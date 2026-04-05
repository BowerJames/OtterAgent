/**
 * ExtensionRunner — loads extensions and dispatches events to their handlers.
 *
 * Each extension gets its own ExtensionsAPI instance. The runner aggregates
 * all registered handlers and dispatches events in registration order.
 */
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, ImageContent, Model, TextContent } from "@mariozechner/pi-ai";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { EntryId, ReadonlySessionManager } from "../interfaces/session-manager.js";
import type { ToolDefinition } from "../interfaces/tool-definition.js";
import type { UIProvider } from "../interfaces/ui-provider.js";
import { noOpUIProvider } from "../interfaces/ui.js";
import type { ModelRegistry } from "../session/model-registry.js";
import type { CommandInfo, CommandOptions } from "./commands.js";
import type { CompactOptions, ExtensionCommandContext, ExtensionContext } from "./context.js";
import { createEventBus } from "./event-bus-impl.js";
import type { EventBus } from "./event-bus.js";
import type {
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	BeforeProviderRequestEvent,
	BeforeProviderRequestEventResult,
	ContextEvent,
	ContextEventResult,
	ExtensionEventName,
	InputEvent,
	InputEventResult,
	SessionBeforeCompactEvent,
	SessionBeforeCompactResult,
	ToolCallEvent,
	ToolCallEventResult,
	ToolResultEvent,
	ToolResultEventResult,
} from "./events.js";
import type { Extension } from "./extension.js";
import type { ExtensionHandler, ExtensionsAPI, ToolInfo } from "./extensions-api.js";
import type { ProviderConfig } from "./providers.js";

// ─── Types ────────────────────────────────────────────────────────────

interface RegisteredCommand {
	name: string;
	options: CommandOptions;
}

type ErrorListener = (error: Error, context: { event?: string; extension?: string }) => void;

/** Actions that the AgentSession provides to the runner. */
export interface ExtensionRunnerActions {
	registerTool: (tool: ToolDefinition) => void;
	getActiveToolNames: () => string[];
	getAllToolDefinitions: () => ToolDefinition[];
	setActiveToolsByName: (names: string[]) => void;
	setModel: (model: Model<Api>) => Promise<boolean>;
	getThinkingLevel: () => ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
	sendMessage: <T = unknown>(
		message: {
			customType: string;
			content: string | (TextContent | ImageContent)[];
			display: boolean;
			details?: T;
		},
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	) => void;
	sendUserMessage: (
		content: string | (TextContent | ImageContent)[],
		options?: { deliverAs?: "steer" | "followUp" },
	) => void;
	appendEntry: (customType: string, data?: unknown) => void;
	setLabel: (entryId: EntryId, label: string | undefined) => void;
	getSessionManager: () => ReadonlySessionManager;
	getAgentEnvironment: () => AgentEnvironment;
	getModel: () => Model<Api> | undefined;
	isIdle: () => boolean;
	getSignal: () => AbortSignal | undefined;
	abort: () => void;
	hasPendingMessages: () => boolean;
	shutdown: () => void;
	getContextUsage: () => ExtensionContext["getContextUsage"] extends () => infer R ? R : never;
	compact: (options?: CompactOptions) => void;
	getSystemPrompt: () => string;
	waitForIdle: () => Promise<void>;
	reload: () => Promise<void>;
}

// ─── ExtensionRunner ──────────────────────────────────────────────────

export class ExtensionRunner {
	private readonly _handlers: Map<string, Array<{ handler: ExtensionHandler<unknown, unknown> }>> =
		new Map();
	private readonly _commands: Map<string, RegisteredCommand> = new Map();
	private readonly _eventBus: EventBus & { clear(): void };
	private readonly _errorListeners: Set<ErrorListener> = new Set();
	private _actions: ExtensionRunnerActions | undefined;
	private _uiProvider: UIProvider;
	private _modelRegistry: ModelRegistry | undefined;

	constructor() {
		this._eventBus = createEventBus();
		this._uiProvider = noOpUIProvider;
	}

