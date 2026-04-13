import { describe, expect, mock, test } from "bun:test";
import type { AgentMessage, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { Extension } from "../extension-core/extension.js";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { AuthStorage } from "../interfaces/auth-storage.js";
import type { SessionManager } from "../interfaces/session-manager.js";
import type { ToolDefinition } from "../interfaces/tool-definition.js";
import { AgentSession, createAgentSession } from "./agent-session.js";
import type { CompactionSummaryMessage } from "./messages.js";
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

		// Trigger a compaction (fires events asynchronously)
		await session.compact();

		expect(events).toContain("compaction_start");
		expect(events).toContain("compaction_end");

		unsub();
		events.length = 0;

		await session.compact();
		expect(events).toHaveLength(0);

		await session.dispose();
	});

	test("compact calls sessionManager.compact with no arguments by default", async () => {
		const sm = createMockSessionManager();
		const session = new AgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		await session.compact();

		expect(sm.compact).toHaveBeenCalledWith(undefined, undefined, 0);

		await session.dispose();
	});

	test("compact passes customInstructions to session_before_compact", async () => {
		const sm = createMockSessionManager();
		const session = new AgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		let receivedInstructions: string | undefined;
		const ext: Extension = (api) =>
			api.on("session_before_compact", (event) => {
				receivedInstructions = event.customInstructions;
			});

		await session.loadExtensions([ext]);
		await session.compact("Focus on code changes");

		expect(receivedInstructions).toBe("Focus on code changes");

		await session.dispose();
	});

	test("compact can be cancelled by extension via session_before_compact", async () => {
		const sm = createMockSessionManager();
		const session = new AgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		const ext: Extension = (api) =>
			api.on("session_before_compact", () => {
				return { cancel: true };
			});

		await session.loadExtensions([ext]);
		await session.compact();

		// compact() should not have been called on session manager
		expect(sm.compact).not.toHaveBeenCalled();

		await session.dispose();
	});

	test("compact uses extension-provided custom compaction", async () => {
		const sm = createMockSessionManager();
		const session = new AgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		const ext: Extension = (api) =>
			api.on("session_before_compact", () => {
				return {
					compaction: {
						summary: "custom summary",
						firstKeptEntryId: "entry-5",
					},
				};
			});

		await session.loadExtensions([ext]);
		await session.compact();

		expect(sm.compact).toHaveBeenCalledWith("custom summary", "entry-5", 0);

		await session.dispose();
	});

	test("compact fires session_compact event with fromExtension flag", async () => {
		const sm = createMockSessionManager();
		const session = new AgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		let capturedSummary = "";
		let capturedFromExtension = false;
		const ext: Extension = (api) =>
			api.on("session_compact", (event) => {
				capturedSummary = event.summary;
				capturedFromExtension = event.fromExtension;
			});

		await session.loadExtensions([ext]);
		await session.compact();

		expect(capturedSummary).toBe("");
		expect(capturedFromExtension).toBe(false);

		await session.dispose();
	});

	test("compact syncs agent messages via replaceMessages", async () => {
		// Use a real session manager to verify message sync
		const { InMemorySessionManager } = await import(
			"../session-managers/in-memory-session-manager.js"
		);
		const sm = new InMemorySessionManager();
		const session = new AgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		// Seed some messages
		session.agent.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Hello" }],
			timestamp: 1,
		} as AgentMessage);
		session.agent.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "Hi" }],
			timestamp: 2,
		} as AgentMessage);
		expect(session.agent.state.messages).toHaveLength(2);

		await session.compact();

		// After default compaction (no summary, no firstKeptEntryId), messages should be empty
		expect(session.agent.state.messages).toHaveLength(0);

		await session.dispose();
	});

	test("messages option seeds agent with prior conversation", async () => {
		const messages: AgentMessage[] = [
			{ role: "user", content: [{ type: "text", text: "Hello" }], timestamp: 1 },
			{ role: "assistant", content: [{ type: "text", text: "Hi there" }], timestamp: 2 },
		];

		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			messages,
		});

		expect(session.agent.state.messages).toHaveLength(2);
		expect(session.agent.state.messages[0].role).toBe("user");
		expect(session.agent.state.messages[1].role).toBe("assistant");

		await session.dispose();
	});

	test("omitting messages option starts with empty history", async () => {
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.state.messages).toHaveLength(0);

		await session.dispose();
	});

	test("compactionSummary messages are preserved when seeding", async () => {
		const compactionSummary: CompactionSummaryMessage = {
			role: "compactionSummary",
			summary: "The user asked about TypeScript and the agent explained generics.",
			tokensBefore: 5000,
			timestamp: 2,
		};
		const messages: AgentMessage[] = [
			{ role: "user", content: [{ type: "text", text: "Old question" }], timestamp: 1 },
			compactionSummary,
			{ role: "user", content: [{ type: "text", text: "New question" }], timestamp: 3 },
		];

		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			messages,
		});

		expect(session.agent.state.messages).toHaveLength(3);
		expect(session.agent.state.messages[1].role).toBe("compactionSummary");
		expect((session.agent.state.messages[1] as CompactionSummaryMessage).summary).toBe(
			"The user asked about TypeScript and the agent explained generics.",
		);

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

	test("agentOptions.initialState managed fields are overridden by session values", async () => {
		const messages: AgentMessage[] = [
			{ role: "user", content: [{ type: "text", text: "Hello" }], timestamp: 1 },
		];
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Correct prompt.",
			thinkingLevel: "off",
			messages,
			agentOptions: {
				initialState: {
					systemPrompt: "Wrong prompt.",
					model: { id: "wrong-model", provider: "wrong" } as Parameters<typeof session.setModel>[0],
					thinkingLevel: "high",
					tools: [],
					messages: [],
				},
			},
		});

		expect(session.agent.state.systemPrompt).toBe("Correct prompt.");
		expect(session.agent.state.thinkingLevel).toBe("off");
		expect(session.agent.state.messages).toHaveLength(1);

		await session.dispose();
	});

	test("agentOptions.initialState managed fields trigger a warning", async () => {
		const originalWarn = console.warn;
		const warnings: string[] = [];
		console.warn = (msg: string) => warnings.push(msg);

		try {
			const session = new AgentSession({
				sessionManager: createMockSessionManager(),
				authStorage: createMockAuthStorage(),
				environment: createMockEnvironment(),
				systemPrompt: "Prompt.",
				agentOptions: {
					initialState: {
						systemPrompt: "Override.",
						messages: [],
					},
				},
			});
			await session.dispose();
		} finally {
			console.warn = originalWarn;
		}

		expect(warnings.some((w) => w.includes("systemPrompt"))).toBe(true);
		expect(warnings.some((w) => w.includes("messages"))).toBe(true);
	});

	test("agentOptions.initialState non-managed fields pass through", async () => {
		const session = new AgentSession({
			sessionManager: createMockSessionManager(),
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			agentOptions: {
				initialState: {
					error: "pre-seeded error",
				},
			},
		});

		expect(session.agent.state.error).toBe("pre-seeded error");

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

		test("agentEnvironment is exposed to extensions via context", async () => {
			const environment = createMockEnvironment({ systemAppend: "env-context-test" });

			const session = new AgentSession({
				sessionManager: createMockSessionManager(),
				authStorage: createMockAuthStorage(),
				environment,
				systemPrompt: "Prompt.",
			});

			let capturedEnv: unknown;
			await session.loadExtensions([
				(api) =>
					api.on("session_start", (_event, ctx) => {
						capturedEnv = ctx.agentEnvironment;
					}),
			]);

			expect(capturedEnv).toBeDefined();
			expect(capturedEnv).toBe(environment);
			expect(
				(capturedEnv as { getSystemMessageAppend(): string | undefined }).getSystemMessageAppend(),
			).toBe("env-context-test");

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

	test("explicit model with auth failure falls back to undefined", async () => {
		const registry = new ModelRegistry(createMockAuthStorage());
		const model = registry.getAll()[0];
		if (!model) return;

		const noAuthStorage: AuthStorage = { getApiKey: async () => undefined };
		const sm = createContextSessionManager({ model: null, thinkingLevel: "off" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: noAuthStorage,
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			model,
		});

		expect(session.agent.state.model).toBeUndefined();
		await session.dispose();
	});

	test("model and thinking level both restored from session context", async () => {
		const registry = new ModelRegistry(createMockAuthStorage());
		// Use a reasoning-capable model so "high" is not clamped to "off".
		const model = registry.getAll().find((m) => m.reasoning);
		if (!model) return;

		const sm = createContextSessionManager({
			model: { provider: model.provider, modelId: model.id },
			thinkingLevel: "high",
		});
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.state.model?.id).toBe(model.id);
		expect(session.agent.state.thinkingLevel).toBe("high");
		await session.dispose();
	});

	test("reasoning-capable model preserves non-off thinking level", async () => {
		const reasoningModel = {
			id: "reasoning-model",
			provider: "anthropic",
			reasoning: true,
		} as Model<Api>;
		const sm = createContextSessionManager({ model: null, thinkingLevel: "off" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			model: reasoningModel,
			thinkingLevel: "high",
		});

		expect(session.agent.state.thinkingLevel).toBe("high");
		await session.dispose();
	});

	test("messages from buildSessionContext() are seeded into the agent", async () => {
		const messages: AgentMessage[] = [
			{ role: "user", content: [{ type: "text", text: "Previous question" }], timestamp: 1 },
			{ role: "assistant", content: [{ type: "text", text: "Previous answer" }], timestamp: 2 },
		];

		let entryCounter = 0;
		const sm: SessionManager = {
			appendMessage: mock(() => String(++entryCounter)),
			buildSessionContext: mock(() => ({
				messages,
				thinkingLevel: "off" as ThinkingLevel,
				model: null,
			})),
			compact: mock(() => String(++entryCounter)),
			appendCustomEntry: mock(() => String(++entryCounter)),
			appendCustomMessageEntry: mock(() => String(++entryCounter)),
			appendModelChange: mock(() => String(++entryCounter)),
			appendThinkingLevelChange: mock(() => String(++entryCounter)),
			appendLabel: mock(() => String(++entryCounter)),
		};

		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.state.messages).toHaveLength(2);
		expect(session.agent.state.messages[0].role).toBe("user");
		expect(session.agent.state.messages[1].role).toBe("assistant");
		await session.dispose();
	});

	test("messages is not accepted as an option (type-level)", async () => {
		const sm = createContextSessionManager({ model: null, thinkingLevel: "off" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
			// @ts-expect-error messages is not a valid option for createAgentSession
			messages: [],
		});
		await session.dispose();
	});

	test("empty messages from buildSessionContext() starts agent with no history", async () => {
		const sm = createContextSessionManager({ model: null, thinkingLevel: "off" });
		const { session } = await createAgentSession({
			sessionManager: sm,
			authStorage: createMockAuthStorage(),
			environment: createMockEnvironment(),
			systemPrompt: "Prompt.",
		});

		expect(session.agent.state.messages).toHaveLength(0);
		await session.dispose();
	});
});
