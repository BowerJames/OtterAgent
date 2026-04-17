import { describe, expect, test, vi } from "vitest";
import type { ResourceLoader } from "../interfaces/resource-loader.js";
import type { SessionManager } from "../interfaces/session-manager.js";
import type { UIProvider } from "../interfaces/ui-provider.js";
import { createAgentSessionFromResourceLoader } from "./agent-session.js";

// ─── Test Helpers ─────────────────────────────────────────────────────

function createMockSessionManager(): SessionManager {
	let entryCounter = 0;
	return {
		appendMessage: vi.fn(() => String(++entryCounter)),
		buildSessionContext: vi.fn(() => ({
			messages: [],
			thinkingLevel: "off" as const,
			model: null,
		})),
		compact: vi.fn(() => String(++entryCounter)),
		appendCustomEntry: vi.fn(() => String(++entryCounter)),
		appendCustomMessageEntry: vi.fn(() => String(++entryCounter)),
		appendModelChange: vi.fn(() => String(++entryCounter)),
		appendThinkingLevelChange: vi.fn(() => String(++entryCounter)),
		appendLabel: vi.fn(() => String(++entryCounter)),
	};
}

function createMockAuthStorage() {
	return {
		getApiKey: vi.fn(async () => "test-api-key"),
	};
}

function createMockEnvironment() {
	return {
		getSystemMessageAppend: () => undefined,
		getTools: () => [],
	};
}

function createMockUIProvider(): UIProvider {
	return {
		dialog: vi.fn(async () => {}),
		confirm: vi.fn(async () => true),
		input: vi.fn(async () => undefined),
		select: vi.fn(async () => undefined),
		notify: vi.fn(),
	};
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("createAgentSessionFromResourceLoader", () => {
	test("creates a session with resources from the loader and the provided UIProvider", async () => {
		const sessionManager = createMockSessionManager();
		const authStorage = createMockAuthStorage();
		const environment = createMockEnvironment();
		const uiProvider = createMockUIProvider();

		const resourceLoader: ResourceLoader = {
			getResources: vi.fn(async () => ({
				sessionManager,
				authStorage,
				environment,
				systemPrompt: "You are a test agent.",
			})),
		};

		const result = await createAgentSessionFromResourceLoader(resourceLoader, uiProvider);

		expect(result.session).toBeDefined();
		expect(result.session.uiProvider).toBe(uiProvider);
		expect(resourceLoader.getResources).toHaveBeenCalledOnce();
	});

	test("propagates errors from getResources()", async () => {
		const uiProvider = createMockUIProvider();

		const resourceLoader: ResourceLoader = {
			getResources: vi.fn(async () => {
				throw new Error("Failed to load resources");
			}),
		};

		await expect(createAgentSessionFromResourceLoader(resourceLoader, uiProvider)).rejects.toThrow(
			"Failed to load resources",
		);
	});

	test("passes uiProvider through to the session", async () => {
		const sessionManager = createMockSessionManager();
		const authStorage = createMockAuthStorage();
		const environment = createMockEnvironment();
		const uiProvider = createMockUIProvider();

		const resourceLoader: ResourceLoader = {
			getResources: vi.fn(async () => ({
				sessionManager,
				authStorage,
				environment,
				systemPrompt: "Test prompt",
			})),
		};

		const result = await createAgentSessionFromResourceLoader(resourceLoader, uiProvider);

		// Verify the uiProvider on the created session matches what we passed
		expect(result.session.uiProvider).toBe(uiProvider);

		// Verify it is the actual mock (not a NoOp default)
		expect(result.session.uiProvider).toBe(uiProvider);
		expect(result.session.uiProvider.notify).toBeDefined();
	});
});
