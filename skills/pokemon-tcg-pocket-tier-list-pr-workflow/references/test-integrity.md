# Test integrity

A green suite is a claim. Each rule below closes a way a suite in this repository has looked strong while pinning nothing. Fix the test or its guard; never weaken an assertion to get a green run

## The mutation proof

Run it for every test that claims to guard a behaviour

1. Stage the fix (`git add <paths>`) or copy the fixed file aside. `git checkout -- <file>` restores from the index, so an unstaged fix is lost
2. Back up each file you will mutate. Apply a one-line mutant that reintroduces the bug as an exact string replacement, guarded by an assertion that the old text occurs exactly once. Match the leading whitespace of the landed code, not of a plan's quoted line
3. Confirm the mutant landed by printing or grepping the mutated line. A replacement that missed leaves the suite green, which looks exactly like a test that cannot fail
4. Run the focused file and require the named test in the failure list. A non-zero exit is not enough, because a mutant can fail an unrelated test while the target still passes. Strip ANSI colour codes before matching runner output
5. Restore in a `finally` block, check each file equals its backup byte for byte, and check `git status --short` shows only intended changes
6. Report the mutant and the test that failed. "21 passed" is not evidence

Run the proof with `node <skill-dir>/scripts/mutate.mjs --file <path> --find <old> --replace <new> --test "<command>" --expect "<test name>"`; it restores the file and prints one JSON line with killed, exit and matched

Variations:

- To show a test catches an old bug, put the old code back in the production file as the mutant. Never copy the old function into the test file, because its assertions then exercise the copy. Every `expect()` subject must come from an import of production code
- When a fix swaps a data source, mutate the reader back to the old source. Stashing to a version that lacks the new exports fails for the wrong reason
- Red-prove two findings in one file one at a time: commit the first, then apply and prove the second
- `git stash` cannot see new untracked files. Move them aside as well when red-proving a fix that is still in the working tree
- Removing one guard can leave a case rejected by another. If a behavioural test keeps passing, mutate the specific check the case targets, or both guards, and say which guard you proved
- A mutant that survives because another guard enforces the same bound is equivalent, not a gap. Name the subsuming guard and report it as equivalent instead of adding tests or weakening guards
- A mutation-sweep row reported as skipped never applied. Repair its target text and rerun before concluding anything about the code
- Mutants that break a cleanup path can leave staging directories in the temp directory. Remove them before the next run so they do not shift its baseline

## Fixtures that can tell right from wrong

- Take messages from the code that produces them: call its message builder or trigger the real refusal, with one case per producer message. An invented message can match a classifier branch the real text never reaches
- When code must read source A and not source B, give A and B different values. Then change one input at a time and assert that the matching output line moves
- When code keeps the best N items, give the fixture more strong candidates than slots, taken from the real producer. One target among filler only proves that filler loses
- Populate a fixture so the old code path yields plausible wrong numbers rather than an empty result, which fails for the wrong reason
- A window-switch test must return different decks per window URL and assert the rendered deck after the switch, not only the requested URLs
- Sweep real data for a bug class. `src/pages/deck/__tests__/DeckDetailPage.real-data-cut.test.tsx` cuts the lead card of every deck in `public/data/best-decks.json`; hand-picked fixtures need luck to hit the deck and card that cross a threshold
- An assertion that cannot fail is worse than none. `assert.ok(x !== undefined || route !== "/")` passes for every input; loop the whole set and assert the outcome both ways, as in `(jsonLd !== undefined) === (route === "/")`
- When a test asserts an absence, name the input that makes the absence meaningful

## Tests that only look like tests

- A test that reads source text (`expect(source).toContain("...")`) stays green when the call's result is discarded. Call the function with real inputs, or mock the boundary (spawn, fetch) and assert what it receives
- A test that reimplements the formula under test stays green forever. Move the real formula into a module, as `src/app/format-card-score.ts` does, and import it
- An expectation built from the helper the component calls agrees by construction. Assert a literal and check it once against the built output (`dist/<route>/index.html`). Where a helper-derived expectation must stay, prove it with a mutant of the rendered value
- A test that a new check stays quiet on healthy input passes before and after the fix. Keep it, call it a negative control in the report, and do not count it as coverage
- A test that needs a machine feature (a locale, a binary, a font, a host) probes for it and uses `it.runIf`. Pair it with a deterministic check at the same seam that holds on every runner, such as spawning `process.execPath` to print the variable an environment merge sets. Run the mutation proof with the probe on and forced off, and report that the guarded mutant survives while skipped
- A deterministic spawn stub runs `process.execPath` with `-e` code, never a shell script, because a `/bin/sh` stub fails on any runner without a POSIX shell, Windows included. Name a test-only probe switch after its purpose, never after a ticket or PR number, so the fixture reads as a reusable control
- A unit test must not depend on a live service (Firebase, Limitless) or a local `.env`. Isolate the boundary at the test seam and keep the production path intact

## Async and shared code

- Assert on settled state, never after a fixed delay: `await waitFor(() => expect(i18n.language).toBe(document.documentElement.lang))`. An async language change resolves after the render that triggered it, so a fixed sleep samples mid-flight and can call a working fix broken
- Two probes that disagree about one tree usually mean one is unsettled. Settle it before changing code
- After changing a shared hook, grep the test tree for its importers and run all of them in one command. A focused file proves the new path, not the other consumers
- Return a fresh `Response` for every fetch call: `mockImplementation(() => Promise.resolve(new Response(...)))`. `mockResolvedValue(new Response(...))` hands every retry the same consumed body, which fails with `Body is unusable: Body has already been read`

## Recovery, cleanup and temporary files

- Inject a failure into each `rmSync` and `renameSync` branch of cleanup or rollback code. Assert the original error, every target's content and the `.tmp` and `.bak` files left behind; happy-path tests do not cover recovery
- Register each temporary file or directory when it is created and remove it in `afterEach` or `finally`. Cleanup at the end of a test body is skipped when an assertion fails
- Test a loader's default no-argument path with a tracked fixture in a disposable directory, through a root-directory factory. Never have a test write a `.env` into the real repository, even with a `finally` restore, since a killed process skips the restore
- Keep env-loading modules pure and put automatic loading in a separate side-effect module (`analysis/src/load-env.ts` beside `load-env-side-effect.ts`). An import that loads `.env` itself reads the developer's values before a test injects its fixture
- When a helper behaves differently under a symlinked ancestor, wrap test temp roots in `fs.realpathSync(fs.mkdtempSync(...))`, and prove each wrapper is load-bearing by unwrapping every site, not one
- Publishing by renaming a directory into place deletes untracked files the old generation held. Say in the report how many went

## Measuring and constants

- To measure a fix, add the test with a temporary print, run it on the unfixed code, record the value, apply the fix, rerun, then remove the print. One fixture and one code path make the delta describe the fix
- When a threshold constant moves, re-derive every fixture expectation by hand against the new value, then restore the old constant once and require the new tests to fail
- A fixture can encode an old constant, such as a date before a corrected window that now filters to zero decks. Move the fixture instead of weakening the assertion

## Rendering evidence for UI

- jsdom leaves `var(--token)` unresolved, and styled-components applies styles through generated classes, so `toHaveStyle` shows wiring at most. For a displayed colour, read the browser's computed style, or parse tokens and composite alpha over the real background, in both themes. Keep the source guard as a separate check
- Prefer asserting that an element is present or absent over asserting its style, whenever the behaviour can be expressed that way
