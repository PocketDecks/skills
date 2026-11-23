import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const probe = require(path.resolve(here, "../skills/pokemon-tcg-pocket-tier-list-pr-workflow/scripts/probe-dist-route.js"));
const origin = "http://127.0.0.1:4321";

const fixture = (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "probe-dist-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const dir = path.join(base, "build");
  const outside = path.join(base, "outside.txt");
  fs.mkdirSync(path.join(dir, "statistics"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<title>root</title>");
  fs.writeFileSync(path.join(dir, "statistics", "index.html"), "<title>statistics</title>");
  fs.writeFileSync(outside, "<title>outside</title>");
  return { dir, outside };
};

test("rejects a path outside the build directory", (t) => {
  const { dir, outside } = fixture(t);
  assert.equal(probe.resolveFile(dir, "/../outside.txt"), null);
  assert.equal(fs.existsSync(outside), true);
});

test("serves the statistics index from its directory", (t) => {
  const { dir } = fixture(t);
  const file = probe.resolveFile(dir, "/statistics/");
  assert.equal(file, path.join(dir, "statistics", "index.html"));
  assert.match(fs.readFileSync(file, "utf8"), /statistics/);
});

test("falls back to the root index for an unknown route", (t) => {
  const { dir } = fixture(t);
  const file = probe.resolveFile(dir, "/unknown/route");
  assert.equal(file, path.join(dir, "index.html"));
  assert.match(fs.readFileSync(file, "utf8"), /root/);
});

test("lets only loopback-server URLs through the filter", () => {
  assert.equal(probe.isLoopbackRequest(`${origin}/deck/1`, origin), true);
  assert.equal(probe.isLoopbackRequest("http://localhost:4321/deck/1", origin), false);
  assert.equal(probe.isLoopbackRequest("https://example.com/deck/1", origin), false);
  assert.equal(probe.isLoopbackRequest(`${origin}.example.com/deck/1`, origin), false);
});
