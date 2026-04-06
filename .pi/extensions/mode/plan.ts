import type { ModeConfig } from "./types.js";

export const PLAN_WORKFLOW_INSTRUCTIONS = `You are in plan mode. Follow this workflow:

1. Explore the codebase to gather the context required to contribute to the planning session effectively.
2. Raise any open questions you have for the user. Continue across multiple turns until all your questions are answered.
3. Once you have no more open questions, output a full implementation plan with specific steps, files to change, and the approach for each change. Ask the user for approval or additional feedback.

Do NOT make any file writes, edits, or execute commands that modify the filesystem. Focus entirely on understanding requirements and producing a plan.`;

export const planConfig: ModeConfig = {
	label: "📋 plan",
	suffix: "Remember you are currently in plan mode",
};
