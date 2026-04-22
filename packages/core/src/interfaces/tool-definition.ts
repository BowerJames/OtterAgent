import type { AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import type { Static, TSchema } from "@sinclair/typebox";

/**
 * Definition for a tool that can be registered with the agent.
 *
 * Replicated from pi-coding-agent's ToolDefinition with TUI-specific
 * fields (renderCall, renderResult) removed. The execute signature
 * uses pi-agent-core's types directly.
 */
export interface ToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown> {
	/** Tool name (used in LLM tool calls). */
	name: string;

	/** Human-readable label for UI display. */
	label: string;

	/** Description for the LLM explaining what this tool does. */
	description: string;

	/**
	 * Optional one-line snippet for the "Available Tools" section in the
	 * system prompt. Tools without a snippet are omitted from that section.
	 */
	promptSnippet?: string;

	/**
	 * Optional guideline bullets appended to the "Guidelines" section of
	 * the system prompt when this tool is active.
	 */
	promptGuidelines?: string[];

	/** Parameter schema (TypeBox). */
	parameters: TParams;

	/**
	 * Optional compatibility shim to prepare raw tool call arguments before
	 * schema validation. Must return an object conforming to `TParams`.
	 */
	prepareArguments?: (args: unknown) => Static<TParams>;

	/**
	 * Execute the tool.
	 *
	 * @param toolCallId - Unique identifier for this tool call.
	 * @param params - Validated parameters matching the `parameters` schema.
	 * @param signal - Abort signal for cancellation. Implementations should
	 *   honour this signal and clean up promptly when aborted.
	 * @param onUpdate - Optional callback for streaming partial results
	 *   during long-running tool executions.
	 * @returns The tool execution result containing content and details.
	 */
	execute(
		toolCallId: string,
		params: Static<TParams>,
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
	): Promise<AgentToolResult<TDetails>>;
}
