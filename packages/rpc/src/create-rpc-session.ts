/**
 * Factory that wires together RpcUIProvider, AgentSession, and RpcHandler
 * in the correct order — eliminating the chicken-and-egg problem that
 * previously required a post-construction `setUIProvider()` call.
 *
 * Wire order:
 * 1. Create RpcUIProvider from the transport (only needs transport, not session)
 * 2. Create AgentSession with the UIProvider baked in at construction time
 * 3. Create RpcHandler with injected resolve/reject callbacks
 * 4. Return both session and handler
 */
import type { AgentOptions, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { createAgentSession } from "@otter-agent/core";
import type { Extension } from "@otter-agent/core";
import type { AgentEnvironment } from "@otter-agent/core";
import type { AuthStorage } from "@otter-agent/core";
import type { SessionManager } from "@otter-agent/core";
import type { AgentSession } from "@otter-agent/core";
import { RpcHandler } from "./rpc-handler.js";
import { createRpcUIProvider } from "./rpc-ui-provider.js";
import type { RpcTransport } from "./types.js";

/**
 * Options for {@link createRpcSession}.
 *
 * This is a standalone interface — it does not extend `CreateAgentSessionOptions`
 * because `uiProvider` is provided internally by this factory and should not
 * be part of the public options. All components are required.
 */
export interface CreateRpcSessionOptions {
	/** The RPC transport to communicate over. */
	transport: RpcTransport;

	/** The environment the agent operates in. */
	environment: AgentEnvironment;

	/** Base system prompt. Environment append and tool info will be added. */
	systemPrompt: string;

	/** Credential retrieval for LLM providers. */
	authStorage: AuthStorage;

	/** Session persistence manager. */
	sessionManager: SessionManager;

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

/** Result of {@link createRpcSession}. */
export interface CreateRpcSessionResult {
	/** The created session with UIProvider baked in at construction. */
	session: AgentSession;
	/** The RPC handler wired to the session and transport. */
	handler: RpcHandler;
}

/**
 * Create an AgentSession and RpcHandler wired together correctly.
 *
 * The UIProvider is created from the transport before the session is
 * constructed, so it is available at construction time — no post-construction
 * setter needed.
 */
export async function createRpcSession(
	options: CreateRpcSessionOptions,
): Promise<CreateRpcSessionResult> {
	const { transport } = options;

	// 1. Create the UIProvider from the transport (only needs transport, not session)
	const { uiProvider, resolveResponse, rejectAll } = createRpcUIProvider(transport);

	// 2. Create the session with UIProvider baked in
	const { session } = await createAgentSession({
		authStorage: options.authStorage,
		sessionManager: options.sessionManager,
		environment: options.environment,
		systemPrompt: options.systemPrompt,
		model: options.model,
		thinkingLevel: options.thinkingLevel,
		uiProvider,
		extensions: options.extensions,
		agentOptions: options.agentOptions,
	});

	// 3. Create the handler with injected resolve/reject callbacks
	const handler = new RpcHandler({
		session,
		transport,
		resolveUIResponse: resolveResponse,
		rejectAllUI: rejectAll,
		onShutdown: options.onShutdown,
	});

	return { session, handler };
}
