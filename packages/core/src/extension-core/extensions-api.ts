/**
 * ExtensionsAPI — the primary interface extensions use to hook into the agent.
 *
 * Extensions receive an instance of this API in their factory function and use
 * it to register tools, commands, event handlers, providers, and to interact
 * with the session.
 */
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, ImageContent, Model, TextContent } from "@mariozechner/pi-ai";
import type { EntryId } from "../interfaces/session-manager.js";
import type { ToolDefinition } from "../interfaces/tool-definition.js";
import type { CommandInfo, CommandOptions } from "./commands.js";
import type { ExtensionContext } from "./context.js";
import type { EventBus } from "./event-bus.js";
import type {
	AgentEndEvent,
	AgentStartEvent,
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	BeforeProviderRequestEvent,
	BeforeProviderRequestEventResult,
	ContextEvent,
	ContextEventResult,
	InputEvent,
	InputEventResult,
	MessageEndEvent,
	MessageStartEvent,
	MessageUpdateEvent,
	SessionBeforeCompactEvent,
	SessionBeforeCompactResult,
	SessionCompactEvent,
	SessionShutdownEvent,
	SessionStartEvent,
	ToolCallEvent,
	ToolCallEventResult,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	ToolExecutionUpdateEvent,
	ToolResultEvent,
	ToolResultEventResult,
	TurnEndEvent,
	TurnStartEvent,
} from "./events.js";
import type { ProviderConfig } from "./providers.js";

/** Handler function type for events. */
export type ExtensionHandler<E, R = undefined> = (
	event: E,
	ctx: ExtensionContext,
	// biome-ignore lint/suspicious/noConfusingVoidType: handlers may return void synchronously
) => Promise<R | undefined> | R | void;

/** Tool info with name, description, and parameter schema. */
export interface ToolInfo {
	name: string;
	description: string;
	parameters: unknown;
}

/**
 * The ExtensionsAPI passed to extension factory functions.
 *
 * Provides methods for subscribing to events, registering tools and commands,
 * managing providers, controlling the model, and interacting with the session.
 */
export interface ExtensionsAPI {
	// ─── Event Subscription ───────────────────────────────────────────

	// Session lifecycle
	on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
	on(event: "session_shutdown", handler: ExtensionHandler<SessionShutdownEvent>): void;
	on(
		event: "session_before_compact",
		handler: ExtensionHandler<SessionBeforeCompactEvent, SessionBeforeCompactResult>,
	): void;
	on(event: "session_compact", handler: ExtensionHandler<SessionCompactEvent>): void;

	// Agent lifecycle
	on(event: "agent_start", handler: ExtensionHandler<AgentStartEvent>): void;
	on(event: "agent_end", handler: ExtensionHandler<AgentEndEvent>): void;
	on(event: "turn_start", handler: ExtensionHandler<TurnStartEvent>): void;
	on(event: "turn_end", handler: ExtensionHandler<TurnEndEvent>): void;
	on(event: "message_start", handler: ExtensionHandler<MessageStartEvent>): void;
	on(event: "message_update", handler: ExtensionHandler<MessageUpdateEvent>): void;
	on(event: "message_end", handler: ExtensionHandler<MessageEndEvent>): void;
	on(event: "tool_execution_start", handler: ExtensionHandler<ToolExecutionStartEvent>): void;
	on(event: "tool_execution_update", handler: ExtensionHandler<ToolExecutionUpdateEvent>): void;
	on(event: "tool_execution_end", handler: ExtensionHandler<ToolExecutionEndEvent>): void;

	// Context & message manipulation
	on(event: "input", handler: ExtensionHandler<InputEvent, InputEventResult>): void;
	on(
		event: "before_agent_start",
		handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>,
	): void;
	on(event: "context", handler: ExtensionHandler<ContextEvent, ContextEventResult>): void;
	on(
		event: "before_provider_request",
		handler: ExtensionHandler<BeforeProviderRequestEvent, BeforeProviderRequestEventResult>,
	): void;

	// Tool hooks
	on(event: "tool_call", handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult>): void;
	on(event: "tool_result", handler: ExtensionHandler<ToolResultEvent, ToolResultEventResult>): void;

	// ─── Tool Management ──────────────────────────────────────────────

	/** Register a tool that the LLM can call. */
	registerTool(tool: ToolDefinition): void;

	/** Get the list of currently active tool names. */
	getActiveTools(): string[];

	/** Get all configured tools with parameter schema metadata. */
	getAllTools(): ToolInfo[];

	/** Set the active tools by name. Triggers a system prompt rebuild. */
	setActiveTools(toolNames: string[]): void;

	// ─── Command Registration ─────────────────────────────────────────

	/** Register a slash command. */
	registerCommand(name: string, options: CommandOptions): void;

	/** Get available slash commands. */
	getCommands(): CommandInfo[];

	// ─── Provider Management ──────────────────────────────────────────

	/**
	 * Register or override a model provider.
	 *
	 * If `models` is provided, replaces all existing models for this provider.
	 * If only `baseUrl` is provided, overrides the URL for existing models.
	 */
	registerProvider(name: string, config: ProviderConfig): void;

	/** Unregister a previously registered provider. */
	unregisterProvider(name: string): void;

	// ─── Model Control ────────────────────────────────────────────────

	/** Set the current model. Returns false if no API key is available. */
	setModel(model: Model<Api>): Promise<boolean>;

	/** Get current thinking level. */
	getThinkingLevel(): ThinkingLevel;

	/** Set thinking level (clamped to model capabilities). */
	setThinkingLevel(level: ThinkingLevel): void;

	// ─── Messages & Entries ───────────────────────────────────────────

	/**
	 * Send a custom message to the session (included in LLM context).
	 *
	 * @param message - The custom message to inject.
	 * @param options - Delivery options.
	 */
	sendMessage<T = unknown>(
		message: {
			customType: string;
			content: string | (TextContent | ImageContent)[];
			display: boolean;
			details?: T;
		},
		options?: {
			/** Whether to trigger an agent turn after injecting. */
			triggerTurn?: boolean;
			/** How to deliver if the agent is streaming. */
			deliverAs?: "steer" | "followUp" | "nextTurn";
		},
	): void;

	/**
	 * Send a user message to the agent. Always triggers a turn.
	 *
	 * @param content - Message content (text or rich content).
	 * @param options - Delivery options.
	 */
	sendUserMessage(
		content: string | (TextContent | ImageContent)[],
		options?: {
			/** How to deliver if the agent is streaming. */
			deliverAs?: "steer" | "followUp";
		},
	): void;

	/**
	 * Append a custom entry to the session for state persistence.
	 * Not sent to the LLM — use sendMessage for that.
	 */
	appendEntry<T = unknown>(customType: string, data?: T): void;

	// ─── Labels ───────────────────────────────────────────────────────

	/**
	 * Set or clear a label on an entry.
	 * Pass undefined to clear the label.
	 */
	setLabel(entryId: EntryId, label: string | undefined): void;

	// ─── Extension Communication ──────────────────────────────────────

	/** Shared event bus for extension-to-extension communication. */
	events: EventBus;
}
