---
name: code-review
description: Run an independent code review using pi-coding-agent. Use after completing an implementation to get a second opinion before pushing. Pass the issue number or a short description of what was implemented.
argument-hint: "[issue-number or description]"
---

Run an independent code review of the current implementation using the pi-coding-agent CLI.

## What to do

1. Identify the issue number:
   - If `$ARGUMENTS` is a number, use it directly as the issue number.
   - If `$ARGUMENTS` is a description, find the matching issue: `gh issue list --repo BowerJames/OtterAgent --search "$ARGUMENTS" --json number,title --limit 5`

2. Identify the files changed in the most recent commit(s): `git diff HEAD~1..HEAD --name-only`

3. Build a review prompt (see structure below). The prompt must **include the issue number** so pi can look it up itself — do NOT embed the issue contents in the prompt.

4. Call the pi-coding-agent:
   ```
   pi --model glm-5-turbo -p "<your prompt>"
   ```

5. Report the full output of the review back to the user, then ask how to proceed.

## Review prompt structure

Use this structure for the prompt passed to pi:

```
You are doing an independent code review of a recently committed implementation
for issue #<ISSUE_NUMBER> in the OtterAgent project (located at /root/Projects/OtterAgent).

## Step 0 — Read the GitHub issue

Start by reading the full GitHub issue using the gh CLI. You MUST do this before anything else:

1. **Title and description**: `gh issue view <ISSUE_NUMBER> --repo BowerJames/OtterAgent --json title,body`
2. **Comments**: `gh issue view <ISSUE_NUMBER> --repo BowerJames/OtterAgent --comments`

Use the title, description, and all comments to fully understand the requirements, context, and any prior discussion before reviewing the code.

## Step 1 — Accuracy & Completeness

Verify that the implementation addresses every requirement mentioned in the issue and its comments.

## Step 2 — Code Quality

Run the linter and report any issues:
- Run: cd /root/Projects/OtterAgent && bun run lint

## Step 3 — Tests

Run the full test suite and report results:
- Run: cd /root/Projects/OtterAgent && bun run test
- Assess whether the test coverage is appropriate for the change

## Step 4 — Build

Verify the project builds cleanly:
- Run: cd /root/Projects/OtterAgent && bun run build

## Step 5 — Post review as a GitHub comment

Before you finish, post your complete review as a comment on the GitHub issue:

- Run: `gh issue comment <ISSUE_NUMBER> --repo BowerJames/OtterAgent --body "<your full review>"`

The comment should include all your findings — issues, gaps, concerns, and anything that looks correct.

Report all findings in full — any issues, gaps, or concerns, as well as confirmation of anything that looks correct.
```

## Notes

- Use `glm-5-turbo` as the model — it has the right balance of capability and speed for reviews.
- Run the review before pushing to remote. If the reviewer finds issues, fix them and re-run the review to confirm before pushing.
- If the reviewer raises a concern you disagree with, discuss it with the user before deciding whether to act on it.
