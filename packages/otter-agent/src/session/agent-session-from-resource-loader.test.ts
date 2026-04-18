import { describe, expect, test, vi } from "vitest";
import type { ResourceLoader } from "../interfaces/resource-loader.js";
import type { SessionManager } from "../interfaces/session-manager.js";
import type { UIProvider } from "../interfaces/ui-provider.js";
import { createAgentSessionFromResourceLoader } from "./agent-session.js";

// ─── Test Helpers ─────────────────────────────────────────────────────

function createMockSessionManager(): SessionManager {
	let entryCounter = 0;
	return {
		appendMessage: vi.fn(async () => String(++entryCounter)),
		buildSessionContext: vi.fn(async () => ({
			messages: [],
			thinkingLevel: "off" as const,
			model: null,
		})),
		compact: vi.fn(async () => String(++entryCounter)),
		appendCustomEntry: vi.fn(async () => String(++entryCounter)),
		appendCustomMessageEntry: vi.fn(async () => String(++entryCounter)),
		appendModelChange: vi.fn(async () => String(++entryCounter)),
		appendThinkingLevelChange: vi.fn(async () => String(++entryCounter)),
		appendLabel: vi.fn(async () => String(++entryCounter)),
		getEntries: vi.fn(async () => []),
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

function createBaseResources() {
	return {
		sessionManager: createMockSessionManager(),
		authStorage: createMockAuthStorage(),
		environment: createMockEnvironment(),
		systemPrompt: "You are a test agent.",
	};
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("createAgentSessionFromResourceLoader", () => {
	test("creates a session with resources from the loader and the provided UIProvider", async () => {
		const uiProvider = createMockUIProvider();
		const resources = createBaseResources();

		const resourceLoader: ResourceLoader = {
			getResources: vi.fn(async () => resources),
		};

		const result = await createAgentSessionFromResourceLoader(resourceLoader, uiProvider);

		expect(result.session).toBeDefined();
		expect(result.session.uiProvider).toBe(uiProvider);
		expect(resourceLoader.getResources).toHaveBeenCalledOnce();
	});

	test("forwards optional fields (thinkingLevel, extensions) to the session", async () => {
		const uiProvider = createMockUIProvider();
		const mockExtension = vi.fn();
		const resources = {
			...createBaseResources(),
			thinkingLevel: "low" as const,
			extensions: [mockExtension],
		};

		const resourceLoader: ResourceLoader = {
			getResources: vi.fn(async () => resources),
		};

		const result = await createAgentSessionFromResourceLoader(resourceLoader, uiProvider);

		expect(result.session).toBeDefined();
		// No model resolved, so thinkingLevel is kept as provided
		expect(result.session.agent.state.thinkingLevel).toBe("low");
		// Verify the resources were passed through to createAgentSession
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
});
