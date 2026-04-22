import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loadExtensionsFromConfigFiles } from "./load-extensions.js";

// Resolve the fixtures directory relative to this test file
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

// Paths to fixture files
const validJsonConfig = resolve(fixturesDir, "valid-extension.json");
const validJsonNoConfig = resolve(fixturesDir, "valid-extension-no-config.json");
const validYamlConfig = resolve(fixturesDir, "valid-extension.yaml");
const validYamlNoConfig = resolve(fixturesDir, "valid-extension-no-config.yaml");
const badJsonConfig = resolve(fixturesDir, "bad-config.json");
const noExportRefConfig = resolve(fixturesDir, "no-export-ref.json");
const nonExistentPathConfig = resolve(fixturesDir, "non-existent-path.json");
const invalidConfigJson = resolve(fixturesDir, "invalid-config.json");

describe("loadExtensionsFromConfigFiles", () => {
	test("successfully loads a single extension", async () => {
		const extensions = await loadExtensionsFromConfigFiles([validJsonConfig]);
		expect(extensions.length).toBe(1);
		expect(typeof extensions[0]).toBe("function");
	});

	test("successfully loads multiple extensions from multiple config files", async () => {
		const extensions = await loadExtensionsFromConfigFiles([validJsonConfig, validYamlConfig]);
		expect(extensions.length).toBe(2);
		for (const ext of extensions) {
			expect(typeof ext).toBe("function");
		}
	});

	test("loads YAML config files", async () => {
		const extensions = await loadExtensionsFromConfigFiles([validYamlConfig]);
		expect(extensions.length).toBe(1);
		expect(typeof extensions[0]).toBe("function");
	});

	test("uses template defaults when config is omitted", async () => {
		const extensions = await loadExtensionsFromConfigFiles([validJsonNoConfig]);
		expect(extensions.length).toBe(1);
		expect(typeof extensions[0]).toBe("function");
	});

	test("uses template defaults when config is omitted (YAML)", async () => {
		const extensions = await loadExtensionsFromConfigFiles([validYamlNoConfig]);
		expect(extensions.length).toBe(1);
		expect(typeof extensions[0]).toBe("function");
	});

	test("returns empty array when no config paths provided", async () => {
		const extensions = await loadExtensionsFromConfigFiles([]);
		expect(extensions).toEqual([]);
	});

	test("skips a bad config file and returns empty array", async () => {
		const extensions = await loadExtensionsFromConfigFiles([badJsonConfig]);
		expect(extensions).toEqual([]);
	});

	test("skips a template with no default export and returns empty array", async () => {
		const extensions = await loadExtensionsFromConfigFiles([noExportRefConfig]);
		expect(extensions).toEqual([]);
	});

	test("skips a non-existent template path and returns empty array", async () => {
		const extensions = await loadExtensionsFromConfigFiles([nonExistentPathConfig]);
		expect(extensions).toEqual([]);
	});

	test("skips a config validation failure and returns empty array", async () => {
		const extensions = await loadExtensionsFromConfigFiles([invalidConfigJson]);
		expect(extensions).toEqual([]);
	});

	test("skips bad extension and returns only valid ones", async () => {
		const extensions = await loadExtensionsFromConfigFiles([badJsonConfig, validJsonConfig]);
		expect(extensions.length).toBe(1);
		expect(typeof extensions[0]).toBe("function");
	});

	test("skips extension with validation failure and returns valid ones", async () => {
		const extensions = await loadExtensionsFromConfigFiles([invalidConfigJson, validJsonConfig]);
		expect(extensions.length).toBe(1);
		expect(typeof extensions[0]).toBe("function");
	});
});