	/** Bind the actions provided by AgentSession. Must be called before dispatching events. */
	bindActions(actions: ExtensionRunnerActions): void {
		this._actions = actions;
	}

	/** Set the UI provider for extension contexts. */
	setUIProvider(provider: UIProvider): void {
		this._uiProvider = provider;
	}

	/** Set the model registry for provider management. */
	setModelRegistry(registry: ModelRegistry): void {
		this._modelRegistry = registry;
	}

	/** Subscribe to extension errors. Returns unsubscribe function. */
	onError(listener: ErrorListener): () => void {
		this._errorListeners.add(listener);
		return () => this._errorListeners.delete(listener);
	}

	// ─── Extension Loading ────────────────────────────────────────────

	/** Load extensions by calling their factory functions. */
	async loadExtensions(extensions: Extension[]): Promise<void> {
		for (const extension of extensions) {
			const api = this._createExtensionsAPI();
			try {
				await extension(api);
			} catch (err) {
				this._emitError(err instanceof Error ? err : new Error(String(err)), {
					event: "extension_load",
				});
			}
		}
	}

	/** Clear all handlers, commands, and event bus. Used during reload. */
	clear(): void {
		this._handlers.clear();
		this._commands.clear();
		this._eventBus.clear();
	}

	// ─── Event Dispatch ───────────────────────────────────────────────

	/** Check if any handlers are registered for an event. */
	hasHandlers(event: string): boolean {
		const handlers = this._handlers.get(event);
		return handlers !== undefined && handlers.length > 0;
	}

	/** Emit a fire-and-forget event (no return value). */
	async emit(event: { type: string } & Record<string, unknown>): Promise<void> {
		const handlers = this._handlers.get(event.type);
		if (!handlers) return;

		const ctx = this._buildExtensionContext();
		for (const { handler } of handlers) {
			try {
				await handler(event, ctx);
			} catch (err) {
				this._emitError(err instanceof Error ? err : new Error(String(err)), {
					event: event.type,
				});
			}
		}
	}

	/** Emit a tool_call event. Returns block result if any handler blocks. */
	async emitToolCall(event: ToolCallEvent): Promise<ToolCallEventResult | undefined> {
		const handlers = this._handlers.get("tool_call") as
			| Array<{ handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult> }>
			| undefined;
		if (!handlers) return undefined;

		const ctx = this._buildExtensionContext();
		for (const { handler } of handlers) {
			try {
				const result = await handler(event, ctx);
				if (result?.block) return result;
			} catch (err) {
				this._emitError(err instanceof Error ? err : new Error(String(err)), {
					event: "tool_call",
				});
			}
		}
		return undefined;
	}

	/** Emit a tool_result event. Returns modified result if any handler modifies. */
	async emitToolResult(event: ToolResultEvent): Promise<ToolResultEventResult | undefined> {
		const handlers = this._handlers.get("tool_result") as
			| Array<{ handler: ExtensionHandler<ToolResultEvent, ToolResultEventResult> }>
			| undefined;
		if (!handlers) return undefined;

		const ctx = this._buildExtensionContext();
		let lastResult: ToolResultEventResult | undefined;
		for (const { handler } of handlers) {
			try {
				const result = await handler(event, ctx);
				if (result) lastResult = result;
			} catch (err) {
				this._emitError(err instanceof Error ? err : new Error(String(err)), {
					event: "tool_result",
				});
			}
		}
		return lastResult;
	}

	/** Emit an input event. Returns first transform/handled result. */
	async emitInput(event: InputEvent): Promise<InputEventResult | undefined> {
		const handlers = this._handlers.get("input") as
			| Array<{ handler: ExtensionHandler<InputEvent, InputEventResult> }>
			| undefined;
		if (!handlers) return undefined;

		const ctx = this._buildExtensionContext();
		for (const { handler } of handlers) {
			try {
				const result = await handler(event, ctx);
				if (result && result.action !== "continue") return result;
			} catch (err) {
				this._emitError(err instanceof Error ? err : new Error(String(err)), {
					event: "input",
				});
			}
		}
		return undefined;
	}

