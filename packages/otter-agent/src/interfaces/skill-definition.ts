/**
 * A skill definition — the minimal input for registering a skill with a
 * {@link SkillSupportedAgentEnvironment}.
 */
export interface SkillDefinition {
	/** Unique skill name. Must be lowercase a-z, 0-9, or hyphens; max 64 characters. */
	name: string;
	/** Human-readable description shown to the agent so it knows when to invoke this skill. */
	description: string;
	/** Markdown body of the skill (without YAML frontmatter). */
	content: string;
}
