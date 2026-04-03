/**
 * AgentSession — the central orchestrator that wraps pi-agent-core's Agent
 * and wires together SessionManager, AuthStorage, AgentEnvironment, and extensions.
 */
import { Agent } from "@mariozechner/pi-agent-core";
import type {
	AgentEvent,
	AgentMessage,
	AgentOptions,
	AgentTool,
	ThinkingLevel,
} from "@mariozechner/pi-agent-core";
import type { Api, ImageContent, Model } from "@mariozechner/pi-ai";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { AuthStorage } from "../interfaces/auth-storage.js";
import type { SessionManager } from "../interfaces/session-manager.js";
import type { ToolDefinition } from "../interfaces/tool-definition.js";
import type { UIProvider } from "../interfaces/ui-provider.js";
import { convertToLlm } from "./messages.js";
import { wrapToolDefinition } from "./tool-wrapper.js";

/** Options for creating an AgentSession. */
export interface AgentSessionOptions {
	/** Session persistence manager. */
	sessionManager: SessionManager;

	/** Credential retrieval for LLM providers. */
	authStorage: AuthStorage;

	/** The environment the agent operates in. */
	environment: AgentEnvironment;

	/** Base system prompt. Environment append and tool info will be added to this. */
	systemPrompt: string;

	/** Initial model to use. */
	model?: Model<Api>;

	/** Initial thinking level. */
	thinkingLevel?: ThinkingLevel;

	/** Optional UI provider for extension interaction. */
	uiProvider?: UIProvider;

	/** Additional pi-agent-core Agent options. */
	agentOptions?: Partial<AgentOptions>;
}

/** Event types emitted by AgentSession (superset of pi-agent-core AgentEvent). */
export type AgentSessionEvent =
	| AgentEvent
	| { type: "compaction_start" }
	| { type: "compaction_end" };

type AgentSessionEventListener = (event: AgentSessionEvent) => void;

/**
 * Central orchestrator wrapping pi-agent-core's Agent.
 *
 * Wires together SessionManager, AuthStorage, AgentEnvironment, and
 * extensions. Delegates the agent loop, streaming, and tool execution
 * to the underlying Agent instance.
 */
export class AgentSession {
	/** The underlying pi-agent-core Agent instance. */
	readonly agent: Agent;

	/** Session persistence manager. */
	readonly sessionManager: SessionManager;

	/** Optional UI provider for extensions. */
	readonly uiProvider: UIProvider | undefined;

	private readonly _authStorage: AuthStorage;
	private readonly _environment: AgentEnvironment;
	private readonly _baseSystemPrompt: string;
	private readonly _environmentAppend: string | undefined;
	private readonly _eventListeners: Set<AgentSessionEventListener> = new Set();
	private _unsubscribeAgent: () => void;

	// Tool management
	private readonly _toolRegistry: Map<string, AgentTool> = new Map();
	private readonly _toolDefinitions: Map<string, ToolDefinition> = new Map();
	private _activeToolNames: Set<string> = new Set();

	constructor(options: AgentSessionOptions) {
		this.sessionManager = options.sessionManager;
		this._authStorage = options.authStorage;
		this._environment = options.environment;
		this._baseSystemPrompt = options.systemPrompt;
		this.uiProvider = options.uiProvider;

		// Resolve environment at startup (called once)
		this._environmentAppend = this._environment.getSystemMessageAppend();
		const environmentTools = this._environment.getTools();

		// Register environment tools
		for (const tool of environmentTools) {
			this._toolDefinitions.set(tool.name, tool);
			this._toolRegistry.set(tool.name, wrapToolDefinition(tool));
			this._activeToolNames.add(tool.name);
		}

		// Build initial system prompt
		const systemPrompt = this._buildSystemPrompt();

		// Build initial tool list
		const tools = this._getActiveTools();

		// Create the pi-agent-core Agent
		this.agent = new Agent({
			...options.agentOptions,
			initialState: {
				systemPrompt,
				model: options.model,
				thinkingLevel: options.thinkingLevel ?? "off",
				tools,
				...options.agentOptions?.initialState,
			},
			convertToLlm: options.agentOptions?.convertToLlm ?? convertToLlm,
			getApiKey: (provider) => this._authStorage.getApiKey(provider),
		});

		// Install tool hooks for extension events
		this._installToolHooks();

		// Subscribe to agent events for persistence and forwarding
		this._unsubscribeAgent = this.agent.subscribe(this._handleAgentEvent);
	}

	// ─── Core Interaction ─────────────────────────────────────────────

	/** Send a prompt to the agent. */
	async prompt(input: string, images?: ImageContent[]): Promise<void> {
		await this.agent.prompt(input, images);
	}

	/** Queue a steering message (delivered mid-run). */
	steer(message: AgentMessage): void {
		this.agent.steer(message);
	}

	/** Queue a follow-up message (delivered after agent finishes). */
	followUp(message: AgentMessage): void {
		this.agent.followUp(message);
	}

	/** Abort the current operation. */
	abort(): void {
		this.agent.abort();
	}

	/** Wait for the agent to finish. */
	async waitForIdle(): Promise<void> {
		await this.agent.waitForIdle();
	}

