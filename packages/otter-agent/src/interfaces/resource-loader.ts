import type { CreateAgentSessionOptions } from "../session/agent-session.js";

/**
 * Provides the resources needed to create an agent session.
 *
 * Implementations may load components from config files, construct them
 * programmatically, or compose them from any source. The only field not
 * provided is {@link UIProvider}, which is supplied separately by the caller.
 */
export interface ResourceLoader {
	/**
	 * Load and return all session resources.
	 *
	 * @returns An object satisfying {@link CreateAgentSessionOptions}
	 *          minus {@link UIProvider}.
	 */
	getResources(): Promise<Omit<CreateAgentSessionOptions, "uiProvider">>;
}
