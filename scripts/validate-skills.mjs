// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PocketDecks

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_DIR = "skills";
const EVALS_DIR = "evals";
const CATALOG = path.join(SKILLS_DIR, "index.json");
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ALLOWED_FRONTMATTER = new Set(["name", "description", "license", "allowed-tools", "metadata", "compatibility"]);
const ALLOWED_ROOT_HIDDEN = new Set([
  ".git",
  ".github",
  ".agents",
  ".claude-plugin",
  ".codex-plugin",
  ".opencode",
  ".coderabbit.yaml",
  ".gitattributes",
  ".gitignore",
  ".nvmrc",
]);
const VERBATIM_TEXTS = new Set(["LICENSE", "CODE_OF_CONDUCT.md"]);
const TEXT_EXTENSIONS = new Set([".md", ".json", ".js", ".mjs", ".cjs", ".ts", ".yml", ".yaml", ".txt", ""]);
const TYPOGRAPHIC = new RegExp(`[${[0x2014, 0x2018, 0x2019, 0x201c, 0x201d].map((code) => String.fromCodePoint(code)).join("")}]`);
const HOME_PATH = /(?:\/(?:var\/)?home\/[a-z_][\w-]*\/|\/Users\/[^/\s]+\/|[A-Za-z]:\\Users\\)/;
const US_SPELLING = new RegExp(
  [
    String.raw`\b(?:organi|recogni|normali|initiali|seriali|prioriti|summari|customi|optimi|minimi|maximi|authori|finali|utili|categori|synchroni|saniti|locali|standardi|visuali|emphasi|speciali|memori|characteri|generali|stabili|tokeni|parameteri|apologi)z(?:e|es|ed|ing|ation|ations)\b`,
    String.raw`\banalyz(?:e|es|ed|ing)\b`,
    String.raw`\b(?:color|behavior|favor|honor|flavor|neighbor)(?:s|ed|ing|al|ite|ites)?\b`,
    String.raw`\bcent(?:er|ers|ered)\b`,
    String.raw`\bcatalog(?:s|ed)?\b`,
    String.raw`\b(?:canceled|canceling|labeled|labeling|modeled|modeling|traveled|traveling)\b`,
    String.raw`\bgray\b`,
  ].join("|"),
  "i",
);
const MIN_EVALS_PER_SIDE = 8;

// Prose of a Markdown file, without fenced code, inline code and link targets,
// so identifiers such as `color-scheme` or a `--write-catalog` flag stay allowed.
// A fence closes only on the same character, at least as long, with nothing after it.
const withoutFences = (markdown) => {
  const kept = [];
  let fence = null;
  for (const line of markdown.split("\n")) {
    if (fence === null) {
      const open = /^[ \t]*(?:(`{3,})[^`]*|(~{3,}).*)$/.exec(line);
      if (open) fence = open[1] ?? open[2];
      else kept.push(line);
    } else if (new RegExp(`^[ \\t]*${fence[0]}{${fence.length},}[ \\t]*$`).test(line)) {
      fence = null;
    }
  }
  return kept.join("\n");
};

