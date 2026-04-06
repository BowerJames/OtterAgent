import {
	AgentEnvironment,
	type AuthStorage,
	ModelRegistry,
	createAgentSession,
	createInMemoryAuthStorage,
	createInMemorySessionManager,
} from "@otter-agent/core";
import { parseCliArgs, printHelp } from "./args.js";
import { runRpcMode } from "./rpc/rpc-mode.js";

const VERSION = "0.0.1";

/**
 * Standard environment variable names for LLM provider API keys.
 * Keyed by provider identifier as used in pi-ai/ModelRegistry.
 */
const PROVIDER_ENV_VARS: Record<string, string> = {
	anthropic: "ANTHROPIC_API_KEY",
	openai: "OPENAI_API_KEY",
	google: "GEMINI_API_KEY",
	deepseek: "DEEPSEEK_API_KEY",
	mistral: "MISTRAL_API_KEY",
	xai: "XAI_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
};

/**
 * Build an InMemoryAuthStorage seeded from standard environment variables.
 */
function buildAuthStorageFromEnv() {
	const keys: Record<string, string> = {};
	for (const [provider, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
		const value = process.env[envVar];
		if (value) {
			keys[provider] = value;
		}
	}
	return createInMemoryAuthStorage(keys);
}

/**
 * Resolve a Model<Api> from CLI --provider and --model flags.
 *
 * Exits the process with an error message if the combination is invalid.
 * Returns undefined when neither flag is provided (session will be modelless).
 */
function resolveModelFromArgs(
	provider: string | undefined,
	modelId: string | undefined,
	authStorage: AuthStorage,
) {
	if (provider && modelId) {
		const registry = new ModelRegistry(authStorage);
		const model = registry.find(provider, modelId);
		if (!model) {
			console.error(`Error: model "${provider}/${modelId}" not found.`);
			console.error("Check --provider and --model values, or omit them to use the default.");
			process.exit(1);
		}
		return model;
	}
	if (provider || modelId) {
		console.error("Error: --provider and --model must be specified together.");
		process.exit(1);
	}
	return undefined;
}

export async function main(argv: string[]): Promise<void> {
	const args = parseCliArgs(argv);

	if (args.help) {
		printHelp();
		process.exit(0);
	}

	if (args.version) {
		console.log(VERSION);
		process.exit(0);
	}

	const authStorage = buildAuthStorageFromEnv();

	// Resolve the model from CLI flags before creating the session.
	// We need a temporary ModelRegistry here because createAgentSession requires a
	// resolved Model<Api> object, not raw provider/modelId strings. createAgentSession
	// constructs its own registry internally for session-context resolution — this one
	// is only used for early CLI validation.
	const model = resolveModelFromArgs(args.provider, args.model, authStorage);

	const sessionManager = createInMemorySessionManager();
	const environment = AgentEnvironment.justBash({
		cwd: args.cwd ?? process.cwd(),
	});

	const { session } = await createAgentSession({
		sessionManager,
		authStorage,
		environment,
		systemPrompt: args.systemPrompt ?? "You are a helpful AI assistant.",
		model,
		thinkingLevel: args.thinking,
	});

	await runRpcMode(session);
}
