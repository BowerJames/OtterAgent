/**
 * Mode Extension
 *
 * Lightweight, mutually exclusive mode system for project-specific agent modes.
 * Only one mode can be active at a time. Modes can provide a prompt suffix,
 * an activation message, or both.
 *
 * Commands:
 *   /mode               — clear active mode
 *   /mode <name>        — activate mode (toggle off if already active)
 *   /plan               — shorthand for /mode plan
 *   /develop            — toggle develop mode
 *   /develop <number>   — activate develop mode for an existing issue
 *   /develop new <desc> — activate develop mode, agent will create issue first
 *
 * Adding a new mode: create a config file and add an entry to the MODES registry below.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DEVELOP_WORKFLOW_INSTRUCTIONS, developConfig } from "./develop.js";
import { PLAN_WORKFLOW_INSTRUCTIONS, planConfig } from "./plan.js";
import type { ModeConfig } from "./types.js";

const PLAN_DEACTIVATED_MESSAGE =
	"Plan mode has been deactivated. You may now make file writes, edits, and other changes as needed.";

const DEVELOP_DEACTIVATED_MESSAGE = "Develop mode has been deactivated.";

const MODES: Record<string, ModeConfig> = {
	plan: planConfig,
	develop: developConfig,
};

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

/**
 * Build the full activation message content for develop mode.
 * Includes the static workflow instructions plus dynamic repo slug and issue context.
 */
async function buildDevelopActivationContent(
	modeState: Record<string, unknown> | undefined,
	pi: ExtensionAPI,
): Promise<string> {
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

	return `${DEVELOP_WORKFLOW_INSTRUCTIONS}${repoLine}${issueContext}`;
}

export default function modeExtension(pi: ExtensionAPI): void {
	let activeMode: string | null = null;
	let modeState: Record<string, unknown> | undefined;

	const availableModes = Object.keys(MODES).join(", ");

	function updateStatus(ctx: ExtensionContext): void {
		if (!activeMode || !(activeMode in MODES)) {
			ctx.ui.setStatus("active-mode", undefined);
			return;
		}

		if (activeMode === "develop") {
			const issueNumber = modeState?.issueNumber;
			const description = modeState?.description;

			if (typeof issueNumber === "number") {
				ctx.ui.setStatus("active-mode", ctx.ui.theme.fg("accent", `🔨 develop #${issueNumber}`));
			} else if (typeof description === "string") {
				ctx.ui.setStatus("active-mode", ctx.ui.theme.fg("accent", "🔨 develop (new)"));
			} else {
				ctx.ui.setStatus("active-mode", ctx.ui.theme.fg("accent", MODES.develop.label));
			}
		} else {
			ctx.ui.setStatus("active-mode", ctx.ui.theme.fg("warning", MODES[activeMode].label));
		}
	}

	async function setMode(
		mode: string | null,
		state: Record<string, unknown> | undefined,
		ctx: ExtensionContext,
		force = false,
	): Promise<void> {
		const previousMode = activeMode;

		// Toggle off if same mode already active (unless forced)
		if (!force && mode !== null && activeMode === mode) {
			mode = null;
			state = undefined;
		}

		activeMode = mode;
		modeState = mode ? state : undefined;
		pi.appendEntry("mode", { mode: activeMode, state: modeState });
		updateStatus(ctx);

		if (activeMode) {
			const label =
				activeMode === "develop" ? buildDevelopLabel(modeState) : MODES[activeMode].label;
			ctx.ui.notify(`Mode: ${label}`, "info");

			// Send one-time activation message
			if (activeMode === "plan") {
				pi.sendMessage({
					customType: "plan-context",
					content: PLAN_WORKFLOW_INSTRUCTIONS,
					display: true,
				});
			} else if (activeMode === "develop") {
				const content = await buildDevelopActivationContent(modeState, pi);
				pi.sendMessage({
					customType: "develop-context",
					content,
					display: true,
				});
			}
		} else {
			ctx.ui.notify("Mode cleared", "info");
		}

		// Send deactivation messages
		if (previousMode === "plan" && activeMode !== "plan") {
			pi.sendMessage({
				customType: "plan-deactivated",
				content: PLAN_DEACTIVATED_MESSAGE,
				display: true,
			});
		}
		if (previousMode === "develop" && activeMode !== "develop") {
			pi.sendMessage({
				customType: "develop-deactivated",
				content: DEVELOP_DEACTIVATED_MESSAGE,
				display: true,
			});
		}
	}

	function buildDevelopLabel(state: Record<string, unknown> | undefined): string {
		if (typeof state?.issueNumber === "number") return `🔨 develop #${state.issueNumber}`;
		if (typeof state?.description === "string") return "🔨 develop (new)";
		return MODES.develop.label;
	}

	// --- Commands ---

	pi.registerCommand("mode", {
		description: "Set or clear agent mode",
		handler: async (args, ctx) => {
			const name = args.trim();

			if (!name) {
				await setMode(null, undefined, ctx);
				return;
			}

			if (!(name in MODES)) {
				ctx.ui.notify(`Unknown mode: ${name}. Available: ${availableModes}`, "error");
				return;
			}

			await setMode(name, undefined, ctx);
		},
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode",
		handler: async (_args, ctx) => {
			if (activeMode === "plan") {
				await setMode(null, undefined, ctx);
			} else {
				await setMode("plan", undefined, ctx);
			}
		},
	});

	pi.registerCommand("develop", {
		description: "Toggle develop mode (optionally with issue number or 'new <description>')",
		handler: async (args, ctx) => {
			const trimmed = args.trim();

			// Toggle off if develop is already active
			if (activeMode === "develop" && !trimmed) {
				await setMode(null, undefined, ctx);
				return;
			}

			if (trimmed.startsWith("new ")) {
				const description = trimmed.slice(4).trim();
				if (!description) {
					ctx.ui.notify("Usage: /develop new <description>", "error");
					return;
				}
				await setMode("develop", { description }, ctx, true);
			} else if (/^\d+$/.test(trimmed)) {
				await setMode("develop", { issueNumber: Number.parseInt(trimmed, 10) }, ctx, true);
			} else if (trimmed) {
				ctx.ui.notify("Usage: /develop [ <issue-number> | new <description> ]", "error");
				return;
			} else {
				// /develop with no args while not active — activate with no state
				await setMode("develop", undefined, ctx);
			}
		},
	});

	// --- Events ---

	// Append suffix to user messages for modes that have one
	pi.on("input", async (event) => {
		if (!activeMode || !(activeMode in MODES)) return;
		if (event.source === "extension") return;

		const config = MODES[activeMode];
		if (!config.suffix) return;

		return {
			action: "transform",
			text: `${event.text}\n\n${config.suffix}`,
		};
	});

	// Restore mode and state on session start/resume
	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (entry.type === "custom" && "customType" in entry && entry.customType === "mode") {
				const data = entry.data;
				if (data?.mode && typeof data.mode === "string" && data.mode in MODES) {
					activeMode = data.mode;
					modeState = data.state;
				}
				break;
			}
		}

		updateStatus(ctx);
	});
}
