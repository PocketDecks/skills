# PocketDecks skills

Agent skills for working on [PocketDecks](https://github.com/PocketDecks) repositories.

| Skill | What it covers |
| --- | --- |
| [pokemon-tcg-pocket-tier-list-pr-workflow](skills/pokemon-tcg-pocket-tier-list-pr-workflow/SKILL.md) | Changing, reviewing and verifying pull requests on [pokemon-tcg-pocket-tier-list](https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list), the Pokémon TCG Pocket tier list behind [pocketdecks.top](https://pocketdecks.top) |

## Install

See [INSTALL.md](INSTALL.md) for Claude Code, Codex, OpenCode, Command Code, Hermes Agent and manual installation.

## Layout

| Path | Purpose |
| --- | --- |
| `INSTALL.md` | Install commands for each supported agent |
| `skills/` | One folder per skill, plus `index.json`, the OpenCode catalogue |
| `evals/` | Trigger evals for each skill, see [evals/README.md](evals/README.md) |
| `scripts/validate-skills.mjs` | Checks frontmatter, links, manifests, the catalogue, the evals and the published text |
| `scripts/bump-version.mjs` | Sets the release version in all four plugin manifests |
| `.claude-plugin/` | Claude Code plugin and marketplace manifests |
| `.codex-plugin/`, `.agents/plugins/` | Codex plugin manifest and marketplace |
| `.opencode/` | OpenCode project config for this repository |
| `plugin.json` | Agent Plugins v1 manifest for Hermes Agent |
| `package.json` | Command Code package manifest |
| `skills.sh.json` | Skill groupings for skills.sh and the Hermes skills hub |

## Contributing

Read [CONTRIBUTING.md](.github/CONTRIBUTING.md) and follow the [code of conduct](CODE_OF_CONDUCT.md). If you are not a maintainer, say in your pull request whether it was AI-assisted.

## Licence

Copyright (C) 2026 PocketDecks. Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
