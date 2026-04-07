import { parseArgs } from "node:util";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

export interface ParsedArgs {
	mode: "rpc";
	provider: string;
	model: string;
	apiKey: string | undefined;
	thinking: ThinkingLevel | undefined;
	systemPrompt: string | undefined;
	cwd: string | undefined;
	extensions: string[];
	help: boolean;
	version: boolean;
}

const HELP = `
Usage: otter [options]

Options:
  --mode <mode>           Operation mode. Currently only "rpc" is supported.
  --provider <name>       LLM provider (e.g. anthropic, openai, google). Required.
  --model <id>            Model ID (e.g. claude-sonnet-4-5-20250514). Required.
  --api-key <key>         API key for the provider. Overrides the environment variable.
  --thinking <level>      Thinking level: off, minimal, low, medium, high, xhigh.
  --system-prompt <text>  Base system prompt.
  --cwd <path>            Working directory for the agent environment.
  --extension, -e <path>  Load an extension config file (JSON or YAML). Can be repeated.
  --help                  Show this help message.
  --version               Print the version and exit.
`.trim();

/**
 * Collect repeatable flags that node:util.parseArgs doesn't support natively.
 *
 * Scans argv for -e / --extension and returns the collected values along
 * with the remaining args (minus the collected flags and their values).
 */
function collectRepeatableFlags(argv: string[]): { extensions: string[]; filteredArgs: string[] } {
	const extensions: string[] = [];
	const filteredArgs: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--extension" || arg === "-e") {
			if (i + 1 < argv.length) {
				extensions.push(argv[++i]);
			} else {
				console.error(`Error: ${arg} requires a path argument.`);
				process.exit(1);
			}
		} else {
			filteredArgs.push(arg);
		}
	}

	return { extensions, filteredArgs };
}

export function parseCliArgs(argv: string[]): ParsedArgs {
	const { extensions, filteredArgs } = collectRepeatableFlags(argv);

	const { values } = parseArgs({
		args: filteredArgs,
		options: {
			mode: { type: "string" },
			provider: { type: "string" },
			model: { type: "string" },
			"api-key": { type: "string" },
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

	const help = (values.help as boolean | undefined) ?? false;
	const version = (values.version as boolean | undefined) ?? false;

	// --help and --version short-circuit without requiring --provider/--model.
	if (help || version) {
		return {
			mode: "rpc",
			provider: "",
			model: "",
			apiKey: undefined,
			thinking,
			systemPrompt: values["system-prompt"] as string | undefined,
			cwd: values.cwd as string | undefined,
			extensions,
			help,
			version,
		};
	}

	const provider = values.provider as string | undefined;
	const model = values.model as string | undefined;

	if (!provider) {
		console.error("Error: --provider is required.");
		console.error(
			"Use --provider <name> to specify the LLM provider (e.g. anthropic, openai, google).",
		);
		process.exit(1);
	}

	if (!model) {
		console.error("Error: --model is required.");
		console.error("Use --model <id> to specify the model ID (e.g. claude-sonnet-4-5-20250514).");
		process.exit(1);
	}

	return {
		mode: "rpc",
		provider,
		model,
		apiKey: values["api-key"] as string | undefined,
		thinking,
		systemPrompt: values["system-prompt"] as string | undefined,
		cwd: values.cwd as string | undefined,
		extensions,
		help: false,
		version: false,
	};
}

export function printHelp(): void {
	console.log(HELP);
}
