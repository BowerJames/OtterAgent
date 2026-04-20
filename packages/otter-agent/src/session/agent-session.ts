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
import type { CompactOptions } from "../extension-core/context.js";
import { ExtensionRunner } from "../extension-core/extension-runner.js";
import type { ExtensionRunnerActions } from "../extension-core/extension-runner.js";
import type { Extension } from "../extension-core/extension.js";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { AuthStorage } from "../interfaces/auth-storage.js";
import type { ResourceLoader } from "../interfaces/resource-loader.js";
import type { EntryId, SessionManager } from "../interfaces/session-manager.js";
import { isSkillSupportedAgentEnvironment } from "../interfaces/skill-supported-agent-environment.js";
import type { ToolDefinition } from "../interfaces/tool-definition.js";
import type { UIProvider } from "../interfaces/ui-provider.js";
import { createNoOpUIProvider } from "../ui-providers/no-op-ui-provider.js";
import { convertToLlm } from "./messages.js";
import { ModelRegistry } from "./model-registry.js";
import { buildSkillInvocationXml } from "./skill-invocation.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { wrapToolDefinition } from "./tool-wrapper.js";

/** Result of {@link createAgentSession}. */
export interface CreateAgentSessionResult {
	/** The created session. */
	session: AgentSession;
}

/**
 * Options for {@link createAgentSession}. Identical to {@link AgentSessionOptions}
 * but without `messages` — the factory always derives messages from
 * {@link SessionManager.buildSessionContext}.
 */
export type CreateAgentSessionOptions = Omit<
	AgentSessionOptions,
	"messages" | "environmentTools" | "environmentAppend"
>;

/**
 * Async factory that creates an AgentSession with session restore.
 *
 * Resolves the effective model and thinking level by consulting the
 * SessionManager's saved state, falling back to explicit options or
 * sensible defaults. Performs an auth check on any resolved model
 * before passing it to the constructor.
 *
 * Consumers who don't need session restore can use the
 * {@link AgentSession} constructor directly.
 */
export async function createAgentSession(
	options: CreateAgentSessionOptions,
): Promise<CreateAgentSessionResult> {
	const { sessionManager, authStorage } = options;

	// 1. Build a ModelRegistry for resolution.
	const registry = new ModelRegistry(authStorage);

	// 2. Get saved session state.
	const sessionContext = await sessionManager.buildSessionContext();

	// 3. Resolve effective model: explicit option > session context > undefined.
	let model = options.model;
	if (!model && sessionContext.model) {
		model = registry.find(sessionContext.model.provider, sessionContext.model.modelId);
	}

	// 4. Auth check — discard the model if no credentials are available.
	if (model && !(await registry.hasAuth(model))) {
		model = undefined;
	}

	// 5. Resolve effective thinking level: explicit option > session context > "off".
	let thinkingLevel: ThinkingLevel = options.thinkingLevel ?? sessionContext.thinkingLevel ?? "off";

	// 6. Clamp thinking level when model doesn't support reasoning.
	//    Only clamp when a model is resolved — leave as-is when model is undefined.
	if (model && !model.reasoning) {
		thinkingLevel = "off";
	}

	// 7. Persist model change if it differs from session context.
	if (model) {
		const ctxModel = sessionContext.model;
		const modelChanged =
			!ctxModel || ctxModel.provider !== model.provider || ctxModel.modelId !== model.id;
		if (modelChanged) {
			await sessionManager.appendModelChange(
				{ provider: model.provider, modelId: model.id },
				thinkingLevel,
			);
		}
	}

	// 8. Persist thinking level change if it differs from session context.
	if (thinkingLevel !== sessionContext.thinkingLevel) {
		await sessionManager.appendThinkingLevelChange(thinkingLevel);
	}

	// 9. Pre-resolve environment for async-compatible construction.
	const [environmentTools, environmentAppend] = await Promise.all([
		options.environment.getTools(),
		options.environment.getSystemMessageAppend(),
	]);

	// 10. Construct and return.
	const session = new AgentSession({
		...options,
		model,
		thinkingLevel,
		messages: sessionContext.messages,
		environmentTools,
		environmentAppend,
	});
	return { session };
}

