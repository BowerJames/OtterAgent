/**
 * Mode Extension
 *
 * Lightweight, mutually exclusive mode system for project-specific agent modes.
 * Only one mode can be active at a time. Modes can provide a prompt suffix,
 * a dynamic beforeAgentStart hook, or both.
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
import { developConfig } from "./develop.js";
import { planConfig } from "./plan.js";
import type { ModeConfig } from "./types.js";

const PLAN_DEACTIVATED_MESSAGE =
	"Plan mode has been deactivated. You may now make file writes, edits, and other changes as needed.";

const MODES: Record<string, ModeConfig> = {
	plan: planConfig,
	develop: developConfig,
};

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

	function setMode(
		mode: string | null,
		state: Record<string, unknown> | undefined,
		ctx: ExtensionContext,
		force = false,
	): void {
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
		} else {
			ctx.ui.notify("Mode cleared", "info");
		}

		// Send deactivation message when leaving plan mode
		if (previousMode === "plan" && activeMode !== "plan") {
			pi.sendMessage({
				customType: "plan-deactivated",
				content: PLAN_DEACTIVATED_MESSAGE,
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
				setMode(null, undefined, ctx);
				return;
			}

			if (!(name in MODES)) {
				ctx.ui.notify(`Unknown mode: ${name}. Available: ${availableModes}`, "error");
				return;
			}

			setMode(name, undefined, ctx);
		},
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode",
		handler: async (_args, ctx) => {
			if (activeMode === "plan") {
				setMode(null, undefined, ctx);
			} else {
				setMode("plan", undefined, ctx);
			}
		},
	});

	pi.registerCommand("develop", {
		description: "Toggle develop mode (optionally with issue number or 'new <description>')",
		handler: async (args, ctx) => {
			const trimmed = args.trim();

			// Toggle off if develop is already active
			if (activeMode === "develop" && !trimmed) {
				setMode(null, undefined, ctx);
				return;
			}

			if (trimmed.startsWith("new ")) {
				const description = trimmed.slice(4).trim();
				if (!description) {
					ctx.ui.notify("Usage: /develop new <description>", "error");
					return;
				}
				setMode("develop", { description }, ctx, true);
			} else if (/^\d+$/.test(trimmed)) {
				setMode("develop", { issueNumber: Number.parseInt(trimmed, 10) }, ctx, true);
			} else if (trimmed) {
				ctx.ui.notify("Usage: /develop [ <issue-number> | new <description> ]", "error");
				return;
			} else {
				// /develop with no args while not active — activate with no state
				setMode("develop", undefined, ctx);
			}
		},
	});

	// --- Events ---

	// Append suffix to user messages for modes that have one (plan mode)
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

	// Inject dynamic context for modes that have a beforeAgentStart hook (develop mode)
	pi.on("before_agent_start", async (_event, ctx) => {
		if (!activeMode || !(activeMode in MODES)) return;

		const config = MODES[activeMode];
		if (!config.beforeAgentStart) return;

		return config.beforeAgentStart(modeState, ctx, pi);
	});

	// Filter out stale context messages from inactive modes
	pi.on("context", async (event) => {
		const inactiveCustomTypes: string[] = [];
		if (activeMode !== "develop") inactiveCustomTypes.push("develop-context");
		if (activeMode !== "plan") inactiveCustomTypes.push("plan-context");

		if (inactiveCustomTypes.length === 0) return;

		return {
			messages: event.messages.filter((m) => {
				return !inactiveCustomTypes.includes((m as { customType?: string }).customType ?? "");
			}),
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
