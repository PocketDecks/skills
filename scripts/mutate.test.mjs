// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PocketDecks

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { namesFailedTest, namesPassedTest, sameBytes } from "../skills/pokemon-tcg-pocket-tier-list-pr-workflow/scripts/mutate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, "../skills/pokemon-tcg-pocket-tier-list-pr-workflow/scripts/mutate.mjs");
const targetSource = "export const limit = 2;\nexport const other = limit;\n";
const checkSource = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  'import { limit } from "./target.mjs";',
  'test("keeps the limit at two", () => assert.equal(limit, 2));',
  'test("other check", () => assert.equal(limit, 2));',
  "",
].join("\n");
const ansiSource = [
  'process.stdout.write("\\u001b[31m✖ keeps the limit at two\\u001b[0m\\n");',
  "process.exit(1);",
  "",
].join("\n");

const fixture = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutate-fixture-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const target = path.join(dir, "target.mjs");
  const check = path.join(dir, "check.test.mjs");
  fs.writeFileSync(target, targetSource);
  fs.writeFileSync(check, checkSource);
  const invoke = (extra = {}) => {
    const options = {
      file: target,
      find: "= 2",
      replace: "= 3",
      test: `node --test "${check}"`,
      expect: "keeps the limit at two",
      ...extra,
    };
    const argv = Object.entries(options).flatMap(([key, value]) => [`--${key}`, value]);
    const result = spawnSync(process.execPath, [script, ...argv], { encoding: "utf8" });
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    return { result, report: JSON.parse(lines.at(-1)), output: `${result.stdout}${result.stderr}` };
  };
  return { dir, target, check, invoke };
};

test("reports a killed mutant when the named test fails", { timeout: 30_000 }, (t) => {
  const { invoke } = fixture(t);
  const { result, report } = invoke();
  assert.equal(result.status, 0);
  assert.equal(report.killed, true);
  assert.equal(report.exit, 1);
  assert.equal(report.matched, true);
});

test("reports a survived mutant when the focused test passes", { timeout: 30_000 }, (t) => {
  const { invoke } = fixture(t);
  const { result, report } = invoke({ find: "= limit", replace: "= 0" });
  assert.equal(result.status, 1);
  assert.equal(report.killed, false);
  assert.equal(report.exit, 0);
  assert.equal(report.matched, false);
});

test("allows an empty replacement for a deletion mutant", { timeout: 30_000 }, (t) => {
  const { dir, target, invoke } = fixture(t);
  const side = path.join(dir, "deleted.mjs");
  const copy = path.join(dir, "copy-delete.cjs");
  fs.writeFileSync(copy, `require("node:fs").copyFileSync(${JSON.stringify(target)}, ${JSON.stringify(side)});\n`);
  const { result } = invoke({ find: "= 2", replace: "", test: `node "${copy}"`, expect: "no test name" });
  assert.equal(result.status, 1);
  assert.match(fs.readFileSync(side, "utf8"), /export const limit ;/);
});

