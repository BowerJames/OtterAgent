import { parseArgs } from "node:util";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

export interface ParsedArgs {
	mode: "rpc";
	provider: string | undefined;
	model: string | undefined;
	thinking: ThinkingLevel | undefined;
	systemPrompt: string | undefined;
	cwd: string | undefined;
	help: boolean;
	version: boolean;
}

const HELP = `
Usage: otter [options]

Options:
  --mode <mode>           Operation mode. Currently only "rpc" is supported.
  --provider <name>       LLM provider (e.g. anthropic, openai, google).
  --model <id>            Model ID (e.g. claude-sonnet-4-5-20250514).
  --thinking <level>      Thinking level: off, minimal, low, medium, high, xhigh.
  --system-prompt <text>  Base system prompt.
  --cwd <path>            Working directory for the agent environment.
  --help                  Show this help message.
  --version               Print the version and exit.
`.trim();

export function parseCliArgs(argv: string[]): ParsedArgs {
	const { values } = parseArgs({
		args: argv,
		options: {
			mode: { type: "string" },
			provider: { type: "string" },
			model: { type: "string" },
			thinking: { type: "string" },
			"system-prompt": { type: "string" },
			cwd: { type: "string" },
			help: { type: "boolean", default: false },
			version: { type: "boolean", default: false },
		},
		strict: false,
	});

	if (values.mode !== undefined && values.mode !== "rpc") {
		console.error(`Error: unsupported mode "${values.mode}". Only "rpc" is supported.`);
		process.exit(1);
	}

	let thinking: ThinkingLevel | undefined;
	if (values.thinking !== undefined) {
		if (!THINKING_LEVELS.includes(values.thinking as ThinkingLevel)) {
			console.error(
				`Error: invalid thinking level "${values.thinking}". Valid values: ${THINKING_LEVELS.join(", ")}`,
			);
			process.exit(1);
		}
		thinking = values.thinking as ThinkingLevel;
	}

	return {
		mode: "rpc",
		provider: values.provider as string | undefined,
		model: values.model as string | undefined,
		thinking,
		systemPrompt: values["system-prompt"] as string | undefined,
		cwd: values.cwd as string | undefined,
		help: (values.help as boolean | undefined) ?? false,
		version: (values.version as boolean | undefined) ?? false,
	};
}

export function printHelp(): void {
	console.log(HELP);
}
