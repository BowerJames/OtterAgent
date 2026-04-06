import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

export type ModeConfig = {
	label: string;
	suffix?: string;
	beforeAgentStart?: (
		modeState: Record<string, unknown> | undefined,
		ctx: ExtensionContext,
		pi: ExtensionAPI,
	) => Promise<{ message: { customType: string; content: string; display: boolean } } | void>;
};
