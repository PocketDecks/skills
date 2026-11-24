import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { sameBytes } from "../skills/pokemon-tcg-pocket-tier-list-pr-workflow/scripts/mutate.mjs";

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
  const { result, report } = invoke({ find: "= 2", replace: "= 2" });
  assert.equal(result.status, 1);
  assert.equal(report.killed, false);
  assert.equal(report.exit, 0);
  assert.equal(report.matched, false);
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