	/** Emit before_agent_start. Collects system prompt overrides and custom messages. */
	async emitBeforeAgentStart(
		event: BeforeAgentStartEvent,
	): Promise<BeforeAgentStartEventResult | undefined> {
		const handlers = this._handlers.get("before_agent_start") as
			| Array<{ handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult> }>
			| undefined;
		if (!handlers) return undefined;

		const ctx = this._buildExtensionContext();
		let currentEvent = event;
		let merged: BeforeAgentStartEventResult | undefined;
		for (const { handler } of handlers) {
			try {
				const result = await handler(currentEvent, ctx);
				if (result) {
					if (!merged) merged = {};
					if (result.message) merged.message = result.message;
					if (result.systemPrompt) {
						// Chain system prompt overrides
						currentEvent = { ...currentEvent, systemPrompt: result.systemPrompt };
						merged.systemPrompt = result.systemPrompt;
					}
				}
			} catch (err) {
				this._emitError(err instanceof Error ? err : new Error(String(err)), {
					event: "before_agent_start",
				});
			}
		}
		return merged;
	}

	/** Emit context event. Returns modified messages if any handler modifies. */
	async emitContext(event: ContextEvent): Promise<ContextEventResult | undefined> {
		const handlers = this._handlers.get("context") as
			| Array<{ handler: ExtensionHandler<ContextEvent, ContextEventResult> }>
			| undefined;
		if (!handlers) return undefined;

		const ctx = this._buildExtensionContext();
		let currentEvent = event;
		let lastResult: ContextEventResult | undefined;
		for (const { handler } of handlers) {
			try {
				const result = await handler(currentEvent, ctx);
				if (result?.messages) {
					currentEvent = { ...currentEvent, messages: result.messages };
					lastResult = result;
				}
			} catch (err) {
				this._emitError(err instanceof Error ? err : new Error(String(err)), {
					event: "context",
				});
			}
		}
		return lastResult;
	}

	/** Emit before_provider_request. Returns last payload override. */
	async emitBeforeProviderRequest(
		event: BeforeProviderRequestEvent,
	): Promise<BeforeProviderRequestEventResult> {
		const handlers = this._handlers.get("before_provider_request") as
			| Array<{
					handler: ExtensionHandler<BeforeProviderRequestEvent, BeforeProviderRequestEventResult>;
			  }>
			| undefined;
		if (!handlers) return event.payload;

		const ctx = this._buildExtensionContext();
		let currentEvent = event;
		let payload = event.payload;
		for (const { handler } of handlers) {
			try {
				const result = await handler(currentEvent, ctx);
				if (result !== undefined) {
					payload = result;
					currentEvent = { ...currentEvent, payload };
				}
			} catch (err) {
				this._emitError(err instanceof Error ? err : new Error(String(err)), {
					event: "before_provider_request",
				});
			}
		}
		return payload;
	}

	/** Emit session_before_compact. Returns cancel/custom compaction result. */
	async emitSessionBeforeCompact(
		event: SessionBeforeCompactEvent,
	): Promise<SessionBeforeCompactResult | undefined> {
		const handlers = this._handlers.get("session_before_compact") as
			| Array<{
					handler: ExtensionHandler<SessionBeforeCompactEvent, SessionBeforeCompactResult>;
			  }>
			| undefined;
		if (!handlers) return undefined;

		const ctx = this._buildExtensionContext();
		for (const { handler } of handlers) {
			try {
				const result = await handler(event, ctx);
				if (result?.cancel || result?.compaction) return result;
			} catch (err) {
				this._emitError(err instanceof Error ? err : new Error(String(err)), {
					event: "session_before_compact",
				});
			}
		}
		return undefined;
	}

	// ─── Command Execution ────────────────────────────────────────────

	/** Get registered commands. */
	getCommands(): CommandInfo[] {
		return [...this._commands.values()].map((c) => ({
			name: c.name,
			description: c.options.description,
		}));
	}

