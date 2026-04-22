/**
 * Context objects passed to extension event handlers and command handlers.
 */
import type { Api, Model } from "@mariozechner/pi-ai";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { ReadonlySessionManager } from "../interfaces/session-manager.js";
import type { UIProvider } from "../interfaces/ui-provider.js";

/** Context usage information for the active model. */
export interface ContextUsage {
	/** Estimated context tokens, or null if unknown (e.g., right after compaction). */
	tokens: number | null;
	/** Maximum context window size in tokens. */
	contextWindow: number;
	/** Context usage as percentage of context window, or null if tokens is unknown. */
	percent: number | null;
}

/** Options for triggering compaction. */
export interface CompactOptions {
	customInstructions?: string;
	onComplete?: (result: { summary?: string }) => void;
	onError?: (error: Error) => void;
}

/**
 * Context passed to extension event handlers.
 *
 * Provides read-only access to agent state and a limited set of
 * actions. Extensions should not mutate agent state directly.
 */
export interface ExtensionContext {
	/** UI methods for user interaction. */
	ui: UIProvider;

	/** Session manager (read-only). */
	sessionManager: ReadonlySessionManager;

	/**
	 * The agent environment.
	 *
	 * Use capability-specific type guards to access richer APIs on concrete
	 * implementations when you need more than the base {@link AgentEnvironment}
	 * interface. For example:
	 *
	 * ```ts
	 * if (isSkillSupportedAgentEnvironment(ctx.agentEnvironment)) {
	 *   ctx.agentEnvironment.addSkill({ ... });
	 * }
	 * ```
	 */
	agentEnvironment: AgentEnvironment;

	/** Current model, if set. */
	model: Model<Api> | undefined;

	/** Whether the agent is idle (not streaming). */
	isIdle(): boolean;

	/** The current abort signal, or undefined when the agent is not streaming. */
	signal: AbortSignal | undefined;

	/** Abort the current agent operation. */
	abort(): void;

	/** Whether there are queued messages waiting. */
	hasPendingMessages(): boolean;

	/** Gracefully shut down the agent. */
	shutdown(): void;

	/** Get current context usage for the active model. */
	getContextUsage(): ContextUsage | undefined;

	/** Trigger compaction without awaiting completion. */
	compact(options?: CompactOptions): void;

	/** Get the current effective system prompt. */
	getSystemPrompt(): string;
}

/**
 * Extended context for command handlers.
 *
 * Includes additional methods that are only safe in user-initiated
 * commands (not in event handlers during the agent loop).
 */
export interface ExtensionCommandContext extends ExtensionContext {
	/** Wait for the agent to finish streaming. */
	waitForIdle(): Promise<void>;

	/** Reload extensions. */
	reload(): Promise<void>;
}
