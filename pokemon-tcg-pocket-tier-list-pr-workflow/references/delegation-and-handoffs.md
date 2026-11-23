# Delegation and handoffs

Rules for splitting work across parallel workers (sub-agents or people) and for documents written for someone else to act on

## Writing briefs

- Write one self-contained brief per task. Quote the task's full section and the plan's global constraints, since task extractors often drop the latter. Add the worktree path, the expected branch and HEAD with an instruction to verify both before the first edit and stop on a mismatch, the owned paths, the exact commit subject, the gate commands, the report path, and "do not push"
- Put the commit rules in the brief verbatim (subject only, Conventional Commits without `ci`, no tool trailers and no mention of how the change was written) and say they override the plan. A plan can carry a stale rule, and a worker follows it unless the brief says which wins. Add the prose style rules; if you have a style-gate skill, name it so the worker loads it too
- Run up to three workers at once by default, so every claimed result can be inspected before dependent work starts. Run more when asked
- Give each shared file exactly one owner and tell the others to leave it. `src/types/pipeline-data.ts` is the usual hazard, so own it in the parent and patch it between workers, or name one owner in both briefs
- Order briefs by data dependency, not plan order. A frontend task that renders new pipeline fields cannot pass until the data regeneration has run. At brief time, grep the frontend task for the fields it reads and check the committed `public/data` carries them
- A frontend deck-page brief also owns all eleven locale files for any new key and the tests that mock fetch with their own deck objects (`DeckDetailPage.missing.test.tsx`, `DeckPage.head.test.tsx`), because regenerated data never reaches those fixtures
- Sequence tasks that share a file. Integrate and verify the first before creating the second's worktree, or both branch from the old file and one silently drops the other's change
- When workers may not run data-producing scripts, the parent owns the refresh: workers commit source and tests, then the parent seeds the worktree's raw store from the freshest local copy (a new worktree starts with an empty `analysis/data/`), runs the refresh, and runs the gates at the merged head
- Tell workers to read only the head of any file over 50 KB and never to grep minified JSON. Tell review workers which files are hand-written, since large PRs here are mostly generated images and JSON
- When told to delegate, stop editing inline at once and hand over what is fixed, what remains, which gates are green and the commands that prove it

## Accepting a worker's result

- A summary is a self-report. Check the same worktree with `git status --short`, `git diff --stat`, the owned diff, `git log` and the report path. Read the final SHA the worker reports, not one quoted mid-report, and confirm each claimed commit with `git cat-file -t <sha>` and `git merge-base --is-ancestor <sha> HEAD`
- Read the worker's list of deviations before accepting, and decide each one: accept and document it, or revert that line. A deviation can change a shipped artefact's meaning while every test passes
- Check author and trailers yourself with `git log -1 --format='%an <%ae>%n%B'`
- Re-run a worker's "confirmed" finding against real data before acting on it. Workers that build throwaway detectors sometimes report their own detector's bug as a product defect
- After a worker changes a data-generating pipeline, check the committed data independently: record counts per file, one known record's fields, and a clean `git status`. A test fixture that redirects output paths can write test data over real data when a new output constant is missing from its redirect list
- After integrating, rerun the full suite and grep for assertions still expecting the old copy or label
- After an interrupted batch, inspect every registered worktree (`git worktree list --porcelain`): status, branch tip, staged and unstaged diff, commit reachability. Keep verified commits, give unfinished work to a finisher in the same worktree with the exact remaining gap, and never restart on top of it or re-dispatch work whose commit already exists
- A worker can report completion after running nothing. Before re-dispatching after such a failure, test the route with a trivial task and then a one-command task
- Steering reaches only a running worker. If refinements arrive after it finished, dispatch a small follow-up for the difference and say so
- Workers leave scratch files (`_verify.ts` and similar). Delete them only once no running worker reads them, then confirm none was committed with `git ls-files --others --exclude-standard` and a grep of `git ls-files`
- A recovery brief for a blocked worker states what is already in the tree, that its substance must be kept, and the exact commit plan

## Numbered briefs with a checker script

When the maintainer hands over numbered task briefs, a conventions file and a script that judges each task from the worktree, coordinate without editing:

1. Run the checker for the starting state first; anything unexpected goes back to the maintainer unchanged
2. Read the checker once before the first dispatch, separating its mechanical lines (branch, clean tree, subjects, files, counts) from those that judge artefacts. Act on its last line
3. Dispatch one task at a time. If the worker reports a blocker or asks a question, pass the report on unchanged
4. On `PASS`, record the task and the commit SHA and move on
5. On `FAIL`, compare `git log -1 --format=%s` with the expected subject. A mismatch means the worker never committed, which allows one retry with the failing lines and `git status --short`. A match means a wrong commit exists, so stop. Correcting it needs an amend or reset, which only the maintainer approves
6. Close with one line per task (subject, short SHA, verdict), the artefact paths the plan names, and any closing instruction quoted verbatim

Before answering a question about "the new X", find which layer owns X. JSON-LD comes from the frontend prerender (`scripts/meta-stamp.js` with the prerender scripts); NDJSON is the analysis deck store. Grep the exact token and say which layer the answer covers

## Documents for someone else to act on

- A QA review brief lists verification areas, not a summary. Name the files and archetypes to recompute, require executed probes ("recompute from the raw store, not a passing unit suite"), state expected numbers as claims to falsify, and cover every contract change the PR made, renames and population swaps included. Ask for each finding with file, line, expected and actual values and the probe, and a stated reason for any skipped check
- An issue meant to seed a plan must stand alone: the cause cited to file and line, measured numbers, the call sites that consume the thing (verified by grep), options in effort order with the lowest-risk one marked, open questions including what could break, and acceptance criteria that say how improvement is measured. Check labels with `gh label list --json name` first; there is no `performance` label, so use `enhancement` with an `area:` label
- A handoff records branch, HEAD, uncommitted files and who owns them (others' files marked do-not-touch), the task or failure, what was ruled out and how, open questions, the cheapest next step, the gates and the style rules. `private/` is gitignored, so a handoff there stays out of PRs
- When an independent reader reviews your account of a rework, expect corrections. Verify each against real data, correct the document in place, mark the corrected passage, and say plainly that the earlier account was wrong. Answer the reader's questions by proposing a rule and testing it against every example the maintainer has ruled on, naming any ruling it fails and why
- When repairing someone else's reverted or half-finished work, label every prior account as unverified. Only `git diff origin/main...HEAD` and the current repository state count as ground truth, and the first step produces a plan only, with execution after the maintainer approves it
- For an ambiguous data-backed request, inspect the existing producer and consumer, list the smallest readings, and ask one question when they lead to different work. Then add a producer-to-consumer acceptance test and render the result where the user will see it. Label fixtures by purpose; a fixture built for one feature is not evidence for another
- When a brief is amended mid-work, the latest amendment wins. Re-read it, record the corrected literal names and output shape, and add a focused regression for the amendment before reusing earlier tests
