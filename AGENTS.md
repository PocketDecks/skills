# AGENTS.md

Read [CONTRIBUTING.md](.github/CONTRIBUTING.md) before changing this repository.

## Environment

- Use the Node version in `.nvmrc`.
- The validator and its tests use Node built-ins, so no install step is needed.

## Checks

- `node scripts/validate-skills.mjs`.
- `node --test "scripts/*.test.mjs"`.
- After a change inside a skill folder, run `node scripts/validate-skills.mjs --write-catalog` and commit the updated catalogue.
- After a description change, run the trigger evals and record the rates in the pull request.

## Layout

- One folder per skill under `skills/`, with `SKILL.md`, `LICENSE`, `references/` and any helper scripts.
- Keep `SKILL.md` short and put detail in named reference files.
- Link every new documentation page from the README or the page that uses it.

## Writing

- British English, straight quotes and no em dashes in prose.
- No local paths, personal email addresses, tokens or private tool names.
- Name a file, command or symbol for every claim about a target repository.

## Promotion

- Treat this repository as the published copy of each skill.
- Leave Hermes profile copies out of commits and promote reviewed content through [skills/publish-manifest.json](skills/publish-manifest.json).
