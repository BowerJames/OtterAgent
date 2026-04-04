/**
 * Pure function for assembling the system prompt from its components.
 *
 * Combines the base prompt, optional environment context, and
 * active tool information (snippets + guidelines) into a single string.
 */
import type { ToolDefinition } from "../interfaces/tool-definition.js";

/** Options for building the system prompt. */
export interface BuildSystemPromptOptions {
	/** The base system prompt provided by the host application. */
	basePrompt: string;
	/** Optional environment context appended after the base prompt. */
	environmentAppend?: string;
	/** Active tool definitions whose snippets and guidelines are included. */
	tools: ToolDefinition[];
}

/**
 * Build the full system prompt from base prompt, environment context,
 * and tool information.
 *
 * Layout:
 * ```
 * <basePrompt>
 *
 * <environmentAppend>          (if provided)
 *
 * # Available Tools             (if any tool has a promptSnippet)
 * - toolName: snippet
 *
 * # Guidelines                  (if any tool has promptGuidelines)
 * - guideline
 * ```
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
	const parts: string[] = [options.basePrompt];

	if (options.environmentAppend) {
		parts.push(options.environmentAppend);
	}

	const toolSection = buildToolSection(options.tools);
	if (toolSection) {
		parts.push(toolSection);
	}

	return parts.join("\n\n");
}

/**
 * Build the tool snippets and guidelines section.
 * Returns undefined if no tools have snippets or guidelines.
 */
export function buildToolSection(tools: ToolDefinition[]): string | undefined {
	const snippets = tools
		.filter((d) => d.promptSnippet)
		.map((d) => `- ${d.name}: ${d.promptSnippet}`);

	const guidelines = tools.flatMap((d) => d.promptGuidelines ?? []);

	const sections: string[] = [];

	if (snippets.length > 0) {
		sections.push(`# Available Tools\n${snippets.join("\n")}`);
	}

	if (guidelines.length > 0) {
		sections.push(`# Guidelines\n${guidelines.map((g) => `- ${g}`).join("\n")}`);
	}

	return sections.length > 0 ? sections.join("\n\n") : undefined;
}
