/**
 * Tests for the default environment extension.
 */
import { Type } from "@sinclair/typebox";
import { describe, expect, test, vi } from "vitest";
import type { Extension } from "../extension-core/extension.js";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { ToolDefinition } from "../interfaces/tool-definition.js";
import { createEnvironmentExtension } from "./environment-extension.js";

// ─── Helpers ─────────────────────────────────────────────────────────

function createTestTool(name: string): ToolDefinition {
	return {
		name,
		label: name,
		description: `Test tool: ${name}`,
		promptSnippet: `${name} — a test tool`,
		promptGuidelines: [],
		parameters: Type.Object({ input: Type.String() }),
		async execute() {
			return { content: [{ type: "text", text: "ok" }], details: undefined };
		},
	};
}

/**
 * Creates a mock ExtensionsAPI that captures registered tools
 * and before_agent_start handlers.
 */
function createMockAPI() {
	const registeredTools: ToolDefinition[] = [];
	const handlers: Array<{ event: string; handler: unknown }> = [];

	const api = {
		registerTool: vi.fn((tool: ToolDefinition) => {
			registeredTools.push(tool);
		}),
		on: vi.fn((event: string, handler: unknown) => {
			handlers.push({ event, handler });
		}),
	};

	return { api, registeredTools, handlers };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("createEnvironmentExtension", () => {
	test("is a valid Extension (function)", () => {
		const env: AgentEnvironment = {
			getSystemMessageAppend: () => undefined,
			getTools: () => [],
		};

		const extension = createEnvironmentExtension(env);
		expect(typeof extension).toBe("function");
	});

	test("registers tools from a sync environment", async () => {
		const tool = createTestTool("bash");
		const env: AgentEnvironment = {
			getSystemMessageAppend: () => undefined,
			getTools: () => [tool],
		};

		const { api, registeredTools } = createMockAPI();
		const extension = createEnvironmentExtension(env);

		await extension(api as Parameters<typeof extension>[0]);

		expect(api.registerTool).toHaveBeenCalledTimes(1);
		expect(api.registerTool).toHaveBeenCalledWith(tool);
		expect(registeredTools).toHaveLength(1);
		expect(registeredTools[0].name).toBe("bash");
	});

	test("registers multiple tools", async () => {
		const tools = [createTestTool("read"), createTestTool("write"), createTestTool("edit")];
		const env: AgentEnvironment = {
			getSystemMessageAppend: () => undefined,
			getTools: () => tools,
		};

		const { api, registeredTools } = createMockAPI();
		const extension = createEnvironmentExtension(env);

		await extension(api as Parameters<typeof extension>[0]);

		expect(registeredTools).toHaveLength(3);
		expect(registeredTools.map((t) => t.name)).toEqual(["read", "write", "edit"]);
	});

	test("registers no tools when environment has none", async () => {
		const env: AgentEnvironment = {
			getSystemMessageAppend: () => undefined,
			getTools: () => [],
		};

		const { registeredTools } = createMockAPI();
		const extension = createEnvironmentExtension(env);

		await extension(createMockAPI().api as Parameters<typeof extension>[0]);

		expect(registeredTools).toHaveLength(0);
	});

	test("registers tools from an async environment", async () => {
		const tool = createTestTool("async_tool");
		const env: AgentEnvironment = {
			getSystemMessageAppend: async () => "async append",
			getTools: async () => [tool],
		};

		const { api, registeredTools } = createMockAPI();
		const extension = createEnvironmentExtension(env);

		await extension(api as Parameters<typeof extension>[0]);

		expect(registeredTools).toHaveLength(1);
		expect(registeredTools[0].name).toBe("async_tool");
	});

	test("registers a before_agent_start handler", async () => {
		const env: AgentEnvironment = {
			getSystemMessageAppend: () => "env context",
			getTools: () => [],
		};

		const { api, handlers } = createMockAPI();
		const extension = createEnvironmentExtension(env);

		await extension(api as Parameters<typeof extension>[0]);

		expect(api.on).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
		expect(handlers.filter((h) => h.event === "before_agent_start")).toHaveLength(1);
	});

	test("before_agent_start appends environment text to system prompt", async () => {
		const env: AgentEnvironment = {
			getSystemMessageAppend: () => "You are in Docker.",
			getTools: () => [],
		};

		const { api } = createMockAPI();
		const extension = createEnvironmentExtension(env);

		await extension(api as Parameters<typeof extension>[0]);

		// Get the registered handler
		const handler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
			(c: unknown[]) => c[0] === "before_agent_start",
		)?.[1] as (event: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>;

		expect(handler).toBeDefined();

		const result = await handler?.({ systemPrompt: "Base prompt." });
		expect(result?.systemPrompt).toBe("Base prompt.\n\nYou are in Docker.");
	});

	test("before_agent_start returns undefined when append is undefined", async () => {
		const env: AgentEnvironment = {
			getSystemMessageAppend: () => undefined,
			getTools: () => [],
		};

		const { api } = createMockAPI();
		const extension = createEnvironmentExtension(env);

		await extension(api as Parameters<typeof extension>[0]);

		const handler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
			(c: unknown[]) => c[0] === "before_agent_start",
		)?.[1] as (event: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>;

		const result = await handler?.({ systemPrompt: "Base prompt." });
		expect(result).toBeUndefined();
	});

	test("before_agent_start returns undefined when append is empty string", async () => {
		const env: AgentEnvironment = {
			getSystemMessageAppend: () => "",
			getTools: () => [],
		};

		const { api } = createMockAPI();
		const extension = createEnvironmentExtension(env);

		await extension(api as Parameters<typeof extension>[0]);

		const handler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
			(c: unknown[]) => c[0] === "before_agent_start",
		)?.[1] as (event: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>;

		const result = await handler?.({ systemPrompt: "Base prompt." });
		expect(result).toBeUndefined();
	});

	test("before_agent_start works with async getSystemMessageAppend", async () => {
		const env: AgentEnvironment = {
			getSystemMessageAppend: async () => {
				return "Async environment info.";
			},
			getTools: async () => [],
		};

		const { api } = createMockAPI();
		const extension = createEnvironmentExtension(env);

		await extension(api as Parameters<typeof extension>[0]);

		const handler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
			(c: unknown[]) => c[0] === "before_agent_start",
		)?.[1] as (event: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>;

		const result = await handler?.({ systemPrompt: "Base." });
		expect(result?.systemPrompt).toBe("Base.\n\nAsync environment info.");
	});

	test("before_agent_start queries fresh append each turn", async () => {
		let callCount = 0;
		const env: AgentEnvironment = {
			getSystemMessageAppend: () => {
				callCount++;
				return `Call ${callCount}`;
			},
			getTools: () => [],
		};

		const { api } = createMockAPI();
		const extension = createEnvironmentExtension(env);

		await extension(api as Parameters<typeof extension>[0]);

		const handler = (api.on as ReturnType<typeof vi.fn>).mock.calls.find(
			(c: unknown[]) => c[0] === "before_agent_start",
		)?.[1] as (event: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>;

		const result1 = await handler?.({ systemPrompt: "Base." });
		expect(result1?.systemPrompt).toBe("Base.\n\nCall 1");

		const result2 = await handler?.({ systemPrompt: "Base." });
		expect(result2?.systemPrompt).toBe("Base.\n\nCall 2");
	});
});
