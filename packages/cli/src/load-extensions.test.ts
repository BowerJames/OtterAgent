import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loadExtensionsFromReferences } from "./load-extensions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

describe("loadExtensionsFromReferences", () => {
	test("loads a single extension by filepath", async () => {
		const extensions = await loadExtensionsFromReferences(
			[{ filepath: "./valid-extension.ts", config: { apiKey: "test", maxRetries: 3 } }],
			fixturesDir,
		);
		expect(extensions.length).toBe(1);
		expect(typeof extensions[0]).toBe("function");
	});

	test("loads a single extension by name from registry", async () => {
		const extensions = await loadExtensionsFromReferences([{ name: "no-op" }], fixturesDir);
		expect(extensions.length).toBe(1);
		expect(typeof extensions[0]).toBe("function");
	});

	test("loads multiple extensions mixing name and filepath", async () => {
		const extensions = await loadExtensionsFromReferences(
			[
				{ name: "no-op" },
				{ filepath: "./valid-extension.ts", config: { apiKey: "test", maxRetries: 3 } },
			],
			fixturesDir,
		);
		expect(extensions.length).toBe(2);
		for (const ext of extensions) {
			expect(typeof ext).toBe("function");
		}
	});

	test("returns empty array for empty references", async () => {
		const extensions = await loadExtensionsFromReferences([], fixturesDir);
		expect(extensions).toEqual([]);
	});

	test("skips invalid filepath and returns empty array", async () => {
		const extensions = await loadExtensionsFromReferences(
			[{ filepath: "./non-existent.ts" }],
			fixturesDir,
		);
		expect(extensions).toEqual([]);
	});

	test("skips unknown registry name and returns empty array", async () => {
		const extensions = await loadExtensionsFromReferences(
			[{ name: "does-not-exist" }],
			fixturesDir,
		);
		expect(extensions).toEqual([]);
	});

	test("skips invalid config and returns empty array", async () => {
		const extensions = await loadExtensionsFromReferences(
			[{ filepath: "./valid-extension.ts", config: { maxRetries: "not-a-number" } }],
			fixturesDir,
		);
		expect(extensions).toEqual([]);
	});

	test("skips bad extension and returns only valid ones", async () => {
		const extensions = await loadExtensionsFromReferences(
			[{ filepath: "./non-existent.ts" }, { name: "no-op" }],
			fixturesDir,
		);
		expect(extensions.length).toBe(1);
		expect(typeof extensions[0]).toBe("function");
	});

	test("skips config validation failure and returns valid ones", async () => {
		const extensions = await loadExtensionsFromReferences(
			[{ filepath: "./valid-extension.ts", config: { maxRetries: "bad" } }, { name: "no-op" }],
			fixturesDir,
		);
		expect(extensions.length).toBe(1);
		expect(typeof extensions[0]).toBe("function");
	});
});
