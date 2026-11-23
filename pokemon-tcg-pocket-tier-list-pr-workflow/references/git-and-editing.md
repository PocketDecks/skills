# Git and editing

How to change files without collateral churn, repair local history, and resolve the conflicts this repository keeps producing

## Editing without churn

- The repository has no formatter config. Never run a formatter over files you are editing; it rewrites hundreds of unrelated lines
- `.gitattributes` sets `* text=auto eol=lf`. Keep LF endings in new and edited files
- For scripted edits, use exact string replacement guarded by `assert src.count(old) == 1`, and write with explicit encoding and newline handling. If a script fails halfway, re-read the file before retrying, because some replacements already landed and the asserts will fire on them
- Write replacement text that contains backslashes as raw strings (`r"""..."""` in Python). A normal string or heredoc turns `\b` into a backspace byte, the pattern then matches nothing, and only a test reveals it. Confirm the bytes with `repr()` or `od -c` before running the tests
- An edit tool that matches on a target string can report "no change" when the target line already exists, without adding anything. After editing a manifest or config, grep for the line you meant to add
- Check `git diff --stat` and the full diff after every edit batch, and confirm only intended lines moved
- When a doc change alters setup or working-directory order, state the starting directory and every `cd` in the example, then run the commands from that starting point. A valid command in the wrong directory leaves the real configuration missing

## Locale JSON

- The eleven `src/locales/*_translation.json` files use two-space indentation, literal non-ASCII text and a trailing newline. To add or remove keys, edit every locale in one pass with a script (`json.load`, then `json.dump(..., ensure_ascii=False, indent=2)` plus a newline), drafting English first and translating each value
- For a copy-only change, replace just the target value in the existing text. Parse the JSON to locate and validate the value, assert the old text occurs exactly once, and leave everything else byte-identical. Re-serialising the whole file can change escaping or spacing and bury a two-string change in churn
- After editing, parse every locale, assert the expected values, and read the full diff before testing
- The parity test checks keys, not wording. When a translation must contain a required term or name, assert the value in every locale
- Machine-drafted translations can borrow a noun from the wrong language or elide incorrectly. Re-read each value for language consistency, and say in the PR body which non-English copy no fluent speaker has reviewed
- Never mass-edit unrelated keys while touching a locale file

## Repairing local history

- `git mv` and `git add` stage immediately, so a later grouped `git add <files> && git commit` sweeps an earlier staged rename into the wrong commit. To fix it before pushing: `git reset --soft HEAD~1`, `git reset`, re-add per commit, and check with `git status --short` that each rename sits on its own commit
- `git commit --amend` rewrites HEAD, whatever commit owns the file. To correct an earlier unpushed commit, commit with `git commit -m "fixup! <that subject>"` and run `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <target>~1`. If that rebase conflicts, `git rebase --abort`, undo the fixup commit, and ship the correction as its own commit; history surgery is not worth several turns
- When an approved amend must keep the commit's dates (for example, a checker compares a generated file's mtime with the commit time), amend with `GIT_COMMITTER_DATE="$(git log -1 --format=%cI)" git commit --amend --no-edit --date="$(git log -1 --format=%aI)"` and confirm the subject, file list and commit count did not change
- To drop commits without an interactive editor, tag a backup ref first, run `GIT_SEQUENCE_EDITOR="sed -i '/^pick <sha>/d'" git rebase -i <base>`, then check the remaining subjects, since SHAs change under a rebase
- Remove pushed commits from an open PR only on explicit instruction. Record the good commit, read the remote SHA with `git ls-remote`, run `git reset --soft <good>`, and push with a lease pinned to that SHA: `git push --force-with-lease=refs/heads/<branch>:<remote-sha>`. Then re-read `headRefOid` and the PR body, which may still link removed assets
- Never trim or rewrite files in the working tree while the maintainer is reviewing the pushed PR; they see the remote copy. Land the cleaned state, then show it

## Branches and remotes

- Remote names differ between checkouts. Identify the canonical remote by its URL in `git remote -v`
- `git fetch` moves remote-tracking refs only, so a local `main` lags behind; that is expected, not damage. When asked why, show evidence without touching the working tree: `git rev-parse main <remote>/main`, `git log --oneline main..<remote>/main` and `git reflog show main --date=iso | head -3`. Before suggesting a fast-forward, count the overlap between the dirty files and the files the missing commits change, and offer the command instead of running it
- A diff against a stale local `main` inflates the PR's apparent size. Fetch, then diff against the remote's `main`
- A handoff, brief or earlier summary describes the state at its own cutoff. Before acting on its SHAs or verdicts, check `gh pr view`, `gh pr checks` and `git log` against what it cites
- When edits land on the wrong branch, stash them, switch, and re-apply; never amend or push the wrong branch. A file the PR changed reading as its old version is the usual sign
- Before branching on a merged prerequisite, verify the exact commit is on `main`. Do not substitute a branch with a similar name

## Conflicts

- Preview conflicts without touching the worktree: `git merge-tree --write-tree --name-only origin/main <branch>`
- Translation passes rewrite whole locale files, so feature branches that carry translations conflict on them repeatedly. When such a branch cannot rebase cleanly, recreate it once instead of cascading PRs: branch from `origin/main`, take the branch's version of files `main` has not changed since the branch point (`git show <old-branch>:<path> > <path>`), apply the branch's key changes onto `main`'s version of files both sides changed with a script, run the gates, and open one replacement PR. Carry hand-written translations over verbatim; never regenerate or drop them
- In generated data, keep `main`'s version unless the change is meant to move that file

## Notices and licences

- In `THIRD_PARTY_NOTICES.md`, never splice, reorder or reflow an existing licence block. Add a new attribution as its own section after the last complete block, and check with `git diff` that every existing line is untouched
- When reusing a credited asset elsewhere, keep its existing credit
