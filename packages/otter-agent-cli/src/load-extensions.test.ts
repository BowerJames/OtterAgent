import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionTemplate } from "@otter-agent/core";
import { ExtensionConfigValidationError } from "@otter-agent/core";
import {
	ExtensionConfigFileError,
	ExtensionLoadError,
	loadExtensionTemplate,
	loadExtensionsFromConfigFiles,
	parseExtensionConfigFile,
} from "./load-extensions.js";

// Resolve the fixtures directory relative to this test file
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

// Paths to fixture files
const validJsonConfig = resolve(fixturesDir, "valid-extension.json");
const validJsonNoConfig = resolve(fixturesDir, "valid-extension-no-config.json");
const validYamlConfig = resolve(fixturesDir, "valid-extension.yaml");
const validYamlNoConfig = resolve(fixturesDir, "valid-extension-no-config.yaml");
const badJsonConfig = resolve(fixturesDir, "bad-config.json");
const badYamlConfig = resolve(fixturesDir, "bad-config.yaml");
const missingPathConfig = resolve(fixturesDir, "missing-path.json");
const nonExistentFile = resolve(fixturesDir, "does-not-exist.json");
const noExportRefConfig = resolve(fixturesDir, "no-export-ref.json");
const nonExistentPathConfig = resolve(fixturesDir, "non-existent-path.json");
const invalidConfigJson = resolve(fixturesDir, "invalid-config.json");
const unsupportedExt = resolve(fixturesDir, "unsupported.txt");

describe("parseExtensionConfigFile", () => {
	test("parses a valid JSON config file with path and config", () => {
		const entry = parseExtensionConfigFile(validJsonConfig);
		expect(entry.path).toBe("./valid-extension.ts");
		expect(entry.config).toEqual({ apiKey: "sk-test-123", maxRetries: 5 });
	});

	test("parses a valid JSON config file with only path (config defaults to {})", () => {
		const entry = parseExtensionConfigFile(validJsonNoConfig);
		expect(entry.path).toBe("./valid-extension.ts");
		expect(entry.config).toEqual({});
	});

	test("parses a valid YAML config file with path and config", () => {
		const entry = parseExtensionConfigFile(validYamlConfig);
		expect(entry.path).toBe("./valid-extension.ts");
		expect(entry.config).toEqual({ apiKey: "sk-yaml-key", maxRetries: 10 });
	});

	test("parses a valid YAML config file with only path", () => {
		const entry = parseExtensionConfigFile(validYamlNoConfig);
		expect(entry.path).toBe("./valid-extension.ts");
		expect(entry.config).toEqual({});
	});

	test("throws ExtensionConfigFileError for non-existent file", () => {
		expect(() => parseExtensionConfigFile(nonExistentFile)).toThrow(ExtensionConfigFileError);
	});

	test("ExtensionConfigFileError includes the file path for non-existent file", () => {
		try {
			parseExtensionConfigFile(nonExistentFile);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ExtensionConfigFileError);
			const e = err as ExtensionConfigFileError;
			expect(e.filePath).toBe(nonExistentFile);
		}
	});

	test("throws ExtensionConfigFileError for invalid JSON", () => {
		expect(() => parseExtensionConfigFile(badJsonConfig)).toThrow(ExtensionConfigFileError);
	});

	test("throws ExtensionConfigFileError with Invalid JSON message", () => {
		try {
			parseExtensionConfigFile(badJsonConfig);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ExtensionConfigFileError);
			expect((err as ExtensionConfigFileError).message).toContain("Invalid JSON");
		}
	});

	test("throws ExtensionConfigFileError for invalid YAML", () => {
		expect(() => parseExtensionConfigFile(badYamlConfig)).toThrow(ExtensionConfigFileError);
	});

	test("throws ExtensionConfigFileError with Invalid YAML message", () => {
		try {
			parseExtensionConfigFile(badYamlConfig);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ExtensionConfigFileError);
			expect((err as ExtensionConfigFileError).message).toContain("Invalid YAML");
		}
	});

	test("throws ExtensionConfigFileError when path property is missing", () => {
		expect(() => parseExtensionConfigFile(missingPathConfig)).toThrow(ExtensionConfigFileError);
	});

	test("throws ExtensionConfigFileError with missing path message", () => {
		try {
			parseExtensionConfigFile(missingPathConfig);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ExtensionConfigFileError);
			expect((err as ExtensionConfigFileError).message).toContain("path");
		}
	});

	test("throws ExtensionConfigFileError for unsupported file extension", () => {
		expect(() => parseExtensionConfigFile(unsupportedExt)).toThrow(ExtensionConfigFileError);
	});

	test("throws ExtensionConfigFileError with unsupported extension message", () => {
		try {
			parseExtensionConfigFile(unsupportedExt);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ExtensionConfigFileError);
			expect((err as ExtensionConfigFileError).message).toContain("Unsupported file extension");
		}
	});
});

describe("loadExtensionTemplate", () => {
	test("loads a .ts file that default-exports an ExtensionTemplate", async () => {
		const template = await loadExtensionTemplate("./valid-extension.ts", fixturesDir);
		expect(typeof template.configSchema).toBe("function");
		expect(typeof template.defaultConfig).toBe("function");
		expect(typeof template.buildExtension).toBe("function");
	});

	test("resolves relative paths against the config directory", async () => {
		const template = await loadExtensionTemplate("./valid-extension.ts", fixturesDir);
		expect(typeof template.buildExtension).toBe("function");
	});

	test("resolves absolute paths", async () => {
		const absPath = resolve(fixturesDir, "valid-extension.ts");
		const template = await loadExtensionTemplate(absPath, fixturesDir);
		expect(typeof template.buildExtension).toBe("function");
	});

	test("throws ExtensionLoadError when module has no default export", async () => {
		await expect(loadExtensionTemplate("./no-export.ts", fixturesDir)).rejects.toThrow(
			ExtensionLoadError,
		);
	});

	test("ExtensionLoadError message mentions no default export", async () => {
		try {
			await loadExtensionTemplate("./no-export.ts", fixturesDir);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ExtensionLoadError);
			expect((err as ExtensionLoadError).message).toContain("no default export");
		}
	});

	test("throws ExtensionLoadError when file does not exist", async () => {
		await expect(loadExtensionTemplate("./non-existent-template.ts", fixturesDir)).rejects.toThrow(
			ExtensionLoadError,
		);
	});
});

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

	test("returns empty array when no config paths provided", async () => {
		const extensions = await loadExtensionsFromConfigFiles([]);
		expect(extensions).toEqual([]);
	});

	test("throws on a bad config file", async () => {
		await expect(loadExtensionsFromConfigFiles([badJsonConfig])).rejects.toThrow(
			ExtensionConfigFileError,
		);
	});

	test("throws on a template with no default export", async () => {
		await expect(loadExtensionsFromConfigFiles([noExportRefConfig])).rejects.toThrow(
			ExtensionLoadError,
		);
	});

	test("throws on a non-existent template path", async () => {
		await expect(loadExtensionsFromConfigFiles([nonExistentPathConfig])).rejects.toThrow(
			ExtensionLoadError,
		);
	});

	test("throws on a config validation failure", async () => {
		await expect(loadExtensionsFromConfigFiles([invalidConfigJson])).rejects.toThrow(
			ExtensionConfigValidationError,
		);
	});

	test("throws on the first bad extension even when valid ones are also listed", async () => {
		await expect(loadExtensionsFromConfigFiles([badJsonConfig, validJsonConfig])).rejects.toThrow(
			ExtensionConfigFileError,
		);
	});
});
