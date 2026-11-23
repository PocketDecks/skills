# Contributing

Thanks for helping. This repository publishes agent skills, so every change is read by people and by models. Keep it accurate, short and checkable.

## Before you open a pull request

1. Use the Node version in `.nvmrc`.
2. Run the validator and its tests from the repository root:

   ```sh
   node scripts/validate-skills.mjs
   node --test "scripts/*.test.mjs"
   ```

3. If you changed any file inside a skill folder, regenerate the OpenCode catalog and commit it with the change:

   ```sh
   node scripts/validate-skills.mjs --write-catalog
   ```

4. If you changed a skill's `description`, rerun its trigger evals (see [evals/README.md](../evals/README.md)) and say in the pull request how the trigger rates moved.

## Writing skill text

- Write rules as instructions an agent can act on and check, not as history of a past pull request.
- Name a file, command or symbol for every claim about the target repository, so a reviewer can verify it.
- Use British English, straight quotes and no em dashes.
- Never include local paths, personal email addresses, tokens or the names of private tools.
- Keep `SKILL.md` lean. Put detail in `references/` and name each reference file in `SKILL.md`.

## Commits and pull requests

- Commit messages are a single [Conventional Commits](https://www.conventionalcommits.org/) subject line: `type(scope): summary`, imperative, lower case after the colon, no trailing full stop. Types are feat, fix, refactor, perf, style, test, docs, build, ops and chore. Workflow changes go under `build`.
- No `Co-Authored-By` trailers for tools.
- Keep the pull request body short: a list of what ships and one line on how you checked it.
- If you are not a maintainer, say in the pull request body whether the change was AI-assisted.

## Code of conduct

This project follows the [code of conduct](../CODE_OF_CONDUCT.md).

## Licence

By contributing, you agree that your contributions are licensed under the [GNU Affero General Public License v3.0 or later](../LICENSE).
