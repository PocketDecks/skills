# Testing quirks in this repository

Failures that read like product defects but come from the test set-up. The frontend suite runs on Vitest with jsdom; `docs/how-to/running-frontend-checks.md` covers layout and fetch stubbing

## i18n and mocks

- `t()` returns raw keys until i18n is initialised. A test that asserts translated strings runs, in `beforeAll`, `await i18n.init()`, `await i18n.changeLanguage("en")` and `await i18n.loadNamespaces("translation")`, importing `i18n` from `src/i18n`
- A `vi.mock("react-i18next")` stub must carry every field the mounted component reads. When a component starts reading a new field such as `i18n.language`, grep the test tree for `vi.mock("react-i18next"` and update each stub, or those tests crash at render with `Cannot read properties of undefined`. Stub the language the mounted route actually resolves to; a `ja` stub on an unprefixed path fakes the mismatch the language tests exist to catch
- `vi.mock` paths resolve relative to the test file, not to the module under test. A wrong path mocks nothing, the real `src/config/firebase.ts` runs, and CI fails with `auth/invalid-api-key` while a local `.env` lets it pass. Move `.env` aside to reproduce CI locally
- A mock factory for a module with several exports must provide every name its importers touch, or the import throws an error saying no such export is defined on the mock
- Never import from `src/App.tsx` in a test. It pulls `AuthContext` and Firebase in at module load. Build test query clients from `queryClientOptions` in `src/app/query-client.ts`, since a hand-rolled client with the default `staleTime` of 0 makes dedup tests flaky under load
- When a mocked data hook must read React context, create its `vi.fn` with `vi.hoisted`, return it from the `vi.mock` factory, and set its implementation outside the factory
- `src/index.tsx` mounts React when imported, so tests cannot import it

## Vitest and jsdom behaviour

- A test that renders JSX must be a `.tsx` file, even if a plan says `.ts`. Vitest parses `.ts` without JSX and reports an opaque parse error
- A test that makes the code under test throw on purpose surfaces as an unhandled rejection that flags the whole run. Register `process.on("unhandledRejection", ...)` before the call and remove it with `process.off` in `finally`
- `sessionStorage` persists across tests in one file. Clear it in `afterEach` for storage-backed logic
- The reporter swallows `console.log` from tests. To inspect values mid-test, write to `process.stdout` or throw an `Error` that carries them, then delete the probe
- For repeated runs, loop in the shell and write each run to its own file, then read the totals from the files
- Router imports come from `react-router` (version 8), not `react-router-dom`

## Deck page tests

- Mirror the provider stack in `src/pages/deck/__tests__/DeckPage.head.test.tsx`. A missing provider throws at the hook call, and a trimmed wrapper can pass most cases while failing only the extinction case
- `useFilters` is the default export of `src/app/use-filters.ts`. `src/components/FilterContext.tsx` exports the context and its provider, not the hook, so a named import from there is `undefined` at call time
- To change a filter mid-test, render a small toggle inside the same route element (`element={<><DeckDetailPage /><Toggle /></>}`). A toggle on another route never mounts
- Fixture decks may reference only card ids in `src/app/__fixtures__/cards.json`. A list with an unresolved id is skipped, which breaks the assertion for the wrong reason
- `isAffordable` in `src/app/deck-filters.ts` caps each card at `2 - missingCount` copies. Cutting one copy of a two-copy card leaves that list affordable, so a test that must evict a list cuts both copies. Work the arithmetic per test rather than trusting a comment
- Locate card tiles by image URL scoped to button tiles (`within(tile).queryAllByRole("img")`). Alt text repeats across printings, and image URLs carry `set/number` (`cards/b3/079.webp`), never the dash id, so `src.includes(cardId)` matches nothing and can pass a whole sweep
- The cut invariant is the tile's copy count strictly decreasing, not the tile vanishing, because a card that a surviving list carries once stays visible after one cut
- The tier-list build (`src/app/build-decks.ts`) trims everything after the last `&`-named deck when `applyPairedTrim` is set. `src/contexts/DecksContext.tsx` sets it only while no energy filter is active (`applyPairedTrim: energy === null`), and detail pages never trim. Pass the option at each call site rather than having `buildDecks` infer it

## Fixtures and counts that move with data

- Suites with one case per ranked deck shrink and grow with `best-decks.json`. A test-count change equal to the deck-count change is data, not a lost test
- When a pipeline type gains a required field, grep the test tree for fixtures of that type, fetch mocks included, and add the field. An `as unknown as` cast hides the gap until render. Prefer adding the field over making it optional
- After a rename, grep `src/`, `analysis/` and `docs/` for the old name. A stray fixture or doc table row survives the typecheck and ships the old contract
- A display change that adds i18n keys owns all eleven `src/locales/*_translation.json` files in the same commit, because `src/locales/__tests__/translation-parity.test.ts` fails on any key English has and another locale lacks
