import { describe, expect, test, vi } from "vitest";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { AuthStorage } from "../interfaces/auth-storage.js";
import type { SessionManager } from "../interfaces/session-manager.js";
import { createRpcSession } from "./create-rpc-session.js";
import type { ExtensionUIResponse, RpcOutboundMessage, RpcTransport } from "./types.js";

// ─── Test Helpers ─────────────────────────────────────────────────────

function createMockSessionManager(): SessionManager {
	let entryCounter = 0;
	return {
		appendMessage: vi.fn(() => String(++entryCounter)),
		buildSessionContext: vi.fn(() => ({ messages: [], thinkingLevel: "off", model: null })),
		compact: vi.fn(() => String(++entryCounter)),
		appendCustomEntry: vi.fn(() => String(++entryCounter)),
		appendCustomMessageEntry: vi.fn(() => String(++entryCounter)),
		appendModelChange: vi.fn(() => String(++entryCounter)),
		appendThinkingLevelChange: vi.fn(() => String(++entryCounter)),
		appendLabel: vi.fn(() => String(++entryCounter)),
	};
}

function createMockAuthStorage(): AuthStorage {
	return {
		getApiKey: vi.fn(async () => "test-api-key"),
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
	messageHandler: ((message: unknown) => void) | undefined;
	inject(message: unknown): void;
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
		close: vi.fn(() => {}),
		inject(message) {
			transport.messageHandler?.(message);
		},
	};
	return transport;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("createRpcSession", () => {
	test("returns both session and handler", async () => {
		const transport = createMockTransport();
		const { session, handler } = await createRpcSession({
			transport,
			environment: createMockEnvironment(),
			systemPrompt: "Test prompt",
		});

		expect(session).toBeDefined();
		expect(handler).toBeDefined();

		handler.stop();
	});

	test("session has UIProvider that sends requests over the transport", async () => {
		const transport = createMockTransport();
		const { session, handler } = await createRpcSession({
			transport,
			environment: createMockEnvironment(),
			systemPrompt: "Test prompt",
		});

		handler.start();

		// Use the session's UIProvider to send a notify (fire-and-forget)
		session.uiProvider.notify("Hello from test", "info");

		const requests = transport.sent.filter((m) => m.type === "extension_ui_request");
		expect(requests).toHaveLength(1);

		const req = requests[0] as { method: string; message: string };
		expect(req.method).toBe("notify");
		expect(req.message).toBe("Hello from test");

		handler.stop();
	});

	test("session UIProvider confirm round-trips via transport", async () => {
		const transport = createMockTransport();
		const { session, handler } = await createRpcSession({
			transport,
			environment: createMockEnvironment(),
			systemPrompt: "Test prompt",
		});

		handler.start();

		// Start a confirm via the session's UIProvider
		const confirmPromise = session.uiProvider.confirm("Title", "Are you sure?");

		// The request should have been sent over the transport
		const requests = transport.sent.filter((m) => m.type === "extension_ui_request");
		expect(requests).toHaveLength(1);

		const req = requests[0] as { id: string; method: string };
		expect(req.method).toBe("confirm");

		// Simulate the client responding
		transport.inject({
			type: "extension_ui_response",
			id: req.id,
			confirmed: true,
		} satisfies ExtensionUIResponse);

		const result = await confirmPromise;
		expect(result).toBe(true);

		handler.stop();
	});

	test("handler.stop() rejects pending UI requests", async () => {
		const transport = createMockTransport();
		const { session, handler } = await createRpcSession({
			transport,
			environment: createMockEnvironment(),
			systemPrompt: "Test prompt",
		});

		handler.start();

		// Start a confirm that will never be resolved
		const confirmPromise = session.uiProvider.confirm("Title", "Body");

		// Stop the handler — should reject all pending UI requests
		handler.stop();

		await expect(confirmPromise).rejects.toThrow("RPC handler stopped");
	});

	test("events flow from session through handler to transport", async () => {
		const transport = createMockTransport();
		const { session, handler } = await createRpcSession({
			transport,
			environment: createMockEnvironment(),
			systemPrompt: "Test prompt",
		});

		handler.start();

		// Trigger a compaction event
		await session.compact();

		const events = transport.sent.filter((m) => m.type === "event");
		expect(events.length).toBeGreaterThanOrEqual(2); // compaction_start + compaction_end

		handler.stop();
	});

	test("get_state command works through the handler", async () => {
		const transport = createMockTransport();
		const { handler } = await createRpcSession({
			transport,
			environment: createMockEnvironment(),
			systemPrompt: "Test prompt",
		});

		handler.start();

		transport.inject({ type: "get_state", id: "req_1" });

		await new Promise((r) => setTimeout(r, 10));

		const responses = transport.sent.filter((m) => m.type === "response");
		expect(responses).toHaveLength(1);
		expect(responses[0]).toMatchObject({
			type: "response",
			command: "get_state",
			success: true,
			id: "req_1",
		});

		handler.stop();
	});

	test("defaults authStorage and sessionManager to in-memory", async () => {
		const transport = createMockTransport();
		const { session } = await createRpcSession({
			transport,
			environment: createMockEnvironment(),
			systemPrompt: "Test prompt",
		});

		// Session should work with defaults — no crash means success
		expect(session.agent).toBeDefined();
		expect(session.sessionManager).toBeDefined();
		expect(session.modelRegistry).toBeDefined();
	});

	test("accepts explicit authStorage and sessionManager", async () => {
		const transport = createMockTransport();
		const authStorage = createMockAuthStorage();
		const sessionManager = createMockSessionManager();

		const { session } = await createRpcSession({
			transport,
			environment: createMockEnvironment(),
			systemPrompt: "Test prompt",
			authStorage,
			sessionManager,
		});

		expect(session.sessionManager).toBe(sessionManager);
	});

	test("onShutdown is threaded through to handler", async () => {
		const transport = createMockTransport();
		const onShutdown = vi.fn(() => {});

		const { handler } = await createRpcSession({
			transport,
			environment: createMockEnvironment(),
			systemPrompt: "Test prompt",
			onShutdown,
		});

		handler.start();
		handler.requestShutdown();
		await new Promise((r) => setTimeout(r, 50));

		expect(onShutdown).toHaveBeenCalledTimes(1);
	});
});
