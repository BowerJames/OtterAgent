import { describe, expect, mock, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { Extension } from "../extensions/extension.js";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { AuthStorage } from "../interfaces/auth-storage.js";
import type { SessionManager } from "../interfaces/session-manager.js";
import type { ToolDefinition } from "../interfaces/tool-definition.js";
import { AgentSession, createAgentSession } from "./agent-session.js";
import { ModelRegistry } from "./model-registry.js";

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

function createMockEnvironment(options?: {
	systemAppend?: string;
	tools?: ToolDefinition[];
}): AgentEnvironment {
	return {
		getSystemMessageAppend: () => options?.systemAppend ?? undefined,
		getTools: () => options?.tools ?? [],
	};
}

function createTestTool(name: string): ToolDefinition {
	return {
		name,
		label: name,
		description: `Test tool: ${name}`,
		promptSnippet: `${name} — a test tool`,
		promptGuidelines: [`Use ${name} for testing`],
		parameters: Type.Object({ input: Type.String() }),
		async execute(_toolCallId, params) {
			return {
				content: [{ type: "text", text: `${name}: ${params.input}` }],
				details: undefined,
			};
		},
	};
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("AgentSession", () => {
	test("constructs with minimal options", async () => {
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "You are a helpful assistant.",
		});

		expect(session.agent).toBeDefined();
		expect(session.sessionManager).toBeDefined();
		expect(session.agent.state.systemPrompt).toBe("You are a helpful assistant.");

		await session.dispose();
	});

	test("appends environment system message", async () => {
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment({
				systemAppend: "You are in a Docker container.",
			}),
			systemPrompt: "Base prompt.",
		});

		expect(session.agent.state.systemPrompt).toContain("Base prompt.");
		expect(session.agent.state.systemPrompt).toContain("You are in a Docker container.");

		await session.dispose();
	});

	test("registers environment tools", async () => {
		const tool = createTestTool("env_tool");
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment({ tools: [tool] }),
			systemPrompt: "Prompt.",
		});

		expect(session.getActiveToolNames()).toContain("env_tool");
		expect(session.agent.state.tools).toHaveLength(1);
		expect(session.agent.state.tools[0].name).toBe("env_tool");

		await session.dispose();
	});

	test("includes tool snippets and guidelines in system prompt", async () => {
		const tool = createTestTool("my_tool");
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment({ tools: [tool] }),
			systemPrompt: "Base.",
		});

		const prompt = session.agent.state.systemPrompt;
		expect(prompt).toContain("# Available Tools");
		expect(prompt).toContain("my_tool — a test tool");
		expect(prompt).toContain("# Guidelines");
		expect(prompt).toContain("Use my_tool for testing");

		await session.dispose();
	});

	test("registerTool adds a tool and updates the agent", async () => {
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.state.tools).toHaveLength(0);

		const tool = createTestTool("new_tool");
		session.registerTool(tool);

		expect(session.getActiveToolNames()).toContain("new_tool");
		expect(session.agent.state.tools).toHaveLength(1);
		expect(session.agent.state.systemPrompt).toContain("new_tool");

		await session.dispose();
	});

	test("setActiveToolsByName filters to valid tools", async () => {
		const tool1 = createTestTool("tool_a");
		const tool2 = createTestTool("tool_b");
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment({ tools: [tool1, tool2] }),
			systemPrompt: "Prompt.",
		});

		expect(session.getActiveToolNames()).toHaveLength(2);

		session.setActiveToolsByName(["tool_a", "nonexistent"]);

		expect(session.getActiveToolNames()).toEqual(["tool_a"]);
		expect(session.agent.state.tools).toHaveLength(1);

		await session.dispose();
	});

	test("setModel persists to session manager", async () => {
		const sm = createMockSessionManager();
		const session = new AgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		const testModel = { id: "test-model", provider: "test" } as Parameters<
			typeof session.setModel
		>[0];
		const result = await session.setModel(testModel);

		expect(result).toBe(true);
		expect(sm.appendModelChange).toHaveBeenCalledWith(
			{ provider: "test", modelId: "test-model" },
			"off",
		);

		await session.dispose();
	});

	test("setModel returns false when no auth available", async () => {
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: { getApiKey: async () => undefined },
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		const testModel = { id: "test-model", provider: "no-auth-provider" } as Parameters<
			typeof session.setModel
		>[0];
		const result = await session.setModel(testModel);

		expect(result).toBe(false);

		await session.dispose();
	});

	test("setThinkingLevel persists to session manager", async () => {
		const sm = createMockSessionManager();
		const session = new AgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		session.setThinkingLevel("high");

		expect(sm.appendThinkingLevelChange).toHaveBeenCalledWith("high");

		await session.dispose();
	});

	test("subscribe and dispose work correctly", async () => {
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		const events: string[] = [];
		const unsub = session.subscribe((e) => events.push(e.type));

		// Trigger a compaction (fires events synchronously)
		session.compact();

		expect(events).toContain("compaction_start");
		expect(events).toContain("compaction_end");

		unsub();
		events.length = 0;

		session.compact();
		expect(events).toHaveLength(0);

		await session.dispose();
	});

	test("authStorage is wired via ModelRegistry as the agent's API key resolver", async () => {
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.getApiKey).toBeDefined();
		expect(session.modelRegistry).toBeDefined();

		await session.dispose();
	});

	test("getAllToolDefinitions returns all registered tools", async () => {
		const tool1 = createTestTool("tool_x");
		const tool2 = createTestTool("tool_y");
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment({ tools: [tool1] }),
			systemPrompt: "Prompt.",
		});

		session.registerTool(tool2);

		const defs = session.getAllToolDefinitions();
		expect(defs).toHaveLength(2);
		expect(defs.map((d) => d.name).sort()).toEqual(["tool_x", "tool_y"]);

		await session.dispose();
	});

	test("getSystemPrompt returns the current system prompt", async () => {
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "My prompt.",
		});

		expect(session.getSystemPrompt()).toBe("My prompt.");

		await session.dispose();
	});

	// ─── Extension Integration ────────────────────────────────────────

	describe("extension integration", () => {
		test("loadExtensions fires session_start event", async () => {
			const handler = mock(() => {});
			const ext: Extension = (api) => api.on("session_start", handler);

			const session = new AgentSession({
				sessionManager: createMockSessionManager(),
				authStorage: createMockAuthStorage(),
				environment: createMockEnvironment(),
				systemPrompt: "Prompt.",
			});

			await session.loadExtensions([ext]);

			expect(handler).toHaveBeenCalledTimes(1);

			await session.dispose();
		});

		test("dispose fires session_shutdown event", async () => {
			const handler = mock(() => {});
			const ext: Extension = (api) => api.on("session_shutdown", handler);

			const session = new AgentSession({
				sessionManager: createMockSessionManager(),
				authStorage: createMockAuthStorage(),
				environment: createMockEnvironment(),
				systemPrompt: "Prompt.",
			});

			await session.loadExtensions([ext]);
			await session.dispose();

			expect(handler).toHaveBeenCalledTimes(1);
		});

		test("extension can register a tool via api.registerTool", async () => {
			const tool = createTestTool("ext_registered_tool");
			const ext: Extension = (api) => api.registerTool(tool);

			const session = new AgentSession({
				sessionManager: createMockSessionManager(),
				authStorage: createMockAuthStorage(),
				environment: createMockEnvironment(),
				systemPrompt: "Prompt.",
			});

			await session.loadExtensions([ext]);

			expect(session.getActiveToolNames()).toContain("ext_registered_tool");
			expect(session.agent.state.tools.map((t) => t.name)).toContain("ext_registered_tool");

			await session.dispose();
		});

		test("extension can register a command and it can be executed", async () => {
			const handler = mock(async () => {});
			const ext: Extension = (api) =>
				api.registerCommand("test-cmd", {
					description: "A test command",
					handler,
				});

			const session = new AgentSession({
				sessionManager: createMockSessionManager(),
				authStorage: createMockAuthStorage(),
				environment: createMockEnvironment(),
				systemPrompt: "Prompt.",
			});

			await session.loadExtensions([ext]);

			const commands = session.extensionRunner.getCommands();
			expect(commands).toHaveLength(1);
			expect(commands[0].name).toBe("test-cmd");

			const result = await session.extensionRunner.executeCommand("test-cmd", "args");
			expect(result).toBe(true);
			expect(handler).toHaveBeenCalledTimes(1);

			await session.dispose();
		});

		test("reload clears and reloads extensions", async () => {
			const startHandler = mock(() => {});
			const ext: Extension = (api) => api.on("session_start", startHandler);

			const session = new AgentSession({
				sessionManager: createMockSessionManager(),
				authStorage: createMockAuthStorage(),
				environment: createMockEnvironment(),
				systemPrompt: "Prompt.",
			});

			await session.loadExtensions([ext]);
			expect(startHandler).toHaveBeenCalledTimes(1);

			await session.reload();
			// session_start fires again after reload
			expect(startHandler).toHaveBeenCalledTimes(2);

			await session.dispose();
		});

		test("extensions passed via options are loaded by loadExtensions", async () => {
			const handler = mock(() => {});
			const ext: Extension = (api) => api.on("session_start", handler);

			const session = new AgentSession({
				sessionManager: createMockSessionManager(),
				authStorage: createMockAuthStorage(),
				environment: createMockEnvironment(),
				systemPrompt: "Prompt.",
				extensions: [ext],
			});

			await session.loadExtensions();

			expect(handler).toHaveBeenCalledTimes(1);

			await session.dispose();
		});

		test("extensionRunner is accessible", async () => {
			const session = new AgentSession({
				sessionManager: createMockSessionManager(),
				authStorage: createMockAuthStorage(),
				environment: createMockEnvironment(),
				systemPrompt: "Prompt.",
			});

			expect(session.extensionRunner).toBeDefined();
			expect(session.extensionRunner.getCommands()).toHaveLength(0);

			await session.dispose();
		});

		test("modelRegistry is accessible and has built-in models", async () => {
			const session = new AgentSession({
				sessionManager: createMockSessionManager(),
				authStorage: createMockAuthStorage(),
				environment: createMockEnvironment(),
				systemPrompt: "Prompt.",
			});

			expect(session.modelRegistry).toBeDefined();
			expect(session.modelRegistry.getAll().length).toBeGreaterThan(0);

			await session.dispose();
		});
	});
});

