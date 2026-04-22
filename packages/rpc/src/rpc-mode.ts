/**
 * Run the agent in RPC mode.
 *
 * Creates a StdioTransport, uses `createRpcSession()` to wire the session
 * and handler together with the UIProvider baked in at construction, then
 * blocks until a graceful shutdown is triggered (via RPC command, stdin
 * close, or SIGTERM/SIGINT signal).
 */
import type { AgentOptions, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { AgentEnvironment, AuthStorage, Extension, SessionManager } from "@otter-agent/core";
import { createRpcSession } from "./create-rpc-session.js";
import { StdioTransport } from "./stdio-transport.js";

/**
 * Options for {@link runRpcMode}.
 *
 * All components are required — every real RPC usage needs a configured
 * session manager and auth storage.
 */
export interface RunRpcModeOptions {
	/** The environment the agent operates in. */
	environment: AgentEnvironment;
	/** Session persistence manager. */
	sessionManager: SessionManager;
	/** Credential retrieval for LLM providers. */
	authStorage: AuthStorage;
	/** Base system prompt. Environment append and tool info will be added. */
	systemPrompt: string;
	/** Initial model to use. */
	model?: Model<Api>;
	/** Initial thinking level. */
	thinkingLevel?: ThinkingLevel;
	/** Extensions to load after session creation. */
	extensions?: Extension[];
	/** Additional pi-agent-core Agent options. */
	agentOptions?: Partial<AgentOptions>;
	/** Called when graceful shutdown completes. */
	onShutdown?: () => void;
}

export async function runRpcMode(options: RunRpcModeOptions): Promise<void> {
	// Mutable ref so the StdioTransport callback can trigger shutdown
	// on the handler that is created after the transport.
	const ref = { handler: null as unknown as { requestShutdown(): void } };

	const transport = new StdioTransport(() => ref.handler.requestShutdown());

	let resolveShutdown: () => void;
	const shutdownPromise = new Promise<void>((resolve) => {
		resolveShutdown = resolve;
	});

	const { handler } = await createRpcSession({
		transport,
		environment: options.environment,
		sessionManager: options.sessionManager,
		authStorage: options.authStorage,
		systemPrompt: options.systemPrompt,
		model: options.model,
		thinkingLevel: options.thinkingLevel,
		extensions: options.extensions,
		agentOptions: options.agentOptions,
		onShutdown: () => resolveShutdown(),
	});
	ref.handler = handler;
	handler.start();

	// Signal handlers for graceful shutdown
	const shutdown = () => handler.requestShutdown();
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	await shutdownPromise;
	// Graceful shutdown complete — exit cleanly
	process.exit(0);
}
