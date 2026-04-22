import type { SkillDefinition } from "../interfaces/skill-definition.js";
import { escapeXml } from "../utils/escape-xml.js";

/**
 * Build the XML block injected into the conversation when a skill is invoked.
 * Follows the same format as pi-coding-agent's skill invocation messages.
 *
 * @param skill - The skill definition to invoke.
 * @param args - Arguments passed by the user after the command name.
 * @param filePath - Optional absolute path to the skill's SKILL.md file.
 *   When provided, a `location` attribute and relative-path hint are included
 *   so the agent can resolve supporting files referenced in the skill content.
 *   Omit for self-contained skills or when the path is not available.
 */
export function buildSkillInvocationXml(
	skill: SkillDefinition,
	args: string,
	filePath?: string,
): string {
	const parts: string[] = [];

	if (filePath) {
		const skillDir = filePath.substring(0, filePath.lastIndexOf("/"));
		parts.push(`<skill name="${escapeXml(skill.name)}" location="${escapeXml(filePath)}">`);
		parts.push(`References are relative to ${skillDir}/.`);
	} else {
		parts.push(`<skill name="${escapeXml(skill.name)}">`);
	}

	parts.push("", skill.content, "</skill>");

	const trimmedArgs = args.trim();
	if (trimmedArgs) {
		parts.push("", trimmedArgs);
	}
	return parts.join("\n");
}
