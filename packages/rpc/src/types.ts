/**
 * RPC protocol types for OtterAgent's headless operation mode.
 *
 * Defines a JSON-line protocol where commands come in, responses and
 * async events go out, over an abstract transport layer.
 *
 * Protocol format: each message is a single JSON line (newline-delimited).
 *
 * ```
 * Client → Agent:  {"type":"prompt","message":"Hello","id":"req_1"}
 * Agent → Client:  {"type":"response","command":"prompt","success":true,"id":"req_1"}
 * Agent → Client:  {"type":"event","event":"agent_start","payload":{}}
 * ```
 */
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";

// ─── Commands (Client → Agent) ───────────────────────────────────────

/** Core interaction commands. */
export interface PromptCommand {
	type: "prompt";
	id?: string;
	message: string;
	images?: ImageContent[];
}

export interface SteerCommand {
	type: "steer";
	id?: string;
	message: string;
}

export interface FollowUpCommand {
	type: "follow_up";
	id?: string;
	message: string;
}

export interface AbortCommand {
	type: "abort";
	id?: string;
}

/** Model control commands. */
export interface SetModelCommand {
	type: "set_model";
	id?: string;
	provider: string;
	modelId: string;
}

export interface SetThinkingLevelCommand {
	type: "set_thinking_level";
	id?: string;
	level: ThinkingLevel;
}

/** Context management commands. */
export interface CompactCommand {
	type: "compact";
	id?: string;
	customInstructions?: string;
}

/** Introspection commands. */
export interface GetStateCommand {
	type: "get_state";
	id?: string;
}

export interface GetCommandsCommand {
	type: "get_commands";
	id?: string;
}

/** Lifecycle commands. */
export interface ShutdownCommand {
	type: "shutdown";
	id?: string;
}

/** Union of all RPC commands. */
export type RpcCommand =
	| PromptCommand
	| SteerCommand
	| FollowUpCommand
	| AbortCommand
	| SetModelCommand
	| SetThinkingLevelCommand
	| CompactCommand
	| GetStateCommand
	| GetCommandsCommand
	| ShutdownCommand;

/** String literal union of all command types. */
export type RpcCommandType = RpcCommand["type"];

// ─── Responses (Agent → Client) ──────────────────────────────────────

/** Successful response. */
export interface RpcSuccessResponse {
	type: "response";
	id?: string;
	command: string;
	success: true;
	data?: unknown;
}

/** Error response. */
export interface RpcErrorResponse {
	type: "response";
	id?: string;
	command: string;
	success: false;
	error: string;
}

/** Union of response types. */
export type RpcResponse = RpcSuccessResponse | RpcErrorResponse;

// ─── Response Data Shapes ────────────────────────────────────────────

/** Data returned by `get_state`. */
export interface RpcSessionState {
	model?: { provider: string; modelId: string };
	thinkingLevel: ThinkingLevel;
	isStreaming: boolean;
	messageCount: number;
	pendingMessageCount: number;
}

/** A command available via slash-command or extension. */
export interface RpcCommandInfo {
	name: string;
	description?: string;
}

/** Data returned by `get_commands`. */
export interface RpcGetCommandsData {
	commands: RpcCommandInfo[];
}

/** Data returned by `set_model`. */
export interface RpcSetModelData {
	provider: string;
	modelId: string;
}

// ─── Events (Agent → Client) ─────────────────────────────────────────

/**
 * Agent event forwarded to the client.
 *
 * Events are forwarded 1:1 from the AgentSession. The `event` field
 * matches the AgentEvent or AgentSessionEvent `type` field, and
 * `payload` contains the full event data.
 */
export interface RpcAgentEvent {
	type: "event";
	event: string;
	payload: unknown;
}

// ─── Extension UI Protocol ───────────────────────────────────────────

/**
 * Extension UI request emitted by the server when an extension calls
 * a UIProvider method (select, confirm, input, dialog, notify).
 *
 * For interactive methods (select, confirm, input, dialog), the client
 * must respond with an `ExtensionUIResponse` matching the `id`.
 * For fire-and-forget methods (notify), no response is expected.
 */
