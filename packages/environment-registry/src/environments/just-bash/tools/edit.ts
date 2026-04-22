import type { ToolDefinition } from "@otter-agent/core";
import { Type } from "@sinclair/typebox";
import type { Bash } from "just-bash";
import {
	applyEditsToNormalizedContent,
	detectLineEnding,
	generateDiffString,
	normalizeToLF,
	restoreLineEndings,
	stripBom,
} from "../edit-diff.js";
import { withFileMutationQueue } from "../file-mutation-queue.js";
import { resolveToCwd } from "../path-utils.js";

const replaceEditSchema = Type.Object(
	{
		oldText: Type.String({
			description:
				"Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.",
		}),
		newText: Type.String({ description: "Replacement text for this targeted edit." }),
	},
	{ additionalProperties: false },
);

const editSchema = Type.Object(
	{
		path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
		edits: Type.Array(replaceEditSchema, {
			description:
				"One or more targeted replacements. Each edit is matched against the original file, not incrementally. Do not include overlapping or nested edits. If two changes touch the same block or nearby lines, merge them into one edit instead.",
		}),
	},
	{ additionalProperties: false },
);

export interface EditToolDetails {
	/** Unified diff of the changes made */
	diff: string;
	/** Line number of the first change in the new file (for editor navigation) */
	firstChangedLine?: number;
}

function prepareEditArguments(input: unknown): unknown {
	if (!input || typeof input !== "object") return input;
	const args = input as Record<string, unknown>;
	if (typeof args.oldText !== "string" || typeof args.newText !== "string") return input;
	const edits = Array.isArray(args.edits) ? [...args.edits] : [];
	edits.push({ oldText: args.oldText, newText: args.newText });
	const { oldText: _oldText, newText: _newText, ...rest } = args;
	return { ...rest, edits };
}

function validateEditInput(input: {
	path: string;
	edits: Array<{ oldText: string; newText: string }>;
}): { path: string; edits: Array<{ oldText: string; newText: string }> } {
	if (!Array.isArray(input.edits) || input.edits.length === 0) {
		throw new Error("Edit tool input is invalid. edits must contain at least one replacement.");
	}
	return { path: input.path, edits: input.edits };
}

export function createEditToolDefinition(
	bash: Bash,
	cwd: string,
): ToolDefinition<typeof editSchema, EditToolDetails | undefined> {
	return {
		name: "edit",
		label: "edit",
		description:
			"Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. If two changes affect the same block or nearby lines, merge them into one edit instead of emitting overlapping edits. Do not include large unchanged regions just to connect distant changes.",
		promptSnippet:
			"Make precise file edits with exact text replacement, including multiple disjoint edits in one call",
		promptGuidelines: [
			"Use edit for precise changes (edits[].oldText must match exactly)",
			"When changing multiple separate locations in one file, use one edit call with multiple entries in edits[] instead of multiple edit calls",
			"Each edits[].oldText is matched against the original file, not after earlier edits are applied. Do not emit overlapping or nested edits. Merge nearby changes into one edit.",
			"Keep edits[].oldText as small as possible while still being unique in the file. Do not pad with large unchanged regions.",
		],
		parameters: editSchema,
		prepareArguments: prepareEditArguments as (args: unknown) => {
			path: string;
			edits: Array<{ oldText: string; newText: string }>;
		},
		async execute(_toolCallId, input, signal) {
			const { path, edits } = validateEditInput(input);
			const absolutePath = resolveToCwd(path, cwd);

			return withFileMutationQueue(absolutePath, async () => {
				if (signal?.aborted) throw new Error("Operation aborted");

				let rawContent: string;
				try {
					rawContent = await bash.readFile(absolutePath);
				} catch {
					throw new Error(`File not found: ${path}`);
				}

				if (signal?.aborted) throw new Error("Operation aborted");

				const { bom, text: content } = stripBom(rawContent);
				const originalEnding = detectLineEnding(content);
				const normalizedContent = normalizeToLF(content);

				const { baseContent, newContent } = applyEditsToNormalizedContent(
					normalizedContent,
					edits,
					path,
				);

				if (signal?.aborted) throw new Error("Operation aborted");

				const finalContent = bom + restoreLineEndings(newContent, originalEnding);
				await bash.writeFile(absolutePath, finalContent);

				if (signal?.aborted) throw new Error("Operation aborted");

				const diffResult = generateDiffString(baseContent, newContent);

				return {
					content: [
						{
							type: "text" as const,
							text: `Successfully replaced ${edits.length} block(s) in ${path}.`,
						},
					],
					details: {
						diff: diffResult.diff,
						firstChangedLine: diffResult.firstChangedLine,
					},
				};
			});
		},
	};
}
