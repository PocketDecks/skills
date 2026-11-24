// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PocketDecks

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { namesFailedTest, sameBytes } from "../skills/pokemon-tcg-pocket-tier-list-pr-workflow/scripts/mutate.mjs";

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

test("reports a killed mutant when the named test fails", (t) => {
  const { invoke } = fixture(t);
  const { result, report } = invoke();
  assert.equal(result.status, 0);
  assert.equal(report.killed, true);
  assert.equal(report.exit, 1);
  assert.equal(report.matched, true);
});

test("reports a survived mutant when the focused test passes", (t) => {
  const { invoke } = fixture(t);
  const { result, report } = invoke({ find: "= limit", replace: "= 0" });
  assert.equal(result.status, 1);
  assert.equal(report.killed, false);
  assert.equal(report.exit, 0);
  assert.equal(report.matched, false);
});

test("allows an empty replacement for a deletion mutant", (t) => {
  const { dir, target, invoke } = fixture(t);
  const side = path.join(dir, "deleted.mjs");
  const copy = path.join(dir, "copy-delete.cjs");
  fs.writeFileSync(copy, `require("node:fs").copyFileSync(${JSON.stringify(target)}, ${JSON.stringify(side)});\n`);
  const { result } = invoke({ find: "= 2", replace: "", test: `node "${copy}"`, expect: "no test name" });
  assert.equal(result.status, 1);
  assert.match(fs.readFileSync(side, "utf8"), /export const limit ;/);
});

test("refuses a no-op mutant with equal find and replace text", (t) => {
  const { target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  const { result, output } = invoke({ find: "= 2", replace: "= 2" });
  assert.equal(result.status, 2);
  assert.match(output, /must differ/);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("refuses a repeated flag", (t) => {
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

test("counts a non-zero exit only when the named test failed", (t) => {
  const { invoke } = fixture(t);
  const { result, report } = invoke({ expect: "a test that never runs" });
  assert.notEqual(report.exit, 0);
  assert.equal(report.matched, false);
  assert.equal(report.killed, false);
  assert.equal(result.status, 1);
});

test("refuses a find text that occurs twice", (t) => {
  const { target, invoke } = fixture(t);
  const before = fs.readFileSync(target, "utf8");
  const { result, output } = invoke({ find: "export", replace: "const" });
  assert.equal(result.status, 2);
  assert.match(output, /exactly once/);
  assert.equal(fs.readFileSync(target, "utf8"), before);
});

test("restores the file after a killed mutant", (t) => {
  const { target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  invoke();
  assert.deepEqual(fs.readFileSync(target), before);
});

test("strips ANSI colour before matching the failed test name", (t) => {
  const { dir, invoke } = fixture(t);
  const ansi = path.join(dir, "ansi-fail.mjs");
  fs.writeFileSync(ansi, ansiSource);
  const { result, report } = invoke({ test: `node "${ansi}"` });
  assert.equal(result.status, 0);
  assert.equal(report.matched, true);
  assert.equal(report.killed, true);
});

test("detects a byte mismatch", () => {
  assert.equal(sameBytes(Buffer.from("abc"), Buffer.from("abc")), true);
  assert.equal(sameBytes(Buffer.from("abc"), Buffer.from("abd")), false);
});

test("lands a replacement with dollar patterns verbatim", (t) => {
  const { dir, target, invoke } = fixture(t);
  const side = path.join(dir, "side.mjs");
  const copy = path.join(dir, "copy.cjs");
  fs.writeFileSync(copy, `require("node:fs").copyFileSync(${JSON.stringify(target)}, ${JSON.stringify(side)});\n`);
  invoke({ find: "= 2", replace: "= $&9", test: `node "${copy}"`, expect: "no test name" });
  assert.match(fs.readFileSync(side, "utf8"), /limit = \$&9;/);
});

test("restores the file when the test command times out", (t) => {
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

test("restores the file when interrupted", { skip: process.platform === "win32" }, async (t) => {
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

test("reports a failed mutant landing check", (t) => {
  const result = stubRun(t, "first");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /mutant did not land/);
});

test("reports a failed restore check", (t) => {
  const result = stubRun(t, "restore");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /restore verification failed/);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
  assert.equal(report.killed, false);
});

test("refuses a zero timeout", (t) => {
  const { target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  const { result } = invoke({ timeout: "0" });
  assert.equal(result.status, 2);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("refuses a non-numeric timeout", (t) => {
  const { target, invoke } = fixture(t);
  const before = fs.readFileSync(target);
  const { result } = invoke({ timeout: "abc" });
  assert.equal(result.status, 2);
  assert.deepEqual(fs.readFileSync(target), before);
});

test("does not count a timed-out run as killed", (t) => {
  const { dir, invoke } = fixture(t);
  const slow = path.join(dir, "fail-then-sleep.cjs");
  fs.writeFileSync(slow, 'process.stdout.write("\\u2716 keeps the limit at two\\n"); setTimeout(() => {}, 5000);\n');
  const { result, report } = invoke({ timeout: "1", test: `node "${slow}"`, expect: "keeps the limit at two" });
  assert.equal(result.status, 1);
  assert.equal(report.timedOut, true);
  assert.equal(report.matched, true);
  assert.equal(report.killed, false);
});

test("removes its signal listeners", (t) => {
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

test("matches a Vitest cross marker for the failed test", () => {
  assert.equal(namesFailedTest("     × keeps the limit at two 3ms", "keeps the limit at two"), true);
});

test("matches a Vitest FAIL line for the failed test", () => {
  assert.equal(namesFailedTest(" FAIL  check.test.ts > limits > keeps the limit at two", "keeps the limit at two"), true);
});

test("does not match a Vitest summary line", () => {
  assert.equal(namesFailedTest(" ❯ check.test.ts (2 tests | 1 failed) 3ms", "check.test.ts"), false);
});

test("matches only the complete node:test name", (t) => {
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

test("matches the captured node and Vitest failure lines only by full name", () => {
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

