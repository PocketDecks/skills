// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PocketDecks

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const bump = path.join(root, "scripts", "bump-version.mjs");
const FILES = [
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "plugin.json",
  "package.json",
];

const fixture = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-fixture-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(root, dir, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.includes(`${path.sep}node_modules${path.sep}`),
  });
  const read = () => FILES.map((file) => fs.readFileSync(path.join(dir, file)));
  const run = (version) =>
    spawnSync(process.execPath, [bump, version], { cwd: dir, encoding: "utf8" });
  return { dir, read, run };
};

test("moves all four manifests together", (t) => {
  const { dir, run } = fixture(t);
  const result = run("1.2.3");
  assert.equal(result.status, 0, result.stderr);
  for (const file of FILES) {
    assert.match(fs.readFileSync(path.join(dir, file), "utf8"), /"version": "1\.2\.3"/);
  }
  const validator = spawnSync(process.execPath, ["scripts/validate-skills.mjs"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(validator.status, 0, validator.stdout + validator.stderr);
});

test("rejects a truncated manifest without writing any file", (t) => {
  const { dir, read, run } = fixture(t);
  const file = path.join(dir, "package.json");
  const text = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, text.replace(/}\s*$/, ""));
  const before = read();
  const result = run("1.0.1");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not valid JSON/);
  assert.deepEqual(read(), before);
});

test("rejects a two-part version", (t) => {
  const { read, run } = fixture(t);
  const before = read();
  const result = run("1.2");
  assert.notEqual(result.status, 0);
  assert.deepEqual(read(), before);
});

test("leaves every file untouched when a later manifest is malformed", (t) => {
  const { dir, read, run } = fixture(t);
  const file = path.join(dir, ".codex-plugin", "plugin.json");
  const text = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, text.replace('"version": "1.0.0"', '"version": "1.0.0",\n  "version": "1.0.0"'));
  const before = read();
  const result = run("2.0.0");
  assert.notEqual(result.status, 0);
  assert.deepEqual(read(), before);
});
