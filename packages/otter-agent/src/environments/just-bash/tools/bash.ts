import { Type } from "@sinclair/typebox";
import type { Bash } from "just-bash";
import type { ToolDefinition } from "../../../interfaces/tool-definition.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateTail } from "../truncate.js";

const bashSchema = Type.Object({
	command: Type.String({ description: "Bash command to execute" }),
	timeout: Type.Optional(
		Type.Number({ description: "Timeout in seconds (optional, no default timeout)" }),
	),
});

export interface BashToolDetails {
	truncation?: ReturnType<typeof truncateTail>;
}

export function createBashToolDefinition(
	bash: Bash,
): ToolDefinition<typeof bashSchema, BashToolDetails | undefined> {
	return {
		name: "bash",
		label: "bash",
		description: `Execute a bash command in the sandboxed virtual filesystem. Returns stdout and stderr. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Optionally provide a timeout in seconds.`,
		promptSnippet: "Execute bash commands (ls, grep, find, etc.)",
		parameters: bashSchema,
		async execute(_toolCallId, { command, timeout }, signal) {
			if (signal?.aborted) throw new Error("Command aborted");

			// Build a combined AbortController so timeout and caller abort both cancel exec.
			const controller = new AbortController();
			let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

			const onAbort = () => controller.abort();
			signal?.addEventListener("abort", onAbort, { once: true });

			if (timeout !== undefined && timeout > 0) {
				timeoutHandle = setTimeout(() => controller.abort("timeout"), timeout * 1000);
			}

			let result: Awaited<ReturnType<typeof bash.exec>>;
			try {
				result = await bash.exec(command, { signal: controller.signal });
			} catch (err) {
				if (signal?.aborted) {
					throw new Error("Command aborted");
				}
				if (controller.signal.reason === "timeout") {
					throw new Error(`Command timed out after ${timeout} seconds`);
				}
				throw err;
			} finally {
				if (timeoutHandle) clearTimeout(timeoutHandle);
				signal?.removeEventListener("abort", onAbort);
			}

			// Combine stdout and stderr into one stream (mirrors real shell behaviour).
			const combined = [result.stdout, result.stderr].filter(Boolean).join("");
			const truncation = truncateTail(combined);
			let outputText = truncation.content || "(no output)";

			if (truncation.truncated) {
				const startLine = truncation.totalLines - truncation.outputLines + 1;
				const endLine = truncation.totalLines;
				if (truncation.truncatedBy === "lines") {
					outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}.]`;
				} else {
					outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit).]`;
				}
			}

			if (result.exitCode !== 0) {
				outputText += `\n\nCommand exited with code ${result.exitCode}`;
				throw new Error(outputText);
			}

			return {
				content: [{ type: "text", text: outputText }],
				details: truncation.truncated ? { truncation } : undefined,
			};
		},
	};
}
