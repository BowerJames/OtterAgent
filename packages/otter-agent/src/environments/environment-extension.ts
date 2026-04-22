import type { Extension } from "../extension-core/extension.js";
/**
 * Creates a default extension that registers the environment's tools
 * and appends the environment's system message to the system prompt.
 *
 * This extension is automatically prepended during `AgentSession.loadExtensions()`
 * so that environment tools are available and the system prompt is augmented
 * before user extensions load.
 *
 * Tools are registered once during init. The system prompt append uses
 * `before_agent_start` (matching pi-coding-agent's pattern), called fresh
 * every turn so that skill registrations from `session_start` handlers
 * are automatically reflected.
 */
import type { AgentEnvironment } from "../interfaces/agent-environment.js";

/**
 * Creates an extension that wires an {@link AgentEnvironment} into the session.
 *
 * @param environment - The environment to register tools and system prompt from.
 * @returns An {@link Extension} suitable for prepending to the extensions array.
 */
export function createEnvironmentExtension(environment: AgentEnvironment): Extension {
	return async (api) => {
		// Register environment tools during init
		const tools = await environment.getTools();
		for (const tool of tools) {
			api.registerTool(tool);
		}

		// Append environment context to system prompt every turn via before_agent_start.
		// Called fresh each turn so skill registrations from session_start handlers
		// are automatically reflected in the append (e.g. JustBashAgentEnvironment
		// includes skill listings in its append).
		api.on("before_agent_start", async (event) => {
			const append = await environment.getSystemMessageAppend();
			if (append) {
				return {
					systemPrompt: `${event.systemPrompt}\n\n${append}`,
				};
			}
			return undefined;
		});
	};
}
