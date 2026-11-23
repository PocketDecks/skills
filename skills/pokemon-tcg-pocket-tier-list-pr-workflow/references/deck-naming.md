# Deck naming and Limitless listings

Archetype names come from Limitless set pages, scraped into `analysis/src/data/limitless-decks.json` by `analysis/scripts/sync-pairings.ts` (`yarn sync-pairings` from `analysis/`). `analysis/src/utils/get-deck-name.ts` reads that store as its only source of names. `docs/how-to/updating-archetypes-and-expansions.md` explains how a name is chosen; this file holds the rules for changing that code and its data

## The listing store

- `sets.<SET>.decks[]` holds `{ name, slug, count }` rows exactly as the set page shows them. Each run replaces one set's array (`mergeSetPage` in `analysis/src/utils/deck-listing-store.ts`) and leaves other sets alone. Nothing folds across runs, so a naming change re-reads raw rows instead of inheriting old decisions
- The scrape covers the standard sets in `STANDARD_SET_CODES` (`analysis/src/utils/set-codes.ts`). The promo pools and the A4b and B4b reprints sit in `NON_STANDARD_SET_CODES` and are not scraped. The list is closed on purpose, so a new set reaches the scrape only when its code joins it
- Reprint sets (`REPRINT_SETS` in `analysis/src/utils/slug-cards.ts`, currently A4b and B4b) fold onto the earliest earlier printing of the same name, so one card never spans several archetype rows. Slug resolution lives in that module, shared by the scraper and the matcher
- The store stays under `analysis/src/data/`. `analysis/data/` is gitignored, and a file there vanishes from the PR
- The scraper exits non-zero when any page fails, a page duplicates another set's page, a slug has an unknown set code or nothing was fetched. One failed page keeps that set's previous snapshot in the file, but the run still fails so the refresh job stops
- A new set can list very few archetypes; a set with one row is not proof of a truncated scrape. Check the Limitless page before assuming one
- Before redesigning the store over a claimed data loss, check whether the rows are in the store. A loss at name-resolution time is not a scrape defect
- Before trusting a variable this script reads in an error path, grep for its declaration and run `node --check`. An uncaught `ReferenceError` in a `catch` block aborts the whole run and defeats the per-set error isolation

## The matcher

- A listing row is a candidate only when the deck holds every card the row names, matched by card name so reprints still match. Containment is necessary but not enough. Real decks run tech Basics as two-ofs, and a popular listing made of them would otherwise outname the centrepiece
- Ranking is `compareRank` in `get-deck-name.ts`. Read it before reasoning about a name, since the order of its signals is not fixed
- Fix naming with general signals, never with per-pair special cases. Each exception narrows the next case and the set never converges
- A card that another card in the deck evolves from is support, not the lead, so Magneton never outnames Magnezone
- Archetypes Limitless never lists are seeded in `SEEDED_ARCHETYPES`. A deck that matches nothing goes to the `UNMATCHED_DECK` bucket (`"unmatched-deck"`), which counts in field shares and is dropped from published rows; `docs/reference/pipeline-output-contract.md` explains why
- Card keys read `Name SET NN` (`Magnezone B1a 26`), with the set code between name and number. Strip the ` SET NN` tail before testing for `ex` or `Mega` or comparing species, or a pattern anchored at the end never matches
- Index rows by card name before matching. A nested scan of every row per deck turns a run of seconds into minutes over the golden's thousands of cases

## Changing names safely

- `analysis/src/__tests__/get-deck-name.test.ts` holds the unit cases, pinned to the fixture listing `analysis/src/__fixtures__/limitless-decks-naming.json`. A new rule ships with a test naming the real pairing it decides
- `analysis/src/__tests__/deck-name-golden.test.ts` compares `buildGolden()` with `analysis/src/__fixtures__/deck-name-golden.json`, built from the live listing store plus real deck lists. Regenerate it deliberately with `yarn golden:generate` from `analysis/`, never in CI, and commit it with the change that moved it
- Read the golden diff before accepting it. New listing rows, reprint re-resolutions and card-order swaps are expected noise; a `real:` key whose name changes to a different archetype renames a deck the site shows and needs a reason in the PR body
- The golden's case-count assertion is a floor, not an exact count. Lower it only when the store's structure changes, and say why
- To judge a disputed name, trace one real deck through `getDeckName` with a throwaway script that lists every contained row and how it ranks. The golden's distribution alone hides why a name won
- The previous behaviour is the calibration reference. Compare value distributions against `git show origin/main:analysis/src/__fixtures__/deck-name-golden.json`, and justify in the PR body any move for cases nobody flagged

## Weekly listing PRs

- `.github/workflows/sync-pairings.yml` runs weekly, commits only the listing store to `automated/pairings-<date>`, runs the analysis typecheck and tests, and opens a PR, as a draft when those checks fail. Because the golden reads the live store, a week that changes a listing usually arrives as a draft with the golden test failing
- To finish such a PR, check out its branch in a scratch worktree, install `analysis/` from its lockfile, run `yarn golden:generate`, read the diff as above, and push the regenerated fixture to the same branch when asked
- The weekly sync and the local refresh both rewrite the listing store and the golden, so a pairings PR can arrive already superseded. Before resolving conflicts, list them without touching the worktree (`git merge-tree --write-tree --name-only origin/main <branch>`), then compare content rather than diff size: load both versions of the store and compare `(set, slug) -> count`. No key the branch adds and no count the branch raises means the branch is stale
- Prove the branch is empty instead of asserting it. Merge `origin/main`, take `main`'s store, regenerate the golden and diff the whole tree against `origin/main`. An empty diff means the PR adds nothing; ask whether to close it or to rerun the sync on top of `main`, because closing discards nothing while a rerun replaces the PR's content
- A rerun that prints no change is a finding, not a failure. It confirms from the other side that `main` already carries everything the live site lists