test("refuses a no-op mutant with equal find and replace text", { timeout: 30_000 }, (t) => {
  const { target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  const { result, output } = invoke({ find: "= 2", replace: "= 2" });
  assert.equal(result.status, 2);
  assert.match(output, /must differ/);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("refuses a repeated flag", { timeout: 30_000 }, (t) => {
  const { target } = fixture(t);
  const before = fs.readFileSync(target);
  const result = spawnSync(process.execPath, [
    script, "--file", target, "--find", "= 2", "--find", "= 3",
    "--replace", "= 0", "--test", 'node -e ""', "--expect", "no test name",
  ], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /duplicate argument/);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("counts a non-zero exit only when the named test failed", { timeout: 30_000 }, (t) => {
  const { invoke } = fixture(t);
  const { result, report } = invoke({ expect: "a test that never runs" });
  assert.notEqual(report.exit, 0);
  assert.equal(report.matched, false);
  assert.equal(report.killed, false);
  assert.equal(result.status, 1);
});

test("refuses a find text that occurs twice", { timeout: 30_000 }, (t) => {
  const { target, invoke } = fixture(t);
  const before = fs.readFileSync(target, "utf8");
  const { result, output } = invoke({ find: "export", replace: "const" });
  assert.equal(result.status, 2);
  assert.match(output, /exactly once/);
  assert.equal(fs.readFileSync(target, "utf8"), before);
});

test("restores the file after a killed mutant", { timeout: 30_000 }, (t) => {
  const { target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  invoke();
  assert.deepEqual(fs.readFileSync(target), before);
});

test("strips ANSI colour before matching the failed test name", { timeout: 30_000 }, (t) => {
  const { dir, invoke } = fixture(t);
  const ansi = path.join(dir, "ansi-fail.mjs");
  fs.writeFileSync(ansi, ansiSource);
  const { result, report } = invoke({ test: `node "${ansi}"` });
  assert.equal(result.status, 0);
  assert.equal(report.matched, true);
  assert.equal(report.killed, true);
});

test("detects a byte mismatch", { timeout: 30_000 }, () => {
  assert.equal(sameBytes(Buffer.from("abc"), Buffer.from("abc")), true);
  assert.equal(sameBytes(Buffer.from("abc"), Buffer.from("abd")), false);
});

test("lands a replacement with dollar patterns verbatim", { timeout: 30_000 }, (t) => {
  const { dir, target, invoke } = fixture(t);
  const side = path.join(dir, "side.mjs");
  const copy = path.join(dir, "copy.cjs");
  fs.writeFileSync(copy, `require("node:fs").copyFileSync(${JSON.stringify(target)}, ${JSON.stringify(side)});\n`);
  invoke({ find: "= 2", replace: "= $&9", test: `node "${copy}"`, expect: "no test name" });
  assert.match(fs.readFileSync(side, "utf8"), /limit = \$&9;/);
});

test("restores the file when the test command times out", { timeout: 30_000 }, (t) => {
  const { dir, target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  const slow = path.join(dir, "slow.cjs");
  fs.writeFileSync(slow, "setTimeout(() => {}, 5000);\n");
  const { result, report } = invoke({ timeout: "1", test: `node "${slow}"` });
  assert.equal(result.status, 1);
  assert.equal(report.timedOut, true);
  assert.equal(report.killed, false);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("restores the file when interrupted", { timeout: 30_000, skip: process.platform === "win32" }, async (t) => {
  const { dir, target } = fixture(t);
  const before = fs.readFileSync(target);
  const marker = path.join(dir, "marker");
  const slow = path.join(dir, "signal.cjs");
  fs.writeFileSync(slow, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ready"); setTimeout(() => {}, 5000);\n`);
  const argv = [
    "--file", target, "--find", "= 2", "--replace", "= 3",
    "--test", `node "${slow}"`, "--expect", "no test name", "--timeout", "10",
  ];
  const child = spawn(process.execPath, [script, ...argv], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(marker) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(fs.existsSync(marker), true);
  process.kill(-child.pid, "SIGINT");
  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(code, 2);
  assert.match(output, /"interrupted":"SIGINT"/);
  assert.deepEqual(fs.readFileSync(target), before);
});

const stubRun = (t, drop) => {
  const { dir, target } = fixture(t);
  const runner = path.join(dir, "runner.mjs");
  const source = [
    'import fs from "node:fs";',
    `import { main } from ${JSON.stringify(script)};`,
    "let writes = 0;",
    "const io = {",
    "  readFileSync: fs.readFileSync,",
    `  writeFileSync: (file, data) => { writes += 1; if (${JSON.stringify(drop)} === "first" && writes === 1) return; if (${JSON.stringify(drop)} === "restore" && writes === 2) return; return fs.writeFileSync(file, data); },`,
    "};",
    "process.exitCode = await main(JSON.parse(process.env.ARGV), io);",
    "",
  ].join("\n");
  fs.writeFileSync(runner, source);
  const argv = ["--file", target, "--find", "= 2", "--replace", "= 3", "--test", 'node -e ""', "--expect", "no test name"];
  return spawnSync(process.execPath, [runner], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ARGV: JSON.stringify(argv) },
  });
};

test("reports a failed mutant landing check", { timeout: 30_000 }, (t) => {
  const result = stubRun(t, "first");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /mutant did not land/);
});

test("reports a failed restore check", { timeout: 30_000 }, (t) => {
  const result = stubRun(t, "restore");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /restore verification failed/);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
  assert.equal(report.killed, false);
});

test("refuses a zero timeout", { timeout: 30_000 }, (t) => {
  const { target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  const { result } = invoke({ timeout: "0" });
  assert.equal(result.status, 2);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("refuses a non-numeric timeout", { timeout: 30_000 }, (t) => {
  const { target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  const { result } = invoke({ timeout: "abc" });
  assert.equal(result.status, 2);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("does not count a timed-out run as killed", { timeout: 30_000 }, (t) => {
  const { dir, invoke } = fixture(t);
  const slow = path.join(dir, "fail-then-sleep.cjs");
  fs.writeFileSync(slow, 'process.stdout.write("\\u2716 keeps the limit at two\\n"); setTimeout(() => {}, 5000);\n');
  const { result, report } = invoke({ timeout: "1", test: `node "${slow}"`, expect: "keeps the limit at two" });
  assert.equal(result.status, 1);
  assert.equal(report.timedOut, true);
  assert.equal(report.matched, true);
  assert.equal(report.killed, false);
});

test("removes its signal listeners", { timeout: 30_000 }, (t) => {
  const { dir, target } = fixture(t);
  const runner = path.join(dir, "listener.mjs");
  const source = [
    'import fs from "node:fs";',
    `import { main } from ${JSON.stringify(script)};`,
    'const before = process.listenerCount("SIGINT");',
    'process.exitCode = await main(JSON.parse(process.env.ARGV));',
    'process.stdout.write(JSON.stringify({ before, after: process.listenerCount("SIGINT") }) + "\\n");',
    "",
  ].join("\n");
  fs.writeFileSync(runner, source);
  const argv = ["--file", target, "--find", "= 2", "--replace", "= 3", "--test", 'node -e ""', "--expect", "no test name"];
  const result = spawnSync(process.execPath, [runner], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ARGV: JSON.stringify(argv) },
  });
  assert.equal(result.status, 1);
  const counts = JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
  assert.equal(counts.after, counts.before);
});

test("matches a Vitest cross marker for the failed test", { timeout: 30_000 }, () => {
  assert.equal(namesFailedTest("     × keeps the limit at two 3ms", "keeps the limit at two"), true);
});

test("matches a Vitest FAIL line for the failed test", { timeout: 30_000 }, () => {
  assert.equal(namesFailedTest(" FAIL  check.test.ts > limits > keeps the limit at two", "keeps the limit at two"), true);
});

test("does not match a Vitest summary line", { timeout: 30_000 }, () => {
  assert.equal(namesFailedTest(" ❯ check.test.ts (2 tests | 1 failed) 3ms", "check.test.ts"), false);
});

test("matches only the complete node:test name", { timeout: 30_000 }, (t) => {
  const { dir, invoke } = fixture(t);
  const target = path.join(dir, "prefix-target.mjs");
  fs.writeFileSync(target, "export const limit = 2;\nexport const other = 2;\n");
  const check = path.join(dir, "prefix.test.mjs");
  fs.writeFileSync(check, [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { limit, other } from "./prefix-target.mjs";',
    'test("keeps the limit at two", () => assert.equal(limit, 2));',
    'test("keeps the limit at two with missing data", () => assert.equal(other, 2));',
    "",
  ].join("\n"));
  const command = `node --test "${check}"`;
  const options = { file: target, find: "other = 2", replace: "other = 3", test: command };
  const short = invoke({ ...options, expect: "keeps the limit at two" });
  assert.equal(short.result.status, 1);
  assert.equal(short.report.killed, false);
  const full = invoke({ ...options, expect: "keeps the limit at two with missing data" });
  assert.equal(full.result.status, 0);
  assert.equal(full.report.killed, true);
});

test("matches the captured node and Vitest failure lines only by full name", { timeout: 30_000 }, () => {
  const lines = [
    "  ✖ keeps the limit at two with missing data (0.36154ms)",
    "    not ok 2 - keeps the limit at two with missing data",
    "     × keeps the limit at two with missing data 2ms",
    " × prefix.test.ts > limits > keeps the limit at two with missing data 2ms",
    " FAIL  prefix.test.ts > limits > keeps the limit at two with missing data",
  ];
  for (const line of lines) {
    assert.equal(namesFailedTest(line, "keeps the limit at two with missing data"), true, line);
    assert.equal(namesFailedTest(line, "keeps the limit at two"), false, line);
  }
  assert.equal(namesFailedTest(lines.at(-1), "limits > keeps the limit at two with missing data"), true);
});

const waitFor = async (pathToWait, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(pathToWait) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(fs.existsSync(pathToWait), `expected ${pathToWait}`);
};

test("stops the runner on a SIGTERM sent to it alone", { timeout: 30_000, skip: process.platform === "win32" }, async (t) => {
  const { dir, target } = fixture(t);
  const before = fs.readFileSync(target);
  const marker = path.join(dir, "sigterm.marker");
  const slow = path.join(dir, "sigterm.cjs");
  fs.writeFileSync(slow, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ready"); setTimeout(() => {}, 30000);\n`);
  const argv = [
    "--file", target, "--find", "= 2", "--replace", "= 3",
    "--test", `node "${slow}"`, "--expect", "no test name", "--timeout", "60",
  ];
  const child = spawn(process.execPath, [script, ...argv], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  await waitFor(marker);
  process.kill(child.pid, "SIGTERM");
  const started = Date.now();
  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(code, 2);
  assert.ok(Date.now() - started < 10000);
  assert.match(output, /"interrupted":"SIGTERM"/);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("kills a descendant left by a timed-out command", { timeout: 30_000, skip: process.platform === "win32" }, async (t) => {
  const { dir, target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  const pidFile = path.join(dir, "descendant.pid");
  const childScript = path.join(dir, "descendant.cjs");
  const parentScript = path.join(dir, "spawner.cjs");
  fs.writeFileSync(childScript, "setTimeout(() => {}, 30000);\n");
  fs.writeFileSync(parentScript, [
    'const fs = require("node:fs");',
    'const { spawn } = require("node:child_process");',
    `const child = spawn(process.execPath, [${JSON.stringify(childScript)}], { stdio: "ignore" });`,
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"));
  const { report } = invoke({ timeout: "1", test: `node "${parentScript}"` });
  assert.equal(report.timedOut, true);
  assert.deepEqual(fs.readFileSync(target), before);
  await waitFor(pidFile);
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH");
});

test("kills a background straggler after a normal exit", { timeout: 30_000, skip: process.platform === "win32" }, async (t) => {
  const { dir, target, invoke } = fixture(t);
  const pidFile = path.join(dir, "straggler.pid");
  const childScript = path.join(dir, "straggler.cjs");
  const parentScript = path.join(dir, "launch.cjs");
  fs.writeFileSync(childScript, "setTimeout(() => {}, 30000);\n");
  fs.writeFileSync(parentScript, [
    'const fs = require("node:fs");',
    'const { spawn } = require("node:child_process");',
    `const child = spawn(process.execPath, [${JSON.stringify(childScript)}], { stdio: "ignore" });`,
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
    "child.unref();",
    "",
  ].join("\n"));
  invoke({ test: `node "${parentScript}"` });
  await waitFor(pidFile);
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH");
});


test("ignores a failing TAP todo line", { timeout: 30_000 }, (t) => {
  const { dir, invoke } = fixture(t);
  assert.equal(namesFailedTest("not ok 1 - keeps the limit at two # TODO pending fix", "keeps the limit at two"), false);
  assert.equal(namesFailedTest("not ok 1 - keeps the limit at two # TODO pending fix", "keeps the limit at two # TODO pending fix"), false);
  const check = path.join(dir, "todo.test.mjs");
  fs.writeFileSync(check, [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { limit } from "./target.mjs";',
    'test("keeps the limit at two", { todo: "pending fix" }, () => assert.equal(limit, 3));',
    'test("other check", () => assert.equal(limit, 3));',
    "",
  ].join("\n"));
  const { result, report } = invoke({ test: `node --test --test-reporter=tap "${check}"`, expect: "keeps the limit at two" });
  assert.equal(result.status, 1);
  assert.equal(report.killed, false);
});

test("refuses a name used by a passing and a failing test", { timeout: 30_000 }, (t) => {
  const { dir, invoke } = fixture(t);
  const target = path.join(dir, "duplicate-target.mjs");
  fs.writeFileSync(target, "export const a = 1;\nexport const b = 2;\n");
  const check = path.join(dir, "duplicate.test.mjs");
  fs.writeFileSync(check, [
    'import test, { describe } from "node:test";',
    'import assert from "node:assert/strict";',
    'import { a, b } from "./duplicate-target.mjs";',
    'describe("A", () => test("rejects empty", () => assert.equal(a, 1)));',
    'describe("B", () => test("rejects empty", () => assert.equal(b, 2)));',
    "",
  ].join("\n"));
  const { result, output } = invoke({
    file: target, find: "b = 2", replace: "b = 3",
    test: `node --test "${check}"`, expect: "rejects empty",
  });
  assert.equal(result.status, 2);
  assert.match(output, /names both a failing and a passing test/);
});

test("matches captured Vitest verbose lines", { timeout: 30_000 }, () => {
  const output = [
    " ✓ dup.test.ts > A > rejects empty 1ms",
    " × dup.test.ts > B > rejects empty 2ms",
    " FAIL  dup.test.ts > B > rejects empty",
  ].join("\n");
  assert.equal(namesPassedTest(output, "rejects empty"), true);
  assert.equal(namesPassedTest(output, "B > rejects empty"), false);
  assert.equal(namesFailedTest(output, "B > rejects empty"), true);
});

test("does not apply suite paths to TAP names", { timeout: 30_000 }, () => {
  assert.equal(namesFailedTest("not ok 2 - longer > keeps the limit at two", "keeps the limit at two"), false);
});

test("matches a marker split across output writes", { timeout: 30_000 }, (t) => {
  const { dir, invoke } = fixture(t);
  const split = path.join(dir, "split.cjs");
  fs.writeFileSync(split, 'process.stdout.write(Buffer.from([0xE2, 0x9C])); setTimeout(() => { process.stdout.write(Buffer.concat([Buffer.from([0x96]), Buffer.from(" keeps the limit at two\\n")])); process.exit(1); }, 200);\n');
  const { report } = invoke({ test: `node "${split}"`, expect: "keeps the limit at two" });
  assert.equal(report.killed, true);
});

test("fails when an escaped child holds the output pipes", { timeout: 30_000, skip: process.platform === "win32" }, async (t) => {
  const { dir, target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  const pidFile = path.join(dir, "escaped.pid");
  const childScript = path.join(dir, "escaped.cjs");
  fs.writeFileSync(childScript, "setTimeout(() => {}, 30000);\n");
  const parent = path.join(dir, "escape.cjs");
  fs.writeFileSync(parent, [
    'const fs = require("node:fs");',
    'const { spawn } = require("node:child_process");',
    `const child = spawn(process.execPath, [${JSON.stringify(childScript)}], { stdio: "inherit", detached: true });`,
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
    "child.unref();",
    "process.exit(1);",
    "",
  ].join("\n"));
  const { result, output } = invoke({ test: `node "${parent}"` });
  await waitFor(pidFile);
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  t.after(() => { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } });
  assert.equal(result.status, 2);
  assert.match(output, /left processes running/);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("kills a same-group holder after a failing exit", { timeout: 30_000, skip: process.platform === "win32" }, async (t) => {
  const { dir, invoke } = fixture(t);
  const pidFile = path.join(dir, "holder.pid");
  const holder = path.join(dir, "holder.cjs");
  fs.writeFileSync(holder, "setTimeout(() => {}, 30000);\n");
  const parent = path.join(dir, "hold.cjs");
  fs.writeFileSync(parent, [
    'const fs = require("node:fs");',
    'const { spawn } = require("node:child_process");',
    'process.stdout.write("✖ keeps the limit at two\\n");',
    `const child = spawn(process.execPath, [${JSON.stringify(holder)}], { stdio: "inherit" });`,
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
    "child.unref();",
    "process.exit(1);",
    "",
  ].join("\n"));
  const { result, report } = invoke({ test: `node "${parent}"`, expect: "keeps the limit at two" });
  assert.equal(result.status, 0);
  assert.equal(report.killed, true);
  assert.equal(report.timedOut, false);
  await waitFor(pidFile);
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH");
});

test("escalates to SIGKILL for a SIGTERM-ignoring command", { timeout: 30_000 }, (t) => {
  const { invoke } = fixture(t);
  const started = Date.now();
  const { result, report } = invoke({
    timeout: "1",
    test: 'node -e "process.on(\'SIGTERM\',()=>{}); setInterval(()=>{},1000)"',
  });
  assert.equal(report.timedOut, true);
  assert.equal(result.status, 1);
  assert.ok(Date.now() - started < 8000);
});

test("refuses a signal received before the command starts", { timeout: 30_000 }, (t) => {
  const { dir, target } = fixture(t);
  const before = fs.readFileSync(target);
  const marker = path.join(dir, "prestart.marker");
  const commandScript = path.join(dir, "prestart-command.cjs");
  fs.writeFileSync(commandScript, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ready");\n`);
  const command = `node "${commandScript}"`;
  const runner = path.join(dir, "prestart.mjs");
  fs.writeFileSync(runner, [
    'import fs from "node:fs";',
    `import { main } from ${JSON.stringify(script)};`,
    "const io = {",
    "  readFileSync: fs.readFileSync,",
    '  writeFileSync: (file, data) => { process.emit("SIGTERM", "SIGTERM"); return fs.writeFileSync(file, data); },',
    "};",
    "process.exitCode = await main(JSON.parse(process.env.ARGV), io);",
    "",
  ].join("\n"));
  const argv = ["--file", target, "--find", "= 2", "--replace", "= 3", "--test", command, "--expect", "no test name"];
  const result = spawnSync(process.execPath, [runner], {
    cwd: dir, encoding: "utf8", env: { ...process.env, ARGV: JSON.stringify(argv) },
  });
  assert.equal(fs.existsSync(marker), false);
  assert.match(result.stdout, /"interrupted":"SIGTERM"/);
  assert.deepEqual(fs.readFileSync(target), before);
});


test("restores the file when the command cannot spawn", { timeout: 30_000 }, (t) => {
  const { dir, target } = fixture(t);
  const copy = path.join(dir, "mutate-badshell.mjs");
  const source = fs.readFileSync(script, "utf8");
  assert.equal(source.split("    shell: true,").length - 1, 1);
  fs.writeFileSync(copy, source.replace("    shell: true,", '    shell: "/nonexistent/shell",'));
  const before = fs.readFileSync(target);
  const argv = ["--file", target, "--find", "= 2", "--replace", "= 3", "--test", 'node -e ""', "--expect", "no test name"];
  const result = spawnSync(process.execPath, [fs.realpathSync(copy), ...argv], { cwd: dir, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ENOENT/);
  assert.deepEqual(fs.readFileSync(target), before);
});
