import type { ToolDefinition } from "./tool-definition.js";

/**
 * Represents the environment the agent operates in.
 *
 * Replaces the `cwd: string` concept from pi-coding-agent, allowing
 * agents to work in non-filesystem environments (remote servers, containers,
 * cloud services, etc.).
 *
 * An agent has exactly one environment. `getTools()` is called once at startup.
 * `getSystemMessageAppend()` is called at startup and again after extensions
 * load, so that environments implementing {@link SkillSupportedAgentEnvironment}
 * can reflect skills registered during `session_start`.
 *
 * Extensions receive an `AgentEnvironment` and should use capability-specific
 * type guards to access richer APIs on concrete implementations. For example:
 *
 * ```ts
 * if (isJustBashAgentEnvironment(ctx.agentEnvironment)) {
 *   // access JustBashAgentEnvironment-specific methods here
 * }
 * ```
 */
export interface AgentEnvironment {
	/**
	 * Optional string appended to the system message so the agent
	 * understands the environment it is working in.
	 *
	 * @returns A string to append to the system prompt, or `undefined` if
	 * the environment has nothing to add.
	 */
	getSystemMessageAppend(): string | undefined;

	/**
	 * Tools the environment exposes to the agent for interacting with it.
	 *
	 * These are analogous to the built-in tools (read, write, bash, etc.)
	 * in pi-coding-agent but are fully customisable per environment.
	 * The returned tools are merged with tools registered by extensions.
	 *
	 * @returns An array of tool definitions, or an empty array if the
	 * environment provides no tools.
	 */
	getTools(): ToolDefinition[];
}
