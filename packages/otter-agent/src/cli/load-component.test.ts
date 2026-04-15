import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ComponentConfigValidationError } from "../index.js";
import {
	ComponentConfigFileError,
	ComponentLoadError,
	loadComponent,
	loadComponentTemplate,
	parseComponentConfigFile,
	resolveTemplatePath,
} from "./load-component.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

const validSmJson = resolve(fixturesDir, "valid-session-manager.json");
const badJsonConfig = resolve(fixturesDir, "bad-config.json");
const missingPathConfig = resolve(fixturesDir, "missing-path.json");
const nonExistentFile = resolve(fixturesDir, "does-not-exist.json");
const noExportRefConfig = resolve(fixturesDir, "no-export-ref.json");
const nonExistentPathConfig = resolve(fixturesDir, "non-existent-path.json");
const unsupportedExt = resolve(fixturesDir, "unsupported.txt");

describe("parseComponentConfigFile", () => {
	test("parses a valid JSON config file", () => {
		const entry = parseComponentConfigFile(validSmJson);
		expect(entry.path).toBe("./valid-session-manager.ts");
		expect(entry.config).toEqual({ label: "test-session" });
	});

	test("throws ComponentConfigFileError for non-existent file", () => {
		expect(() => parseComponentConfigFile(nonExistentFile)).toThrow(ComponentConfigFileError);
	});

	test("throws ComponentConfigFileError for invalid JSON", () => {
		expect(() => parseComponentConfigFile(badJsonConfig)).toThrow(ComponentConfigFileError);
	});

	test("throws ComponentConfigFileError for missing path", () => {
		expect(() => parseComponentConfigFile(missingPathConfig)).toThrow(ComponentConfigFileError);
	});

	test("throws ComponentConfigFileError for unsupported extension", () => {
		expect(() => parseComponentConfigFile(unsupportedExt)).toThrow(ComponentConfigFileError);
	});

	test("ComponentConfigFileError includes filePath", () => {
		try {
			parseComponentConfigFile(nonExistentFile);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ComponentConfigFileError);
			expect((err as ComponentConfigFileError).filePath).toBe(nonExistentFile);
		}
	});
});

describe("resolveTemplatePath", () => {
	test("resolves relative paths against configDir", () => {
		const resolved = resolveTemplatePath("./foo.ts", "/some/dir");
		expect(resolved).toBe("/some/dir/foo.ts");
	});

	test("returns absolute paths unchanged", () => {
		const resolved = resolveTemplatePath("/abs/path/foo.ts", "/some/dir");
		expect(resolved).toBe("/abs/path/foo.ts");
	});

	test("returns package specifiers unchanged", () => {
		const resolved = resolveTemplatePath(
			"@otter-agent/core/dist/session-managers/sqlite-session-manager.js",
			"/some/dir",
		);
		expect(resolved).toBe("@otter-agent/core/dist/session-managers/sqlite-session-manager.js");
	});

	test("returns bare package names unchanged", () => {
		const resolved = resolveTemplatePath("my-package/index.js", "/some/dir");
		expect(resolved).toBe("my-package/index.js");
	});

	test("resolves parent-relative paths against configDir", () => {
		const resolved = resolveTemplatePath("../sibling/foo.ts", "/some/dir");
		expect(resolved).toBe("/some/sibling/foo.ts");
	});

	test("resolves deeply nested relative paths", () => {
		const resolved = resolveTemplatePath("./sub/dir/template.ts", "/base/config");
		expect(resolved).toBe("/base/config/sub/dir/template.ts");
	});
});

describe("loadComponentTemplate", () => {
	test("loads a valid ComponentTemplate from a .ts file", async () => {
		const template = await loadComponentTemplate("./valid-session-manager.ts", fixturesDir);
		expect(typeof template.configSchema).toBe("function");
		expect(typeof template.defaultConfig).toBe("function");
		expect(typeof template.build).toBe("function");
	});

	test("resolves absolute path", async () => {
		const absPath = resolve(fixturesDir, "valid-session-manager.ts");
		const template = await loadComponentTemplate(absPath, fixturesDir);
		expect(typeof template.build).toBe("function");
	});

	test("throws ComponentLoadError when module has no default export", async () => {
		await expect(loadComponentTemplate("./no-export.ts", fixturesDir)).rejects.toThrow(
			ComponentLoadError,
		);
	});

	test("throws ComponentLoadError when file does not exist", async () => {
		await expect(loadComponentTemplate("./non-existent-template.ts", fixturesDir)).rejects.toThrow(
			ComponentLoadError,
		);
	});

	test("ComponentLoadError message mentions no default export", async () => {
		try {
			await loadComponentTemplate("./no-export.ts", fixturesDir);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ComponentLoadError);
			expect((err as ComponentLoadError).message).toContain("no default export");
		}
	});
});

describe("loadComponent", () => {
	test("loads and builds a component from a JSON config", async () => {
		const instance = await loadComponent(validSmJson);
		expect(instance).toBeDefined();
		// The fixture builds an InMemorySessionManager — check a known method
		expect(typeof (instance as { getEntries?: unknown }).getEntries).toBe("function");
	});

	test("throws ComponentConfigFileError for bad config file", async () => {
		await expect(loadComponent(badJsonConfig)).rejects.toThrow(ComponentConfigFileError);
	});

	test("throws ComponentLoadError for missing template", async () => {
		await expect(loadComponent(nonExistentPathConfig)).rejects.toThrow(ComponentLoadError);
	});

	test("throws ComponentLoadError for no-export template reference", async () => {
		await expect(loadComponent(noExportRefConfig)).rejects.toThrow(ComponentLoadError);
	});
});
