/**
 * Provider registration types for the ExtensionsAPI.
 *
 * Simplified from pi-coding-agent — supports API key-based providers only.
 * OAuth and custom streamSimple handlers are not included.
 */
import type { Api, Model } from "@mariozechner/pi-ai";

/** Configuration for a model within a provider. */
export interface ProviderModelConfig {
	/** Model ID (e.g., "claude-sonnet-4-20250514"). */
	id: string;

	/** Display name (e.g., "Claude 4 Sonnet"). */
	name: string;

	/** API type override for this model. */
	api?: Api;

	/** Whether the model supports extended thinking. */
	reasoning: boolean;

	/** Supported input types. */
	input: ("text" | "image")[];

	/** Cost per token (for tracking, can be 0). */
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};

	/** Maximum context window size in tokens. */
	contextWindow: number;

	/** Maximum output tokens. */
	maxTokens: number;

	/** Custom headers for this model. */
	headers?: Record<string, string>;

	/** OpenAI compatibility settings. */
	compat?: Model<Api>["compat"];
}

/** Configuration for registering a provider. */
export interface ProviderConfig {
	/** Base URL for the API endpoint. Required when defining models. */
	baseUrl?: string;

	/** API key or environment variable name. Required when defining models. */
	apiKey?: string;

	/** API type. Required at provider or model level when defining models. */
	api?: Api;

	/** Custom headers to include in requests. */
	headers?: Record<string, string>;

	/** If true, adds Authorization: Bearer header with the resolved API key. */
	authHeader?: boolean;

	/** Models to register. If provided, replaces all existing models for this provider. */
	models?: ProviderModelConfig[];
}
