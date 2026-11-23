# Meta windows and scoring

`docs/reference/pipeline-output-contract.md` describes every published file and field, and `docs/explanation/statistical-scoring.md` explains the weighting. Its "Scoring weights" section still says the weights read the run clock; the code passes the newest data date (`scoringWeights(anchor)` in `analysis/src/utils/build-window-artefacts.ts`). Trust the code, and flag the doc when you touch that area

## Windows

- Window ids and the default come from `scripts/meta-windows.mjs`: `10d`, `20d`, `30d` and `all`, with `20d` the default. Un-suffixed files carry the default window. `public/data/` holds the 10d and 20d files; 30d and all-time exist only as premium artefacts (`docs/how-to/publish-premium-data.md`), and the public meta-share files keep full entries for the free decks only
- Recompute everything per window: field shares, Frequency Score, Power Score, the qualification gate and the archetype floor. Never relabel a since-release computation as a window
- Every game inside a window weighs the same. Do not add a recency multiplier inside a window
- Windows and score weights anchor on the newest data date, not the run clock, so a refresh that lands days after the last scrape still fills its windows. A rebuild over an unchanged raw store should reproduce the published scores; treat a difference as something to explain, starting with the card package and the listing store
- An inclusive calendar-day filter over date-only rows keeps N days with `cutoff = newest - (days - 1) * DAY_MS`. Subtracting `days` keeps N + 1. The trend series has no rows for days without qualified games, so a slice spanning N days can hold fewer rows
- Meta-share comparison windows take the artefact's own length (`shareDays = gamesDays = window length`), so `share`, `sharePrev`, `delta`, `isNew` and `windowGames` are all window-relative. Pass the comparison the whole qualified store, not the ranking set: `sharePrev`, `firstSeen` and `isNew` read games outside the window, and the ranking set makes every archetype report `sharePrev: 0`
- The public matchup matrix counts every player's games; Power Score reads a separate qualified tally (`analysis/src/utils/build-matchup-populations.ts`). Never feed the public matrix from the qualified tally, which inflates displayed win rates, and never derive the qualified tally by filtering or scaling the all-player one, since qualification applies per source record. Give each population the window-filtered deck list, not the raw store
- OG images cover every deck visible in any window, and the generator prunes orphans against that union. Compare prune results against the union, not one window's list
- A label that names a window length must be window-scoped in data as well as in text
- A change to a shared pipeline field patches `src/types/pipeline-data.ts` in the same change, since both `analysis/` and `src/` compile against it
- Frontend window state lives in one context (`MetaWindowContext`) shared by every page that shows a window. A second local toggle lets two pages disagree. When premium lapses mid-session, fall back to the default window, but never reset while premium state is still unknown (`null`). Render window controls outside data-dependent loading and error branches, so a failed fetch never hides the control that picks another window
- When a mechanism is retired, grep `docs/`, SEO copy and locale strings for its name in the same change. Page prose can describe a retired mechanism while every test stays green

## Explaining a rank

Audit the producer and the consumer together before explaining or publishing a surprising placement

1. Read `analysis/src/get-best-decks.ts`, `analysis/src/utils/build-window-artefacts.ts`, `build-deck-power.ts` and `calculate-matchup-results.ts`, then the published `best-decks`, `meta-share` and `matchup-data` files for the window in question
2. Recompute each named deck from the committed files and report qualified list count, window games, field coverage, expected win rate before and after smoothing, Power Score, Frequency Score, Meta Score, rank and tier
3. Check population coherence. Matchup performance and opponent prevalence must come from the same population; mixing them needs a stated policy and an all-player against qualified-only counterfactual
4. Explain the scale before the tier. Power Score reads 50 for an even expected win rate and 100 for the best deck in the field, so a small win-rate gap can become a large point gap. Tiers S to F are six equal-width bands between the current best and worst scores (`buildTiers` in `src/app/tier-helper.ts`), not fixed thresholds across runs
5. Quantify what the score ignores. Power Score renormalises over covered opponents, smooths each matchup toward 50% with `MATCHUP_PRIOR_GAMES` pseudo-games, drops rows below `MIN_MATCHUP_GAMES` and leaves decks below `MIN_FIELD_COVERAGE` unranked. Read the live values from `analysis/src/settings.ts` rather than quoting old ones, and run a counterfactual for the uncovered share before calling a sparse result fair
6. Treat mirror rows explicitly. Exclude an archetype's own row from a field metric, or report the measured effect of keeping it
7. Keep metric meanings apart. The legacy card `score`, Power Score, Frequency Score, Meta Score, expected win rate and field coverage answer different questions; check which one the route sorts on
8. Classify the result as a data defect, a population-policy choice or a surprising but supported result before touching any weight or threshold

When an independent recompute disagrees with the producer, suspect the recompute first. A null window means every day, not none, and a wall of mismatches confined to one window or field is a defect in the recompute. Fix and rerun it before touching the producer

## Changing scoring

- A change to a weight, multiplier, floor or score shape that moves rankings is an experiment, not a fix. Gate it behind one boolean in `analysis/src/settings.ts` that rests `false` in every committed state
- Key any lookup on the exact key the producer emits. Card keys are `Name SET NN` (`Charizard ex A1 36`), so a map keyed on the bare name matches nothing and the change is inert. Run the producer to see the key shape before writing the map
- Run with the switch off and on, save both `best-decks.json` snapshots outside the repository, diff the top 30 by order and score, and report whether the movement matches the hypothesis. Commit no data from the on run, and open no PR until the maintainer judges the preview a net gain
- When asked whether to change a window, floor or weight, measure it against a second real snapshot first. If every metric moves inside run noise, report it as neutral and keep it out of the current commit
- For a headline score blending win rate and play rate, accept it by Spearman rank correlation on live data with a throwaway script, never pinned in a test, because the numbers move with every scrape. Correlation with raw win rate should sit clearly above 0.7 and correlation with play rate clearly below 0.5; above 0.8 with play rate means a popularity ranking under a win-rate label
- Smooth thin matchups toward 50% by their own game count rather than imposing a hard opponent-games floor, which discards the sparse majority and hands the ranking to the frequency term. Give thin-coverage decks an explicit unranked state rather than an invented prior score
- Before writing predicted outcomes into a plan, run the formulas on the real data and record the executed numbers. Validate the measurement path first by replaying the published ranking from committed files through the real scoring code; every committed Power Score must reproduce
- Derive constants from the source of truth instead of hand-editing them. `EXPANSION_RELEASE_DATE` comes from the newest dated, non-deluxe expansion in the card package (`latestReleaseDate` in `settings.ts`). When a derived constant changes, check what else reads it before rebuilding (this one also gates `filter-decks.ts` and the score ramp) and state the blast radius in the PR
- Recompute every number a comment cites with a fresh run before committing. Comments carry mechanisms, ratios and invariants; mark exact counts as moving with the data

## Data shapes for answers

- `best-decks` lists come from qualified decks only (a player at or above `MIN_WINRATE_THRESHOLD`, 0.6), deduplicated by exact list, so low-tier archetypes show few lists
- `matchup-data` counts every player's games for the archetype inside the window, far more than its list count suggests. Cite both with care
- `meta-share` shares count qualified games only, so a deck played widely but poorly can read 0% share despite many games
- Resolve card ids through the pinned card package, never from memory
