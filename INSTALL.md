# Install

Install the marketplace or package once, then start a new session so the skill loads.

## Claude Code

```text
/plugin marketplace add PocketDecks/skills
/plugin install pocketdecks-skills@pocketdecks
```

## Codex

```sh
codex plugin marketplace add PocketDecks/skills
```

Open `/plugins` in `codex` and install `pocketdecks-skills`, then start a new session.

## OpenCode

Add the skills catalogue to `opencode.json`, either globally or per project.

```json
{
  "skills": ["https://raw.githubusercontent.com/PocketDecks/skills/main/skills/"]
}
```

Running OpenCode inside a clone of this repository loads the skills through [.opencode/opencode.json](.opencode/opencode.json).

## Command Code

```sh
command-code mods add PocketDecks/skills
```

The package ships `skills/` through `commandcode.skills` in [package.json](package.json), so the skills load in every session the package loads in. Add `--global` to install for every project. To copy one skill instead, run `command-code skills add PocketDecks/skills -s <name>`.

## Hermes Agent

```sh
hermes plugins install PocketDecks/skills
```

The repository is an Agent Plugins v1 package, with [plugin.json](plugin.json) at the root and the skills in `skills/`. Portable plugins install disabled, so enable it with `hermes plugins enable pocketdecks-skills`. To install one skill instead, run `hermes skills install PocketDecks/skills/skills/<name>`. [skills.sh.json](skills.sh.json) groups the skills on skills.sh and in the Hermes skills hub.

## Any other agent

Copy a folder from `skills/` into the agent's skills directory. Each folder holds a `SKILL.md` with its trigger description and instructions, a `references/` folder loaded on demand, and any helper scripts.