/**
 * Async factory that creates an AgentSession from a ResourceLoader and UIProvider.
 *
 * Delegates resource loading to the ResourceLoader, then passes the
 * assembled options (including the caller-supplied UIProvider) to
 * {@link createAgentSession}.
 */
export async function createAgentSessionFromResourceLoader(
	resourceLoader: ResourceLoader,
	uiProvider: UIProvider,
): Promise<CreateAgentSessionResult> {
	const resources = await resourceLoader.getResources();
	return createAgentSession({ ...resources, uiProvider });
}

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

	/** Optional UI provider for extension interaction. Defaults to NoOp. */
	uiProvider?: UIProvider;

	/** Extensions to load. */
	extensions?: Extension[];

	/**
	 * Messages to seed the agent with.
	 * For direct constructor use only — when using {@link createAgentSession},
	 * messages are populated automatically from {@link SessionManager.buildSessionContext}.
	 * Defaults to an empty array (new session).
	 */
	messages?: AgentMessage[];

	/** Additional pi-agent-core Agent options. */
	agentOptions?: Partial<AgentOptions>;

	/**
	 * Pre-resolved tools from the environment.
	 *
	 * Must be provided by all callers. Use {@link createAgentSession} for
	 * automatic pre-resolution from an {@link AgentEnvironment} (including
	 * async environments). Direct construction requires callers to resolve
	 * these values themselves.
	 */
	environmentTools: ToolDefinition[];

	/**
	 * Pre-resolved system message append from the environment.
	 *
	 * Must be provided by all callers. Use {@link createAgentSession} for
	 * automatic pre-resolution from an {@link AgentEnvironment} (including
	 * async environments). Direct construction requires callers to resolve
	 * these values themselves.
	 */
	environmentAppend: string | undefined;
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

	/** UI provider for extension interaction. Always set (defaults to NoOp). */
	readonly uiProvider: UIProvider;

	/** Model registry for provider management. */
	readonly modelRegistry: ModelRegistry;

	private readonly _authStorage: AuthStorage;
	private readonly _environment: AgentEnvironment;
	private readonly _baseSystemPrompt: string;
	private _environmentAppend: string | undefined;
	private readonly _eventListeners: Set<AgentSessionEventListener> = new Set();
	private readonly _extensionRunner: ExtensionRunner;
	private _unsubscribeAgent: () => void;
	private _extensions: Extension[];

	// Tool management
	private readonly _toolRegistry: Map<string, AgentTool> = new Map();
	private readonly _toolDefinitions: Map<string, ToolDefinition> = new Map();
	private _activeToolNames: Set<string> = new Set();

	constructor(options: AgentSessionOptions) {
		this.sessionManager = options.sessionManager;
		this._authStorage = options.authStorage;
		this._environment = options.environment;
		this._baseSystemPrompt = options.systemPrompt;
		this.uiProvider = options.uiProvider ?? createNoOpUIProvider();
		this._extensions = options.extensions ?? [];

		// Create model registry
		this.modelRegistry = new ModelRegistry(this._authStorage);

		// Create extension runner
		this._extensionRunner = new ExtensionRunner();
		this._extensionRunner.setUIProvider(this.uiProvider);
		this._extensionRunner.setModelRegistry(this.modelRegistry);

		// Use pre-resolved environment values.
		this._environmentAppend = options.environmentAppend;
		const environmentTools = options.environmentTools;

		// Register environment tools
		for (const tool of environmentTools) {
			this._toolDefinitions.set(tool.name, tool);
			this._toolRegistry.set(tool.name, wrapToolDefinition(tool));
			this._activeToolNames.add(tool.name);
		}

		// Build initial system prompt
		const systemPrompt = this._getCurrentSystemPrompt();

		// Build initial tool list
		const tools = this._getActiveTools();

		// Warn if agentOptions.initialState contains fields managed by AgentSession —
		// they will be silently discarded. Point callers to the correct option.
		const managedFields = ["systemPrompt", "model", "thinkingLevel", "tools", "messages"] as const;
		if (options.agentOptions?.initialState) {
			for (const field of managedFields) {
				if (field in options.agentOptions.initialState) {
					console.warn(
						`[AgentSession] agentOptions.initialState.${field} is ignored — this field is managed by AgentSession. Use the dedicated AgentSessionOptions.${field} option instead.`,
					);
				}
			}
		}

		// Create the pi-agent-core Agent
		this.agent = new Agent({
			...options.agentOptions,
			initialState: {
				...options.agentOptions?.initialState, // escape hatch — low priority
				systemPrompt, // session values always win
				model: options.model,
				thinkingLevel: options.thinkingLevel ?? "off",
				tools,
				messages: options.messages ?? [],
			},
			convertToLlm: options.agentOptions?.convertToLlm ?? convertToLlm,
			getApiKey: (provider) => this.modelRegistry.getApiKey(provider),
		});

		// Install tool hooks for extension events
		this._installToolHooks();

		// Bind extension runner actions
		this._extensionRunner.bindActions(this._buildRunnerActions());

		// Subscribe to agent events for persistence and forwarding
		this._unsubscribeAgent = this.agent.subscribe(this._handleAgentEvent);
	}

	// ─── Extension Loading ────────────────────────────────────────────

	/**
	 * Load extensions and fire session_start.
	 * Call this after construction to initialise extensions.
	 *
	 * After session_start fires (extensions may have registered skills on the
	 * environment), the system prompt is rebuilt and skill commands are registered.
	 */
	async loadExtensions(extensions?: Extension[]): Promise<void> {
		if (extensions) {
			this._extensions = extensions;
		}
		await this._extensionRunner.loadExtensions(this._extensions);
		await this._extensionRunner.emit({ type: "session_start" });

		// Refresh the environment append now that extensions may have modified the
		// environment (e.g. by registering skills on a SkillSupportedAgentEnvironment).
		this._environmentAppend = await this._environment.getSystemMessageAppend();
		this._applyToolChanges();
		this._registerSkillCommands();
	}

	/** Get the extension runner for direct access (commands, error listeners, etc). */
	get extensionRunner(): ExtensionRunner {
		return this._extensionRunner;
	}

	/**
	 * Reload extensions: clears all handlers, reloads, fires session_start.
	 */
	async reload(): Promise<void> {
		this._extensionRunner.clear();
		await this._extensionRunner.loadExtensions(this._extensions);
		await this._extensionRunner.emit({ type: "session_start" });

		// Refresh environment append and skill commands after reload.
		this._environmentAppend = await this._environment.getSystemMessageAppend();
		this._applyToolChanges();
		this._registerSkillCommands();
	}

	// ─── Core Interaction ─────────────────────────────────────────────

	/**
	 * Send a prompt to the agent.
	 *
	 * Fires `before_agent_start` before the agent loop. Extensions can
	 * override the system prompt for this turn and inject custom messages.
	 * System prompt overrides are per-turn only — the base prompt is
	 * always restored before the next turn.
	 */
	async prompt(input: string, images?: ImageContent[]): Promise<void> {
		// Intercept extension commands (e.g., "/commandName args")
		if (input.startsWith("/")) {
			const handled = await this._tryExecuteExtensionCommand(input);
			if (handled) return;
		}

		const baseSystemPrompt = this._getCurrentSystemPrompt();

		// Fire before_agent_start — extensions can override the system prompt
		// or inject custom messages for this turn.
		const result = await this._extensionRunner.emitBeforeAgentStart({
			type: "before_agent_start",
			prompt: input,
			images,
			systemPrompt: baseSystemPrompt,
		});

		// Apply per-turn system prompt override, or ensure the base is set
		// (in case a previous turn had an override).
		if (result?.systemPrompt) {
			this.agent.setSystemPrompt(result.systemPrompt);
		} else {
			this.agent.setSystemPrompt(baseSystemPrompt);
		}

		// Build the messages array: custom messages from extensions first,
		// then the user prompt.
		const messages: AgentMessage[] = [];
		if (result?.message) {
			messages.push({
				role: "custom",
				customType: result.message.customType,
				content: result.message.content,
				display: result.message.display,
				details: result.message.details,
				timestamp: Date.now(),
			} as AgentMessage);
		}

		if (messages.length > 0) {
			// Prepend custom messages, then send the user prompt
			for (const msg of messages) {
				this.agent.appendMessage(msg);
			}
		}

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

	/** Set the current model. Returns false if no API key is available. */
	async setModel(model: Model<Api>): Promise<boolean> {
		const hasAuth = await this.modelRegistry.hasAuth(model);
		if (!hasAuth) return false;
		this.agent.setModel(model);
		await this.sessionManager.appendModelChange(
			{ provider: model.provider, modelId: model.id },
			this.agent.state.thinkingLevel,
		);
		return true;
	}

	/** Set the thinking level. */
	async setThinkingLevel(level: ThinkingLevel): Promise<void> {
		this.agent.setThinkingLevel(level);
		await this.sessionManager.appendThinkingLevelChange(level);
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

	// ─── System Prompt ────────────────────────────────────────────────

	/** Get the current effective system prompt. */
	getSystemPrompt(): string {
		return this.agent.state.systemPrompt;
	}

	// ─── Compaction ───────────────────────────────────────────────────

	/**
	 * Compact the conversation context.
	 *
	 * Default behaviour: records a compaction entry with no summary and no
	 * `firstKeptEntryId`, effectively clearing all prior conversation history.
	 * Only messages appended after the compaction entry are kept.
	 *
	 * Extensions can customise or cancel compaction via the `session_before_compact`
	 * event. If an extension provides a custom compaction result (summary and/or
	 * firstKeptEntryId), those values are used instead.
	 */
	async compact(customInstructions?: string): Promise<string | undefined> {
		// 1. Emit compaction_start.
		this._emit({ type: "compaction_start" });

		// 2. Fire session_before_compact — extensions can cancel or provide custom result.
		const beforeResult = await this._extensionRunner.emitSessionBeforeCompact({
			type: "session_before_compact",
			messages: this.agent.state.messages,
			customInstructions,
			signal: this.agent.signal ?? new AbortController().signal,
		});

		// 3. If extension cancelled, skip compaction.
		if (beforeResult?.cancel) {
			this._emit({ type: "compaction_end" });
			return undefined;
		}

		// 4. Determine compaction parameters.
		let summary: string | undefined;
		let firstKeptEntryId: EntryId | undefined;
		let fromExtension = false;

		if (beforeResult?.compaction) {
			summary = beforeResult.compaction.summary;
			firstKeptEntryId = beforeResult.compaction.firstKeptEntryId;
			fromExtension = true;
		}
		// else: default compaction — no summary, no firstKeptEntryId (full clear).

		// 5. Record compaction in session manager.
		await this.sessionManager.compact(summary, firstKeptEntryId, 0);

		// 6. Rebuild agent messages from session context to sync state.
		const { messages } = await this.sessionManager.buildSessionContext();
		this.agent.replaceMessages(messages);

		// 7. Fire session_compact event.
		await this._extensionRunner.emit({
			type: "session_compact",
			summary: summary ?? "",
			fromExtension,
		});

		// 8. Emit compaction_end.
		this._emit({ type: "compaction_end" });

		return summary;
	}

	// ─── Cleanup ──────────────────────────────────────────────────────

	/** Unsubscribe from the underlying Agent and clean up. */
	async dispose(): Promise<void> {
		await this._extensionRunner.emit({ type: "session_shutdown" });
		this._unsubscribeAgent();
		this._eventListeners.clear();
	}

	// ─── Internal ─────────────────────────────────────────────────────

	private _emit(event: AgentSessionEvent): void {
		for (const listener of this._eventListeners) {
			listener(event);
		}
	}

	private _handleAgentEvent = async (event: AgentEvent): Promise<void> => {
		// Persist messages to session manager
		if (event.type === "message_end") {
			try {
				await this.sessionManager.appendMessage(event.message);
			} catch (err) {
				console.warn(
					`[AgentSession] Failed to persist message: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}

		// Forward agent events to extension handlers
		this._extensionRunner.emit(event).catch(() => {
			// Errors are handled by extension runner error listeners
		});

		// Forward to session-level listeners
		this._emit(event);
	};

	/**
	 * Install beforeToolCall/afterToolCall hooks on the Agent.
	 * These hooks dispatch tool_call and tool_result events to extensions.
	 */
	private _installToolHooks(): void {
		this.agent.setBeforeToolCall(async (context) => {
			if (!this._extensionRunner.hasHandlers("tool_call")) return undefined;

			const result = await this._extensionRunner.emitToolCall({
				type: "tool_call",
				toolCallId: context.toolCall.id,
				toolName: context.toolCall.name,
				input: (context.args as Record<string, unknown>) ?? {},
			});

			if (result?.block) {
				return { block: true, reason: result.reason };
			}
			return undefined;
		});

		this.agent.setAfterToolCall(async (context) => {
			if (!this._extensionRunner.hasHandlers("tool_result")) return undefined;

			const result = await this._extensionRunner.emitToolResult({
				type: "tool_result",
				toolCallId: context.toolCall.id,
				toolName: context.toolCall.name,
				input: (context.args as Record<string, unknown>) ?? {},
				content: context.result.content,
				details: context.result.details,
				isError: context.isError,
			});

			if (result) {
				return {
					content: result.content,
					details: result.details,
					isError: result.isError,
				};
			}
			return undefined;
		});
	}

	/** Build runner actions that delegate to this session. */
	private _buildRunnerActions(): ExtensionRunnerActions {
		return {
			registerTool: (tool) => this.registerTool(tool),
			getActiveToolNames: () => this.getActiveToolNames(),
			getAllToolDefinitions: () => this.getAllToolDefinitions(),
			setActiveToolsByName: (names) => this.setActiveToolsByName(names),
			setModel: (model) => this.setModel(model),
			getThinkingLevel: () => this.agent.state.thinkingLevel,
			setThinkingLevel: (level) => this.setThinkingLevel(level),
			sendMessage: (message, options) => {
				// Convert custom message to AgentMessage and deliver
				const agentMessage = {
					role: "custom" as const,
					customType: message.customType,
					content: message.content,
					display: message.display,
					details: message.details,
					timestamp: Date.now(),
				};
				void this.sessionManager.appendCustomMessageEntry(
					message.customType,
					message.content,
					message.display,
				);
				if (options?.deliverAs === "steer") {
					this.agent.steer(agentMessage as AgentMessage);
				} else if (options?.deliverAs === "followUp" || options?.triggerTurn) {
					this.agent.followUp(agentMessage as AgentMessage);
				} else {
					this.agent.appendMessage(agentMessage as AgentMessage);
				}
			},
			sendUserMessage: (content, options) => {
				const text = typeof content === "string" ? content : JSON.stringify(content);
				const userMessage = {
					role: "user" as const,
					content: text,
					timestamp: Date.now(),
				} as AgentMessage;
				if (options?.deliverAs === "steer") {
					this.agent.steer(userMessage);
				} else {
					this.agent.followUp(userMessage);
				}
			},
			appendEntry: (customType, data) => {
				void this.sessionManager.appendCustomEntry(customType, data);
			},
			setLabel: (entryId: EntryId, label: string | undefined) => {
				if (label !== undefined) {
					void this.sessionManager.appendLabel(label, entryId);
				}
			},
			getSessionManager: () => this.sessionManager,
			getAgentEnvironment: () => this._environment,
			getModel: () => this.agent.state.model,
			isIdle: () => !this.agent.state.isStreaming,
			getSignal: () => this.agent.signal,
			abort: () => this.abort(),
			hasPendingMessages: () => this.agent.hasQueuedMessages(),
			shutdown: () => {
				this.dispose();
			},
			getContextUsage: () => {
				const model = this.agent.state.model;
				if (!model) return undefined;
				return {
					tokens: null,
					contextWindow: model.contextWindow ?? 0,
					percent: null,
				};
			},
			compact: (options?: CompactOptions) => {
				this.compact(options?.customInstructions)
					.then((summary) => {
						options?.onComplete?.({ summary });
					})
					.catch((err) => {
						options?.onError?.(err instanceof Error ? err : new Error(String(err)));
					});
			},
			getSystemPrompt: () => this.getSystemPrompt(),
			waitForIdle: () => this.waitForIdle(),
			reload: () => this.reload(),
		};
	}

	/**
	 * Build the current base system prompt (base + environment + tools).
	 * This is the "resting" prompt that is always restored between turns.
	 */
	private _getCurrentSystemPrompt(): string {
		return buildSystemPrompt({
			basePrompt: this._baseSystemPrompt,
			environmentAppend: this._environmentAppend,
			tools: this._getActiveToolDefinitions(),
		});
	}

	/** Get the active ToolDefinition instances. */
	private _getActiveToolDefinitions(): ToolDefinition[] {
		return [...this._activeToolNames]
			.map((name) => this._toolDefinitions.get(name))
			.filter((d): d is ToolDefinition => d !== undefined);
	}

	/** Get the active AgentTool instances for the pi-agent-core Agent. */
	private _getActiveTools(): AgentTool[] {
		return [...this._activeToolNames]
			.map((name) => this._toolRegistry.get(name))
			.filter((t): t is AgentTool => t !== undefined);
	}

	/**
	 * Try to execute a `/command args` extension command.
	 * Returns true if the command was found (even if it errored).
	 */
	private async _tryExecuteExtensionCommand(text: string): Promise<boolean> {
		const spaceIndex = text.indexOf(" ");
		const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
		const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);
		return this._extensionRunner.executeCommand(commandName, args);
	}

	/** Apply tool changes to the Agent (update tools and rebuild system prompt). */
	private _applyToolChanges(): void {
		this.agent.setTools(this._getActiveTools());
		this.agent.setSystemPrompt(this._getCurrentSystemPrompt());
	}

	/**
	 * Register commands for all skills on a SkillSupportedAgentEnvironment.
	 *
	 * Each skill gets two commands:
	 * - `<name>` — bare form (skipped if an extension command already uses the name)
	 * - `skill:<name>` — namespaced form (always available, never collides)
	 *
	 * Called after loadExtensions() and reload() so that skills registered
	 * during session_start are available before the user types any input.
	 */
	private _registerSkillCommands(): void {
		const env = this._environment;
		if (!isSkillSupportedAgentEnvironment(env)) return;

		for (const skill of env.getSkills()) {
			const handler = async (args: string): Promise<void> => {
				// Duck-type check: environments that expose getSkillFilePath (e.g.
				// JustBashAgentEnvironment, which uses the read tool) include the
				// location in the XML so the agent knows where to find the file.
				const pathProvider = env as { getSkillFilePath?: (name: string) => string | undefined };
				const filePath =
					typeof pathProvider.getSkillFilePath === "function"
						? pathProvider.getSkillFilePath(skill.name)
						: undefined;
				const xml = buildSkillInvocationXml(skill, args, filePath);
				await this.prompt(xml);
			};

			const commandOptions = { description: skill.description, handler };

			// Bare name: only if no extension command already owns it.
			this._extensionRunner.registerCommand(skill.name, commandOptions);
			// Namespaced form: always register.
			this._extensionRunner.registerCommand(`skill:${skill.name}`, commandOptions);
		}
	}
}
