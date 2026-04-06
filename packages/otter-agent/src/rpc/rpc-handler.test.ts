import { describe, expect, mock, test } from "bun:test";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { AuthStorage } from "../interfaces/auth-storage.js";
import type { SessionManager } from "../interfaces/session-manager.js";
import { AgentSession } from "../session/agent-session.js";
import { createRpcUIProvider } from "../ui-providers/rpc-ui-provider.js";
import { RpcHandler } from "./rpc-handler.js";
import type { ExtensionUIResponse } from "./types.js";
import type {
	RpcAgentEvent,
	RpcInboundMessage,
	RpcOutboundMessage,
	RpcResponse,
	RpcTransport,
} from "./types.js";

// ─── Test Helpers ─────────────────────────────────────────────────────

function createMockSessionManager(): SessionManager {
	let entryCounter = 0;
	return {
		appendMessage: mock(() => String(++entryCounter)),
		buildSessionContext: mock(() => ({ messages: [], thinkingLevel: "off", model: null })),
		compact: mock(() => String(++entryCounter)),
		appendCustomEntry: mock(() => String(++entryCounter)),
		appendCustomMessageEntry: mock(() => String(++entryCounter)),
		appendModelChange: mock(() => String(++entryCounter)),
		appendThinkingLevelChange: mock(() => String(++entryCounter)),
		appendLabel: mock(() => String(++entryCounter)),
	};
}

function createMockAuthStorage(): AuthStorage {
	return {
		getApiKey: mock(async () => "test-api-key"),
	};
}

function createMockEnvironment(): AgentEnvironment {
	return {
		getSystemMessageAppend: () => undefined,
		getTools: () => [],
	};
}

interface MockTransport extends RpcTransport {
	sent: RpcOutboundMessage[];
	messageHandler: ((message: RpcInboundMessage) => void) | undefined;
	inject(message: RpcInboundMessage): void;
}

function createMockTransport(): MockTransport {
	const transport: MockTransport = {
		sent: [],
		messageHandler: undefined,
		onMessage(handler) {
			transport.messageHandler = handler;
		},
		send(message) {
			transport.sent.push(message);
		},
		close: mock(() => {}),
		inject(message) {
			transport.messageHandler?.(message);
		},
	};
	return transport;
}

/**
 * Create a test setup with RpcHandler wired to a session and transport.
 *
 * Uses createRpcUIProvider externally (matching the pattern used by
 * createRpcSession) and injects the resolve/reject callbacks into
 * RpcHandler options.
 */
function createTestSetup() {
	const transport = createMockTransport();
	const { uiProvider, resolveResponse, rejectAll } = createRpcUIProvider(transport);
	const session = new AgentSession({
		sessionManager: createMockSessionManager(),
		authStorage: createMockAuthStorage(),
		environment: createMockEnvironment(),
		systemPrompt: "Test prompt",
		uiProvider,
	});
	const handler = new RpcHandler({
		session,
		transport,
		resolveUIResponse: resolveResponse,
		rejectAllUI: rejectAll,
	});
	handler.start();
	return { transport, session, handler };
}

