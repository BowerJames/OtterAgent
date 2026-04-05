import { describe, expect, mock, test } from "bun:test";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "../interfaces/tool-definition.js";
import { ExtensionRunner } from "./extension-runner.js";
import type { ExtensionRunnerActions } from "./extension-runner.js";
import type { Extension } from "./extension.js";
import type { ExtensionsAPI } from "./extensions-api.js";

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Create a mock set of runner actions. Every method is a mock that returns
 * a sensible default so tests only need to override what they care about.
 */
function createMockActions(): ExtensionRunnerActions {
	return {
		registerTool: mock(() => {}),
		getActiveToolNames: mock(() => []),
		getAllToolDefinitions: mock(() => []),
		setActiveToolsByName: mock(() => {}),
		setModel: mock(async () => true),
		getThinkingLevel: mock(() => "off" as const),
		setThinkingLevel: mock(() => {}),
		sendMessage: mock(() => {}),
		sendUserMessage: mock(() => {}),
		appendEntry: mock(() => {}),
		setLabel: mock(() => {}),
		getSessionManager: mock(() => ({})),
		getAgentEnvironment: mock(() => ({
			getSystemMessageAppend: () => undefined,
			getTools: () => [],
		})),
		getModel: mock(() => undefined),
		isIdle: mock(() => true),
		getSignal: mock(() => undefined),
		abort: mock(() => {}),
		hasPendingMessages: mock(() => false),
		shutdown: mock(() => {}),
		getContextUsage: mock(() => undefined),
		compact: mock(() => {}),
		getSystemPrompt: mock(() => "system prompt"),
		waitForIdle: mock(async () => {}),
		reload: mock(async () => {}),
	};
}

function createRunner(): ExtensionRunner {
	const runner = new ExtensionRunner();
	runner.bindActions(createMockActions());
	return runner;
}

