import fs from "node:fs";

const FILES = [
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "plugin.json",
  "package.json",
];
const VERSION = /^\d+\.\d+\.\d+$/;
const [next] = process.argv.slice(2);

if (!next || !VERSION.test(next)) {
  process.stderr.write("usage: node scripts/bump-version.mjs MAJOR.MINOR.PATCH\n");
  process.exit(1);
}

try {
  const first = fs.readFileSync(FILES[0], "utf8");
  const found = /"version":\s*"(\d+\.\d+\.\d+)"/.exec(first);
  if (!found) throw new Error(`${FILES[0]}: no version to replace`);
  const current = found[1];
  const needle = `"version": "${current}"`;
  const replacement = `"version": "${next}"`;
  const updates = FILES.map((file) => {
    const text = fs.readFileSync(file, "utf8");
    if (text.split(needle).length - 1 !== 1) {
      throw new Error(`${file}: expected exactly one ${needle}`);
    }
    return [file, text.replace(needle, replacement)];
  });
  for (const [file, text] of updates) fs.writeFileSync(file, text);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
