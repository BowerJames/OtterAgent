/**
 * Mode Extension
 *
 * Lightweight, mutually exclusive mode system for project-specific agent modes.
 * Only one mode can be active at a time. Modes append a prompt suffix to every
 * user message and show a footer status indicator.
 *
 * Commands:
 *   /mode           — clear active mode
 *   /mode <name>    — activate mode (toggle off if already active)
 *   /plan           — shorthand for /mode plan
 *
 * Adding a new mode: add an entry to the MODES registry below.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type ModeConfig = {
	label: string;
	suffix: string;
};

const MODES: Record<string, ModeConfig> = {
	plan: {
		label: "📋 plan",
		suffix:
			"Remember we are in a planning session so you should not be making any writes or edits. Address my comments and raise any further open questions you have. If you have no open questions respond with your current implementation plan.",
	},
};

export default function modeExtension(pi: ExtensionAPI): void {
	let activeMode: string | null = null;

	const availableModes = Object.keys(MODES).join(", ");

	function updateStatus(ctx: ExtensionContext): void {
		if (activeMode && MODES[activeMode]) {
			ctx.ui.setStatus("active-mode", ctx.ui.theme.fg("warning", MODES[activeMode].label));
		} else {
			ctx.ui.setStatus("active-mode", undefined);
		}
	}

	function setMode(mode: string | null, ctx: ExtensionContext): void {
		activeMode = mode;
		pi.appendEntry("mode", { mode: activeMode });
		updateStatus(ctx);

		if (activeMode) {
			ctx.ui.notify(`Mode: ${MODES[activeMode].label}`, "info");
		} else {
			ctx.ui.notify("Mode cleared", "info");
		}
	}

	pi.registerCommand("mode", {
		description: "Set or clear agent mode",
		handler: async (args, ctx) => {
			const name = args.trim();

			if (!name) {
				setMode(null, ctx);
				return;
			}

			if (!(name in MODES)) {
				ctx.ui.notify(`Unknown mode: ${name}. Available: ${availableModes}`, "error");
				return;
			}

			// Toggle off if same mode already active
			if (activeMode === name) {
				setMode(null, ctx);
				return;
			}

			setMode(name, ctx);
		},
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode",
		handler: async (_args, ctx) => {
			if (activeMode === "plan") {
				setMode(null, ctx);
			} else {
				setMode("plan", ctx);
			}
		},
	});

	pi.on("input", async (event) => {
		if (!activeMode || !(activeMode in MODES)) return;
		if (event.source === "extension") return;

		return {
			action: "transform",
			text: `${event.text}\n\n${MODES[activeMode].suffix}`,
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		const modeEntry = entries
			.filter(
				(e: { type: string; customType?: string }) =>
					e.type === "custom" && e.customType === "mode",
			)
			.pop() as { data?: { mode: string | null } } | undefined;

		if (modeEntry?.data) {
			activeMode = modeEntry.data.mode;
		}

		updateStatus(ctx);
	});
}