export const proseOf = (markdown) =>
  withoutFences(markdown)
    .replace(/`[^`\n]*`/g, "")
    .replace(/\]\([^)\s]*(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g, "]");

const toPosix = (relative) => relative.split(path.sep).join("/");

const walk = (root, relative = "") => {
  const entries = [];
  for (const dirent of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, dirent.name);
    if (dirent.name === ".git" || dirent.name === "node_modules") continue;
    entries.push({ relative: toPosix(child), dirent });
    if (dirent.isDirectory()) entries.push(...walk(root, child));
  }
  return entries;
};

// Plain values YAML reads as null, booleans, numbers or flow collections keep that type,
// so a field such as `description: null` is not mistaken for text.
const yamlScalar = (value) => {
  if (/^(?:~|null)?$/i.test(value)) return null;
  if (/^(?:true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (/^[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(value)) return Number(value.replaceAll("_", ""));
  if (/^\[.*\]$/.test(value)) return value.slice(1, -1).split(",").map((item) => item.trim()).filter(Boolean);
  if (/^\{.*\}$/.test(value)) return {};
  return value.replace(/^(["'])(.*)\1$/, "$2");
};

export const parseFrontmatter = (text) => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return null;
  const fields = {};
  let blockKey = null;
  let blockLines = [];
  let folded = false;
  const closeBlock = () => {
    if (blockKey === null) return;
    const text = blockLines.join("\n").trim();
    fields[blockKey] = folded
      ? text.replace(/\n+/g, (breaks) => (breaks.length === 1 ? " " : "\n".repeat(breaks.length - 1)))
      : text;
    blockKey = null;
    blockLines = [];
  };
  for (const line of match[1].split("\n")) {
    if (blockKey !== null && (/^\s+\S/.test(line) || /^\s*$/.test(line))) {
      blockLines.push(line.trim());
      continue;
    }
    closeBlock();
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    if (/^[>|](?:[1-9]?[-+]?|[-+][1-9])(?:\s+#.*)?$/.test(value)) {
      blockKey = key;
      folded = value.startsWith(">");
    } else {
      fields[key] = yamlScalar(value);
    }
  }
  closeBlock();
  return fields;
};

const skillNames = (root) => {
  const dir = path.join(root, SKILLS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort();
};

const skillFiles = (root, name) =>
  walk(root, path.join(SKILLS_DIR, name))
    .filter(({ dirent }) => dirent.isFile())
    .map(({ relative }) => relative.slice(`${SKILLS_DIR}/${name}/`.length))
    .sort();

export const buildCatalog = (root) => ({
  skills: skillNames(root).map((name) => {
    const files = skillFiles(root, name);
    const hash = crypto.createHash("sha256");
    for (const file of files) {
      hash.update(`${file}\0`);
      hash.update(fs.readFileSync(path.join(root, SKILLS_DIR, name, file)));
      hash.update("\0");
    }
    return { name, version: hash.digest("hex").slice(0, 12), files };
  }),
});

const readJson = (root, relative, problems, shape = "object") => {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  } catch (error) {
    problems.push(`${relative}: ${error.code === "ENOENT" ? "missing" : `invalid JSON (${error.message})`}`);
    return null;
  }
  const isArray = Array.isArray(value);
  const fits = shape === "array" ? isArray : value !== null && typeof value === "object" && !isArray;
  if (!fits) {
    problems.push(`${relative}: must be a JSON ${shape}`);
    return null;
  }
  return value;
};

const checkSkill = (root, name, problems) => {
  const where = `${SKILLS_DIR}/${name}/SKILL.md`;
  if (!NAME_PATTERN.test(name) || name.length > 64) {
    problems.push(`${SKILLS_DIR}/${name}: folder name must match ${NAME_PATTERN} and be at most 64 characters`);
  }
  const file = path.join(root, where);
  if (!fs.existsSync(file)) {
    problems.push(`${where}: missing`);
    return;
  }
  const fields = parseFrontmatter(fs.readFileSync(file, "utf8"));
  if (!fields) {
    problems.push(`${where}: no frontmatter block`);
    return;
  }
  for (const key of Object.keys(fields)) {
    if (!ALLOWED_FRONTMATTER.has(key)) problems.push(`${where}: unexpected frontmatter key "${key}"`);
  }
  for (const key of ["name", "description", "license", "compatibility"]) {
    if (key in fields && typeof fields[key] !== "string") problems.push(`${where}: ${key} must be a string`);
  }
  const text = (key) => (typeof fields[key] === "string" ? fields[key] : "");
  if (fields.name !== name) problems.push(`${where}: name "${text("name")}" must equal the folder name "${name}"`);
  const description = text("description");
  if (!description) problems.push(`${where}: description is missing`);
  if (description.length > 1024) problems.push(`${where}: description is ${description.length} characters, over 1024`);
  if (/[<>]/.test(description)) problems.push(`${where}: description contains an angle bracket`);
  if (text("compatibility").length > 500) problems.push(`${where}: compatibility is over 500 characters`);
  if (fields.license !== "AGPL-3.0-or-later") problems.push(`${where}: license must be AGPL-3.0-or-later`);
  if (!fs.existsSync(path.join(root, SKILLS_DIR, name, "LICENSE"))) problems.push(`${SKILLS_DIR}/${name}/LICENSE: missing`);
};

const checkLinks = (root, entries, problems) => {
  for (const { relative, dirent } of entries) {
    if (!dirent.isFile() || !relative.endsWith(".md") || VERBATIM_TEXTS.has(path.posix.basename(relative))) continue;
    const text = fs.readFileSync(path.join(root, relative), "utf8");
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
      const resolved = path.join(root, path.dirname(relative), decodeURI(target.split("#")[0]));
      if (!fs.existsSync(resolved)) problems.push(`${relative}: link target "${target}" does not exist`);
    }
  }
};

const checkTree = (root, entries, problems) => {
  for (const { relative, dirent } of entries) {
    const base = path.posix.basename(relative);
    if (dirent.isSymbolicLink()) problems.push(`${relative}: symlinks are not allowed`);
    if (base.startsWith(".")) {
      const topLevel = !relative.includes("/");
      const underAllowedRoot = [...ALLOWED_ROOT_HIDDEN].some((entry) => relative.startsWith(`${entry}/`));
      if (topLevel ? !ALLOWED_ROOT_HIDDEN.has(base) : !underAllowedRoot) {
        problems.push(`${relative}: hidden file or folder outside the allowed list`);
      }
    }
    if (!dirent.isFile() || !TEXT_EXTENSIONS.has(path.posix.extname(relative))) continue;
    const text = fs.readFileSync(path.join(root, relative), "utf8");
    if (text.includes("\r")) problems.push(`${relative}: CR line endings`);
    if (HOME_PATH.test(text)) problems.push(`${relative}: contains a local home directory path`);
    if (!VERBATIM_TEXTS.has(base) && path.posix.extname(relative) === ".md") {
      const spelling = US_SPELLING.exec(proseOf(text));
      if (spelling) problems.push(`${relative}: US spelling "${spelling[0]}", use British English`);
    }
    if (!VERBATIM_TEXTS.has(base) && TYPOGRAPHIC.test(text)) {
      problems.push(`${relative}: contains an em dash or a curly quote`);
    }
  }
};

const checkManifests = (root, problems) => {
  const claude = readJson(root, ".claude-plugin/plugin.json", problems);
  const claudeMarket = readJson(root, ".claude-plugin/marketplace.json", problems);
  const codex = readJson(root, ".codex-plugin/plugin.json", problems);
  const codexMarket = readJson(root, ".agents/plugins/marketplace.json", problems);
  const opencode = readJson(root, ".opencode/opencode.json", problems);
  if (!claude || !claudeMarket || !codex || !codexMarket || !opencode) return;
  if (claude.name !== codex.name) problems.push(`plugin names differ: "${claude.name}" and "${codex.name}"`);
  if (claude.version !== codex.version) problems.push(`plugin versions differ: "${claude.version}" and "${codex.version}"`);
  if (!NAME_PATTERN.test(codex.name ?? "") || codex.name.length > 64) problems.push(".codex-plugin/plugin.json: invalid name");
  if (!/^\d+\.\d+\.\d+$/.test(codex.version ?? "")) problems.push(".codex-plugin/plugin.json: version must be MAJOR.MINOR.PATCH");
  if (codex.skills !== `./${SKILLS_DIR}/`) problems.push(`.codex-plugin/plugin.json: skills must be "./${SKILLS_DIR}/"`);
  const ui = codex.interface ?? {};
  for (const [field, limit] of [["displayName", 30], ["shortDescription", 30], ["longDescription", 4000], ["developerName", 80]]) {
    if (typeof ui[field] !== "string" || !ui[field] || ui[field].length > limit) {
      problems.push(`.codex-plugin/plugin.json: interface.${field} must be 1 to ${limit} characters`);
    }
  }
  if (!claudeMarket.plugins?.some((plugin) => plugin.name === claude.name && plugin.source === "./")) {
    problems.push(`.claude-plugin/marketplace.json: no entry for "${claude.name}" with source "./"`);
  }
  if (!codexMarket.plugins?.some((plugin) => plugin.name === codex.name)) {
    problems.push(`.agents/plugins/marketplace.json: no entry for "${codex.name}"`);
  }
  if (!opencode.skills?.includes(`./${SKILLS_DIR}`)) problems.push(`.opencode/opencode.json: skills must list "./${SKILLS_DIR}"`);
};

const AGENT_PLUGINS_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

// Hermes Agent reads plugin.json (Agent Plugins v1) and skills.sh.json; Command Code reads package.json.
const checkPackages = (root, names, problems) => {
  const claude = readJson(root, ".claude-plugin/plugin.json", []);
  const portable = readJson(root, "plugin.json", problems);
  const npm = readJson(root, "package.json", problems);
  const groups = readJson(root, "skills.sh.json", problems);
  if (!claude || !portable || !npm || !groups) return;
  if (portable.$schema !== AGENT_PLUGINS_SCHEMA) problems.push(`plugin.json: $schema must be "${AGENT_PLUGINS_SCHEMA}"`);
  for (const [file, manifest] of [["plugin.json", portable], ["package.json", npm]]) {
    for (const field of ["name", "version", "license"]) {
      if (manifest[field] !== claude[field]) problems.push(`${file}: ${field} must match .claude-plugin/plugin.json`);
    }
  }
  if (npm.private !== true) problems.push("package.json: private must be true");
  if (!npm.keywords?.includes("cmd-mod")) problems.push('package.json: keywords must include "cmd-mod"');
  if (!npm.commandcode?.skills?.includes(`./${SKILLS_DIR}`)) problems.push(`package.json: commandcode.skills must list "./${SKILLS_DIR}"`);
  const grouped = (Array.isArray(groups.groupings) ? groups.groupings : []).flatMap((group) => group?.skills ?? []);
  for (const name of names) {
    if (!grouped.includes(name)) problems.push(`skills.sh.json: no grouping lists "${name}"`);
  }
  for (const name of grouped) {
    if (!names.includes(name)) problems.push(`skills.sh.json: "${name}" is not a skill in ${SKILLS_DIR}/`);
  }
};

const checkCatalog = (root, problems) => {
  const expected = JSON.stringify(buildCatalog(root), null, 2);
  const file = path.join(root, CATALOG);
  const actual = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : "";
  if (actual !== expected) problems.push(`${CATALOG}: out of date, run node scripts/validate-skills.mjs --write-catalog`);
};

const checkEvals = (root, names, problems) => {
  const dir = path.join(root, EVALS_DIR);
  const evalNames = fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name)
    : [];
  for (const name of evalNames) {
    if (!names.includes(name)) problems.push(`${EVALS_DIR}/${name}: no skill with that name`);
  }
  for (const name of names) {
    const relative = `${EVALS_DIR}/${name}/trigger-evals.json`;
    const items = readJson(root, relative, problems, "array");
    if (!items) continue;
    const seen = new Set();
    let positive = 0;
    let negative = 0;
    items.forEach((item, index) => {
      if (typeof item?.query !== "string" || !item.query.trim() || typeof item.should_trigger !== "boolean") {
        problems.push(`${relative}: item ${index} needs a non-empty query and a boolean should_trigger`);
        return;
      }
      const key = item.query.trim().toLowerCase();
      if (seen.has(key)) problems.push(`${relative}: item ${index} repeats an earlier query`);
      seen.add(key);
      if (item.should_trigger) positive += 1;
      else negative += 1;
    });
    if (positive < MIN_EVALS_PER_SIDE || negative < MIN_EVALS_PER_SIDE) {
      problems.push(`${relative}: needs at least ${MIN_EVALS_PER_SIDE} should-trigger and ${MIN_EVALS_PER_SIDE} should-not-trigger queries`);
    }
  }
};

export const validate = (root) => {
  const problems = [];
  const names = skillNames(root);
  if (names.length === 0) problems.push(`${SKILLS_DIR}: no skills found`);
  const entries = walk(root);
  for (const name of names) checkSkill(root, name, problems);
  checkLinks(root, entries, problems);
  checkTree(root, entries, problems);
  checkManifests(root, problems);
  checkPackages(root, names, problems);
  checkCatalog(root, problems);
  checkEvals(root, names, problems);
  return problems;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const root = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  if (args.includes("--write-catalog")) {
    fs.writeFileSync(path.join(root, CATALOG), `${JSON.stringify(buildCatalog(root), null, 2)}\n`);
  }
  const problems = validate(root);
  for (const problem of problems) console.error(problem);
  console.log(problems.length === 0 ? "ok: no problems found" : `${problems.length} problem(s) found`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}
