/**
 * Wraps a ToolDefinition into an AgentTool for the pi-agent-core runtime.
 */
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "../interfaces/tool-definition.js";

export function wrapToolDefinition(definition: ToolDefinition): AgentTool {
	return {
		name: definition.name,
		label: definition.label,
		description: definition.description,
		parameters: definition.parameters,
		prepareArguments: definition.prepareArguments,
		execute: (toolCallId, params, signal, onUpdate) =>
			definition.execute(toolCallId, params, signal, onUpdate),
	};
}
