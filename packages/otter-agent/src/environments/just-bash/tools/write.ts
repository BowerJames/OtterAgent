import { Type } from "@sinclair/typebox";
import type { Bash } from "just-bash";
import type { ToolDefinition } from "../../../interfaces/tool-definition.js";
import { withFileMutationQueue } from "../file-mutation-queue.js";
import { resolveToCwd } from "../path-utils.js";

const writeSchema = Type.Object({
	path: Type.String({ description: "Path to the file to write (relative or absolute)" }),
	content: Type.String({ description: "Content to write to the file" }),
});

export function createWriteToolDefinition(
	bash: Bash,
	cwd: string,
): ToolDefinition<typeof writeSchema, undefined> {
	return {
		name: "write",
		label: "write",
		description:
			"Write content to a file in the virtual filesystem. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
		promptSnippet: "Create or overwrite files",
		promptGuidelines: ["Use write only for new files or complete rewrites."],
		parameters: writeSchema,
		async execute(_toolCallId, { path, content }, signal) {
			const absolutePath = resolveToCwd(path, cwd);

			return withFileMutationQueue(absolutePath, async () => {
				if (signal?.aborted) throw new Error("Operation aborted");

				// just-bash creates parent directories automatically on write.
				await bash.writeFile(absolutePath, content);

				if (signal?.aborted) throw new Error("Operation aborted");

				return {
					content: [
						{
							type: "text" as const,
							text: `Successfully wrote ${content.length} bytes to ${path}`,
						},
					],
					details: undefined,
				};
			});
		},
	};
}
