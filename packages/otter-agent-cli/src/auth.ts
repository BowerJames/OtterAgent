import type { AuthStorage } from "@otter-agent/core";
import { createInMemoryAuthStorage } from "@otter-agent/core";

/**
 * Standard environment variable names for LLM provider API keys.
 * Keyed by provider identifier as used in pi-ai/ModelRegistry.
 */
export const PROVIDER_ENV_VARS: Record<string, string> = {
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
 *
 * If `apiKeyOverride` is provided, it is merged into the keys map after
 * env vars are read, so it takes precedence for the given provider.
 */
export function buildAuthStorageFromEnv(apiKeyOverride?: {
	provider: string;
	apiKey: string;
}): AuthStorage {
	const keys: Record<string, string> = {};
	for (const [provider, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
		const value = process.env[envVar];
		if (value) {
			keys[provider] = value;
		}
	}
	if (apiKeyOverride) {
		keys[apiKeyOverride.provider] = apiKeyOverride.apiKey;
	}
	return createInMemoryAuthStorage(keys);
}
