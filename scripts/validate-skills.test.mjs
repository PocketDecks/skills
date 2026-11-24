// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PocketDecks

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildCatalog, parseFrontmatter, proseOf, validate } from "./validate-skills.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = "pokemon-tcg-pocket-tier-list-pr-workflow";
const skillMd = path.join("skills", skill, "SKILL.md");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "validate-skills-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

let copies = 0;
const copyRepo = () => {
  const root = path.join(scratch, String(copies++));
  fs.cpSync(repoRoot, root, {
    recursive: true,
    filter: (source) => ![".git", "node_modules"].includes(path.basename(source)),
  });
  return root;
};
const edit = (root, relative, change) => {
  const file = path.join(root, relative);
  fs.writeFileSync(file, change(fs.readFileSync(file, "utf8")));
};
const editJson = (root, relative, change) =>
  edit(root, relative, (text) => `${JSON.stringify(change(JSON.parse(text)), null, 2)}\n`);
const refreshCatalog = (root) =>
  fs.writeFileSync(path.join(root, "skills", "index.json"), `${JSON.stringify(buildCatalog(root), null, 2)}\n`);
const problemsAfter = (change, { catalog = true } = {}) => {
  const root = copyRepo();
  change(root);
  if (catalog) refreshCatalog(root);
  return validate(root);
};
const expectProblem = (problems, pattern) =>
  assert.ok(problems.some((problem) => pattern.test(problem)), `expected ${pattern} in:\n${problems.join("\n")}`);

test("the repository passes", () => {
  assert.deepEqual(validate(repoRoot), []);
});

test("parses a folded description", () => {
  const fields = parseFrontmatter("---\nname: demo\ndescription: >-\n  first line\n  second line\nlicense: MIT\n---\nbody\n");
  assert.deepEqual(fields, { name: "demo", description: "first line second line", license: "MIT" });
});

test("rejects a name that differs from the folder", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => text.replace(`name: ${skill}`, "name: other-skill"))), /must equal the folder name/);
});

test("rejects a missing frontmatter block", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => text.replace(/^---\n/, ""))), /no frontmatter block/);
});

test("rejects an unknown frontmatter key", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => text.replace("license:", "owner: someone\nlicense:"))), /unexpected frontmatter key "owner"/);
});

test("rejects a description over 1024 characters", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => text.replace("description: >-\n", `description: >-\n  ${"x".repeat(1025)}\n`))), /over 1024/);
});

test("keeps blank lines inside a block description", () => {
  const fields = parseFrontmatter("---\nname: demo\ndescription: >-\n  first\n\n  second\n  third\nlicense: MIT\n---\n");
  assert.deepEqual(fields, { name: "demo", description: "first\nsecond third", license: "MIT" });
  const literal = parseFrontmatter("---\ndescription: |\n  first\n\n  second\n---\n");
  assert.equal(literal.description, "first\n\nsecond");
  assert.equal(parseFrontmatter("---\ndescription: >- # note\n  a\n  b\n---\n").description, "a b");
  for (const indicator of [">2-", ">-2"]) {
    assert.equal(parseFrontmatter(`---\ndescription: ${indicator}\n  a\n  b\n---\n`).description, "a b");
  }
});

test("rejects a description that runs over 1024 characters after a blank line", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => text.replace("description: >-\n", `description: >-\n  short\n\n  ${"x".repeat(1025)}\n`))), /over 1024/);
});

test("rejects a description that YAML reads as null or a list", () => {
  for (const value of ["null", "~", "[]", "[a, b]", "{a: b}", "true", "42"]) {
    expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => text.replace(/description: >-\n(?:  .*\n)+/, `description: ${value}\n`))), /description must be a string/);
  }
});

test("reads quoted YAML keywords as text", () => {
  assert.deepEqual(parseFrontmatter("---\nname: 'null'\ndescription: \"42\"\n---\n"), { name: "null", description: "42" });
});

test("rejects an angle bracket in the description", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => text.replace("description: >-\n", "description: >-\n  use <this>\n"))), /angle bracket/);
});

test("rejects another licence", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => text.replace("license: AGPL-3.0-or-later", "license: MIT"))), /license must be/);
});

