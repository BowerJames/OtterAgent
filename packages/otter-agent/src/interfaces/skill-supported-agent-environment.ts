import type { AgentEnvironment } from "./agent-environment.js";
import type { SkillDefinition } from "./skill-definition.js";

/**
 * Optional extension of {@link AgentEnvironment} for environments that support
 * skill registration.
 *
 * Not all environments support skills. Use {@link isSkillSupportedAgentEnvironment}
 * to narrow an {@link AgentEnvironment} to this interface before calling these methods.
 *
 * Extensions register skills in a `session_start` handler by accessing
 * `ctx.agentEnvironment`, narrowing with the type guard, and calling `addSkill()`.
 *
 * @example
 * ```ts
 * api.on("session_start", (_event, ctx) => {
 *   if (isSkillSupportedAgentEnvironment(ctx.agentEnvironment)) {
 *     ctx.agentEnvironment.addSkill({
 *       name: "my-skill",
 *       description: "What this skill does",
 *       content: "Instructions for the agent...",
 *     });
 *   }
 * });
 * ```
 */
export interface SkillSupportedAgentEnvironment extends AgentEnvironment {
	/**
	 * Register a skill with the environment.
	 *
	 * Validates the skill name. If the name is invalid, logs a warning and returns
	 * `false` without throwing — the session continues unaffected.
	 *
	 * @returns `true` if the skill was registered, `false` if the name was invalid.
	 */
	addSkill(skill: SkillDefinition): boolean;

	/**
	 * Return all registered skill definitions.
	 */
	getSkills(): SkillDefinition[];

	/**
	 * Return the full content of the skill's virtual file (including YAML frontmatter),
	 * or `undefined` if no skill with that name is registered.
	 */
	getSkillContent(name: string): string | undefined;

	/**
	 * Return the absolute virtual filesystem path to the skill's `SKILL.md` file,
	 * or `undefined` if no skill with that name is registered.
	 */
	getSkillFilePath(name: string): string | undefined;
}

/**
 * Type guard — returns `true` if `env` implements {@link SkillSupportedAgentEnvironment}.
 *
 * @example
 * ```ts
 * if (isSkillSupportedAgentEnvironment(ctx.agentEnvironment)) {
 *   ctx.agentEnvironment.addSkill({ ... });
 * }
 * ```
 */
export function isSkillSupportedAgentEnvironment(
	env: AgentEnvironment,
): env is SkillSupportedAgentEnvironment {
	return (
		typeof (env as SkillSupportedAgentEnvironment).addSkill === "function" &&
		typeof (env as SkillSupportedAgentEnvironment).getSkills === "function" &&
		typeof (env as SkillSupportedAgentEnvironment).getSkillContent === "function" &&
		typeof (env as SkillSupportedAgentEnvironment).getSkillFilePath === "function"
	);
}
