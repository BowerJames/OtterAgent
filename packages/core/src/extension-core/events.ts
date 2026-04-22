/**
 * Extension event types.
 *
 * Defines all events that extensions can subscribe to via the ExtensionsAPI.
 * Events are grouped into: session lifecycle, agent lifecycle,
 * context/message manipulation, and tool hooks.
 */
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
	AssistantMessageEvent,
	ImageContent,
	TextContent,
	ToolResultMessage,
} from "@mariozechner/pi-ai";
import type { EntryId } from "../interfaces/session-manager.js";

// ─── Session Lifecycle ────────────────────────────────────────────────

/** Fired on initial session load. */
export interface SessionStartEvent {
	type: "session_start";
}

/** Fired on process exit. Extensions should clean up resources. */
export interface SessionShutdownEvent {
	type: "session_shutdown";
}

/** Fired before context compaction (can be cancelled or customised). */
export interface SessionBeforeCompactEvent {
	type: "session_before_compact";
	/** The messages that will be summarised. */
	messages: AgentMessage[];
	/** Custom instructions provided by the caller, if any. */
	customInstructions?: string;
	/** Abort signal — honoured by the compaction process. */
	signal: AbortSignal;
}

/** Result from session_before_compact handler. */
export interface SessionBeforeCompactResult {
	/** Set to true to cancel compaction. */
	cancel?: boolean;
	/** Provide a custom compaction result to skip the default summarisation. */
	compaction?: {
		summary?: string;
		firstKeptEntryId?: EntryId;
		details?: unknown;
	};
}

/** Fired after context compaction. */
export interface SessionCompactEvent {
	type: "session_compact";
	/** The compaction summary that was persisted. */
	summary: string;
	/** Whether an extension provided the compaction (vs default). */
	fromExtension: boolean;
}

// ─── Agent Lifecycle ──────────────────────────────────────────────────

/** Fired when an agent loop starts. */
export interface AgentStartEvent {
	type: "agent_start";
}

/** Fired when an agent loop ends. */
export interface AgentEndEvent {
	type: "agent_end";
	messages: AgentMessage[];
}

/** Fired at the start of each turn. */
export interface TurnStartEvent {
	type: "turn_start";
	turnIndex: number;
	timestamp: number;
}

/** Fired at the end of each turn. */
export interface TurnEndEvent {
	type: "turn_end";
	turnIndex: number;
	message: AgentMessage;
	toolResults: ToolResultMessage[];
}

/** Fired when a message starts (user, assistant, or toolResult). */
export interface MessageStartEvent {
	type: "message_start";
	message: AgentMessage;
}

/** Fired during assistant message streaming with token-by-token updates. */
export interface MessageUpdateEvent {
	type: "message_update";
	message: AgentMessage;
	assistantMessageEvent: AssistantMessageEvent;
}

/** Fired when a message ends. */
export interface MessageEndEvent {
	type: "message_end";
	message: AgentMessage;
}

/** Fired when a tool starts executing. */
export interface ToolExecutionStartEvent {
	type: "tool_execution_start";
	toolCallId: string;
	toolName: string;
	args: unknown;
}

/** Fired during tool execution with partial/streaming output. */
export interface ToolExecutionUpdateEvent {
	type: "tool_execution_update";
	toolCallId: string;
	toolName: string;
	args: unknown;
	partialResult: unknown;
}

/** Fired when a tool finishes executing. */
export interface ToolExecutionEndEvent {
	type: "tool_execution_end";
	toolCallId: string;
	toolName: string;
	result: unknown;
	isError: boolean;
}

// ─── Context & Message Manipulation ───────────────────────────────────

/** Source of user input. */
export type InputSource = "rpc" | "extension" | "programmatic";

/** Fired when user input is received, before agent processing. */
export interface InputEvent {
	type: "input";
	text: string;
	images?: ImageContent[];
	source: InputSource;
}

/** Result from input event handler. */
export type InputEventResult =
	| { action: "continue" }
	| { action: "transform"; text: string; images?: ImageContent[] }
	| { action: "handled" };

/** Fired after user input but before the agent loop starts. */
export interface BeforeAgentStartEvent {
	type: "before_agent_start";
	prompt: string;
	images?: ImageContent[];
	systemPrompt: string;
}

/** Result from before_agent_start handler. */
export interface BeforeAgentStartEventResult {
	/** Inject a custom message into the conversation. */
	message?: {
		customType: string;
		content: string | (TextContent | ImageContent)[];
		display: boolean;
		details?: unknown;
	};
	/** Replace the system prompt for this turn. If multiple extensions return this, they are chained. */
	systemPrompt?: string;
}

/** Fired before each LLM call. Can modify messages. */
export interface ContextEvent {
	type: "context";
	messages: AgentMessage[];
}

/** Result from context event handler. */
export interface ContextEventResult {
	messages?: AgentMessage[];
}

/** Fired before a provider request is sent. Can replace the payload. */
export interface BeforeProviderRequestEvent {
	type: "before_provider_request";
	payload: unknown;
}

/** Result from before_provider_request handler. */
export type BeforeProviderRequestEventResult = unknown;

// ─── Tool Hooks ───────────────────────────────────────────────────────

/**
 * Fired before a tool executes. Can block execution.
 *
 * `event.input` is mutable. Mutate it in place to patch tool arguments
 * before execution. Later handlers see earlier mutations. No re-validation
 * is performed after mutation.
 */
export interface ToolCallEvent {
	type: "tool_call";
	toolCallId: string;
	toolName: string;
	input: Record<string, unknown>;
}

/** Result from tool_call handler. */
export interface ToolCallEventResult {
	/** Block tool execution. To modify arguments, mutate `event.input` in place instead. */
	block?: boolean;
	reason?: string;
}

/** Fired after a tool executes. Can modify the result. */
export interface ToolResultEvent {
	type: "tool_result";
	toolCallId: string;
	toolName: string;
	input: Record<string, unknown>;
	content: (TextContent | ImageContent)[];
	details: unknown;
	isError: boolean;
}

/** Result from tool_result handler. */
export interface ToolResultEventResult {
	content?: (TextContent | ImageContent)[];
	details?: unknown;
	isError?: boolean;
}

// ─── Event Union & Handler Types ──────────────────────────────────────

/** Union of all extension event types. */
export type ExtensionEvent =
	| SessionStartEvent
	| SessionShutdownEvent
	| SessionBeforeCompactEvent
	| SessionCompactEvent
	| AgentStartEvent
	| AgentEndEvent
	| TurnStartEvent
	| TurnEndEvent
	| MessageStartEvent
	| MessageUpdateEvent
	| MessageEndEvent
	| ToolExecutionStartEvent
	| ToolExecutionUpdateEvent
	| ToolExecutionEndEvent
	| InputEvent
	| BeforeAgentStartEvent
	| ContextEvent
	| BeforeProviderRequestEvent
	| ToolCallEvent
	| ToolResultEvent;

/** Event name string literal union. */
export type ExtensionEventName = ExtensionEvent["type"];
