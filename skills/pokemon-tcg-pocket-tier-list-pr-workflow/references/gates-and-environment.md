# Gates and environment

Setup traps, baselines and flakes for the gates listed in SKILL.md. CI runs the same commands through `.github/actions/setup`, which installs the Node version in `.nvmrc` and runs a frozen install per workspace

## Setting up a worktree

- A fresh worktree has no `node_modules` in either root, and a root install does not cover `analysis/`. Run `yarn install --frozen-lockfile` at the root and again in `analysis/` (and in `workers/kofi/` when touching it), or the analysis suite fails on missing packages such as `dotenv`
- After pulling a merge that changed `analysis/package.json` or `analysis/yarn.lock`, reinstall `analysis/` before judging any failure. A stale card package makes tests fail for a newly released set in ways that look like real defects
- Before calling a failure pre-existing, compare the installed version of the packages involved with the manifest: `node -p "require('./node_modules/<pkg>/package.json').version"`. A stale install also moves the test total
- To check a hand-edited manifest and lockfile without touching a shared tree, copy `package.json` and `yarn.lock` to a scratch directory and run `yarn install --frozen-lockfile` there. Require exit 0 and, for a removal, the package absent from the scratch `node_modules`
- A clean worktree has no Firebase build settings. Build with placeholder values on the command line, as `.github/workflows/preview.yml` does for Dependabot (`VITE_FIREBASE_APIKEY=placeholder VITE_FIREBASE_PROJECTID=placeholder ... yarn build`). A malformed key throws `auth/invalid-api-key` before React mounts, and the empty root then looks like a prerender readiness failure
- Never read, edit or overwrite a developer's `.env` to make a gate pass. Run the analysis suite with `env -u LIMITLESS_API_KEY` so a local key cannot change the result, and if a test needs a key, pass a placeholder variable and record that in the report

## Reading results

- Totals move with the repository and its data. The frontend suite has cases per ranked archetype in `best-decks.json`, so a data refresh moves the total with no code change. Compare failure counts and failing test names with the baseline, never totals alone
- To prove a failure is pre-existing, run the same command on the untouched base (a detached worktree at the base SHA, or with your work stashed) and report both results side by side, for example `1 failed / 325 passed` against `1 failed / 335 passed`. A matching failure count with a higher total is a clean change
- `analysis/src/__tests__/generate-og-images.test.ts` renders real canvases and can time out under full-suite load. If it fails, run it alone and on the base before treating it as a signal, and fix a genuine timeout with an explicit per-test limit
- A prerender failure can reproduce on an untouched `main` (a deck page timing out on its root selector). Build and run the same step on the base before attributing it to the diff, and report both results
- Root lint can fail on gitignored trees that `eslint .` still walks, such as a nested worktree. List the failing paths and test each with `git ls-files --error-unmatch <path>`. When none is tracked, confirm with `--ignore-pattern` for those trees and report the failure as local; do not edit the config to silence it
- `eslint.config.mjs` sets `no-restricted-imports` in two overrides, one for page files and one for the pure `src/app/` layer. Before adding another override of a rule already set, prove the effective rule with a temporary violating file, because a later matching override replaces the earlier options and lint stays green
- The prerender step binds `127.0.0.1:4173` (`scripts/prerender-shared.js`) and fails with `EADDRINUSE` when something already listens there. Identify the listener first (`ss -ltnp | grep 4173`). Stop it only if it is your own leftover preview server, which never exits and serves a stale build; otherwise wait
- CI's analysis job runs the suite a second time with `TMPDIR` pointing at a symlink to a real directory. To reproduce a failure from that step, do the same locally from `analysis/`: `link="$(mktemp -u)"; ln -s "$(mktemp -d)" "$link"; TMPDIR="$link" yarn test`

## Bumping the Node version

- The pin lives in `.nvmrc` (read by every workflow through the setup action), the `engines` field of the root and `analysis/` manifests, and any doc that quotes the version. Grep the old version across the tree before and after the edit
- Run both frozen installs and every gate on the target binary. Put it first on `PATH` and confirm `node -v` prints the target before the first command
- No local run can check the deploy actions, which need the Firebase service account. Read the PR's preview job and the preview-link comment for the exact head SHA (`gh pr view <n> --json comments`); a green check alone does not show the link was posted
- Move any comment that justifies the pinned version when the version changes

## Dependency and security alerts

- Read the alert's own fields: `gh api repos/PocketDecks/pokemon-tcg-pocket-tier-list/dependabot/alerts/<n>`, then `.dependency.package.name`, `.dependency.manifest_path`, `.security_advisory.vulnerabilities[0].vulnerable_version_range` and `.first_patched_version.identifier`. The `dependency` field often names the direct parent while the range and summary describe a transitive package
- Prove presence per lockfile (`grep -in "<package>" yarn.lock analysis/yarn.lock workers/kofi/yarn.lock`), list the installed tree, and read the parent's declared dependencies. When lockfiles and alert disagree, the live dependency graph decides: `gh api repos/PocketDecks/pokemon-tcg-pocket-tier-list/dependency-graph/sbom`
- Compare the vulnerable range with the resolved version in each lockfile and state per alert whether it applies. A batch of alerts usually holds one or two real ones; name the exceptions instead of implying the whole batch is live
- Never dismiss an alert on your own authority. Report the evidence and let the maintainer decide; an alert raised against an older graph closes on the next refresh after a push to the default branch
- Map each Node CVE to a code path before claiming exposure. The site is static hosting with no Node process, so visitors cannot reach a Node CVE; CI jobs and local pipeline runs can, and their blast radius is the secrets they hold. No `dns` import rules out a `dns` advisory, while the outbound `fetch` path makes TLS and decompression advisories real
- Fix with a patch bump inside the pinned major: raise the range, run `yarn install` without `--frozen-lockfile`, and read the lock diff. A family of related packages moving together is expected; unrelated churn means the install re-resolved more than the advisory needed
- In the root and `analysis/`, Dependabot opens version PRs only for `pokemon-tcg-pocket-cards`; the Ko-fi worker and the pinned actions have their own grouped entries (`.github/dependabot.yml`). Anything else is upgraded by hand when the maintainer chooses
