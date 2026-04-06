import { describe, expect, test } from "bun:test";
import { UIProvider } from "./index.js";
import { createNoOpUIProvider } from "./no-op-ui-provider.js";

// ─── createNoOpUIProvider ─────────────────────────────────────────────────────

describe("createNoOpUIProvider", () => {
	test("dialog resolves without error", async () => {
		const ui = createNoOpUIProvider();
		await expect(ui.dialog("Title", "Body")).resolves.toBeUndefined();
	});

	test("confirm returns false", async () => {
		const ui = createNoOpUIProvider();
		await expect(ui.confirm("Title", "Body")).resolves.toBe(false);
	});

	test("input returns undefined", async () => {
		const ui = createNoOpUIProvider();
		await expect(ui.input("Title", "placeholder")).resolves.toBeUndefined();
	});

	test("input returns undefined when called without placeholder", async () => {
		const ui = createNoOpUIProvider();
		await expect(ui.input("Title")).resolves.toBeUndefined();
	});

	test("select returns undefined", async () => {
		const ui = createNoOpUIProvider();
		await expect(ui.select("Title", ["a", "b", "c"])).resolves.toBeUndefined();
	});

	test("notify does not throw", () => {
		const ui = createNoOpUIProvider();
		expect(() => ui.notify("message")).not.toThrow();
	});

	test("notify with type does not throw", () => {
		const ui = createNoOpUIProvider();
		expect(() => ui.notify("message", "warning")).not.toThrow();
	});

	test("each call returns an independent instance", () => {
		const ui1 = createNoOpUIProvider();
		const ui2 = createNoOpUIProvider();
		expect(ui1).not.toBe(ui2);
	});
});

// ─── UIProvider.noOp() factory ────────────────────────────────────────────────

describe("UIProvider.noOp()", () => {
	test("dialog resolves without error", async () => {
		const ui = UIProvider.noOp();
		await expect(ui.dialog("Title", "Body")).resolves.toBeUndefined();
	});

	test("confirm returns false", async () => {
		const ui = UIProvider.noOp();
		await expect(ui.confirm("Title", "Body")).resolves.toBe(false);
	});

	test("input returns undefined", async () => {
		const ui = UIProvider.noOp();
		await expect(ui.input("Title", "placeholder")).resolves.toBeUndefined();
	});

	test("select returns undefined", async () => {
		const ui = UIProvider.noOp();
		await expect(ui.select("Title", ["a", "b"])).resolves.toBeUndefined();
	});

	test("notify does not throw", () => {
		const ui = UIProvider.noOp();
		expect(() => ui.notify("message")).not.toThrow();
	});

	test("each call returns an independent instance", () => {
		const ui1 = UIProvider.noOp();
		const ui2 = UIProvider.noOp();
		expect(ui1).not.toBe(ui2);
	});
});
