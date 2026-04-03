/**
 * Custom message types for OtterAgent.
 *
 * Extends pi-agent-core's AgentMessage via declaration merging to add
 * custom message types (compaction summaries, extension messages).
 * Also provides the convertToLlm transformer for the Agent.
 */
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ImageContent, Message, TextContent } from "@mariozechner/pi-ai";

export const COMPACTION_SUMMARY_PREFIX =
	"The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
export const COMPACTION_SUMMARY_SUFFIX = "\n</summary>";

/**
 * Message type for extension-injected messages via sendMessage().
 */
export interface CustomMessage<T = unknown> {
	role: "custom";
	customType: string;
	content: string | (TextContent | ImageContent)[];
	display: boolean;
	details?: T;
	timestamp: number;
}

/**
 * Message type for compaction summaries.
 */
export interface CompactionSummaryMessage {
	role: "compactionSummary";
	summary: string;
	tokensBefore: number;
	timestamp: number;
}

// Extend AgentMessage with our custom types
declare module "@mariozechner/pi-agent-core" {
	interface CustomAgentMessages {
		custom: CustomMessage;
		compactionSummary: CompactionSummaryMessage;
	}
}

export function createCustomMessage(
	customType: string,
	content: string | (TextContent | ImageContent)[],
	display: boolean,
	details: unknown | undefined,
	timestamp: number,
): CustomMessage {
	return { role: "custom", customType, content, display, details, timestamp };
}

export function createCompactionSummaryMessage(
	summary: string,
	tokensBefore: number,
): CompactionSummaryMessage {
	return {
		role: "compactionSummary",
		summary,
		tokensBefore,
		timestamp: Date.now(),
	};
}

/**
 * Transform AgentMessages (including custom types) to LLM-compatible Messages.
 *
 * Used as the Agent's convertToLlm option. Handles:
 * - Standard messages (user, assistant, toolResult) — pass through
 * - Custom messages (from extensions) — convert to user message
 * - Compaction summaries — convert to user message with summary tags
 * - Unknown roles — filtered out
 */
export function convertToLlm(messages: AgentMessage[]): Message[] {
	return messages
		.map((m): Message | undefined => {
			switch (m.role) {
				case "custom": {
					const content =
						typeof m.content === "string"
							? [{ type: "text" as const, text: m.content }]
							: m.content;
					return {
						role: "user",
						content,
						timestamp: m.timestamp,
					};
				}
				case "compactionSummary":
					return {
						role: "user",
						content: [
							{
								type: "text",
								text: COMPACTION_SUMMARY_PREFIX + m.summary + COMPACTION_SUMMARY_SUFFIX,
							},
						],
						timestamp: m.timestamp,
					};
				case "user":
				case "assistant":
				case "toolResult":
					return m;
				default:
					return undefined;
			}
		})
		.filter((m): m is Message => m !== undefined);
}
