# Trigger evals

Each skill has a `trigger-evals.json` here: requests that should load the skill and near-misses that should not. The file uses the eval-set format of Anthropic's skill-creator, an array of `{"query": "...", "should_trigger": true}` items.

The validator checks the shape and asks for at least eight queries on each side. It does not run them, because running them needs a model.

To measure a description, run skill-creator's eval loop with this file as the eval set and the skill folder as the skill path. When you change a description, rerun it and say in the pull request how the trigger rates moved.

Keep the negatives hard. A query that shares the skill's words but needs something else (deck advice, the physical game, generic GitHub help) tests the description; an unrelated request does not.