export type ExtensionUIRequest =
	| ExtensionUIDialogRequest
	| ExtensionUIConfirmRequest
	| ExtensionUIInputRequest
	| ExtensionUISelectRequest
	| ExtensionUINotifyRequest;

export interface ExtensionUIDialogRequest {
	type: "extension_ui_request";
	id: string;
	method: "dialog";
	title: string;
	body: string;
	timeout?: number;
}

export interface ExtensionUIConfirmRequest {
	type: "extension_ui_request";
	id: string;
	method: "confirm";
	title: string;
	body: string;
	timeout?: number;
}

export interface ExtensionUIInputRequest {
	type: "extension_ui_request";
	id: string;
	method: "input";
	title: string;
	placeholder?: string;
	timeout?: number;
}

export interface ExtensionUISelectRequest {
	type: "extension_ui_request";
	id: string;
	method: "select";
	title: string;
	items: unknown[];
	timeout?: number;
}

export interface ExtensionUINotifyRequest {
	type: "extension_ui_request";
	id: string;
	method: "notify";
	message: string;
	notifyType?: "info" | "warning" | "error";
}

/**
 * Extension UI response sent by the client to resolve an interactive
 * UI request. The `id` must match the originating request.
 */
export interface ExtensionUIResponse {
	type: "extension_ui_response";
	id: string;
	/** The selected/entered value (for select, input). */
	value?: string;
	/** Whether the user confirmed (for confirm). */
	confirmed?: boolean;
	/** Set to true if the user cancelled the dialog. */
	cancelled?: boolean;
}

// ─── Inbound Messages (Client → Agent) ───────────────────────────────

/**
 * Union of all inbound messages the agent can receive from the client.
 * Includes both RPC commands and extension UI responses.
 */
export type RpcInboundMessage = RpcCommand | ExtensionUIResponse;

// ─── Outbound Messages (Agent → Client) ──────────────────────────────

/**
 * Union of all outbound messages the agent can send to the client.
 * Includes responses, events, and extension UI requests.
 */
export type RpcOutboundMessage = RpcResponse | RpcAgentEvent | ExtensionUIRequest;

// ─── Transport ───────────────────────────────────────────────────────

/**
 * Abstract transport interface for RPC communication.
 *
 * The core package defines the protocol and handler logic. Specific
 * transports (stdio, WebSocket, HTTP) are provided by separate packages.
 */
export interface RpcTransport {
	/**
	 * Register a handler for incoming messages from the client.
	 * The transport is responsible for parsing JSON lines into objects.
	 */
	onMessage(handler: (message: RpcInboundMessage) => void): void;

	/**
	 * Send an outbound message to the client.
	 * The transport is responsible for serialising to JSON lines.
	 */
	send(message: RpcOutboundMessage): void;

	/**
	 * Close the transport and release resources.
	 * Optional — not all transports need explicit cleanup.
	 */
	close?(): void;
}

// ─── Convenience Helpers (for handler use) ───────────────────────────

/** Helper type to extract the data shape for a specific command response. */
export type RpcResponseDataFor<T extends RpcCommandType> = T extends "get_state"
	? RpcSessionState
	: T extends "get_commands"
		? RpcGetCommandsData
		: T extends "set_model"
			? RpcSetModelData
			: undefined;

/** All agent event names that can appear in RpcAgentEvent.event. */
export type RpcAgentEventName =
	| "agent_start"
	| "agent_end"
	| "turn_start"
	| "turn_end"
	| "message_start"
	| "message_update"
	| "message_end"
	| "tool_execution_start"
	| "tool_execution_update"
	| "tool_execution_end"
	| "compaction_start"
	| "compaction_end";

/** All extension event names forwarded as RPC events. */
export type RpcExtensionEventName = "session_start" | "session_shutdown" | "session_compact";
