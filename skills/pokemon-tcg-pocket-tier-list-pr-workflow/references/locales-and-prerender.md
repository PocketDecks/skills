# Locales, prerender and generated assets

`docs/how-to/adding-a-language.md` covers adding a translation, and `docs/how-to/deploying-and-hosting.md` lists every build stage in order. This file covers locale URLs, head tags, the prerender and the checks over built output

## Locale URLs

- English is unprefixed. `LOCALE_PREFIXES` in `scripts/locale-route.mjs` (`{ en: "", ja: "/ja" }`) defines the locales that own a URL, and `src/app/locale-route.ts` re-exports the helpers by name. Eleven translation files exist; nine locales have no URL and must keep working through detection and the switcher
- A URL prefix is the small half of a new URL locale. The deck head tags, the deck prerender and the route metadata (`JA_ROUTE_META` in `scripts/prerender-routes.js`) assume Japanese for every non-English locale. Extend all three in the same change, and add a guard test that fails when `ROUTE_LOCALES` holds an unexpected locale and names those files
- `prefixedLocale(pathname)` returns a locale only for a registered prefix. `splitLocale(pathname)` returns `{ locale, rest }`; run route tests such as `startsWith("/deck/")` on `rest`, or they fail silently on `/ja/deck/...`
- `src/i18n.ts` detects in the order `["pathLocale", "navigator"]` with `caches: []`. Do not add a cache, which would pin a language the URL should decide
- Styled router links do not localise themselves. Give them an already-localised href from `useLocaleHref`, or route a bare path through `LocaleLink`, never both: `LocaleLink` prefixes whatever it receives, so a localised path becomes `/ja/ja/...`. Assert the rendered href starts with the locale and contains no `/ja/ja/`
- Language follows the URL. `useDocumentLanguage` sets the language from a prefix; on an unprefixed URL the document follows the language the content renders in. Key per-entry state on `useLocation().key` and re-derive only when the key changes, because a re-render of the same entry after a switcher change must not revert the visitor's choice. On back or forward (`useNavigationType() === "POP"`), restore the language that entry had, not English
- Entry memory exists only for entries the app rendered. A test that mounts `MemoryRouter` at the last entry of a stack never renders the earlier one; push forward first, then go back

## Head tags and structured data

- `DeckHeadTags` writes title, description and `og:*` into the live DOM, while the prerender stamps them at build time. Both must produce the same string per locale, so the client imports the prerender's helper (`scripts/deck-friendly-name.mjs`, `scripts/deck-head-copy.mjs`) instead of deriving names itself. The client's display name joins resolved card names differently from the slug-derived name, and the two agree on only a minority of decks
- Compare a client computation with its build-time twin across the whole dataset, never one sampled page
- `og:url` comes from `localizedUrl(SITE_URL, locale, ...)`, whose trailing-slash form equals the canonical. Assert exactly one `og:url` per page and that it equals the canonical
- `stampHead` in `scripts/meta-stamp.js` removes only `rel="alternate"` links that also carry `hreflang`. Test any strip by adding an unrelated alternate (a feed or manifest link) and requiring it to survive; a count-only assertion passes while unrelated tags disappear
- Structured data is per locale. A locale home page needs its own block derived from the base, with the locale URL and `inLanguage`; a deck breadcrumb links and labels in its locale. Keep the derivation in a named helper so it can be tested per locale
- Prove a locale-scoped change by its blast radius: capture the JSON-LD and head tags of every built page before and after, require zero changes on default-locale pages, and check the target pages changed

## Build order and prerender

- `yarn build` runs typecheck and lint, then `build:site` with its `prebuild:site` generators, `vite build`, and the `postbuild:site` chain: `prerender-decks.js`, `prerender-deck-hubs.js`, `prerender-routes.js`, `verify-dist-html.js`. CI's preview and deploy run `yarn build:site`
- Run the full chain, never `vite build` alone. Without the prebuild generators the built HTML references assets that were never generated and `verify-dist-html` reports a wall of `is not built` errors
- Run the postbuild steps in declared order from a clean `dist/` and never rerun one against an already-prerendered tree. `prerender-decks.js` reads `dist/index.html` as its template and `prerender-routes.js` overwrites that file with a captured page; a deck prerender started from it writes empty deck roots (`Empty deck roots found in built HTML`) or duplicated JSON-LD and `og:url` tags. `scripts/__tests__/postbuild-order.test.js` pins part of this order
- When a postbuild step fails, rerun the whole command from `rm -rf dist`. A partial `dist/` holds template HTML without prerendered pages
- The prerender serves `dist/` on `127.0.0.1:4173`, answers card database requests with a stub image and aborts every other outside request (`scripts/prerender-shared.js`). Serve the untouched template for every fallback request; a previously captured route must never become the next route's starting DOM
- Capture only after a positive readiness signal for each data-backed route, not a selector the loading shell also has. Match readiness anchors by path prefix (`a[href^="/deck/"], a[href^="/ja/deck/"]`), not substring, and build the prefixes from the router's locale table
- Keep every HTML normalisation step inside the post-readiness capture callback, before serialising. Test the order as wait, ready, capture, then run the production build, because a unit seam does not prove the generated HTML
- When the static root is populated, the client mounts into a hidden sibling and swaps atomically once the route reports readiness or a timeout expires; an empty root mounts directly. Calling `createRoot` on a populated `#root` removes the snapshot before the page is ready and inflates render delay. Gate consent and ad portals on the same reveal signal
- Assert the document language in built output for every page class, including `app-shell.html` and `404.html`, and require exactly one `lang` attribute on `<html>`. `index.html` carries no `lang` on purpose because the stamp adds it

## Generated assets

- Put mappings shared by a generator and the app in a dependency-free shared module, so both resolve names to the same ids
- Make generators idempotent: skip existing outputs, bound concurrency, retry fetches a fixed number of times, and fail on a missing source record. A second run must write nothing
- Version a public media URL when regenerated bytes can replace an existing path, and keep the cache rule specific to that path
- A consumer check derives every required output id from the same source data as the producer and reports missing files by id. Prove it with a negative control: delete one generated file, require the check to fail naming it, restore, require a pass
- Changing a slug formula must leave the generated sitemap byte-identical; compare before and after

## Expansion pages

- Indexing follows `src/app/expansion-index-policy.mjs`. The newest covered expansion and the one before it are indexable, each only with at least `MIN_INDEXED_EXPANSION_CARDS` covered cards; every other listed expansion renders with `noindex, follow` and keeps its canonical and hreflang links
- Each page stamps a unique title, description, self-canonical, language, alternates and robots value, and the HTML verifier checks every listed page. Historical pages without live cards or decks still need enough translated descriptive copy to pass the visible-content threshold, with no tiers, ranks, scores or win rates

## Viewing a local build

- After `yarn build`, any static server pointed at `dist/` shows the prerendered HTML. `curl` and `grep` see only that prerendered shell
- For the hydrated DOM (a table filled after a fetch, a link count, an absent notice), run this skill's probe from the repository root: `node <skill-dir>/scripts/probe-dist-route.js dist /statistics/ "No deck movement"`. It serves `dist/` on loopback only, aborts every outside request, and prints the title, deck-link count, which texts appear, page errors and the first body lines. The header of the script documents its environment variables
