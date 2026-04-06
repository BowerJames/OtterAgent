import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ModeConfig } from "./types.js";

const DEVELOP_WORKFLOW_INSTRUCTIONS = `You are in develop mode. Follow this workflow:

1. If you are on the main branch, create a new branch. Choose an appropriate name based on the work.
2. If an issue number is provided, review it with \`gh issue view <number> --comments\`. If it's missing decisions or is outdated, update it.
3. If no issue exists yet, create one first with goals, acceptance criteria, and a plan so the work is tracked.
4. Complete the development work.
5. Once the work is complete, commit with a descriptive message and post a comment on the issue summarizing what was done.`;

/**
 * Parse a git remote URL to extract the owner/repo slug.
 * Handles both HTTPS and SSH formats.
 */
function parseRepoSlug(remoteUrl: string): string | null {
	// HTTPS: https://github.com/owner/repo.git
	const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
	if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;

	// SSH: git@github.com:owner/repo.git
	const sshMatch = remoteUrl.match(/git@[^:]+:([^/]+)\/([^/\s]+?)(?:\.git)?$/);
	if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

	return null;
}

async function developBeforeAgentStart(
	modeState: Record<string, unknown> | undefined,
	_ctx: ExtensionContext,
	pi: ExtensionAPI,
): Promise<{ message: { customType: string; content: string; display: boolean } } | void> {
	// Fetch repo slug every turn (not cached) so branch changes are reflected
	let repoLine = "";
	try {
		const { stdout, code } = await pi.exec("git", ["remote", "get-url", "origin"]);
		if (code === 0 && stdout.trim()) {
			const slug = parseRepoSlug(stdout.trim());
			if (slug) {
				repoLine = `\nRepository: ${slug}`;
			}
		}
	} catch {
		// git not available or no remote — omit repo line
	}

	// Build issue/description context based on modeState
	let issueContext = "";
	const issueNumber = modeState?.issueNumber;
	const description = modeState?.description;

	if (typeof issueNumber === "number") {
		issueContext = `\nIssue: #${issueNumber}`;
	} else if (typeof description === "string") {
		issueContext = `\nNo issue exists yet — create one first.\nDescription: ${description}`;
	} else {
		issueContext = "\nNo issue or description provided — ask the user what they want to work on.";
	}

	const content = `${DEVELOP_WORKFLOW_INSTRUCTIONS}${repoLine}${issueContext}`;

	return {
		message: {
			customType: "develop-context",
			content,
			display: false,
		},
	};
}

export const developConfig: ModeConfig = {
	label: "🔨 develop",
	beforeAgentStart: developBeforeAgentStart,
};
