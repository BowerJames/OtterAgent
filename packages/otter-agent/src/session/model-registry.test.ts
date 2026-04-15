import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, test, vi } from "vitest";
import type { ProviderConfig, ProviderModelConfig } from "../extension-core/providers.js";
import type { AuthStorage } from "../interfaces/auth-storage.js";
import { ModelRegistry } from "./model-registry.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function createMockAuthStorage(overrides?: Partial<AuthStorage>): AuthStorage {
	return {
		getApiKey: vi.fn(async (provider: string) => {
			if (provider === "openai") return "sk-test-openai";
			if (provider === "anthropic") return "sk-test-anthropic";
			return undefined;
		}),
		...overrides,
	};
}

/** A minimal extension-registered model config. */
function extModel(
	id: string,
	name: string,
	overrides?: Partial<ProviderModelConfig>,
): ProviderModelConfig {
	return {
		id,
		name,
		api: "anthropic-messages",
		...overrides,
	};
}

/** A minimal provider config with models. */
function providerConfig(
	models: ProviderModelConfig[] = [],
	overrides?: Partial<ProviderConfig>,
): ProviderConfig {
	return {
		models,
		...overrides,
	};
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("ModelRegistry", () => {
	test("constructor loads built-in models from pi-ai", () => {
		const registry = new ModelRegistry(createMockAuthStorage());
		const all = registry.getAll();

		// pi-ai should have at least some built-in providers
		expect(all.length).toBeGreaterThan(0);

		// All models should have provider and id
		for (const model of all) {
			expect(model.provider).toBeDefined();
			expect(model.id).toBeDefined();
		}
	});

	test("find returns a model by provider and ID", () => {
		const registry = new ModelRegistry(createMockAuthStorage());
		const all = registry.getAll();
		if (all.length === 0) return;

		const first = all[0];
		const found = registry.find(first.provider, first.id);
		expect(found).toBeDefined();
		expect(found?.id).toBe(first.id);
	});

	test("find returns undefined for unknown model", () => {
		const registry = new ModelRegistry(createMockAuthStorage());
		expect(registry.find("nonexistent", "nope")).toBeUndefined();
	});

	// ─── API Key Resolution ──────────────────────────────────────

	describe("getApiKey", () => {
		test("falls back to AuthStorage when no extension provider is registered", async () => {
			const authStorage = createMockAuthStorage();
			const registry = new ModelRegistry(authStorage);

			const key = await registry.getApiKey("openai");
			expect(key).toBe("sk-test-openai");
			expect(authStorage.getApiKey).toHaveBeenCalledWith("openai");
		});

		test("returns extension provider apiKey directly", async () => {
			const registry = new ModelRegistry(createMockAuthStorage());
			registry.registerProvider("custom", providerConfig([], { apiKey: "custom-key-123" }));

			const key = await registry.getApiKey("custom");
			expect(key).toBe("custom-key-123");
		});

		test("resolves env var names from process.env", async () => {
			const registry = new ModelRegistry(createMockAuthStorage());
			registry.registerProvider("envprovider", providerConfig([], { apiKey: "MY_CUSTOM_KEY" }));

			process.env.MY_CUSTOM_KEY = "resolved-value";
			try {
				const key = await registry.getApiKey("envprovider");
				expect(key).toBe("resolved-value");
			} finally {
				process.env.MY_CUSTOM_KEY = undefined;
			}
		});

		test("returns raw apiKey when it does not look like an env var", async () => {
			const registry = new ModelRegistry(createMockAuthStorage());
			registry.registerProvider("raw", providerConfig([], { apiKey: "not-an-env-var" }));

			const key = await registry.getApiKey("raw");
			expect(key).toBe("not-an-env-var");
		});

		test("env var name not set in environment returns the raw apiKey string", async () => {
			const registry = new ModelRegistry(createMockAuthStorage());
			registry.registerProvider(
				"missingenv",
				providerConfig([], { apiKey: "TOTALLY_MISSING_KEY" }),
			);

			const key = await registry.getApiKey("missingenv");
			// "TOTALLY_MISSING_KEY" looks like an env var but isn't set,
			// so the implementation falls through and returns the raw string.
			expect(key).toBe("TOTALLY_MISSING_KEY");
		});
	});

	// ─── hasAuth ─────────────────────────────────────────────────

	describe("hasAuth", () => {
		test("returns true when API key is available", async () => {
			const registry = new ModelRegistry(createMockAuthStorage());
			const model = registry.find("openai", "gpt-4o");
			if (!model) return; // skip if no built-in openai model

			expect(await registry.hasAuth(model)).toBe(true);
		});

		test("returns false when no API key is available", async () => {
			const registry = new ModelRegistry(createMockAuthStorage());
			// Create a fake model for a provider with no auth
			const fakeModel = {
				id: "fake",
				name: "Fake",
				api: "openai-chat",
				provider: "noauth-provider",
				baseUrl: "",
			} as Model<Api>;

			expect(await registry.hasAuth(fakeModel)).toBe(false);
		});
	});

	// ─── Provider Registration ───────────────────────────────────

	describe("registerProvider with models", () => {
		test("replaces existing models for the provider", () => {
			const registry = new ModelRegistry(createMockAuthStorage());

			// Get count of built-in models for "openai"
			const openaiBefore = registry.getAll().filter((m) => m.provider === "openai");

			registry.registerProvider("openai", providerConfig([extModel("custom-gpt", "Custom GPT")]));

			const openaiAfter = registry.getAll().filter((m) => m.provider === "openai");
			expect(openaiAfter).toHaveLength(1);
			expect(openaiAfter[0].id).toBe("custom-gpt");
			// Built-in count should be restorable (not lost)
			expect(openaiBefore.length).toBeGreaterThan(0);
		});

		test("adds models for a new provider", () => {
			const registry = new ModelRegistry(createMockAuthStorage());

			registry.registerProvider(
				"myprovider",
				providerConfig([extModel("model-a", "Model A"), extModel("model-b", "Model B")]),
			);

			expect(registry.find("myprovider", "model-a")).toBeDefined();
			expect(registry.find("myprovider", "model-b")).toBeDefined();
		});
	});

	describe("registerProvider with only baseUrl", () => {
		test("overrides baseUrl on existing models", () => {
			const registry = new ModelRegistry(createMockAuthStorage());

			// Find a provider that has at least one model
			const all = registry.getAll();
			const existing = all.find((m) => m.provider === "openai" || m.provider === "anthropic");
			if (!existing) return; // skip if no known provider models

			const originalUrl = existing.baseUrl;

			registry.registerProvider(existing.provider, {
				baseUrl: "https://custom.example.com/v1",
			} as ProviderConfig);

			const updated = registry.find(existing.provider, existing.id);
			expect(updated).toBeDefined();
			expect(updated?.baseUrl).toBe("https://custom.example.com/v1");
			expect(updated?.baseUrl).not.toBe(originalUrl);
		});
	});

	// ─── Provider Unregistration ─────────────────────────────────

	describe("unregisterProvider", () => {
		test("removes extension models and restores built-in models", () => {
			const registry = new ModelRegistry(createMockAuthStorage());

			const openaiBefore = registry.getAll().filter((m) => m.provider === "openai");
			if (openaiBefore.length === 0) return;

			// Register extension models
			registry.registerProvider(
				"openai",
				providerConfig([extModel("ext-model", "Extension Model")]),
			);

			expect(registry.getAll().filter((m) => m.provider === "openai")).toHaveLength(1);
			expect(registry.find("openai", "ext-model")).toBeDefined();

			// Unregister
			registry.unregisterProvider("openai");

			const openaiAfter = registry.getAll().filter((m) => m.provider === "openai");
			expect(openaiAfter.map((m) => m.id).sort()).toEqual(openaiBefore.map((m) => m.id).sort());
		});

		test("unregistering a non-registered provider is a no-op", () => {
			const registry = new ModelRegistry(createMockAuthStorage());
			const countBefore = registry.getAll().length;

			registry.unregisterProvider("never-registered");

			expect(registry.getAll().length).toBe(countBefore);
		});
	});

	// ─── Model creation ──────────────────────────────────────────

	describe("model creation", () => {
		test("extension model inherits provider config fields", () => {
			const registry = new ModelRegistry(createMockAuthStorage());

			registry.registerProvider(
				"myprovider",
				providerConfig([extModel("m1", "M1", { contextWindow: 4096, maxTokens: 1024 })], {
					baseUrl: "https://api.example.com",
					headers: { "X-Custom": "value" },
				}),
			);

			const model = registry.find("myprovider", "m1");
			expect(model).toBeDefined();
			expect(model?.baseUrl).toBe("https://api.example.com");
			expect(model?.contextWindow).toBe(4096);
			expect(model?.maxTokens).toBe(1024);
			expect((model?.headers as Record<string, string>)["X-Custom"]).toBe("value");
		});

		test("model-level headers override provider-level headers", () => {
			const registry = new ModelRegistry(createMockAuthStorage());

			registry.registerProvider(
				"myprovider",
				providerConfig([extModel("m1", "M1", { headers: { "X-Model": "override" } })], {
					baseUrl: "https://api.example.com",
					headers: { "X-Model": "provider-level", "X-Common": "yes" },
				}),
			);

			const model = registry.find("myprovider", "m1");
			expect(model).toBeDefined();
			expect((model?.headers as Record<string, string>)["X-Model"]).toBe("override");
			expect((model?.headers as Record<string, string>)["X-Common"]).toBe("yes");
		});
	});
});
