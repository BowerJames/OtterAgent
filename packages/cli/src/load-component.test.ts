import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ComponentConfigValidationError } from "@otter-agent/core";
import { describe, expect, test } from "vitest";
import {
	ComponentLoadError,
	loadComponentTemplate,
	resolveComponentFromReference,
	resolveTemplatePath,
} from "./load-component.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

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

describe("resolveComponentFromReference", () => {
	test("delegates to registryBuilder for name-based references", async () => {
		const instance = await resolveComponentFromReference(
			{ name: "test-component", config: { foo: "bar" } },
			fixturesDir,
			(options) => {
				expect(options.name).toBe("test-component");
				expect(options.config).toEqual({ foo: "bar" });
				return { built: true } as unknown as SessionManager;
			},
		);
		expect(instance).toEqual({ built: true });
	});

	test("uses empty config when not provided for name-based references", async () => {
		await resolveComponentFromReference({ name: "test-component" }, fixturesDir, (options) => {
			expect(options.config).toEqual({});
			return { built: true } as unknown as SessionManager;
		});
	});

	test("loads and builds from filepath", async () => {
		const instance = await resolveComponentFromReference(
			{ filepath: "./valid-session-manager.ts", config: { label: "from-ref" } },
			fixturesDir,
			() => {
				throw new Error("Should not call registry builder for filepath");
			},
		);
		expect(instance).toBeDefined();
		expect(typeof (instance as { getEntries?: unknown }).getEntries).toBe("function");
	});

	test("uses template defaults when config not provided for filepath", async () => {
		const instance = await resolveComponentFromReference(
			{ filepath: "./valid-session-manager.ts" },
			fixturesDir,
			() => {
				throw new Error("Should not call registry builder for filepath");
			},
		);
		expect(instance).toBeDefined();
	});

	test("throws when registry builder fails", async () => {
		await expect(
			resolveComponentFromReference({ name: "unknown" }, fixturesDir, () => {
				throw new Error("Unknown component: unknown");
			}),
		).rejects.toThrow("Unknown component: unknown");
	});

	test("throws ComponentLoadError for invalid filepath", async () => {
		await expect(
			resolveComponentFromReference({ filepath: "./non-existent.ts" }, fixturesDir, () => {
				throw new Error("Should not call registry builder");
			}),
		).rejects.toThrow(ComponentLoadError);
	});

	test("throws ComponentConfigValidationError for invalid config", async () => {
		await expect(
			resolveComponentFromReference(
				{ filepath: "./valid-extension.ts", config: { maxRetries: "not-a-number" } },
				fixturesDir,
				() => {
					throw new Error("Should not call registry builder");
				},
			),
		).rejects.toThrow(ComponentConfigValidationError);
	});
});

// Type used in tests
interface SessionManager {
	getEntries?: unknown;
}