// ─── createAgentSession() ─────────────────────────────────────────────

/** Build a SessionManager mock whose buildSessionContext returns specific state. */
function createContextSessionManager(ctx: {
	model: { provider: string; modelId: string } | null;
	thinkingLevel: ThinkingLevel;
}): SessionManager {
	let entryCounter = 0;
	return {
		appendMessage: mock(() => String(++entryCounter)),
		buildSessionContext: mock(() => ({ messages: [], ...ctx })),
		compact: mock(() => String(++entryCounter)),
		appendCustomEntry: mock(() => String(++entryCounter)),
		appendCustomMessageEntry: mock(() => String(++entryCounter)),
		appendModelChange: mock(() => String(++entryCounter)),
		appendThinkingLevelChange: mock(() => String(++entryCounter)),
		appendLabel: mock(() => String(++entryCounter)),
	};
}

describe("createAgentSession", () => {
	test("no model in options or context — agent starts without a model", async () => {
		const sm = createContextSessionManager({ model: null, thinkingLevel: "off" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.state.model).toBeUndefined();
		await session.dispose();
	});

	test("explicit options.model is used directly", async () => {
		const registry = new ModelRegistry(createMockAuthStorage());
		const model = registry.getAll()[0];
		if (!model) return; // guard: skip if pi-ai has no built-ins

		const sm = createContextSessionManager({ model: null, thinkingLevel: "off" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			model,
		});

		expect(session.agent.state.model?.id).toBe(model.id);
		await session.dispose();
	});

	test("model restored from session context via registry.find()", async () => {
		const registry = new ModelRegistry(createMockAuthStorage());
		const model = registry.getAll()[0];
		if (!model) return;

		const sm = createContextSessionManager({
			model: { provider: model.provider, modelId: model.id },
			thinkingLevel: "off",
		});
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.state.model?.id).toBe(model.id);
		await session.dispose();
	});

	test("session context model not in registry falls back to undefined", async () => {
		const sm = createContextSessionManager({
			model: { provider: "unknown-provider", modelId: "unknown-model" },
			thinkingLevel: "off",
		});
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.state.model).toBeUndefined();
		await session.dispose();
	});

	test("auth failure on resolved model falls back to undefined", async () => {
		const registry = new ModelRegistry(createMockAuthStorage());
		const model = registry.getAll()[0];
		if (!model) return;

		const noAuthStorage: AuthStorage = { getApiKey: async () => undefined };
		const sm = createContextSessionManager({
			model: { provider: model.provider, modelId: model.id },
			thinkingLevel: "off",
		});
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: noAuthStorage,
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.state.model).toBeUndefined();
		await session.dispose();
	});

	test("thinking level restored from session context", async () => {
		const sm = createContextSessionManager({ model: null, thinkingLevel: "high" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.state.thinkingLevel).toBe("high");
		await session.dispose();
	});

	test("explicit thinkingLevel overrides session context", async () => {
		const sm = createContextSessionManager({ model: null, thinkingLevel: "high" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			thinkingLevel: "low",
		});

		expect(session.agent.state.thinkingLevel).toBe("low");
		await session.dispose();
	});

	test("thinking level clamped to off when model does not support reasoning", async () => {
		const nonReasoningModel = {
			id: "no-reason-model",
			provider: "anthropic",
			reasoning: false,
		} as Model<Api>;
		const sm = createContextSessionManager({ model: null, thinkingLevel: "off" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			model: nonReasoningModel,
			thinkingLevel: "high",
		});

		expect(session.agent.state.thinkingLevel).toBe("off");
		await session.dispose();
	});

	test("thinking level not clamped when model is undefined", async () => {
		const sm = createContextSessionManager({ model: null, thinkingLevel: "off" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			thinkingLevel: "high",
		});

		expect(session.agent.state.thinkingLevel).toBe("high");
		await session.dispose();
	});

	test("appendModelChange called when model differs from session context", async () => {
		const registry = new ModelRegistry(createMockAuthStorage());
		const model = registry.getAll()[0];
		if (!model) return;

		const sm = createContextSessionManager({ model: null, thinkingLevel: "off" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			model,
		});

		expect(sm.appendModelChange).toHaveBeenCalledTimes(1);
		expect(sm.appendModelChange).toHaveBeenCalledWith(
			{ provider: model.provider, modelId: model.id },
			expect.any(String),
		);
		await session.dispose();
	});

	test("appendModelChange not called when model matches session context", async () => {
		const registry = new ModelRegistry(createMockAuthStorage());
		const model = registry.getAll()[0];
		if (!model) return;

		const sm = createContextSessionManager({
			model: { provider: model.provider, modelId: model.id },
			thinkingLevel: "off",
		});
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			model,
		});

		expect(sm.appendModelChange).not.toHaveBeenCalled();
		await session.dispose();
	});

	test("appendThinkingLevelChange called when thinking level differs from session context", async () => {
		const sm = createContextSessionManager({ model: null, thinkingLevel: "off" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			thinkingLevel: "high",
		});

		expect(sm.appendThinkingLevelChange).toHaveBeenCalledWith("high");
		await session.dispose();
	});

	test("appendThinkingLevelChange not called when thinking level matches session context", async () => {
		const sm = createContextSessionManager({ model: null, thinkingLevel: "high" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			thinkingLevel: "high",
		});

		expect(sm.appendThinkingLevelChange).not.toHaveBeenCalled();
		await session.dispose();
	});
});