test("rejects a broken relative link", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => `${text}\n[gone](references/missing.md)\n`)), /link target "references\/missing.md"/);
});

test("rejects a symlink", () => {
  expectProblem(problemsAfter((root) => fs.symlinkSync("SKILL.md", path.join(root, "skills", skill, "alias.md"))), /symlinks are not allowed/);
});

test("rejects a hidden file inside a skill", () => {
  expectProblem(problemsAfter((root) => fs.writeFileSync(path.join(root, "skills", skill, ".notes"), "x\n")), /hidden file or folder outside the allowed list/);
});

test("rejects an em dash in skill text", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => `${text}\nOne ${String.fromCodePoint(0x2014)} two\n`)), /em dash or a curly quote/);
});

test("rejects a US spelling in skill prose", () => {
  const reference = path.join("skills", skill, "references", "frontend.md");
  for (const word of ["normalize", "colors", "behavior", "catalog", "centered", "analyzing", "labeled", "gray"]) {
    expectProblem(problemsAfter((root) => edit(root, reference, (text) => `${text}\nThis line says ${word}.\n`)), new RegExp(`frontend.md: US spelling "${word}"`));
  }
});

test("allows US spellings in code, link targets and verbatim texts", () => {
  const prose = proseOf("Use `color-scheme` and [the guide](https://example.com/catalog).\n\n- Step:\n\n   ```sh\n   node x.mjs --write-catalog\n   ```\n\n~~~\nbehavior\n~~~\nEnd\n");
  assert.equal(prose.includes("color"), false);
  assert.equal(prose.includes("catalog"), false);
  assert.equal(prose.includes("behavior"), false);
  assert.ok(prose.includes("End"));
  const fenceLike = proseOf("~~~\n~~~example\nbehavior\n```\ncolor\n~~\n~~~ \nafter\n");
  assert.equal(fenceLike, "after\n");
  assert.equal(proseOf("~~~~\n~~~\ncolor\n~~~~\nafter\n"), "after\n");
  assert.equal(proseOf("```example```\n\nUse color.\n"), "\n\nUse color.\n");
  assert.equal(proseOf("```js\ncolor\n```\n~~~ `quoted` info\ngray\n~~~\nafter\n"), "after\n");
  assert.equal(proseOf('[a](https://example.com/catalog "Guide catalog") [b](x \'colour\') [c](y (gray))\n'), "[a] [b] [c]\n");
  const problems = problemsAfter((root) => edit(root, "CODE_OF_CONDUCT.md", (text) => `${text}\nbehavior\n`));
  assert.equal(problems.some((problem) => /US spelling/.test(problem)), false, problems.join("\n"));
});

test("rejects a home directory path", () => {
  const home = ["", "home", "someone", "dev", ""].join("/");
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => `${text}\nRun it from ${home}repo\n`)), /home directory path/);
});

test("rejects CR line endings", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => text.replace("\n", "\r\n"))), /CR line endings/);
});

test("rejects a stale catalog", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => `${text}\nOne more rule\n`), { catalog: false }), /index.json: out of date/);
});

test("rejects mismatched plugin versions", () => {
  expectProblem(problemsAfter((root) => editJson(root, ".codex-plugin/plugin.json", (json) => ({ ...json, version: "9.9.9" }))), /plugin versions differ/);
});

test("rejects malformed manifest JSON", () => {
  expectProblem(problemsAfter((root) => fs.writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), "{")), /plugin.json: invalid JSON/);
});

test("rejects a Codex display name over 30 characters", () => {
  expectProblem(
    problemsAfter((root) => editJson(root, ".codex-plugin/plugin.json", (json) => ({ ...json, interface: { ...json.interface, displayName: "x".repeat(31) } }))),
    /interface.displayName/
  );
});

test("rejects an OpenCode config that does not list the skills folder", () => {
  expectProblem(problemsAfter((root) => editJson(root, ".opencode/opencode.json", (json) => ({ ...json, skills: [] }))), /opencode.json: skills must list/);
});

test("rejects missing trigger evals", () => {
  expectProblem(problemsAfter((root) => fs.rmSync(path.join(root, "evals", skill), { recursive: true })), /trigger-evals.json: missing/);
});

