import type { AgentEnvironment, ComponentTemplate, ToolDefinition } from "@otter-agent/core";
import { Type } from "@sinclair/typebox";

/**
 * AgentEnvironment that provides no tools and no system message appendix.
 *
 * Useful as a default or placeholder when no real environment is needed.
 */
export class NoOpAgentEnvironment implements AgentEnvironment {
	getSystemMessageAppend(): string | undefined {
		return undefined;
	}

	getTools(): ToolDefinition[] {
		return [];
	}
}

const NoOpConfigSchema = Type.Object({});

/**
 * ComponentTemplate for {@link NoOpAgentEnvironment}.
 *
 * Accepts no configuration — `configSchema()` is an empty object.
 */
export const NoOpAgentEnvironmentTemplate: ComponentTemplate<
	typeof NoOpConfigSchema,
	AgentEnvironment
> = {
	configSchema() {
		return NoOpConfigSchema;
	},

	defaultConfig() {
		return {};
	},

	build(_config) {
		return new NoOpAgentEnvironment();
	},
};
