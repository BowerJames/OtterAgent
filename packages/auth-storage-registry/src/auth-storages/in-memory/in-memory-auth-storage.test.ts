import { describe, expect, test } from "vitest";
import { InMemoryAuthStorage } from "./index.js";

// ─── InMemoryAuthStorage — direct construction ─────────────────────────

describe("InMemoryAuthStorage", () => {
	test("returns the key for a known provider", async () => {
		const auth = new InMemoryAuthStorage({ anthropic: "sk-ant-123" });
		expect(await auth.getApiKey("anthropic")).toBe("sk-ant-123");
	});

	test("returns undefined for an unknown provider", async () => {
		const auth = new InMemoryAuthStorage({ anthropic: "sk-ant-123" });
		expect(await auth.getApiKey("openai")).toBeUndefined();
	});

	test("returns undefined for all providers when created with no keys", async () => {
		const auth = new InMemoryAuthStorage();
		expect(await auth.getApiKey("anthropic")).toBeUndefined();
	});

	test("supports multiple providers", async () => {
		const auth = new InMemoryAuthStorage({
			anthropic: "sk-ant-123",
			openai: "sk-oai-456",
		});
		expect(await auth.getApiKey("anthropic")).toBe("sk-ant-123");
		expect(await auth.getApiKey("openai")).toBe("sk-oai-456");
	});

	test("each instance is independent", async () => {
		const auth1 = new InMemoryAuthStorage({ anthropic: "key-1" });
		const auth2 = new InMemoryAuthStorage({ anthropic: "key-2" });
		expect(await auth1.getApiKey("anthropic")).toBe("key-1");
		expect(await auth2.getApiKey("anthropic")).toBe("key-2");
	});

	test("instanceof InMemoryAuthStorage is true for direct construction", () => {
		const auth = new InMemoryAuthStorage();
		expect(auth instanceof InMemoryAuthStorage).toBe(true);
	});
});