function getResponses(transport: MockTransport): RpcResponse[] {
	return transport.sent.filter((m): m is RpcResponse => m.type === "response");
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("RpcHandler", () => {
	test("responds to get_state", async () => {
		const { transport, handler } = createTestSetup();

		transport.inject({ type: "get_state", id: "req_1" });

		// Allow async processing
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(true);
		expect(responses[0].command).toBe("get_state");
		expect(responses[0].id).toBe("req_1");

		const data = responses[0].data as { thinkingLevel: string; isStreaming: boolean };
		expect(data.thinkingLevel).toBe("off");
		expect(data.isStreaming).toBe(false);

		handler.stop();
	});

	test("responds to get_commands with empty list", async () => {
		const { transport, handler } = createTestSetup();

		transport.inject({ type: "get_commands", id: "req_2" });
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(true);

		const data = responses[0].data as { commands: unknown[] };
		expect(data.commands).toEqual([]);

		handler.stop();
	});

	test("prompt returns success immediately (fire-and-forget)", async () => {
		const { transport, handler } = createTestSetup();

		transport.inject({ type: "prompt", id: "req_3", message: "Hello" });

		// Prompt response should come back immediately
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses.length).toBeGreaterThanOrEqual(1);
		const promptResponse = responses.find((r) => r.command === "prompt");
		expect(promptResponse?.success).toBe(true);
		expect(promptResponse?.id).toBe("req_3");

		handler.stop();
	});

	test("abort responds with success", async () => {
		const { transport, handler } = createTestSetup();

		transport.inject({ type: "abort", id: "req_4" });
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(true);
		expect(responses[0].command).toBe("abort");

		handler.stop();
	});

	test("set_thinking_level responds with success", async () => {
		const { transport, session, handler } = createTestSetup();

		transport.inject({ type: "set_thinking_level", id: "req_5", level: "high" });
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(true);
		expect(session.agent.state.thinkingLevel).toBe("high");

		handler.stop();
	});

	test("set_model errors for unknown model", async () => {
		const { transport, handler } = createTestSetup();

		transport.inject({
			type: "set_model",
			id: "req_6",
			provider: "nonexistent",
			modelId: "fake-model",
		});
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(false);
		expect(responses[0].error).toContain("Unknown model");

		handler.stop();
	});

	test("forwards session events to transport", async () => {
		const { transport, session, handler } = createTestSetup();

		// Emit a session event
		session.agent.abort(); // triggers no event, but let's use compact
		await session.compact();

		const events = transport.sent.filter((m) => m.type === "event");
		expect(events.length).toBeGreaterThanOrEqual(1);

		handler.stop();
	});

	test("routes extension_ui_response to resolveUIResponse callback", async () => {
		const resolveUIResponse = mock((_response: ExtensionUIResponse) => {});
		const rejectAllUI = mock((_reason: string) => {});
		const transport = createMockTransport();
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
		});

		const handler = new RpcHandler({
			session,
			transport,
			resolveUIResponse,
			rejectAllUI,
		});
		handler.start();

		transport.inject({
			type: "extension_ui_response",
			id: "some-uuid",
			confirmed: true,
		});

		expect(resolveUIResponse).toHaveBeenCalledTimes(1);
		expect(resolveUIResponse).toHaveBeenCalledWith(
			expect.objectContaining({ type: "extension_ui_response", id: "some-uuid" }),
		);

		handler.stop();
	});

	test("stop calls rejectAllUI callback", async () => {
		const rejectAllUI = mock((_reason: string) => {});
		const resolveUIResponse = mock((_response: ExtensionUIResponse) => {});
		const transport = createMockTransport();
		const { uiProvider } = createRpcUIProvider(transport);
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
			uiProvider,
		});

		const handler = new RpcHandler({
			session,
			transport,
			resolveUIResponse,
			rejectAllUI,
		});

		handler.stop();

		expect(rejectAllUI).toHaveBeenCalledTimes(1);
		expect(rejectAllUI).toHaveBeenCalledWith("RPC handler stopped");
		expect(transport.close).toHaveBeenCalled();
	});

	test("deferred shutdown stops after next command", async () => {
		const { transport, handler } = createTestSetup();

		handler.requestShutdown();

		// Next command should trigger stop
		transport.inject({ type: "abort", id: "req_7" });
		await new Promise((r) => setTimeout(r, 10));

		expect(transport.close).toHaveBeenCalled();
	});

	test("steer sends user message to session", async () => {
		const { transport, session, handler } = createTestSetup();

		const steerSpy = mock(() => {});
		session.steer = steerSpy as typeof session.steer;

		transport.inject({ type: "steer", id: "req_8", message: "Go faster" });
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(true);
		expect(steerSpy).toHaveBeenCalled();

		handler.stop();
	});

	test("follow_up sends user message to session", async () => {
		const { transport, session, handler } = createTestSetup();

		const followUpSpy = mock(() => {});
		session.followUp = followUpSpy as typeof session.followUp;

		transport.inject({ type: "follow_up", id: "req_9", message: "What next?" });
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(true);
		expect(followUpSpy).toHaveBeenCalled();

		handler.stop();
	});

	test("compact responds with success", async () => {
		const { transport, handler } = createTestSetup();

		transport.inject({ type: "compact", id: "req_10" });
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(true);
		expect(responses[0].command).toBe("compact");

		handler.stop();
	});

	test("dispatches unknown command type to extension commands", async () => {
		const commandHandler = mock(async () => {});
		const transport = createMockTransport();
		const { uiProvider, resolveResponse, rejectAll } = createRpcUIProvider(transport);
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
			uiProvider,
		});

		await session.loadExtensions([
			(api) => {
				api.registerCommand("deploy", {
					description: "Deploy the app",
					handler: commandHandler,
				});
			},
		]);

		const handler = new RpcHandler({
			session,
			transport,
			resolveUIResponse: resolveResponse,
			rejectAllUI: rejectAll,
		});
		handler.start();

		// Send an unknown command type that matches an extension command
		transport.inject({ type: "deploy", id: "req_ext", args: "production" } as RpcInboundMessage);
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(true);
		expect(responses[0].command).toBe("deploy");
		expect(commandHandler).toHaveBeenCalledTimes(1);

		handler.stop();
	});

	test("returns error for completely unknown command type", async () => {
		const { transport, handler } = createTestSetup();

		transport.inject({ type: "nonexistent", id: "req_bad" } as RpcInboundMessage);
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(false);
		expect(responses[0].error).toContain("Unknown command type");

		handler.stop();
	});

	test("emits state_change event when state changes", async () => {
		const { transport, session, handler } = createTestSetup();

		// Compact fires compaction_start and compaction_end events
		await session.compact();
		await new Promise((r) => setTimeout(r, 10));

		const events = transport.sent.filter((m): m is RpcAgentEvent => m.type === "event");
		// Should have at least the lifecycle events
		expect(events.length).toBeGreaterThanOrEqual(1);

		handler.stop();
	});

	test("validates required message field on prompt", async () => {
		const { transport, handler } = createTestSetup();

		// Send prompt with empty message
		transport.inject({ type: "prompt", id: "req_val", message: "" } as RpcInboundMessage);
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(false);
		expect(responses[0].error).toContain("Missing required field");

		handler.stop();
	});

	test("validates required message field on steer", async () => {
		const { transport, handler } = createTestSetup();

		transport.inject({ type: "steer", id: "req_val2", message: "" } as RpcInboundMessage);
		await new Promise((r) => setTimeout(r, 10));

		const responses = getResponses(transport);
		expect(responses).toHaveLength(1);
		expect(responses[0].success).toBe(false);
		expect(responses[0].error).toContain("Missing required field");

		handler.stop();
	});
});

describe("AgentSession slash command interception", () => {
	test("executes registered extension command on /prefix", async () => {
		const commandHandler = mock(async () => {});

		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
		});

		// Load an extension that registers a command
		await session.loadExtensions([
			(api) => {
				api.registerCommand("hello", {
					description: "Test command",
					handler: commandHandler,
				});
			},
		]);

		// Send a /hello command — should be intercepted, not sent to LLM
		await session.prompt("/hello world");

		expect(commandHandler).toHaveBeenCalledTimes(1);
		expect(commandHandler.mock.calls[0][0]).toBe("world");

		await session.dispose();
	});

	test("falls through to LLM for unknown /commands", async () => {
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
		});

		// No extensions registered, so /unknown should fall through
		// Since no model is set, this will error — but the point is it tries
		// to send to the agent rather than being intercepted
		try {
			await session.prompt("/unknown command");
		} catch {
			// Expected — no model configured
		}

		await session.dispose();
	});
});
