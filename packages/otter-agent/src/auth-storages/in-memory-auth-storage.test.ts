import { describe, expect, test } from "bun:test";
import { InMemoryAuthStorage, createInMemoryAuthStorage } from "./in-memory-auth-storage.js";
import { AuthStorage } from "./index.js";

// ─── createInMemoryAuthStorage ────────────────────────────────────────────────

describe("createInMemoryAuthStorage", () => {
	test("returns the key for a known provider", async () => {
		const auth = createInMemoryAuthStorage({ anthropic: "sk-ant-123" });
		expect(await auth.getApiKey("anthropic")).toBe("sk-ant-123");
	});

	test("returns undefined for an unknown provider", async () => {
		const auth = createInMemoryAuthStorage({ anthropic: "sk-ant-123" });
		expect(await auth.getApiKey("openai")).toBeUndefined();
	});

	test("returns undefined for all providers when created with no keys", async () => {
		const auth = createInMemoryAuthStorage();
		expect(await auth.getApiKey("anthropic")).toBeUndefined();
	});

	test("supports multiple providers", async () => {
		const auth = createInMemoryAuthStorage({
			anthropic: "sk-ant-123",
			openai: "sk-oai-456",
		});
		expect(await auth.getApiKey("anthropic")).toBe("sk-ant-123");
		expect(await auth.getApiKey("openai")).toBe("sk-oai-456");
	});

	test("each call returns an independent instance", async () => {
		const auth1 = createInMemoryAuthStorage({ anthropic: "key-1" });
		const auth2 = createInMemoryAuthStorage({ anthropic: "key-2" });
		expect(await auth1.getApiKey("anthropic")).toBe("key-1");
		expect(await auth2.getApiKey("anthropic")).toBe("key-2");
	});
});

// ─── AuthStorage.inMemory() factory ──────────────────────────────────────────

describe("AuthStorage.inMemory()", () => {
	test("returns a working AuthStorage instance", async () => {
		const auth = AuthStorage.inMemory({ anthropic: "sk-ant-123" });
		expect(await auth.getApiKey("anthropic")).toBe("sk-ant-123");
	});

	test("returns undefined for unknown provider", async () => {
		const auth = AuthStorage.inMemory({ anthropic: "sk-ant-123" });
		expect(await auth.getApiKey("openai")).toBeUndefined();
	});

	test("works with no arguments", async () => {
		const auth = AuthStorage.inMemory();
		expect(await auth.getApiKey("anthropic")).toBeUndefined();
	});

	test("each call returns an independent instance", async () => {
		const auth1 = AuthStorage.inMemory({ anthropic: "key-1" });
		const auth2 = AuthStorage.inMemory({ anthropic: "key-2" });
		expect(await auth1.getApiKey("anthropic")).toBe("key-1");
		expect(await auth2.getApiKey("anthropic")).toBe("key-2");
	});

	test("satisfies the AuthStorage type (type-level check via createInMemoryAuthStorage)", async () => {
		const auth1 = AuthStorage.inMemory();
		const auth2 = createInMemoryAuthStorage();
		expect(typeof auth1.getApiKey).toBe("function");
		expect(typeof auth2.getApiKey).toBe("function");
	});
});

// ─── InMemoryAuthStorage — direct construction & instanceof ─────────────────

describe("InMemoryAuthStorage — direct construction", () => {
	test("can be constructed directly via new", async () => {
		const auth = new InMemoryAuthStorage({ anthropic: "sk-ant-123" });
		expect(await auth.getApiKey("anthropic")).toBe("sk-ant-123");
	});

	test("returns undefined for unknown provider when constructed directly", async () => {
		const auth = new InMemoryAuthStorage({ anthropic: "sk-ant-123" });
		expect(await auth.getApiKey("openai")).toBeUndefined();
	});

	test("instanceof InMemoryAuthStorage is true for direct construction", () => {
		const auth = new InMemoryAuthStorage();
		expect(auth instanceof InMemoryAuthStorage).toBe(true);
	});

	test("instanceof InMemoryAuthStorage is true for factory creation", () => {
		const auth = createInMemoryAuthStorage();
		expect(auth instanceof InMemoryAuthStorage).toBe(true);
	});

	test("instanceof InMemoryAuthStorage is true for namespace factory creation", () => {
		const auth = AuthStorage.inMemory();
		expect(auth instanceof InMemoryAuthStorage).toBe(true);
	});
});
