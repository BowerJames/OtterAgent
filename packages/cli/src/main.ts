import { dirname, resolve } from "node:path";
import { buildAuthStorage } from "@otter-agent/auth-storage-registry";
import type { AgentEnvironment, AuthStorage, SessionManager } from "@otter-agent/core";
import { ModelRegistry } from "@otter-agent/core";
import { buildAgentEnvironment } from "@otter-agent/environment-registry";
import { runRpcMode } from "@otter-agent/rpc";
import { buildSessionManager } from "@otter-agent/session-manager-registry";
import { parseCliArgs, printHelp } from "./args.js";
import { ConfigFileError, parseOtterConfig } from "./config.js";
import type { OtterConfig } from "./config.js";
import { ComponentConfigValidationError, ComponentLoadError } from "./load-component.js";
import { resolveComponentFromReference } from "./load-component.js";
import { loadExtensionsFromReferences } from "./load-extensions.js";

const VERSION = "0.0.1";

/**
 * Resolve a component from a config reference, exiting on error.
 *
 * @param label - Human-readable label for error messages.
 * @param ref - The component reference.
 * @param configDir - Directory of the config file.
 * @param registryBuilder - Registry builder function.
 */
async function resolveComponentOrExit<T>(
	label: string,
	ref: Parameters<typeof resolveComponentFromReference<T>>[0],
	configDir: string,
	registryBuilder: Parameters<typeof resolveComponentFromReference<T>>[2],
): Promise<T> {
	try {
		return await resolveComponentFromReference<T>(ref, configDir, registryBuilder);
	} catch (err) {
		if (err instanceof ComponentConfigValidationError) {
			console.error(`Error: ${label} config validation failed:\n${err.errors.join("\n")}`);
		} else if (err instanceof ComponentLoadError) {
			console.error(`Error: Failed to load ${label}: ${err.message}`);
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

	if (args.command === "help") {
		printHelp();
		process.exit(0);
	}

	if (args.command === "version") {
		console.log(VERSION);
		process.exit(0);
	}

	// Parse the unified config file
	let config: OtterConfig;
	try {
		config = parseOtterConfig(args.configPath);
	} catch (err) {
		if (err instanceof ConfigFileError) {
			console.error(`Error: ${err.message}`);
		} else {
			console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
		}
		process.exit(1);
	}

	const configDir = dirname(resolve(args.configPath));

	// Resolve the three core components
	const environment = await resolveComponentOrExit<AgentEnvironment>(
		"environment",
		config.environment,
		configDir,
		(options) => buildAgentEnvironment(options),
	);

	const sessionManager = await resolveComponentOrExit<SessionManager>(
		"session-manager",
		config["session-manager"],
		configDir,
		(options) => buildSessionManager(options),
	);

	const authStorage = await resolveComponentOrExit<AuthStorage>(
		"auth-storage",
		config["auth-storage"],
		configDir,
		(options) => buildAuthStorage(options),
	);

	// Resolve model
	const modelRegistry = new ModelRegistry(authStorage);
	const model = modelRegistry.find(config.provider, config.model);
	if (!model) {
		console.error(`Error: model "${config.provider}/${config.model}" not found.`);
		console.error('Check "provider" and "model" values in the config file.');
		process.exit(1);
	}

	// Load extensions (non-fatal)
	const extensions = await loadExtensionsFromReferences(config.extensions, configDir);

	// Run in RPC mode
	await runRpcMode({
		environment,
		sessionManager,
		authStorage,
		systemPrompt: config["system-prompt"],
		model,
		thinkingLevel: config["thinking-level"],
		agentOptions: config["agent-options"],
		extensions: extensions.length > 0 ? extensions : undefined,
	});
}