	/** Execute a registered command. Returns false if not found. */
	async executeCommand(name: string, args: string): Promise<boolean> {
		const command = this._commands.get(name);
		if (!command) return false;

		const ctx = this._buildExtensionCommandContext();
		try {
			await command.options.handler(args, ctx);
		} catch (err) {
			this._emitError(err instanceof Error ? err : new Error(String(err)), {
				event: `command:${name}`,
			});
		}
		return true;
	}

	// ─── Internal ─────────────────────────────────────────────────────

	private _requireActions(): ExtensionRunnerActions {
		if (!this._actions) {
			throw new Error("ExtensionRunner: actions not bound. Call bindActions() first.");
		}
		return this._actions;
	}

	private _registerHandler(event: string, handler: ExtensionHandler<unknown, unknown>): void {
		let list = this._handlers.get(event);
		if (!list) {
			list = [];
			this._handlers.set(event, list);
		}
		list.push({ handler });
	}

	private _emitError(error: Error, context: { event?: string; extension?: string }): void {
		for (const listener of this._errorListeners) {
			listener(error, context);
		}
	}

	private _buildExtensionContext(): ExtensionContext {
		const actions = this._requireActions();
		return {
			ui: this._uiProvider,
			hasUI: this._uiProvider !== noOpUIProvider,
			sessionManager: actions.getSessionManager(),
			agentEnvironment: actions.getAgentEnvironment(),
			model: actions.getModel(),
			isIdle: actions.isIdle,
			signal: actions.getSignal(),
			abort: actions.abort,
			hasPendingMessages: actions.hasPendingMessages,
			shutdown: actions.shutdown,
			getContextUsage: actions.getContextUsage,
			compact: actions.compact,
			getSystemPrompt: actions.getSystemPrompt,
		};
	}

	private _buildExtensionCommandContext(): ExtensionCommandContext {
		const actions = this._requireActions();
		return {
			...this._buildExtensionContext(),
			waitForIdle: actions.waitForIdle,
			reload: actions.reload,
		};
	}

	private _createExtensionsAPI(): ExtensionsAPI {
		const runner = this;
		const actions = () => runner._requireActions();

		const api: ExtensionsAPI = {
			// biome-ignore lint/suspicious/noExplicitAny: overloaded on() signatures need a broad implementation
			on(event: ExtensionEventName, handler: ExtensionHandler<any, any>): void {
				runner._registerHandler(event, handler);
			},

			registerTool(tool: ToolDefinition): void {
				actions().registerTool(tool);
			},

			getActiveTools(): string[] {
				return actions().getActiveToolNames();
			},

			getAllTools(): ToolInfo[] {
				return actions()
					.getAllToolDefinitions()
					.map((d) => ({
						name: d.name,
						description: d.description,
						parameters: d.parameters,
					}));
			},

			setActiveTools(toolNames: string[]): void {
				actions().setActiveToolsByName(toolNames);
			},

			registerCommand(name: string, options: CommandOptions): void {
				runner._commands.set(name, { name, options });
			},

			getCommands(): CommandInfo[] {
				return runner.getCommands();
			},

			registerProvider(name: string, config: ProviderConfig): void {
				runner._modelRegistry?.registerProvider(name, config);
			},

			unregisterProvider(name: string): void {
				runner._modelRegistry?.unregisterProvider(name);
			},

			async setModel(model: Model<Api>): Promise<boolean> {
				return actions().setModel(model);
			},

			getThinkingLevel(): ThinkingLevel {
				return actions().getThinkingLevel();
			},

			setThinkingLevel(level: ThinkingLevel): void {
				actions().setThinkingLevel(level);
			},

			sendMessage(message, options) {
				actions().sendMessage(message, options);
			},

			sendUserMessage(content, options) {
				actions().sendUserMessage(content, options);
			},

			appendEntry(customType: string, data?: unknown): void {
				actions().appendEntry(customType, data);
			},

			setLabel(entryId: EntryId, label: string | undefined): void {
				actions().setLabel(entryId, label);
			},

			events: runner._eventBus,
		};

		return api;
	}
}