test("rejects too few negative trigger evals", () => {
  const relative = path.join("evals", skill, "trigger-evals.json");
  expectProblem(problemsAfter((root) => editJson(root, relative, (items) => items.filter((item) => item.should_trigger))), /at least 8/);
});

test("rejects a repeated trigger eval query", () => {
  const relative = path.join("evals", skill, "trigger-evals.json");
  expectProblem(problemsAfter((root) => editJson(root, relative, (items) => [...items, items[0]])), /repeats an earlier query/);
});

test("rejects a folder name outside the pattern", () => {
  const problems = problemsAfter((root) => {
    fs.renameSync(path.join(root, "skills", skill), path.join(root, "skills", "Bad_Name"));
    fs.renameSync(path.join(root, "evals", skill), path.join(root, "evals", "Bad_Name"));
    edit(root, path.join("skills", "Bad_Name", "SKILL.md"), (text) => text.replace(`name: ${skill}`, "name: Bad_Name"));
  });
  expectProblem(problems, /skills\/Bad_Name: folder name must match/);
});

test("rejects a compatibility note over 500 characters", () => {
  expectProblem(problemsAfter((root) => edit(root, skillMd, (text) => text.replace(/^compatibility: .*$/m, `compatibility: ${"x".repeat(501)}`))), /compatibility is over 500/);
});

test("rejects a skill without its LICENSE", () => {
  expectProblem(problemsAfter((root) => fs.rmSync(path.join(root, "skills", skill, "LICENSE"))), new RegExp(`${skill}/LICENSE: missing`));
});

test("rejects a Codex manifest whose skills path is wrong", () => {
  expectProblem(problemsAfter((root) => editJson(root, ".codex-plugin/plugin.json", (json) => ({ ...json, skills: "./other/" }))), /skills must be "\.\/skills\/"/);
});

test("rejects a Codex version that is not MAJOR.MINOR.PATCH", () => {
  const problems = problemsAfter((root) => {
    editJson(root, ".codex-plugin/plugin.json", (json) => ({ ...json, version: "1.0" }));
    editJson(root, ".claude-plugin/plugin.json", (json) => ({ ...json, version: "1.0" }));
  });
  expectProblem(problems, /version must be MAJOR.MINOR.PATCH/);
});

test("rejects an invalid Codex plugin name", () => {
  const problems = problemsAfter((root) => {
    editJson(root, ".codex-plugin/plugin.json", (json) => ({ ...json, name: "Bad Name" }));
    editJson(root, ".claude-plugin/plugin.json", (json) => ({ ...json, name: "Bad Name" }));
  });
  expectProblem(problems, /\.codex-plugin\/plugin.json: invalid name/);
});

test("rejects a Claude marketplace without the plugin", () => {
  expectProblem(problemsAfter((root) => editJson(root, ".claude-plugin/marketplace.json", (json) => ({ ...json, plugins: [] }))), /\.claude-plugin\/marketplace.json: no entry/);
});

test("rejects a Codex marketplace without the plugin", () => {
  expectProblem(problemsAfter((root) => editJson(root, ".agents/plugins/marketplace.json", (json) => ({ ...json, plugins: [] }))), /\.agents\/plugins\/marketplace.json: no entry/);
});

test("rejects evals for a skill that does not exist", () => {
  expectProblem(problemsAfter((root) => fs.cpSync(path.join(root, "evals", skill), path.join(root, "evals", "ghost-skill"), { recursive: true })), /evals\/ghost-skill: no skill with that name/);
});

test("rejects a malformed trigger eval item", () => {
  const relative = path.join("evals", skill, "trigger-evals.json");
  expectProblem(problemsAfter((root) => editJson(root, relative, (items) => [...items, { query: "", should_trigger: "yes" }])), /needs a non-empty query and a boolean/);
});

test("rejects trigger evals that are not an array", () => {
  const relative = path.join("evals", skill, "trigger-evals.json");
  expectProblem(problemsAfter((root) => editJson(root, relative, () => ({ items: [] }))), /must be a JSON array/);
});

test("rejects a manifest that is a JSON scalar", () => {
  expectProblem(problemsAfter((root) => fs.writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), "null\n")), /plugin.json: must be a JSON object/);
});

