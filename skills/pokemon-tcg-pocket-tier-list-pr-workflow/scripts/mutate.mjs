// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PocketDecks
//
// Applies one exact mutation to a file, runs a focused test command and reports
// whether that command failed the named test. The file is restored byte for
// byte before the report is printed. It recognises node:test, TAP and Vitest
// failure lines. Pass the complete test name to --expect, or its Vitest suite
// path. The test command runs in its own process group, which is stopped on a
// timeout or interrupt. For Vitest, run `yarn vitest run --reporter=verbose
// <file>` and pass a suite path such as `limits > keeps the limit at two`. A
// name that matches both a failing and a passing test is refused. TAP todo and
// skip lines are ignored.
//
// Usage:
//   node <skill-dir>/scripts/mutate.mjs --file <path> --find <text> \
//     --replace <text> --test "<command>" --expect "<test name>" \
//     [--timeout <seconds>]
//
// Exit codes: 0 killed, 1 survived or timed out, 2 setup error or interrupt.

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const countOccurrences = (text, needle) => text.split(needle).length - 1;

export const stripAnsi = (text) => text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");

const FAILED_LINE = /^\s*(✖|×|not ok \d+ -|FAIL)\s+(.+?)\s*$/;
const PASSED_LINE = /^\s*(✔|✓|ok \d+ -)\s+(.+?)\s*$/;
// Only Vitest prints suite paths joined with " > ".
const SUITE_PATH_MARKERS = new Set(["×", "FAIL", "✓"]);
const TIMING = /\s+(?:\(\d+(?:\.\d+)?ms\)|\d+(?:\.\d+)?m?s)$/;
// A TAP line with a TODO or SKIP directive is not a result: a failing todo test
// prints "not ok" but does not fail the run.
const TAP_DIRECTIVE = /\s#\s*(?:TODO|SKIP)\b/i;

const testLines = (output, pattern) =>
  stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => pattern.exec(line))
    .filter(Boolean)
    .filter(([, marker, id]) => !(marker.endsWith("-") && TAP_DIRECTIVE.test(id)))
    .map(([, marker, id]) => ({
      suitePaths: SUITE_PATH_MARKERS.has(marker),
      forms: [...new Set([id, id.replace(TIMING, "")])],
    }));

const names = (line, name) =>
  line.forms.some((form) => form === name || (line.suitePaths && form.endsWith(` > ${name}`)));

export const namesFailedTest = (output, name) => testLines(output, FAILED_LINE).some((line) => names(line, name));

export const namesPassedTest = (output, name) => testLines(output, PASSED_LINE).some((line) => names(line, name));

const groupAlive = (pid) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};

const killTree = (pid, signal) => {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // The process group has already exited.
  }
};

// Runs the command in its own process group so a timeout or interrupt can stop
// every descendant. Once the shell exits, the group gets one grace period to
// release the output pipes before it is killed; a process outside the group
// that still holds them after a second grace period counts as left running.
export const runCommand = (command, { env, timeoutMs, graceMs = 2000 }) => {
  const child = spawn(command, {
    shell: true,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let timedOut = false;
  let exitCode = null;
  let held = false;
  let stopping = false;
  const timers = [];
  const later = (ms, action) => timers.push(setTimeout(action, ms));
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      output += chunk;
    });
  }
  const stop = () => {
    killTree(child.pid, "SIGTERM");
    if (stopping) return;
    stopping = true;
    later(graceMs, () => killTree(child.pid, "SIGKILL"));
  };
  later(timeoutMs, () => {
    timedOut = true;
    stop();
  });
  const done = new Promise((resolve) => {
    let finished = false;
    const finish = async () => {
      if (finished) return;
      finished = true;
      for (const timer of timers) clearTimeout(timer);
      killTree(child.pid, "SIGKILL");
      const deadline = Date.now() + 5000;
      while (process.platform !== "win32" && groupAlive(child.pid) && Date.now() < deadline) {
        await new Promise((wait) => setTimeout(wait, 20));
      }
      resolve({
        code: exitCode,
        output,
        timedOut,
        treeExited: !held && (process.platform === "win32" || !groupAlive(child.pid)),
      });
    };
    child.on("exit", (code) => {
      exitCode = code;
      later(graceMs, () => {
        killTree(child.pid, "SIGKILL");
        later(graceMs, () => {
          held = true;
          child.stdout.destroy();
          child.stderr.destroy();
          finish();
        });
      });
    });
    child.on("close", finish);
  });
  return { done, stop };
};

