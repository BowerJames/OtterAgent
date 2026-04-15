import { describe, expect, test } from "vitest";
import { buildAuthStorageFromEnv } from "./auth.js";

describe("buildAuthStorageFromEnv", () => {
	test("reads API keys from environment variables", async () => {
		const originalKey = process.env.ANTHROPIC_API_KEY;
		process.env.ANTHROPIC_API_KEY = "env-key-123";
		try {
			const storage = buildAuthStorageFromEnv();
			expect(await storage.getApiKey("anthropic")).toBe("env-key-123");
		} finally {
			process.env.ANTHROPIC_API_KEY = originalKey;
		}
	});

	test("returns undefined for providers with no env var set", async () => {
		const originalKey = process.env.OPENAI_API_KEY;
		// biome-ignore lint/performance/noDelete: assignment to undefined sets the string "undefined" in Node.js
		delete process.env.OPENAI_API_KEY;
		try {
			const storage = buildAuthStorageFromEnv();
			expect(await storage.getApiKey("openai")).toBeUndefined();
		} finally {
			if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
		}
	});

	test("apiKeyOverride takes precedence over environment variable", async () => {
		const originalKey = process.env.ANTHROPIC_API_KEY;
		process.env.ANTHROPIC_API_KEY = "env-key-123";
		try {
			const storage = buildAuthStorageFromEnv({ provider: "anthropic", apiKey: "cli-key-456" });
			expect(await storage.getApiKey("anthropic")).toBe("cli-key-456");
		} finally {
			process.env.ANTHROPIC_API_KEY = originalKey;
		}
	});

	test("apiKeyOverride adds a key for a provider with no env var", async () => {
		const originalKey = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = undefined;
		try {
			const storage = buildAuthStorageFromEnv({ provider: "openai", apiKey: "cli-key-789" });
			expect(await storage.getApiKey("openai")).toBe("cli-key-789");
		} finally {
			if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
		}
	});

	test("no override and no env vars returns empty storage", async () => {
		const envBackups: Record<string, string | undefined> = {};
		for (const envVar of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) {
			envBackups[envVar] = process.env[envVar];
			delete process.env[envVar];
		}
		try {
			const storage = buildAuthStorageFromEnv();
			expect(await storage.getApiKey("anthropic")).toBeUndefined();
			expect(await storage.getApiKey("openai")).toBeUndefined();
			expect(await storage.getApiKey("google")).toBeUndefined();
		} finally {
			for (const [envVar, value] of Object.entries(envBackups)) {
				if (value !== undefined) process.env[envVar] = value;
			}
		}
	});
});
