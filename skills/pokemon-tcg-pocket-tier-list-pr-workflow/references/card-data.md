# Card data

Card and expansion data come from the `pokemon-tcg-pocket-cards` npm package, pinned with a caret range in both the root and `analysis/` manifests. `docs/reference/card-data-contract.md` documents the core projection, the field mapping and where normalisation happens

## Payloads

- The frontend bundles the typed `core` and `expansions` exports (`src/app/constants.ts`); nothing fetches card data at runtime. The analysis package imports the full `data/v5/cards.min.json` and `expansions.json`
- The core projection keeps the prints that appear in decks and leaves out art variants that duplicate a kept print. That suits deck tools but is the wrong source for set-completion or checklist views, which need the full payload
- Core omits `ex`, `health` and `stage` on Trainers rather than setting them to `null`, and `normaliseCard` in `src/app/cards-api.ts` coerces them back. A test that asserts the old shape must keep doing so after any payload change
- Attack costs come from `src/data/attack-costs.json`, which `scripts/generate-attack-costs.mjs` builds at prebuild from `data/v5/cards.gameplay.no-image`, keyed by `deckBuilderNr` so alternate prints behave alike. `yarn check:generated` runs it with `--check`. `src/app/deck-energy.ts` reads these costs to infer energy types, because `best-decks.json` ships only ids and counts while a shareable deck code needs an energy block. Never bundle the gameplay payload for this, and never hand-maintain per-card energy overrides; Dragon costs match no single type
- Trust the package's generated `data/v5/*.d.ts` for field nullability. An `as unknown as LocalType[]` cast bypasses it and turns a nullable field into a non-null claim. Widen the local type, then coerce at the read site or the data-building step
- To learn what a subpath import types as, compile a small consumer file against the installed package in a scratch directory, checking the default import and the named type together. TypeScript synthesises a default export for a direct JSON import but not through a package `types` condition, so probing the JSON file can disagree with the real import
- To inspect an unreleased or uninstalled version, run `npm pack pokemon-tcg-pocket-cards@<version>` in a scratch directory and list or measure its `data/v5` files
- Prove coverage before swapping a payload. Extract every card id from `public/data/best-decks.json` (each `lists[].cards[]` entry is `"<count>:<id>"`), diff it against the candidate payload, then run the real-data deck sweep
- Before quoting a bundle saving, find where the JSON landed. It is inlined into a shared chunk, not the importing module, so list `dist/assets` by size with raw and gzip sizes and grep for a known card id. Count the non-data code in that chunk when reporting the cut

## Package bump PRs

- Dependabot opens one grouped PR for the package across `/` and `/analysis`. Check that both manifests carry the intended range and that both lockfiles resolve the same version, tarball and integrity hash
- Run `yarn check:generated` and inspect tracked generated consumers. When the new version adds a row a build-time table consumes, regenerate that table in the bump commit, prove the generator is deterministic by running it twice, and leave published data untouched
- A new set needs its code in `STANDARD_SET_CODES` (`analysis/src/utils/set-codes.ts`); until then `sync-pairings` fails on unknown set codes. `EXPANSION_RELEASE_DATE` moves by itself with the package
- Run any package-backed regression that was skipped before the bump and report its explicit pass, not the suite total. A green suite with that case skipped says nothing about the new set
- When newest-set selection can tie on `release_date`, break the tie on a stable id and test the same candidates in both input orders. A strict `>` keeps package order and brings back the positional bug the date selector replaced. Use a same-day fixture that does not hit a fallback date
- For build checks that scan HTML, assert each failure mode's exact message and test the branch where no set is eligible. Parse rendered image sources once and run every image check over that collection, rather than searching raw HTML
- Keep the app and analysis policies separate when a plan gives each package its own. The package boundary is part of the contract; decline a reviewer's deduplication suggestion with that reason
- Before editing `.github/dependabot.yml`, read GitHub's current options reference, validate the edited file, and run a deliberately broken copy as a control
