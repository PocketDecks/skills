# Frontend

`docs/reference/frontend-architecture.md` maps the providers, routes, query keys, contexts and pure helpers. `docs/explanation/ads-premium-and-consent.md` explains the ads, premium and consent layers. This file holds the contracts and traps that reviews keep returning to

## The deck page contract

- `/deck/:deckId` resolves its deck through `useDeckDetail` and `resolveDeckDetail` in `src/app/deck-resolution.ts`, by id from the raw pipeline data, filtered only by the missing-card rule. Never filter it by rank, paired trim, energy, EX, expansion or deck count, because any of those can drop a deck the visitor has already opened, and a fallback to a second build then renders a stale best list
- Cutting a card works like the tier list: missing counts change, the deck re-resolves, the best list swaps, and the grid, stats and alternatives move together. Do not reimplement cut visuals by hiding or dimming tiles
- When cuts leave no affordable list, the page stays up with the empty-state notice and a working Undo (`DeckEmptyState`). Only an unknown slug shows "Deck not found". Judge extinction with the missing-card rule on the deck's own lists, never by the deck's absence from the filtered tier list, which other filters also shrink
- Patching one exit condition of a ranked, filtered or trimmed collection used as an identity lookup leaves the bug class open, because any other way out of that collection reopens it. Look the deck up by id instead
- In a dispute about what `main` does, run both trees and read `git diff origin/main...HEAD`; that beats any written account, including handoffs
- Prove changes here with the real-data sweep `src/pages/deck/__tests__/DeckDetailPage.real-data-cut.test.tsx`

## Shared modules

- Each concept has one home. Deck display names live in `src/app/deck-display.ts`, card reference parsing in `src/app/card-ref.ts` (`parseDeckListRef` for `"2:a1-004"` refs), the deck slug in `scripts/deck-slug.mjs` with a re-export in `src/app/deck-slug.ts`, and one-swap diff logic in `src/app/deck-diff.ts`. Do not recreate local copies or split reference strings at call sites
- Code that a build script and the client share lives in `scripts/<name>.mjs`, imports nothing heavy (no `fs`, no Puppeteer), and comes with `scripts/<name>.d.mts` and a one-line re-export in `src/app/<name>.ts`, as `locale-route.ts` and `deck-head-copy.ts` do. Scripts load it with `require()`, which works for ESM without top-level await. Grep the built chunks for a toolchain string to prove nothing heavy reached the bundle
- `tsconfig.node.json` includes only `vite.config.mts` and `scripts/**/*.d.mts`, so the declaration file is what the typecheck sees
- The re-exports name their members, so a helper added to the `.mjs` stays invisible to `src/` until it is listed. The symptom is a typecheck error, `has no exported member '<name>'`
- Never import a prerender script from `src/` (Puppeteer would enter the browser bundle), never ship a `.cjs` file that `src/` imports (Vite's dev server does not convert it), and never add `"type": "module"` to the root `package.json`, which would break the CommonJS `scripts/*.js`. The Vite config is `vite.config.mts` for the same reason

## Data loading

- Keep required and optional queries in separate lifecycles. An optional fetch (meta share, analytics, enrichment) never joins the `Promise.all` that resolves required deck data, because a promise that never settles bypasses the rejection fallback and leaves the page loading. The regression test resolves the required response, leaves the optional one pending, and asserts the primary content renders without the optional field
- Meta share loads through `DecksProvider` and degrades to `null` on any failure. Do not fetch `/data/meta-share.json` anywhere else, and render missing optional data as an absent section, never an error page
- A frontend change that reads a new pipeline field cannot pass its gates until the committed data carries the field. Regenerate the data first, or let one change own both ends

## Shared UI shells

- `src/components/TierGrid.tsx` lays out the S to F tiers for the tier-list, cards and expansion pages: `items === null` shows `loadingLabel`, `[]` shows `emptyLabel`, and optional `filters` and `footer` slots carry page controls. Render every state through one page wrapper with a single conditional filter slot; an early return with a second copy of the shell is how an empty state drops the caller's filters. Keep `footer` inside the populated branch
- Test the shell in loading and empty states with its filters present, and test one real caller recovering after its filter changes. A grid-only test passes while a caller stays stranded on an empty result
- The deck page's `KeyStats` is a three-column grid and each `KeyStatRow` uses `display: contents`, with every cell pinned to its column so a row without a tooltip cannot shift the rows below. Keep the grid on the container, since per-row grids cannot share column widths. Pin cells with child selectors; interpolating sibling styled-components reads as use-before-declaration and fails the typecheck
- The open tooltip bubble (`src/components/Tooltip.tsx`) is `position: fixed` and clamped inside the viewport margins, with its accessible label from the translated `ariaLabel` prop. Do not return to icon-anchored absolute positioning, which overflows narrow screens whenever the icon sits near an edge
- The deck card's name label (`NameTip` in `src/components/DeckCard.tsx`) follows the same model. It is `position: fixed`, centred on the tile, clamped to the viewport margins and placed above the tile. It closes on any document scroll, caught in the capture phase, and follows the tile on resize, because a fixed label otherwise stays put while the page moves. Test a tile near the top, a lower tile and scroll dismissal
- Bundled UI images go in `src/assets/`, where Vite fingerprints them; `public/` is for files that need a stable URL. Resize art to its display size before committing

## Premium

- The 30-day and all-time windows, and full movement data, are enforced by delivery. They are not in `public/data/`, the refresh uploads them to Firestore, and security rules allow reads only for an active entitlement. Nothing in the interface is blurred
- New premium content follows the same path. Keep it out of the public files, load it through `src/app/premium-data.ts`, and cover the rule with `yarn test:rules`. A client-side gate over data the browser already holds is presentation, not enforcement; check with `curl` on the live URLs before claiming otherwise

## Consent and theme colours

- Consent overrides live in `src/consent/consent-overrides.css`. `ConsentProvider` renders no consent UI during prerender (`isPrerender` in `src/app/prerender.ts`); keep that guard
- The consent library reads separate light and dark variables. Under the `c15t-dark` class it reads `--button-primary-dark`, which the overrides set to `var(--f)`. Inspect both paths before changing a token
- For colour evidence, mount the real visibility gate and walk the flow to the dialog before asserting banner or dialog colours. A decorative pseudo-element covering a fill is not colour evidence. The first render must not look pressed or focused; keep `:focus-visible` and intentional `:active` styles
- Classify every consumer of a token (background, text, border, icon, chart, overlay, third-party setting) before changing it. When one token serves status colours and links, add a semantic link token instead of moving the shared one, and use an on-accent text token on accent fills rather than borrowing the page background as ink
- Probe rendered colours in a browser in both themes after confirming the active `data-theme` and `color-scheme`. Parse final values, composite alpha over the real background and compare contrast ratios for text on accent fills, chart ticks, tooltips and focus rings separately
- For prerendered pages, wait for route readiness, then clear transient runtime theme state immediately before serialising, and test that event order
- When a review asks for a resolved colour, do not weaken the test to a token string because jsdom cannot resolve it. Add the smallest runtime probe that fails when the rendered colour is wrong
