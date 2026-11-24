// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PocketDecks
//
// Applies one exact mutation to a file, runs a focused test command and reports
// whether that command failed the named test. The file is restored byte for
// byte before the report is printed.
//
// Usage:
//   node <skill-dir>/scripts/mutate.mjs --file <path> --find <text> \
//     --replace <text> --test "<command>" --expect "<test name>" \
//     [--timeout <seconds>]
//
// Exit codes: 0 killed, 1 survived or timed out, 2 setup error or interrupt.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const countOccurrences = (text, needle) => text.split(needle).length - 1;

export const stripAnsi = (text) => text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");

export const namesFailedTest = (output, name) =>
  stripAnsi(output)
    .split(/\r?\n/)
    .some((line) => /^\s*(?:\u2716|not ok\b)/i.test(line) && line.includes(name));

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
        caughtSignal = signal;
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
    const result = spawnSync(args.test, {
      shell: true,
      encoding: "utf8",
      env,
      timeout: args.timeout * 1000,
      killSignal: "SIGKILL",
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    report.exit = result.status === null ? 1 : result.status;
    report.matched = namesFailedTest(output, args.expect);
    report.timedOut = result.error?.code === "ETIMEDOUT";
    report.killed = !report.timedOut && report.exit !== 0 && report.matched;
    await new Promise((resolve) => setImmediate(resolve));
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
