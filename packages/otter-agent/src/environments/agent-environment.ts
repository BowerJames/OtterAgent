import type { AgentEnvironment as IAgentEnvironment } from "../interfaces/agent-environment.js";
import {
	JustBashAgentEnvironment,
	type JustBashAgentEnvironmentOptions,
	JustBashAgentEnvironmentOptionsSchema,
	JustBashAgentEnvironmentTemplate,
	type JustBashToolName,
	isJustBashAgentEnvironment,
} from "./just-bash/just-bash-agent-environment.js";

export {
	isJustBashAgentEnvironment,
	JustBashAgentEnvironment,
	JustBashAgentEnvironmentOptionsSchema,
	JustBashAgentEnvironmentTemplate,
	type JustBashAgentEnvironmentOptions,
	type JustBashToolName,
};

/**
 * Namespace providing factory methods for built-in {@link IAgentEnvironment}
 * implementations. The empty interface extension below enables TypeScript
 * declaration merging so `AgentEnvironment` is both a type (the full interface)
 * and a value (the namespace with factory methods) in a single export.
 *
 * @example
 * ```typescript
 * import { AgentEnvironment } from "@otter-agent/core";
 * const env: AgentEnvironment = AgentEnvironment.justBash({ cwd: "/workspace" });
 * ```
 */
// Empty interface extension enables declaration merging with the namespace below.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AgentEnvironment extends IAgentEnvironment {}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AgentEnvironment {
	/**
	 * Creates a {@link JustBashAgentEnvironment} backed by a sandboxed just-bash
	 * virtual filesystem. Exposes bash, read, write, and edit tools.
	 */
	export function justBash(options?: JustBashAgentEnvironmentOptions): IAgentEnvironment {
		return new JustBashAgentEnvironment(options);
	}
}
