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
	sessionManagerConfig: string;
	/** Provided via --auth-storage-config. When absent, env vars / --api-key are used. */
	authStorageConfig: string | undefined;
	agentEnvironmentConfig: string;
	extensions: string[];
	help: boolean;
	version: boolean;
}

const HELP = `
Usage: otter [options]

Options:
  --mode <mode>                    Operation mode. Currently only "rpc" is supported.
  --provider <name>                LLM provider (e.g. anthropic, openai, google). Required.
  --model <id>                     Model ID (e.g. claude-sonnet-4-5-20250514). Required.
  --api-key <key>                  API key for the provider. Mutually exclusive with --auth-storage-config.
  --thinking <level>               Thinking level: off, minimal, low, medium, high, xhigh.
  --system-prompt <text>           Base system prompt.
  --session-manager-config <path>  Session manager config file (JSON or YAML). Required.
  --auth-storage-config <path>     Auth storage config file (JSON or YAML). Mutually exclusive with --api-key.
  --agent-environment-config <path> Agent environment config file (JSON or YAML). Required.
  --extension, -e <path>           Load an extension config file (JSON or YAML). Can be repeated.
  --help                           Show this help message.
  --version                        Print the version and exit.
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
			"session-manager-config": { type: "string" },
			"auth-storage-config": { type: "string" },
			"agent-environment-config": { type: "string" },
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

	// --help and --version short-circuit without requiring other flags.
	if (help || version) {
		return {
			mode: "rpc",
			provider: "",
			model: "",
			apiKey: undefined,
			thinking,
			systemPrompt: values["system-prompt"] as string | undefined,
			sessionManagerConfig: "",
			authStorageConfig: undefined,
			agentEnvironmentConfig: "",
			extensions,
			help,
			version,
		};
	}

	const provider = values.provider as string | undefined;
	const model = values.model as string | undefined;
	const apiKey = values["api-key"] as string | undefined;
	const authStorageConfig = values["auth-storage-config"] as string | undefined;
	const sessionManagerConfig = values["session-manager-config"] as string | undefined;
	const agentEnvironmentConfig = values["agent-environment-config"] as string | undefined;

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

	if (apiKey !== undefined && authStorageConfig !== undefined) {
		console.error("Error: --api-key and --auth-storage-config are mutually exclusive.");
		console.error(
			"Use --api-key to pass a key directly, or --auth-storage-config to load from a config file.",
		);
		process.exit(1);
	}

	if (!sessionManagerConfig) {
		console.error("Error: --session-manager-config is required.");
		console.error("Use --session-manager-config <path> to specify a session manager config file.");
		process.exit(1);
	}

	if (!agentEnvironmentConfig) {
		console.error("Error: --agent-environment-config is required.");
		console.error(
			"Use --agent-environment-config <path> to specify an agent environment config file.",
		);
		process.exit(1);
	}

	return {
		mode: "rpc",
		provider,
		model,
		apiKey,
		thinking,
		systemPrompt: values["system-prompt"] as string | undefined,
		sessionManagerConfig,
		authStorageConfig,
		agentEnvironmentConfig,
		extensions,
		help: false,
		version: false,
	};
}

export function printHelp(): void {
	console.log(HELP);
}
