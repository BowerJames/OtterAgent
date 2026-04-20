import type { AgentEnvironment, AuthStorage, SessionManager } from "@otter-agent/core";
import { ModelRegistry } from "@otter-agent/core";
import { parseCliArgs, printHelp } from "./args.js";
import { buildAuthStorageFromEnv } from "./auth.js";
import {
	ComponentConfigFileError,
	ComponentConfigValidationError,
	ComponentLoadError,
	loadComponent,
} from "./load-component.js";
import { loadExtensionsFromConfigFiles } from "./load-extensions.js";
import { runRpcMode } from "./rpc-mode.js";

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

/**
 * Load a component from a config file, exiting on any error.
 *
 * @param configPath - Path to the JSON or YAML config file.
 * @param label - Human-readable label for error messages (e.g. "session manager").
 */
async function loadComponentOrExit<T>(configPath: string, label: string): Promise<T> {
	try {
		return await loadComponent<T>(configPath);
	} catch (err) {
		if (err instanceof ComponentConfigFileError) {
			console.error(`Error: Failed to load ${label} config file "${configPath}": ${err.message}`);
		} else if (err instanceof ComponentLoadError) {
			console.error(`Error: Failed to load ${label} template: ${err.message}`);
		} else if (err instanceof ComponentConfigValidationError) {
			console.error(`Error: ${label} config validation failed:\n${err.errors.join("\n")}`);
		} else {
			console.error(
				`Error: Unexpected failure loading ${label}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		process.exit(1);
	}
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

	// Load the three required components from their config files.
	const [sessionManager, environment] = await Promise.all([
		loadComponentOrExit<SessionManager>(args.sessionManagerConfig, "session manager"),
		loadComponentOrExit<AgentEnvironment>(args.agentEnvironmentConfig, "agent environment"),
	]);

	// Auth storage: either loaded from a config file or built from env vars / --api-key.
	let authStorage: AuthStorage;
	if (args.authStorageConfig) {
		authStorage = await loadComponentOrExit<AuthStorage>(args.authStorageConfig, "auth storage");
	} else {
		const apiKeyOverride = args.apiKey
			? { provider: args.provider, apiKey: args.apiKey }
			: undefined;
		authStorage = buildAuthStorageFromEnv(apiKeyOverride);
	}

	// Resolve the model from CLI flags before creating the session.
	const model = resolveModelFromArgs(args.provider, args.model, authStorage);

	// Load extensions from config files (non-fatal: errors are logged and skipped).
	const extensions = await loadExtensionsFromConfigFiles(args.extensions);

	await runRpcMode({
		authStorage,
		environment,
		sessionManager,
		systemPrompt: args.systemPrompt ?? "You are a helpful AI assistant.",
		model,
		thinkingLevel: args.thinking,
		extensions: extensions.length > 0 ? extensions : undefined,
	});
}
