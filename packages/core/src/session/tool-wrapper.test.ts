import { Type } from "@sinclair/typebox";
import { describe, expect, test } from "vitest";
import type { ToolDefinition } from "../interfaces/tool-definition.js";
import { wrapToolDefinition } from "./tool-wrapper.js";

describe("wrapToolDefinition", () => {
	test("maps ToolDefinition fields to AgentTool", () => {
		const definition: ToolDefinition = {
			name: "test_tool",
			label: "Test Tool",
			description: "A test tool",
			parameters: Type.Object({ input: Type.String() }),
			async execute(_toolCallId, params) {
				return {
					content: [{ type: "text", text: `got: ${params.input}` }],
					details: undefined,
				};
			},
		};

		const agentTool = wrapToolDefinition(definition);

		expect(agentTool.name).toBe("test_tool");
		expect(agentTool.label).toBe("Test Tool");
		expect(agentTool.description).toBe("A test tool");
		expect(agentTool.parameters).toBe(definition.parameters);
	});

	test("execute delegates to the definition", async () => {
		const definition: ToolDefinition = {
			name: "echo",
			label: "Echo",
			description: "Echoes input",
			parameters: Type.Object({ msg: Type.String() }),
			async execute(_toolCallId, params) {
				return {
					content: [{ type: "text", text: params.msg }],
					details: { echoed: true },
				};
			},
		};

		const agentTool = wrapToolDefinition(definition);
		const result = await agentTool.execute("call-1", { msg: "hello" }, undefined, undefined);

		expect(result.content).toEqual([{ type: "text", text: "hello" }]);
		expect(result.details).toEqual({ echoed: true });
	});

	test("prepareArguments is passed through", () => {
		const definition: ToolDefinition = {
			name: "tool",
			label: "Tool",
			description: "desc",
			parameters: Type.Object({ x: Type.Number() }),
			prepareArguments: (args) => ({ x: Number((args as { x: string }).x) }),
			async execute(_toolCallId, params) {
				return { content: [{ type: "text", text: String(params.x) }], details: undefined };
			},
		};

		const agentTool = wrapToolDefinition(definition);
		expect(agentTool.prepareArguments).toBeDefined();
		expect(agentTool.prepareArguments?.({ x: "42" })).toEqual({ x: 42 });
	});
});
