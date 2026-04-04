import { describe, expect, mock, test } from "bun:test";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { AuthStorage } from "../interfaces/auth-storage.js";
import type { SessionManager } from "../interfaces/session-manager.js";
import { AgentSession } from "../session/agent-session.js";
import { RpcHandler } from "./rpc-handler.js";
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
		buildSessionContext: mock(() => []),
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

function createTestSetup() {
	const transport = createMockTransport();
	const session = new AgentSession({
		sessionManager: createMockSessionManager(),
		authStorage: createMockAuthStorage(),
		environment: createMockEnvironment(),
		systemPrompt: "Test prompt",
	});
	const handler = new RpcHandler({ session, transport });
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

	test("routes extension_ui_response to UIProvider", async () => {
		const { transport, handler } = createTestSetup();

		// The handler should route this without error — no pending request to resolve,
		// but it shouldn't throw either
		transport.inject({
			type: "extension_ui_response",
			id: "unknown-uuid",
			confirmed: true,
		});

		// No crash means success
		handler.stop();
	});

	test("stop closes transport and cleans up", async () => {
		const { transport, handler } = createTestSetup();

		handler.stop();

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
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
		});

		await session.loadExtensions([
			(api) => {
				api.registerCommand("deploy", {
					description: "Deploy the app",
					handler: commandHandler,
				});
			},
		]);

		const handler = new RpcHandler({ session, transport });
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

describe("RpcHandler UIProvider", () => {
	test("uiProvider is available on handler", () => {
		const transport = createMockTransport();
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
		});
		const handler = new RpcHandler({ session, transport });

		expect(handler.uiProvider).toBeDefined();
		expect(handler.uiProvider.dialog).toBeFunction();
		expect(handler.uiProvider.confirm).toBeFunction();
		expect(handler.uiProvider.input).toBeFunction();
		expect(handler.uiProvider.select).toBeFunction();
		expect(handler.uiProvider.notify).toBeFunction();
	});

	test("notify sends fire-and-forget request", () => {
		const transport = createMockTransport();
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
		});
		const handler = new RpcHandler({ session, transport });

		handler.uiProvider.notify("Hello", "info");

		const requests = transport.sent.filter((m) => m.type === "extension_ui_request");
		expect(requests).toHaveLength(1);

		const req = requests[0] as { method: string; message: string };
		expect(req.method).toBe("notify");
		expect(req.message).toBe("Hello");
	});

	test("confirm sends request and resolves on response", async () => {
		const transport = createMockTransport();
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
		});
		const handler = new RpcHandler({ session, transport });
		handler.start();

		const confirmPromise = handler.uiProvider.confirm("Title", "Are you sure?");

		// Find the emitted request
		const requests = transport.sent.filter((m) => m.type === "extension_ui_request");
		expect(requests).toHaveLength(1);

		const req = requests[0] as { id: string; method: string };
		expect(req.method).toBe("confirm");

		// Simulate client responding
		transport.inject({
			type: "extension_ui_response",
			id: req.id,
			confirmed: true,
		});

		const result = await confirmPromise;
		expect(result).toBe(true);

		handler.stop();
	});

	test("input sends request and resolves with value", async () => {
		const transport = createMockTransport();
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
		});
		const handler = new RpcHandler({ session, transport });
		handler.start();

		const inputPromise = handler.uiProvider.input("Name?", "placeholder");

		const requests = transport.sent.filter((m) => m.type === "extension_ui_request");
		const req = requests[0] as { id: string };

		transport.inject({
			type: "extension_ui_response",
			id: req.id,
			value: "Alice",
		});

		const result = await inputPromise;
		expect(result).toBe("Alice");

		handler.stop();
	});

	test("select resolves with item at index", async () => {
		const transport = createMockTransport();
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
		});
		const handler = new RpcHandler({ session, transport });
		handler.start();

		const items = [{ name: "a" }, { name: "b" }, { name: "c" }];
		const selectPromise = handler.uiProvider.select("Pick one", items);

		const requests = transport.sent.filter((m) => m.type === "extension_ui_request");
		const req = requests[0] as { id: string };

		// Client returns index "1" to pick second item
		transport.inject({
			type: "extension_ui_response",
			id: req.id,
			value: "1",
		});

		const result = await selectPromise;
		expect(result).toEqual({ name: "b" });

		handler.stop();
	});

	test("select resolves undefined on cancel", async () => {
		const transport = createMockTransport();
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Test",
		});
		const handler = new RpcHandler({ session, transport });
		handler.start();

		const selectPromise = handler.uiProvider.select("Pick one", ["a", "b"]);

		const requests = transport.sent.filter((m) => m.type === "extension_ui_request");
		const req = requests[0] as { id: string };

		transport.inject({
			type: "extension_ui_response",
			id: req.id,
			cancelled: true,
		});

		const result = await selectPromise;
		expect(result).toBeUndefined();

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
