import { AgentEnvironment, type AuthStorage, ModelRegistry } from "@otter-agent/core";
import { parseCliArgs, printHelp } from "./args.js";
import { buildAuthStorageFromEnv } from "./auth.js";
import { runRpcMode } from "./rpc/rpc-mode.js";

const VERSION = "0.0.1";

/**
 * Resolve a Model<Api> from CLI --provider and --model flags.
 *
 * Exits the process with an error message if the combination is invalid.
 */
function resolveModelFromArgs(provider: string, modelId: string, authStorage: AuthStorage) {
	const registry = new ModelRegistry(authStorage);
	const model = registry.find(provider, modelId);
	if (!model) {
		console.error(`Error: model "${provider}/${modelId}" not found.`);
		console.error("Check --provider and --model values.");
		process.exit(1);
	}
	return model;
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

	const apiKeyOverride = args.apiKey ? { provider: args.provider, apiKey: args.apiKey } : undefined;

	const authStorage = buildAuthStorageFromEnv(apiKeyOverride);

	// Resolve the model from CLI flags before creating the session.
	// We need a temporary ModelRegistry here because createRpcSession requires a
	// resolved Model<Api> object, not raw provider/modelId strings. createRpcSession
	// constructs its own registry internally for session-context resolution — this one
	// is only used for early CLI validation.
	const model = resolveModelFromArgs(args.provider, args.model, authStorage);

	const environment = AgentEnvironment.justBash({
		cwd: args.cwd ?? process.cwd(),
	});

	await runRpcMode({
		authStorage,
		environment,
		systemPrompt: args.systemPrompt ?? "You are a helpful AI assistant.",
		model,
		thinkingLevel: args.thinking,
	});
}
