# Pipeline runs and pipeline code

`docs/reference/analysis-pipeline.md` documents the deck store, the store lock, its refusals and the recovery procedure. `docs/how-to/running-the-scheduled-refresh.md` describes the steps `yarn refresh:job` runs. This file adds the rules for changing that code, testing it and reviewing refresh PRs

## Refresh runs

- Run the refresh with `yarn refresh:job` from `analysis/`; `yarn refresh:job --dry-run` records the commands without running them. The job works in a scratch worktree created by `yarn refresh:outputs begin` (run from `analysis/`) and moves finished outputs back with `yarn refresh:outputs stage`, so a run that fails before the stage step leaves the generated files in the main checkout untouched
- A behaviour change to `analysis/scripts/refresh-job.ts` updates the guide in the same PR. `analysis/src/__tests__/refresh-job-lists.test.ts` reads the guide and fails when the two disagree
- The pipeline fails closed. Never override a refusal from `yarn start`; `assertPublishable` (`analysis/src/utils/assert-publishable.ts`) checks archetype floors, ranked counts, data age, slug collisions, the listing store's newest set and the unmatched-deck share before anything is written
- Raw tournament data (`analysis/data/`, gitignored) stays on the machine that ran the download and is never staged
- For anyone who is not a maintainer, running the pipeline is a separate authorisation from a code fix. Downloading, syncing pairings and regenerating public data rewrite tracked files, so ask before running them inside a code task, and offer a local check that reaches the same conclusion where one exists (a production build un-skips the `dist/` script tests)
- When asked what a PR touched, separate references from data. `git fetch`, `gh api` reads and a frozen install fetch no data; a download, a pairing sync or a pipeline run does. Say which ran
- After a rebuild, prove the generated data reaches its consumer: `yarn build` must prerender and pass `verify-dist-html`, and a browser-rendered `/tier-list` must show `/deck/` links. Deck counts and image parity alone do not show the ranking survived
- When only one published file should change, diff every other file in `public/data/` against `git show HEAD:<path>` and require them byte-identical, then diff the changed file field by field and check row order
- In a merge conflict on generated data, keep `main`'s version unless the change is meant to move that file. A rebuild touches unrelated rankings, images and timestamps
- Stage OG image changes with `git add -A public/og/deck`, so renamed decks land their deletions and additions in the same commit

## Writing files and recovering

- Write pipeline JSON through `writeArtefacts` (`analysis/src/utils/write-artifacts.ts`), which stages each target as `<target>.tmp`, swaps through `<target>.bak` and marks new targets with `<target>.created`. A plain `writeFileSync` truncates the target before it can fail and loses the previous snapshot
- After an interrupted write, never restore or delete staging files from their suffixes, and never treat a clean `yarn store:verify` (from `analysis/`) as proof that the files came from one write. Stop writers, preserve an untouched copy of `analysis/data/` and ask the maintainer to approve a specific recovery, as the recovery section of `docs/reference/analysis-pipeline.md` sets out
- A change to the write protocol is incomplete until every passage that lists the staging files agrees with it: the scheduled refresh guide, `docs/reference/analysis-pipeline.md`, `docs/tutorial/running-pipeline-updates.md` and the `store:verify` reporting
- OG images stage beside the target and publish by renaming the live directory to `<target>.previous`, then the staging directory into place (`analysis/src/utils/generate-og-images.ts`). Scan for leftovers beside the target, never in `os.tmpdir()`, which can sit on another volume
- When a downloader updates two files that form one logical pair, stage both complete payloads before replacing either, and test with an injected failure on the second replacement that both old targets come back

## Testing entry points

- Mock `global.fetch` only. A mock at `getTournamentDecks` or `getPairings` cannot see a missing status check, which is the defect class these tests exist for
- The Limitless client (`analysis/src/utils/limitless-client.ts`) retries 429 and 5xx responses up to four attempts in all, waiting 500 ms and doubling, or the `Retry-After` value capped at 30 s. `vi.useFakeTimers()` with `await vi.advanceTimersByTimeAsync(...)` settles a retry run at once; restore real timers in `afterEach` and right after the failing call
- The analysis `tsconfig.json` has no DOM library, so type a fetch mock's parameter as `string`, not `RequestInfo` or `URL`
- Export the orchestration as `main(options)` with an injectable store path, fetch and set list, and return the run state. Set `process.exitCode` inside the `if (require.main === module)` block, never in `main`, or importing the script sets the test process's exit code
- Seed a temporary store and assert on it. A failing path leaves the file byte-identical, a successful path writes only the new rows, and no `.tmp`, `.bak` or `.created` file survives
- `analysis/src/__tests__/layering.test.ts` refuses a `src/` import of `analysis/scripts/` unless `PERMITTED_CROSSINGS` names the importing file with a `specifier` and a `reason` longer than 20 characters. Add the entry and import with a literal path. A computed path (`path.resolve(__dirname, ...)`) passes the scan without permission, which is the dodge the guard exists to catch. Prove the entry by removing it once and watching the scan name the file
- Shared pipeline types live in `src/types/pipeline-data.ts` at the repository root. From `analysis/src/__tests__/` the import is `../../../src/types/pipeline-data`
- A script that recomputes a published metric is a second implementation with its own population. Make diagnostics read the published files (values from `best-decks.json`, snapshot identity from `meta-share.json`'s `generatedAt` and `windowDays`), print that identity above the output, and take an optional data directory so tests can drive fixtures

## Picking up an issue

- Re-run the issue's reproduction at the current head before fixing. A later refactor may already close it, and a data refresh moves the cited counts, so compare the mechanism and the shape of the mismatch rather than the numbers
- When the code is already correct, the deliverable is the missing regression test plus any remaining hole, and the PR body says which part was already fixed. Do not invent a change to match the issue title
- Read the acceptance criteria for cases the title omits (status classes, boundary inputs). A reviewer quoting one of them is quoting the issue, not widening scope
- Guard scripts that compare SHAs compare by prefix: `git rev-parse --short` can return seven or more characters depending on the object store
