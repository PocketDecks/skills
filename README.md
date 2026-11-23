# PocketDecks skills

Agent skills for working on [PocketDecks](https://github.com/PocketDecks) repositories.

| Skill | What it covers |
| --- | --- |
| [pokemon-tcg-pocket-tier-list-pr-workflow](skills/pokemon-tcg-pocket-tier-list-pr-workflow/SKILL.md) | Changing, reviewing and verifying pull requests on [pokemon-tcg-pocket-tier-list](https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list), the Pokémon TCG Pocket tier list behind [pocketdecks.top](https://pocketdecks.top) |

## Install

### Claude Code

```text
/plugin marketplace add PocketDecks/skills
/plugin install pocketdecks-skills@pocketdecks
```

### Codex

```sh
codex plugin marketplace add PocketDecks/skills
```

Then run `codex`, open `/plugins` and install `pocketdecks-skills`. Start a new session before using it.

### OpenCode

Add the skills catalogue to your `opencode.json` (global or per project):

```json
{
  "skills": ["https://raw.githubusercontent.com/PocketDecks/skills/main/skills/"]
}
```

Running OpenCode inside a clone of this repository loads the skills through [.opencode/opencode.json](.opencode/opencode.json).

### Any other agent

Copy a folder from `skills/` into your agent's skills directory. Each folder holds a `SKILL.md` with its trigger description and instructions, a `references/` folder it loads on demand, and any helper scripts.

## Layout

| Path | Purpose |
| --- | --- |
| `skills/` | One folder per skill, plus `index.json`, the OpenCode catalogue |
| `evals/` | Trigger evals for each skill, see [evals/README.md](evals/README.md) |
| `scripts/validate-skills.mjs` | Checks frontmatter, links, manifests, the catalogue, the evals and the published text |
| `.claude-plugin/` | Claude Code plugin and marketplace manifests |
| `.codex-plugin/`, `.agents/plugins/` | Codex plugin manifest and marketplace |
| `.opencode/` | OpenCode project config for this repository |

## Contributing

Read [CONTRIBUTING.md](.github/CONTRIBUTING.md) and follow the [code of conduct](CODE_OF_CONDUCT.md). If you are not a maintainer, say in your pull request whether it was AI-assisted.

## Licence

Copyright (C) 2026 PocketDecks. Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