export const sameBytes = (left, right) => Buffer.compare(left, right) === 0;

const parseArgs = (argv) => {
  const keys = ["file", "find", "replace", "test", "expect", "timeout"];
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith("--") || !keys.includes(flag.slice(2))) {
      throw new Error(`unexpected argument: ${flag}`);
    }
    const key = flag.slice(2);
    if (args[key] !== undefined) throw new Error(`duplicate argument: ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${flag}`);
    args[key] = value;
    index += 1;
  }
  for (const key of ["file", "find", "test", "expect"]) {
    if (!args[key]) throw new Error(`missing required argument: --${key}`);
  }
  if (args.replace === undefined) throw new Error("missing required argument: --replace");
  if (args.find === args.replace) throw new Error("--find and --replace must differ");
  const timeout = args.timeout === undefined ? 600 : Number(args.timeout);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("--timeout must be a positive number of seconds");
  args.timeout = timeout;
  return args;
};

export const main = async (argv, io = fs) => {
  let args = null;
  let backup = null;
  let code = 2;
  const report = { file: null, killed: false, exit: null, matched: false, timedOut: false, interrupted: null };
  const handlers = {};
  let caughtSignal = null;
  let running = null;
  try {
    args = parseArgs(argv);
    report.file = args.file;
    backup = io.readFileSync(args.file);
    const original = backup.toString("utf8");
    if (countOccurrences(original, args.find) !== 1) {
      throw new Error(`--find must occur exactly once in ${args.file}`);
    }
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      handlers[signal] = () => {
        caughtSignal ??= signal;
        running?.stop();
      };
      process.on(signal, handlers[signal]);
    }
    const mutated = Buffer.from(original.replace(args.find, () => args.replace));
    io.writeFileSync(args.file, mutated);
    if (!sameBytes(io.readFileSync(args.file), mutated)) {
      throw new Error(`mutant did not land in ${args.file}`);
    }
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    if (caughtSignal) throw new Error(`interrupted by ${caughtSignal}`);
    running = runCommand(args.test, { env, timeoutMs: args.timeout * 1000 });
    const result = await running.done;
    report.exit = result.code === null ? 1 : result.code;
    report.matched = namesFailedTest(result.output, args.expect);
    if (report.matched && namesPassedTest(result.output, args.expect)) {
      report.matched = false;
      throw new Error("--expect names both a failing and a passing test; use a unique name or the Vitest suite path");
    }
    report.timedOut = result.timedOut;
    if (!result.treeExited) throw new Error("the test command left processes running");
    report.killed = !report.timedOut && report.exit !== 0 && report.matched;
    code = report.killed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    code = 2;
  } finally {
    if (args && backup) {
      try {
        io.writeFileSync(args.file, backup);
        if (!sameBytes(io.readFileSync(args.file), backup)) {
          process.stderr.write("restore verification failed\n");
          report.killed = false;
          code = 2;
        }
      } catch (error) {
        process.stderr.write(`${error.message}\n`);
        report.killed = false;
        code = 2;
      }
    }
    for (const [signal, handler] of Object.entries(handlers)) {
      process.removeListener(signal, handler);
    }
    if (caughtSignal) {
      report.interrupted = caughtSignal;
      report.killed = false;
      code = 2;
    }
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return code;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((value) => {
    process.exitCode = value;
  });
}