/** Capture an extension's API for inspection. */
function captureApi(): { api: ExtensionsAPI; extension: Extension } {
	let captured: ExtensionsAPI | undefined;
	const extension: Extension = (api) => {
		captured = api;
	};
	return {
		get api() {
			return captured as ExtensionsAPI;
		},
		extension,
	};
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("ExtensionRunner", () => {
	// ─── Loading ────────────────────────────────────────────────────

	describe("loading", () => {
		test("loads a sync extension", async () => {
			const runner = createRunner();
			const fn = mock(() => {});
			await runner.loadExtensions([(api) => fn(api)]);

			expect(fn).toHaveBeenCalledTimes(1);
			expect(fn.mock.calls[0][0]).toBeDefined();
		});

		test("loads an async extension", async () => {
			const runner = createRunner();
			const fn = mock(async () => {});
			await runner.loadExtensions([async (api) => fn(api)]);

			expect(fn).toHaveBeenCalledTimes(1);
		});

		test("extension that throws is caught and reported via onError", async () => {
			const runner = createRunner();
			const errorListener = mock(() => {});
			runner.onError(errorListener);

			const good = mock(() => {});
			const bad: Extension = () => {
				throw new Error("boom");
			};

			await runner.loadExtensions([bad, good]);

			expect(good).toHaveBeenCalledTimes(1);
			expect(errorListener).toHaveBeenCalledTimes(1);
			expect(errorListener.mock.calls[0][0].message).toBe("boom");
			expect(errorListener.mock.calls[0][1]).toEqual({ event: "extension_load" });
		});

		test("loading zero extensions is a no-op", async () => {
			const runner = createRunner();
			await runner.loadExtensions([]);
			// No error, no crash
		});
	});

	// ─── Scoped ExtensionsAPI ───────────────────────────────────────

	describe("scoped ExtensionsAPI", () => {
		test("each extension gets its own ExtensionsAPI instance", async () => {
			const runner = createRunner();
			const apis: ExtensionsAPI[] = [];

			await runner.loadExtensions([
				(api) => {
					apis.push(api);
				},
				(api) => {
					apis.push(api);
				},
			]);

			expect(apis).toHaveLength(2);
			expect(apis[0]).not.toBe(apis[1]);
		});

		test("all extensions share the same EventBus", async () => {
			const runner = createRunner();
			const buses: unknown[] = [];

			await runner.loadExtensions([
				(api) => {
					buses.push(api.events);
				},
				(api) => {
					buses.push(api.events);
				},
			]);

			expect(buses).toHaveLength(2);
			expect(buses[0]).toBe(buses[1]);
		});
	});

	// ─── Tool registration ─────────────────────────────────────────

	describe("tool registration", () => {
		test("extension registerTool calls actions.registerTool", async () => {
			const mockActions = createMockActions();
			const runner = new ExtensionRunner();
			runner.bindActions(mockActions);
			const tool = {
				name: "ext_tool",
				label: "Ext Tool",
				description: "An extension tool",
				promptSnippet: "ext_tool",
				promptGuidelines: [],
				parameters: {},
				execute: mock(async () => ({
					content: [{ type: "text" as const, text: "ok" }],
					details: undefined,
				})),
			};

			await runner.loadExtensions([(api) => api.registerTool(tool as ToolDefinition)]);

			expect(mockActions.registerTool).toHaveBeenCalledWith(tool);
		});
	});

	// ─── Fire-and-forget events ────────────────────────────────────

	describe("fire-and-forget events (emit)", () => {
		test("handlers are called in registration order", async () => {
			const runner = createRunner();
			const order: number[] = [];

			await runner.loadExtensions([
				(api) =>
					api.on("session_start", () => {
						order.push(1);
					}),
				(api) =>
					api.on("session_start", () => {
						order.push(2);
					}),
			]);

			await runner.emit({ type: "session_start" });
			expect(order).toEqual([1, 2]);
		});

		test("errors in one handler do not stop subsequent handlers", async () => {
			const runner = createRunner();
			const errorListener = mock(() => {});
			runner.onError(errorListener);
			const calls: number[] = [];

			await runner.loadExtensions([
				(api) =>
					api.on("agent_start", () => {
						calls.push(1);
					}),
				(api) =>
					api.on("agent_start", () => {
						throw new Error("oops");
					}),
				(api) =>
					api.on("agent_start", () => {
						calls.push(2);
					}),
			]);

			await runner.emit({ type: "agent_start" });
			expect(calls).toEqual([1, 2]);
			expect(errorListener).toHaveBeenCalledTimes(1);
		});

		test("no handlers is a no-op", async () => {
			const runner = createRunner();
			await runner.emit({ type: "session_shutdown" });
			// No error
		});

		test("hasHandlers returns true when handlers are registered", async () => {
			const runner = createRunner();
			expect(runner.hasHandlers("session_start")).toBe(false);

			await runner.loadExtensions([(api) => api.on("session_start", () => {})]);

			expect(runner.hasHandlers("session_start")).toBe(true);
		});
	});

	// ─── tool_call (cancellable) ──────────────────────────────────

	describe("tool_call event", () => {
		test("no handlers returns undefined", async () => {
			const runner = createRunner();
			const result = await runner.emitToolCall({
				type: "tool_call",
				toolCallId: "tc1",
				toolName: "read",
				input: { path: "/tmp" },
			});
			expect(result).toBeUndefined();
		});

		test("handler that does not block returns undefined", async () => {
			const runner = createRunner();

			await runner.loadExtensions([
				(api) =>
					api.on("tool_call", () => {
						return { block: false };
					}),
			]);

			const result = await runner.emitToolCall({
				type: "tool_call",
				toolCallId: "tc1",
				toolName: "read",
				input: { path: "/tmp" },
			});
			expect(result).toBeUndefined();
		});

		test("handler that blocks returns the block result immediately", async () => {
			const runner = createRunner();

			await runner.loadExtensions([
				(api) =>
					api.on("tool_call", () => {
						return { block: true, reason: "not allowed" };
					}),
			]);

			const result = await runner.emitToolCall({
				type: "tool_call",
				toolCallId: "tc1",
				toolName: "rm",
				input: { path: "/danger" },
			});
			expect(result).toEqual({ block: true, reason: "not allowed" });
		});

		test("first block short-circuits", async () => {
			const runner = createRunner();
			const secondCalled = mock(() => {});

			await runner.loadExtensions([
				(api) =>
					api.on("tool_call", () => {
						return { block: true, reason: "first" };
					}),
				(api) =>
					api.on("tool_call", () => {
						secondCalled();
						return { block: true, reason: "second" };
					}),
			]);

			const result = await runner.emitToolCall({
				type: "tool_call",
				toolCallId: "tc1",
				toolName: "rm",
				input: {},
			});
			expect(result).toEqual({ block: true, reason: "first" });
			expect(secondCalled).not.toHaveBeenCalled();
		});
	});

	// ─── tool_result (modifying) ─────────────────────────────────

	describe("tool_result event", () => {
		test("no handlers returns undefined", async () => {
			const runner = createRunner();
			const result = await runner.emitToolResult({
				type: "tool_result",
				toolCallId: "tc1",
				toolName: "read",
				input: {},
				content: [{ type: "text", text: "original" }],
				details: undefined,
				isError: false,
			});
			expect(result).toBeUndefined();
		});

		test("handler can modify content", async () => {
			const runner = createRunner();

			await runner.loadExtensions([
				(api) =>
					api.on("tool_result", () => {
						return {
							content: [{ type: "text", text: "modified" }],
							details: undefined,
							isError: false,
						};
					}),
			]);

			const result = await runner.emitToolResult({
				type: "tool_result",
				toolCallId: "tc1",
				toolName: "read",
				input: {},
				content: [{ type: "text", text: "original" }],
				details: undefined,
				isError: false,
			});
			expect(result?.content).toEqual([{ type: "text", text: "modified" }]);
		});

		test("last non-undefined result wins", async () => {
			const runner = createRunner();

			await runner.loadExtensions([
				(api) =>
					api.on("tool_result", () => {
						return {
							content: [{ type: "text", text: "first" }],
							details: undefined,
							isError: false,
						};
					}),
				(api) =>
					api.on("tool_result", () => {
						return {
							content: [{ type: "text", text: "second" }],
							details: undefined,
							isError: false,
						};
					}),
			]);

			const result = await runner.emitToolResult({
				type: "tool_result",
				toolCallId: "tc1",
				toolName: "read",
				input: {},
				content: [{ type: "text", text: "original" }],
				details: undefined,
				isError: false,
			});
			expect(result?.content).toEqual([{ type: "text", text: "second" }]);
		});
	});

	// ─── input (first-match) ─────────────────────────────────────

	describe("input event", () => {
		test("no handlers returns undefined", async () => {
			const runner = createRunner();
			const result = await runner.emitInput({
				type: "input",
				text: "hello",
				source: "rpc",
			});
			expect(result).toBeUndefined();
		});

		test("continue action does not short-circuit", async () => {
			const runner = createRunner();
			const secondCalled = mock(() => ({ action: "handled" as const }));

			await runner.loadExtensions([
				(api) =>
					api.on("input", () => {
						return { action: "continue" as const };
					}),
				(api) =>
					api.on("input", () => {
						return secondCalled();
					}),
			]);

			const result = await runner.emitInput({
				type: "input",
				text: "hello",
				source: "rpc",
			});
			expect(secondCalled).toHaveBeenCalled();
			expect(result?.action).toBe("handled");
		});

		test("transform action returns immediately", async () => {
			const runner = createRunner();
			const secondCalled = mock(() => {});

			await runner.loadExtensions([
				(api) =>
					api.on("input", () => {
						return { action: "transform" as const, text: "modified" };
					}),
				(api) =>
					api.on("input", () => {
						secondCalled();
						return { action: "continue" as const };
					}),
			]);

			const result = await runner.emitInput({
				type: "input",
				text: "hello",
				source: "rpc",
			});
			expect(secondCalled).not.toHaveBeenCalled();
			expect(result).toEqual({ action: "transform", text: "modified" });
		});

		test("handled action returns immediately", async () => {
			const runner = createRunner();

			await runner.loadExtensions([
				(api) =>
					api.on("input", () => {
						return { action: "handled" as const };
					}),
			]);

			const result = await runner.emitInput({
				type: "input",
				text: "hello",
				source: "rpc",
			});
			expect(result).toEqual({ action: "handled" });
		});
	});

	// ─── before_agent_start (chaining) ───────────────────────────

	describe("before_agent_start event", () => {
		test("no handlers returns undefined", async () => {
			const runner = createRunner();
			const result = await runner.emitBeforeAgentStart({
				type: "before_agent_start",
				prompt: "hello",
				systemPrompt: "base prompt",
			});
			expect(result).toBeUndefined();
		});

		test("system prompt overrides chain — last wins", async () => {
			const runner = createRunner();

			await runner.loadExtensions([
				(api) =>
					api.on("before_agent_start", () => {
						return { systemPrompt: "override-1" };
					}),
				(api) =>
					api.on("before_agent_start", () => {
						return { systemPrompt: "override-2" };
					}),
			]);

			const result = await runner.emitBeforeAgentStart({
				type: "before_agent_start",
				prompt: "hello",
				systemPrompt: "base prompt",
			});
			expect(result?.systemPrompt).toBe("override-2");
		});

		test("message fields are merged", async () => {
			const runner = createRunner();

			await runner.loadExtensions([
				(api) =>
					api.on("before_agent_start", () => {
						return {
							message: {
								customType: "notice",
								content: "from ext 1",
								display: true,
							},
						};
					}),
				(api) =>
					api.on("before_agent_start", () => {
						return { systemPrompt: "new prompt" };
					}),
			]);

			const result = await runner.emitBeforeAgentStart({
				type: "before_agent_start",
				prompt: "hello",
				systemPrompt: "base",
			});
			expect(result?.message).toEqual({
				customType: "notice",
				content: "from ext 1",
				display: true,
			});
			expect(result?.systemPrompt).toBe("new prompt");
		});
	});

	// ─── context (modification) ──────────────────────────────────

	describe("context event", () => {
		test("no handlers returns undefined", async () => {
			const runner = createRunner();
			const result = await runner.emitContext({
				type: "context",
				messages: [],
			});
			expect(result).toBeUndefined();
		});

		test("handler can modify messages; next handler sees modified messages", async () => {
			const runner = createRunner();
			const fakeMsg1 = { role: "user", content: "injected", timestamp: 0 } as AgentMessage;
			const fakeMsg2 = { role: "user", content: "second", timestamp: 0 } as AgentMessage;

			await runner.loadExtensions([
				(api) =>
					api.on("context", (event) => {
						return { messages: [...event.messages, fakeMsg1] };
					}),
				(api) =>
					api.on("context", (event) => {
						// Should see the injected message
						return { messages: [...event.messages, fakeMsg2] };
					}),
			]);

			const result = await runner.emitContext({
				type: "context",
				messages: [],
			});
			expect(result?.messages).toHaveLength(2);
			expect((result?.messages as AgentMessage[])[0]).toBe(fakeMsg1);
			expect((result?.messages as AgentMessage[])[1]).toBe(fakeMsg2);
		});
	});

	// ─── session_before_compact (cancellable) ────────────────────

	describe("session_before_compact event", () => {
		test("no handlers returns undefined", async () => {
			const runner = createRunner();
			const result = await runner.emitSessionBeforeCompact({
				type: "session_before_compact",
				messages: [],
				signal: new AbortController().signal,
			});
			expect(result).toBeUndefined();
		});

		test("cancel short-circuits", async () => {
			const runner = createRunner();
			const secondCalled = mock(() => {});

			await runner.loadExtensions([
				(api) =>
					api.on("session_before_compact", () => {
						return { cancel: true };
					}),
				(api) =>
					api.on("session_before_compact", () => {
						secondCalled();
						return {};
					}),
			]);

			const result = await runner.emitSessionBeforeCompact({
				type: "session_before_compact",
				messages: [],
				signal: new AbortController().signal,
			});
			expect(result?.cancel).toBe(true);
			expect(secondCalled).not.toHaveBeenCalled();
		});

		test("custom compaction short-circuits", async () => {
			const runner = createRunner();

			await runner.loadExtensions([
				(api) =>
					api.on("session_before_compact", () => {
						return {
							compaction: {
								summary: "custom summary",
								firstKeptEntryId: "entry-42",
							},
						};
					}),
			]);

			const result = await runner.emitSessionBeforeCompact({
				type: "session_before_compact",
				messages: [],
				signal: new AbortController().signal,
			});
			expect(result?.compaction).toEqual({
				summary: "custom summary",
				firstKeptEntryId: "entry-42",
			});
		});
	});

	// ─── Commands ────────────────────────────────────────────────

	describe("commands", () => {
		test("extension can register and execute a command", async () => {
			const runner = createRunner();
			const handler = mock(async () => {});

			await runner.loadExtensions([
				(api) =>
					api.registerCommand("deploy", {
						description: "Deploy the app",
						handler,
					}),
			]);

			const commands = runner.getCommands();
			expect(commands).toHaveLength(1);
			expect(commands[0].name).toBe("deploy");
			expect(commands[0].description).toBe("Deploy the app");

			const executed = await runner.executeCommand("deploy", "--prod");
			expect(executed).toBe(true);
			expect(handler).toHaveBeenCalledWith("--prod", expect.any(Object));
		});

		test("executeCommand returns false for unknown command", async () => {
			const runner = createRunner();
			const executed = await runner.executeCommand("nonexistent", "");
			expect(executed).toBe(false);
		});

		test("command handler errors are caught and reported via onError", async () => {
			const runner = createRunner();
			const errorListener = mock(() => {});
			runner.onError(errorListener);

			await runner.loadExtensions([
				(api) =>
					api.registerCommand("fail", {
						handler: async () => {
							throw new Error("cmd error");
						},
					}),
			]);

			const executed = await runner.executeCommand("fail", "");
			expect(executed).toBe(true); // command was found, error was caught internally
			expect(errorListener).toHaveBeenCalledTimes(1);
			expect(errorListener.mock.calls[0][0].message).toBe("cmd error");
			expect(errorListener.mock.calls[0][1]).toEqual({ event: "command:fail" });
		});
	});

	// ─── Reload ──────────────────────────────────────────────────

	describe("reload", () => {
		test("clear removes all handlers and commands", async () => {
			const runner = createRunner();
			const handler = mock(() => {});

			await runner.loadExtensions([
				(api) => api.on("session_start", handler),
				(api) =>
					api.registerCommand("test", {
						handler: async () => {},
					}),
			]);

			expect(runner.hasHandlers("session_start")).toBe(true);
			expect(runner.getCommands()).toHaveLength(1);

			runner.clear();

			expect(runner.hasHandlers("session_start")).toBe(false);
			expect(runner.getCommands()).toHaveLength(0);
		});

		test("clear stops events from firing", async () => {
			const runner = createRunner();
			const handler = mock(() => {});

			await runner.loadExtensions([(api) => api.on("agent_start", handler)]);

			await runner.emit({ type: "agent_start" });
			expect(handler).toHaveBeenCalledTimes(1);

			runner.clear();

			await runner.emit({ type: "agent_start" });
			expect(handler).toHaveBeenCalledTimes(1); // not called again
		});

		test("re-loading after clear registers fresh handlers", async () => {
			const runner = createRunner();
			const handler1 = mock(() => {});
			const handler2 = mock(() => {});

			await runner.loadExtensions([(api) => api.on("session_start", handler1)]);

			await runner.emit({ type: "session_start" });
			expect(handler1).toHaveBeenCalledTimes(1);

			runner.clear();

			await runner.loadExtensions([(api) => api.on("session_start", handler2)]);

			await runner.emit({ type: "session_start" });
			expect(handler1).toHaveBeenCalledTimes(1); // not called again after clear
			expect(handler2).toHaveBeenCalledTimes(1); // called after reload
		});

		test("clear also clears the event bus", async () => {
			const runner = createRunner();
			let received: unknown | undefined;

			await runner.loadExtensions([
				(api) => {
					api.events.on("custom", (data) => {
						received = data;
					});
				},
			]);

			// Access the shared event bus through a second extension
			let bus: ExtensionsAPI["events"] | undefined;
			await runner.loadExtensions([
				(api) => {
					bus = api.events;
				},
			]);

			bus?.emit("custom", "hello");
			expect(received).toBe("hello");

			runner.clear();
			received = undefined;
			bus?.emit("custom", "world");
			expect(received).toBeUndefined();
		});
	});

	// ─── Error handling ──────────────────────────────────────────

	describe("error handling", () => {
		test("onError returns unsubscribe function", async () => {
			const runner = createRunner();
			const listener1 = mock(() => {});
			const listener2 = mock(() => {});

			const unsub = runner.onError(listener1);
			runner.onError(listener2);

			// Trigger an error
			await runner.loadExtensions([
				(api) =>
					api.on("session_start", () => {
						throw new Error("err");
					}),
			]);
			await runner.emit({ type: "session_start" });

			expect(listener1).toHaveBeenCalledTimes(1);
			expect(listener2).toHaveBeenCalledTimes(1);

			unsub();

			await runner.emit({ type: "session_start" });
			expect(listener1).toHaveBeenCalledTimes(1); // not called again
			expect(listener2).toHaveBeenCalledTimes(2); // still called
		});
	});

	// ─── ExtensionContext ────────────────────────────────────────

	describe("ExtensionContext", () => {
		test("agentEnvironment is exposed to event handlers", async () => {
			const mockActions = createMockActions();
			mockActions.getAgentEnvironment = mock(() => ({
				getSystemMessageAppend: () => "test-append",
				getTools: () => [],
			}));

			const runner = new ExtensionRunner();
			runner.bindActions(mockActions);

			let capturedEnv: unknown;
			await runner.loadExtensions([
				(api) =>
					api.on("session_start", (_event, ctx) => {
						capturedEnv = ctx.agentEnvironment;
					}),
			]);

			await runner.emit({ type: "session_start" });

			expect(capturedEnv).toBeDefined();
			expect(
				(capturedEnv as { getSystemMessageAppend(): string | undefined }).getSystemMessageAppend(),
			).toBe("test-append");
		});

		test("agentEnvironment is the same object returned by getAgentEnvironment", async () => {
			const mockActions = createMockActions();
			const expectedEnv = {
				getSystemMessageAppend: () => undefined,
				getTools: () => [],
			};
			mockActions.getAgentEnvironment = mock(() => expectedEnv);

			const runner = new ExtensionRunner();
			runner.bindActions(mockActions);

			let capturedEnv: unknown;
			await runner.loadExtensions([
				(api) =>
					api.on("session_start", (_event, ctx) => {
						capturedEnv = ctx.agentEnvironment;
					}),
			]);

			await runner.emit({ type: "session_start" });

			expect(capturedEnv).toBe(expectedEnv);
		});

		test("agentEnvironment is exposed in command context", async () => {
			const mockActions = createMockActions();
			const expectedEnv = {
				getSystemMessageAppend: () => "cmd-context",
				getTools: () => [],
			};
			mockActions.getAgentEnvironment = mock(() => expectedEnv);

			const runner = new ExtensionRunner();
			runner.bindActions(mockActions);

			let capturedEnv: unknown;
			await runner.loadExtensions([
				(api) =>
					api.registerCommand("check-env", {
						handler: async (_args, ctx) => {
							capturedEnv = ctx.agentEnvironment;
						},
					}),
			]);

			await runner.executeCommand("check-env", "");

			expect(capturedEnv).toBe(expectedEnv);
		});
	});

	// ─── Actions not bound ───────────────────────────────────────

	describe("edge cases", () => {
		test("emit without bound actions throws", async () => {
			const runner = new ExtensionRunner();
			// Don't call bindActions

			// Loading is fine (no actions needed)
			await runner.loadExtensions([(api) => api.on("session_start", () => {})]);

			// But emitting requires building context, which needs actions
			await expect(runner.emit({ type: "session_start" })).rejects.toThrow("actions not bound");
		});
	});
});
