---
name: pi-review
description: Run an independent code review using pi-coding-agent. Use after completing an implementation to get a second opinion before pushing. Pass the issue number or a short description of what was implemented.
argument-hint: "[issue-number or description]"
---

Run an independent code review of the current implementation using the pi-coding-agent CLI.

## What to do

1. Gather context:
   - Read the relevant GitHub issue (if an issue number was given in $ARGUMENTS): `gh issue view $ARGUMENTS --repo BowerJames/OtterAgent --json title,body`
   - Identify the files changed in the most recent commit(s): `git diff HEAD~1..HEAD --name-only`

2. Build a review prompt that includes:
   - A summary of the issue or change being reviewed
   - The specific implementation checklist (what was changed and why)
   - Instructions to run lint, tests, and build
   - A request to report all findings in full

3. Call the pi-coding-agent:
   ```
   pi --model glm-5-turbo -p "<your prompt>"
   ```

4. Report the full output of the review back to the user, then ask how to proceed.

## Review prompt structure

Use this structure for the prompt passed to pi:

```
You are doing an independent code review of a recently committed implementation
for [issue/change description] in the OtterAgent project (located at /root/Projects/OtterAgent).

## Background
[Summarise the problem that was solved and the approach taken]

## Implementation checklist
[List each specific thing that should have been done, so the reviewer can verify each one]

## Your tasks

1. **Accuracy & Completeness**: Verify each item in the implementation checklist above.

2. **Code Quality**: Run the linter and report any issues:
   - Run: cd /root/Projects/OtterAgent && bun run lint

3. **Tests**: Run the full test suite and report results:
   - Run: cd /root/Projects/OtterAgent && bun run test
   - Assess whether the test coverage is appropriate for the change

4. **Build**: Verify the project builds cleanly:
   - Run: cd /root/Projects/OtterAgent && bun run build

Report all findings in full — any issues, gaps, or concerns, as well as confirmation of anything that looks correct.
```

## Notes

- Use `glm-5-turbo` as the model — it has the right balance of capability and speed for reviews.
- Run the review before pushing to remote. If the reviewer finds issues, fix them and re-run the review to confirm before pushing.
- If the reviewer raises a concern you disagree with, discuss it with the user before deciding whether to act on it.
