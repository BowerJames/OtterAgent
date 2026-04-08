/**
 * Model registry — manages built-in and extension-registered models,
 * provides API key resolution via AuthStorage.
 *
 * Built-in models are loaded from pi-ai at construction. Extensions
 * can register additional providers/models dynamically.
 */
import { type Api, type Model, getModels, getProviders } from "@mariozechner/pi-ai";
import type { ProviderConfig, ProviderModelConfig } from "../extension-core/providers.js";
import type { AuthStorage } from "../interfaces/auth-storage.js";

export class ModelRegistry {
	private readonly _authStorage: AuthStorage;
	private _models: Map<string, Model<Api>> = new Map();
	private _registeredProviders: Map<string, ProviderConfig> = new Map();
	/** Snapshot of built-in models for restore on unregister. */
	private readonly _builtInModels: Map<string, Model<Api>>;

	constructor(authStorage: AuthStorage) {
		this._authStorage = authStorage;
		this._builtInModels = this._loadBuiltInModels();
		this._models = new Map(this._builtInModels);
	}

	/** Get all available models. */
	getAll(): Model<Api>[] {
		return [...this._models.values()];
	}

	/** Find a model by provider and ID. */
	find(provider: string, modelId: string): Model<Api> | undefined {
		return this._models.get(this._key(provider, modelId));
	}

	/** Get API key for a provider. */
	async getApiKey(provider: string): Promise<string | undefined> {
		// Check extension-registered provider config first
		const config = this._registeredProviders.get(provider);
		if (config?.apiKey) {
			// If it looks like an env var name (all caps, underscores), resolve it
			if (/^[A-Z_]+$/.test(config.apiKey)) {
				const envVal = process.env[config.apiKey];
				if (envVal) return envVal;
			}
			return config.apiKey;
		}
		// Fall back to AuthStorage
		return this._authStorage.getApiKey(provider);
	}

	/** Check if a model has auth configured (without refreshing tokens). */
	async hasAuth(model: Model<Api>): Promise<boolean> {
		const key = await this.getApiKey(model.provider);
		return key !== undefined;
	}

	/**
	 * Register or override a model provider.
	 *
	 * If `models` is provided, replaces all existing models for this provider.
	 * If only `baseUrl` is provided, overrides the URL for existing models.
	 */
	registerProvider(name: string, config: ProviderConfig): void {
		this._registeredProviders.set(name, config);

		if (config.models) {
			// Remove existing models for this provider
			for (const [key, model] of this._models) {
				if (model.provider === name) {
					this._models.delete(key);
				}
			}
			// Add new models
			for (const modelConfig of config.models) {
				const model = this._createModel(name, modelConfig, config);
				this._models.set(this._key(name, model.id), model);
			}
		} else if (config.baseUrl) {
			// Override baseUrl for existing models
			for (const [key, model] of this._models) {
				if (model.provider === name) {
					this._models.set(key, { ...model, baseUrl: config.baseUrl });
				}
			}
		}
	}

	/**
	 * Unregister a previously registered provider.
	 * Removes extension models and restores built-in models for this provider.
	 */
	unregisterProvider(name: string): void {
		if (!this._registeredProviders.has(name)) return;
		this._registeredProviders.delete(name);

		// Remove all models for this provider
		for (const [key, model] of this._models) {
			if (model.provider === name) {
				this._models.delete(key);
			}
		}

		// Restore built-in models for this provider
		for (const [key, model] of this._builtInModels) {
			if (model.provider === name) {
				this._models.set(key, model);
			}
		}
	}

	private _key(provider: string, modelId: string): string {
		return `${provider}:${modelId}`;
	}

	private _loadBuiltInModels(): Map<string, Model<Api>> {
		const models = new Map<string, Model<Api>>();
		for (const provider of getProviders()) {
			for (const model of getModels(provider)) {
				models.set(this._key(model.provider, model.id), model as Model<Api>);
			}
		}
		return models;
	}

	private _createModel(
		providerName: string,
		config: ProviderModelConfig,
		providerConfig: ProviderConfig,
	): Model<Api> {
		return {
			id: config.id,
			name: config.name,
			api: (config.api ?? providerConfig.api ?? "anthropic-messages") as Api,
			provider: providerName,
			baseUrl: providerConfig.baseUrl ?? "",
			reasoning: config.reasoning,
			input: config.input,
			cost: config.cost,
			contextWindow: config.contextWindow,
			maxTokens: config.maxTokens,
			headers: { ...providerConfig.headers, ...config.headers },
			compat: config.compat,
		};
	}
}