	// ─── Model Control ────────────────────────────────────────────────

	/** Set the current model. */
	setModel(model: Model<Api>): void {
		this.agent.setModel(model);
		this.sessionManager.appendModelChange(
			{ provider: model.provider, modelId: model.id },
			this.agent.state.thinkingLevel,
		);
	}

	/** Set the thinking level. */
	setThinkingLevel(level: ThinkingLevel): void {
		this.agent.setThinkingLevel(level);
		this.sessionManager.appendThinkingLevelChange(level);
	}

	// ─── Tool Management ──────────────────────────────────────────────

	/** Register an additional tool (e.g., from an extension). */
	registerTool(definition: ToolDefinition): void {
		this._toolDefinitions.set(definition.name, definition);
		this._toolRegistry.set(definition.name, wrapToolDefinition(definition));
		this._activeToolNames.add(definition.name);
		this._applyToolChanges();
	}

	/** Get the names of currently active tools. */
	getActiveToolNames(): string[] {
		return [...this._activeToolNames];
	}

	/** Get all registered tool definitions. */
	getAllToolDefinitions(): ToolDefinition[] {
		return [...this._toolDefinitions.values()];
	}

	/** Set which tools are active by name. Triggers system prompt rebuild. */
	setActiveToolsByName(toolNames: string[]): void {
		this._activeToolNames = new Set(toolNames.filter((name) => this._toolRegistry.has(name)));
		this._applyToolChanges();
	}

	// ─── Events ───────────────────────────────────────────────────────

	/** Subscribe to session events. Returns an unsubscribe function. */
	subscribe(handler: AgentSessionEventListener): () => void {
		this._eventListeners.add(handler);
		return () => {
			this._eventListeners.delete(handler);
		};
	}

	// ─── Compaction ───────────────────────────────────────────────────

	/** Compact the conversation context. */
	async compact(_customInstructions?: string): Promise<void> {
		// TODO: Implement compaction with LLM summarisation in a future issue.
		// For now this is a placeholder that fires the lifecycle events.
		this._emit({ type: "compaction_start" });
		this._emit({ type: "compaction_end" });
	}

	// ─── Cleanup ──────────────────────────────────────────────────────

	/** Unsubscribe from the underlying Agent and clean up. */
	dispose(): void {
		this._unsubscribeAgent();
		this._eventListeners.clear();
	}

	// ─── Internal ─────────────────────────────────────────────────────

	private _emit(event: AgentSessionEvent): void {
		for (const listener of this._eventListeners) {
			listener(event);
		}
	}

	private _handleAgentEvent = (event: AgentEvent): void => {
		// Persist messages to session manager
		if (event.type === "message_end") {
			this.sessionManager.appendMessage(event.message);
		}

		// Forward to session-level listeners
		this._emit(event);
	};

	/**
	 * Install beforeToolCall/afterToolCall hooks on the Agent.
	 *
	 * These hooks will be the integration point for extension tool_call
	 * and tool_result events (wired up in #4 extension loading).
	 * For now they are placeholders that can be extended.
	 */
	private _installToolHooks(): void {
		this.agent.setBeforeToolCall(async (_context) => {
			// Extension tool_call event dispatch will be wired here in #4
			return undefined;
		});

		this.agent.setAfterToolCall(async (_context) => {
			// Extension tool_result event dispatch will be wired here in #4
			return undefined;
		});
	}

	/** Build the full system prompt from base + environment + tools. */
	private _buildSystemPrompt(): string {
		let prompt = this._baseSystemPrompt;

		// Append environment context
		if (this._environmentAppend) {
			prompt += `\n\n${this._environmentAppend}`;
		}

		// Append tool information
		const toolSection = this._buildToolSection();
		if (toolSection) {
			prompt += `\n\n${toolSection}`;
		}

		return prompt;
	}

	/** Build the tool snippets and guidelines section of the system prompt. */
	private _buildToolSection(): string | undefined {
		const activeDefinitions = [...this._activeToolNames]
			.map((name) => this._toolDefinitions.get(name))
			.filter((d): d is ToolDefinition => d !== undefined);

		const snippets = activeDefinitions
			.filter((d) => d.promptSnippet)
			.map((d) => `- ${d.name}: ${d.promptSnippet}`);

		const guidelines = activeDefinitions.flatMap((d) => d.promptGuidelines ?? []);

		const parts: string[] = [];

		if (snippets.length > 0) {
			parts.push(`# Available Tools\n${snippets.join("\n")}`);
		}

		if (guidelines.length > 0) {
			parts.push(`# Guidelines\n${guidelines.map((g) => `- ${g}`).join("\n")}`);
		}

		return parts.length > 0 ? parts.join("\n\n") : undefined;
	}

	/** Get the active AgentTool instances for the pi-agent-core Agent. */
	private _getActiveTools(): AgentTool[] {
		return [...this._activeToolNames]
			.map((name) => this._toolRegistry.get(name))
			.filter((t): t is AgentTool => t !== undefined);
	}

	/** Apply tool changes to the Agent (update tools and rebuild system prompt). */
	private _applyToolChanges(): void {
		this.agent.setTools(this._getActiveTools());
		this.agent.setSystemPrompt(this._buildSystemPrompt());
	}
}