test("rejects trigger evals that are a JSON scalar", () => {
  const relative = path.join("evals", skill, "trigger-evals.json");
  expectProblem(problemsAfter((root) => fs.writeFileSync(path.join(root, relative), "0\n")), /trigger-evals.json: must be a JSON array/);
});

test("rejects Hermes and Command Code manifests that drift from the Claude plugin", () => {
  for (const [file, field] of [["plugin.json", "name"], ["plugin.json", "version"], ["plugin.json", "license"], ["package.json", "name"], ["package.json", "version"], ["package.json", "license"]]) {
    expectProblem(problemsAfter((root) => editJson(root, file, (json) => ({ ...json, [field]: "other" }))), new RegExp(`^${file}: ${field} must match`));
  }
});

test("rejects a plugin.json without the Agent Plugins schema", () => {
  expectProblem(problemsAfter((root) => editJson(root, "plugin.json", ({ $schema, ...json }) => json)), /plugin.json: \$schema must be/);
});

test("rejects a package.json that is public, untagged or lists no skills", () => {
  expectProblem(problemsAfter((root) => editJson(root, "package.json", (json) => ({ ...json, private: false }))), /package.json: private must be true/);
  expectProblem(problemsAfter((root) => editJson(root, "package.json", (json) => ({ ...json, keywords: ["pocketdecks"] }))), /keywords must include "cmd-mod"/);
  expectProblem(problemsAfter((root) => editJson(root, "package.json", (json) => ({ ...json, commandcode: { skills: [] } }))), /commandcode.skills must list "\.\/skills"/);
});

test("rejects skills.sh.json groupings that miss a skill or name an unknown one", () => {
  expectProblem(problemsAfter((root) => editJson(root, "skills.sh.json", (json) => ({ ...json, groupings: [{ title: "x", skills: ["ghost-skill"] }] }))), new RegExp(`no grouping lists "${skill}"`));
  expectProblem(problemsAfter((root) => editJson(root, "skills.sh.json", (json) => ({ ...json, groupings: [{ title: "x", skills: [skill, "ghost-skill"] }] }))), /"ghost-skill" is not a skill/);
});

test("rejects a missing Hermes or Command Code manifest", () => {
  for (const file of ["plugin.json", "package.json", "skills.sh.json"]) {
    expectProblem(problemsAfter((root) => fs.rmSync(path.join(root, file))), new RegExp(`^${file.replace(".", "\\.")}: missing`));
  }
});

test("rejects a repository with no skills", () => {
  expectProblem(problemsAfter((root) => fs.rmSync(path.join(root, "skills", skill), { recursive: true }), { catalog: false }), /skills: no skills found/);
});

test("rejects a publish manifest that misses a shipped file", () => {
  const problems = problemsAfter((root) => editJson(root, "skills/publish-manifest.json", (json) => ({
    ...json,
    published: json.published.filter((file) => file !== "scripts/mutate.mjs"),
  })));
  expectProblem(problems, /publish-manifest\.json: missing scripts\/mutate\.mjs/);
});

test("rejects a publish manifest with an extra file", () => {
  const problems = problemsAfter((root) => editJson(root, "skills/publish-manifest.json", (json) => ({
    ...json,
    published: [...json.published, "scripts/extra.mjs"],
  })));
  expectProblem(problems, /publish-manifest\.json: extra scripts\/extra\.mjs/);
});

test("reports a broken catalogue without throwing", () => {
  const problems = problemsAfter((root) => fs.writeFileSync(path.join(root, "skills", "index.json"), '{"skills": ['), { catalog: false });
  expectProblem(problems, /skills\/index\.json: out of date/);
});

test("rejects a publish manifest naming an unknown skill", () => {
  const problems = problemsAfter((root) => editJson(root, "skills/publish-manifest.json", (json) => ({ ...json, skill: "no-such-skill" })));
  expectProblem(problems, /is not a folder/);
});

test("rejects a publish manifest with a non-array list", () => {
  const problems = problemsAfter((root) => editJson(root, "skills/publish-manifest.json", (json) => ({ ...json, published: "all" })));
  expectProblem(problems, /published must be an array/);
});
