# CI, previews and deploys

`docs/how-to/deploying-and-hosting.md` ("Which workflow does what") and `docs/how-to/running-frontend-checks.md` ("What CI runs") describe the workflows. This file covers reading their results, editing them, and checking previews and production

## The workflows

- `ci.yml` (CI) runs on pushes to `main`, PRs against `main` and manual dispatch. Its jobs are `frontend` (generated-file check, typecheck, lint, tests, script tests, Firestore rules), `analysis` (typecheck, tests, and the tests again with `TMPDIR` behind a symlink), `kofi` and `actionlint`
- `preview.yml` builds every PR from a branch in this repository and deploys it to a Firebase preview channel, which posts the link as a PR comment. Fork PRs skip it, and Dependabot builds with placeholder settings and never deploys
- `deploy.yml` runs after a successful CI run for a push to `main` (`workflow_run`). It checks out the run's head SHA, skips the work when `main` has moved on, builds, runs `yarn verify:premium` and deploys the live channel
- `sync-pairings.yml` scrapes the Limitless listings every Monday and opens or updates the weekly listing PR

## Reading a red run

- Inspect the failed job at the exact head before changing code: `gh run list --commit <sha>`, then `gh run view <run-id> --json jobs,headSha` and `gh run view <run-id> --log-failed`
- If the failure is a timeout or runner condition with no failed assertion, compare the equivalent check at the same SHA and rerun once with `gh run rerun <run-id> --failed`. Keep the local result, the CI failure and the rerun separate in the report, and do not call the PR green until a check at that head completes successfully
- Report the state of long Preview and Deploy runs once and carry on with other work rather than blocking on them. Check again before calling the PR ready
- Keep an earlier local failure as a historical result. If a local build failed without runtime configuration, do not explain it with a later configured build; state both and claim only what the workflow file and logs show
- Before reporting secret exposure, tell apart a secret's name, a workflow reference to it, a masked log value and an unmasked value. A masked value shows the platform hid it. Call it a leak only when raw secret material is visible, and never copy a secret value into a report

## Editing workflows

- Style rules for prose never apply to YAML, shell or code. A double quote in shell is an operator; requoting a workflow to satisfy a writing rule stops variables expanding
- Run actionlint locally at the version `ci.yml` pins before the first edit and record its findings. Download the pinned `linux_amd64` release archive, verify it against a literal SHA-256 (`printf '%s  %s\n' '<sha>' '<archive>' | sha256sum -c -`), extract only the binary, and never pipe a downloaded script into a shell. In CI keep the literal hash; a checksums file fetched from the same release cannot detect a replaced asset
- `.github/actionlint.yaml` uses a top-level `paths:` map keyed by globs, each with an `ignore:` list of message regexes. A top-level `ignore:` is not a supported shape and leaves every finding active, so rerun the linter to prove a suppression works. Ignore by path with a short comment naming the upstream issue, and keep a negative control: an unknown key in a scratch copy of a workflow must still fail. The scratch directory needs a `.git` directory, or the linter exits before linting
- Pin actions as `@<40-character SHA> # vX.Y.Z`. Resolve a tag with `gh api repos/OWNER/REPO/commits/TAG --jq .sha`; to name the tag of a SHA already in the tree, match it in `git ls-remote --tags <repo-url>`. Keep the version comment, which Dependabot reads, and check every directory the `github-actions` Dependabot entry lists when moving an action
- Set `timeout-minutes` from measured step times on recent green runs, with headroom, and give emulator steps their own shorter limit
- A deploy triggered by `workflow_run` must check out `github.event.workflow_run.head_sha` and use it in every freshness check, since `GITHUB_SHA` under that trigger is the default branch head. Gate the job on a successful conclusion and a push event
- Persist a value computed in one step and reused later through `GITHUB_ENV`. Recomputing a UTC date can cross midnight and push to a different branch
- Removing a secret from a workflow removes the `env:` key once it is empty; re-parse the file with the repository's `js-yaml` afterwards
- `scripts/__tests__/workflow-policy.test.js` pins workflow shapes. When a change alters a shape, update the expected values to the new contract and keep the assertions that prove ordering and gating; never delete assertions to go green
- Drive freshness and dispatch steps through fake `git` and `gh` shims that log their calls, covering current, stale and failing commands. Build new shims from an existing working shim's `printf` format instead of retyping escapes, since `\n` inside a JS template literal changes meaning with each level of escaping. Shims log expanded arguments, so assert on expanded values. Say which paths stay untested until a real Actions run

## Bot-opened PRs

- Events created with `GITHUB_TOKEN` start no workflows, so a PR the bot opens gets no CI on its own. `sync-pairings.yml` shows the pattern: after the whole PR block, `gh workflow run ci.yml --ref "$BRANCH"` with `actions: write` on the job, retried up to three times inside an `if` condition (which `bash -e` does not abort on), then a named failure message. A dispatch placed before `gh pr create` can fail and leave a pushed branch with no PR
- If PR creation fails with `GitHub Actions is not permitted to create or approve pull requests`, the branch is pushed and the PR is missing. The setting has enterprise, organisation and repository levels; a greyed-out repository checkbox means the organisation policy is off. Check the repository value with `gh api repos/<owner>/<repo>/actions/permissions/workflow`
## Previews

- Open the preview URL in a fresh tab or hard-reload first; the channel reuses one URL per PR, and a tab left open across a push requests chunks that no longer exist
- Exercise the routes the PR touches, typically `/tier-list`, `/statistics` and a real deck page whose slug you took from the tier list's links, never guessed. Require no `Error`, `undefined`, `NaN` or `Loading...` in the body text and real data on screen. A rendered deck code on a deck page shows the energy inference and attack-cost path works end to end
- Answer a performance complaint with numbers. Emulate a mid-range phone (6x CPU throttling, a 390x844 viewport at device pixel ratio 3, cold cache), sum `decodedBodySize` of the `.js` resource entries, and run the same protocol against production. Measured parity does not close a real user's report; keep looking for the behaviour they hit
- For Lighthouse figures, run the Lighthouse CLI or PageSpeed Insights against the preview from a browser profile without extensions, with `CHROME_PATH` set (Lighthouse ignores `PUPPETEER_EXECUTABLE_PATH`, as `.env.example` notes). Save JSON outside the repository, extract scores programmatically, run every requested route and form factor, and never fill a missing cell from a related route. Report ads-allowed numbers when ads are in scope, and record preview-only conditions such as `noindex`
- To compare animations, pause the element that owns the animation at the same negative delay and viewport on both pages, and check computed animation name, delay, play state and transform before treating frames as matched

## After a merge

- Find the Deploy run that followed CI for the merge commit and open its job. Deploy reports success even when it skipped a commit that `main` had already moved past, so confirm the deploy step itself ran and record the live URL it printed
- Prove the deployed content, not only the deploy. Fetch the live data files (each public window variant and the un-suffixed file) and compare a named deck's values with the committed file, and grep the served HTML for the feature's markup, since the prerendered page is what crawlers and first paint see
- Smoke-test production from its sitemap: fetch every `<loc>`, count response statuses, scan bodies for loopback hosts, compare a nonexistent route with a real one to catch fallback-only 200s, spot-check titles, canonicals and OG images, and fetch the assets each page type references. Report `checked=N problems=M` with the URL tested
