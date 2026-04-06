import type { ModeConfig } from "./types.js";

export const DEVELOP_WORKFLOW_INSTRUCTIONS = `You are in develop mode. Follow this workflow:

1. If you are on the main branch, create a new branch. Choose an appropriate name based on the work.
2. If an issue number is provided, review it with \`gh issue view <number> --comments\`. If it's missing decisions or is outdated, update it.
3. If no issue exists yet, create one first with goals, acceptance criteria, and a plan so the work is tracked.
4. Complete the development work.
5. Once the work is complete, commit with a descriptive message and post a comment on the issue summarizing what was done.`;

export const developConfig: ModeConfig = {
	label: "🔨 develop",
	suffix: "Remember you are currently in develop mode",
};
