import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ConfigFileError, parseOtterConfig } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

const validYaml = resolve(fixturesDir, "valid-config.yaml");
const validJson = resolve(fixturesDir, "valid-config.json");
const missingKeys = resolve(fixturesDir, "missing-keys.yaml");
const invalidThinkingLevel = resolve(fixturesDir, "invalid-thinking-level.yaml");
const invalidComponentRefBoth = resolve(fixturesDir, "invalid-component-ref-both.yaml");
const invalidComponentRefNeither = resolve(fixturesDir, "invalid-component-ref-neither.yaml");
const invalidAgentOptions = resolve(fixturesDir, "invalid-agent-options.yaml");
const invalidExtensions = resolve(fixturesDir, "invalid-extensions.yaml");
const nonExistent = resolve(fixturesDir, "does-not-exist.yaml");
const badJson = resolve(fixturesDir, "bad-config.json");
const unsupportedExt = resolve(fixturesDir, "unsupported.txt");

describe("parseOtterConfig", () => {
	test("parses a valid YAML config file", () => {
		const config = parseOtterConfig(validYaml);
		expect(config).toBeDefined();
		expect(config["system-prompt"]).toBe("You are a helpful AI assistant.");
		expect(config.provider).toBe("anthropic");
		expect(config.model).toBe("claude-sonnet-4-5-20250514");
		expect(config["thinking-level"]).toBe("medium");
		expect(config["agent-options"]).toEqual({});
		expect(config.extensions).toHaveLength(2);
	});

	test("parses a valid JSON config file", () => {
		const config = parseOtterConfig(validJson);
		expect(config).toBeDefined();
		expect(config["system-prompt"]).toBe("You are a helpful AI assistant.");
		expect(config.provider).toBe("anthropic");
		expect(config.model).toBe("claude-sonnet-4-5-20250514");
		expect(config["thinking-level"]).toBe("medium");
		expect(config.extensions).toHaveLength(2);
	});

	test("parses environment with name", () => {
		const config = parseOtterConfig(validYaml);
		expect("name" in config.environment).toBe(true);
		if ("name" in config.environment) {
			expect(config.environment.name).toBe("just-bash");
			expect(config.environment.config).toEqual({ cwd: "/tmp" });
		}
	});

	test("parses extension with filepath", () => {
		const config = parseOtterConfig(validYaml);
		const extWithFilepath = config.extensions[1];
		expect("filepath" in extWithFilepath).toBe(true);
		if ("filepath" in extWithFilepath) {
			expect(extWithFilepath.filepath).toBe("./valid-extension.ts");
			expect(extWithFilepath.config).toEqual({ apiKey: "sk-test-123", maxRetries: 5 });
		}
	});

	test("parses extension with name", () => {
		const config = parseOtterConfig(validYaml);
		const extWithName = config.extensions[0];
		expect("name" in extWithName).toBe(true);
		if ("name" in extWithName) {
			expect(extWithName.name).toBe("no-op");
		}
	});

	test("throws ConfigFileError for non-existent file", () => {
		expect(() => parseOtterConfig(nonExistent)).toThrow(ConfigFileError);
	});

	test("throws ConfigFileError for invalid JSON", () => {
		expect(() => parseOtterConfig(badJson)).toThrow(ConfigFileError);
	});

	test("throws ConfigFileError for unsupported extension", () => {
		expect(() => parseOtterConfig(unsupportedExt)).toThrow(ConfigFileError);
	});

	test("ConfigFileError includes filePath", () => {
		try {
			parseOtterConfig(nonExistent);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ConfigFileError);
			expect((err as ConfigFileError).filePath).toBe(nonExistent);
		}
	});

	test("throws ConfigFileError for missing required keys", () => {
		try {
			parseOtterConfig(missingKeys);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ConfigFileError);
			const msg = (err as ConfigFileError).message;
			expect(msg).toContain("Missing required keys");
		}
	});

	test("throws ConfigFileError for invalid thinking-level", () => {
		try {
			parseOtterConfig(invalidThinkingLevel);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ConfigFileError);
			const msg = (err as ConfigFileError).message;
			expect(msg).toContain("thinking-level");
		}
	});

	test("throws ConfigFileError for agent-options that is an array", () => {
		try {
			parseOtterConfig(invalidAgentOptions);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ConfigFileError);
			const msg = (err as ConfigFileError).message;
			expect(msg).toContain("agent-options");
		}
	});

	test("throws ConfigFileError for extensions that is not an array", () => {
		try {
			parseOtterConfig(invalidExtensions);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ConfigFileError);
			const msg = (err as ConfigFileError).message;
			expect(msg).toContain("extensions");
		}
	});

	test("throws ConfigFileError for component reference with both name and filepath", () => {
		try {
			parseOtterConfig(invalidComponentRefBoth);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ConfigFileError);
			const msg = (err as ConfigFileError).message;
			expect(msg).toContain("environment");
			expect(msg).toContain("both");
		}
	});

	test("throws ConfigFileError for component reference with neither name nor filepath", () => {
		try {
			parseOtterConfig(invalidComponentRefNeither);
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ConfigFileError);
			const msg = (err as ConfigFileError).message;
			expect(msg).toContain("environment");
			expect(msg).toContain("neither");
		}
	});
});
