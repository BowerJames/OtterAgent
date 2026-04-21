import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseCliArgs } from "./args.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../../dist/cli/cli.js");

function runCli(args: string[]): Promise<{ exitCode: number | null; stderr: string }> {
	return new Promise((resolve, reject) => {
		const proc = spawn("node", [cliPath, ...args], {
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stderr = "";
		proc.stderr?.on("data", (data) => {
			stderr += data;
		});
		proc.on("close", (code) => {
			resolve({ exitCode: code, stderr });
		});
		proc.on("error", reject);
	});
}

describe("parseCliArgs", () => {
	const baseArgs = [
		"--provider",
		"anthropic",
		"--model",
		"claude-sonnet-4-5-20250514",
		"--session-manager-config",
		"./sm.yaml",
		"--auth-storage-config",
		"./auth.yaml",
		"--agent-environment-config",
		"./env.yaml",
	];

	test("defaults to rpc mode", () => {
		const args = parseCliArgs(baseArgs);
		expect(args.mode).toBe("rpc");
	});

	test("parses --provider and --model", () => {
		const args = parseCliArgs(baseArgs);
		expect(args.provider).toBe("anthropic");
		expect(args.model).toBe("claude-sonnet-4-5-20250514");
	});

	test("exits when --provider is missing", async () => {
		const { exitCode, stderr } = await runCli([
			"--model",
			"claude-sonnet-4-5-20250514",
			"--session-manager-config",
			"./sm.yaml",
			"--auth-storage-config",
			"./auth.yaml",
			"--agent-environment-config",
			"./env.yaml",
		]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("--provider is required");
	});

	test("exits when --model is missing", async () => {
		const { exitCode, stderr } = await runCli([
			"--provider",
			"anthropic",
			"--session-manager-config",
			"./sm.yaml",
			"--auth-storage-config",
			"./auth.yaml",
			"--agent-environment-config",
			"./env.yaml",
		]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("--model is required");
	});

	test("exits when --session-manager-config is missing", async () => {
		const { exitCode, stderr } = await runCli([
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-5-20250514",
			"--auth-storage-config",
			"./auth.yaml",
			"--agent-environment-config",
			"./env.yaml",
		]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("--session-manager-config is required");
	});

	test("exits when --agent-environment-config is missing", async () => {
		const { exitCode, stderr } = await runCli([
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-5-20250514",
			"--session-manager-config",
			"./sm.yaml",
			"--auth-storage-config",
			"./auth.yaml",
		]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("--agent-environment-config is required");
	});

	test("exits when --api-key and --auth-storage-config are both provided", async () => {
		const { exitCode, stderr } = await runCli([
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-5-20250514",
			"--api-key",
			"sk-test",
			"--session-manager-config",
			"./sm.yaml",
			"--auth-storage-config",
			"./auth.yaml",
			"--agent-environment-config",
			"./env.yaml",
		]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("mutually exclusive");
	});

	test("parses --api-key (without --auth-storage-config)", () => {
		// baseArgs includes --auth-storage-config, so use args without it
		const argsWithoutAuthConfig = [
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-5-20250514",
			"--session-manager-config",
			"./sm.yaml",
			"--agent-environment-config",
			"./env.yaml",
			"--api-key",
			"sk-test-key",
		];
		const args = parseCliArgs(argsWithoutAuthConfig);
		expect(args.apiKey).toBe("sk-test-key");
	});

	test("defaults apiKey to undefined when not provided", () => {
		const args = parseCliArgs(baseArgs);
		expect(args.apiKey).toBeUndefined();
	});

	test("parses --thinking with all valid levels", () => {
		const levels = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
		for (const level of levels) {
			const args = parseCliArgs([...baseArgs, "--thinking", level]);
			expect(args.thinking).toBe(level);
		}
	});

	test("parses --system-prompt", () => {
		const args = parseCliArgs([...baseArgs, "--system-prompt", "You are a helpful assistant."]);
		expect(args.systemPrompt).toBe("You are a helpful assistant.");
	});

	test("parses all three component config flags", () => {
		const args = parseCliArgs(baseArgs);
		expect(args.sessionManagerConfig).toBe("./sm.yaml");
		expect(args.authStorageConfig).toBe("./auth.yaml");
		expect(args.agentEnvironmentConfig).toBe("./env.yaml");
	});

	test("authStorageConfig is undefined when --auth-storage-config is not provided", () => {
		const argsWithoutAuth = [
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-5-20250514",
			"--session-manager-config",
			"./sm.yaml",
			"--agent-environment-config",
			"./env.yaml",
		];
		const args = parseCliArgs(argsWithoutAuth);
		expect(args.authStorageConfig).toBeUndefined();
	});

	test("--cwd flag is not recognised (no cwd field)", () => {
		// --cwd has been removed; passing it is silently ignored (strict: false)
		const args = parseCliArgs([...baseArgs, "--cwd", "/workspace"]);
		expect(args).not.toHaveProperty("cwd");
	});

	test("sets help flag", () => {
		const args = parseCliArgs(["--help"]);
		expect(args.help).toBe(true);
	});

	test("sets version flag", () => {
		const args = parseCliArgs(["--version"]);
		expect(args.version).toBe(true);
	});

	test("returns undefined for unprovided optional fields", () => {
		const args = parseCliArgs(baseArgs);
		expect(args.thinking).toBeUndefined();
		expect(args.systemPrompt).toBeUndefined();
		expect(args.apiKey).toBeUndefined();
	});

	describe("--extension / -e flag", () => {
		test("defaults to empty array when not provided", () => {
			const args = parseCliArgs(baseArgs);
			expect(args.extensions).toEqual([]);
		});

		test("parses a single -e flag", () => {
			const args = parseCliArgs([...baseArgs, "-e", "./ext.json"]);
			expect(args.extensions).toEqual(["./ext.json"]);
		});

		test("parses a single --extension flag", () => {
			const args = parseCliArgs([...baseArgs, "--extension", "./ext.yaml"]);
			expect(args.extensions).toEqual(["./ext.yaml"]);
		});

		test("parses multiple -e flags", () => {
			const args = parseCliArgs([
				...baseArgs,
				"-e",
				"./plan-mode.json",
				"-e",
				"./custom-tools.yaml",
			]);
			expect(args.extensions).toEqual(["./plan-mode.json", "./custom-tools.yaml"]);
		});

		test("parses mixed -e and --extension flags", () => {
			const args = parseCliArgs([
				...baseArgs,
				"-e",
				"./a.json",
				"--extension",
				"./b.yaml",
				"-e",
				"./c.json",
			]);
			expect(args.extensions).toEqual(["./a.json", "./b.yaml", "./c.json"]);
		});

		test("exits when -e is the last argument with no value", async () => {
			const { exitCode, stderr } = await runCli([...baseArgs, "-e"]);
			expect(exitCode).toBe(1);
			expect(stderr).toContain("requires a path argument");
		});

		test("exits when --extension is the last argument with no value", async () => {
			const { exitCode, stderr } = await runCli([...baseArgs, "--extension"]);
			expect(exitCode).toBe(1);
			expect(stderr).toContain("requires a path argument");
		});

		test("extensions are included in help short-circuit", () => {
			const args = parseCliArgs(["--help", "-e", "./ext.json"]);
			expect(args.extensions).toEqual(["./ext.json"]);
		});

		test("extensions are included in version short-circuit", () => {
			const args = parseCliArgs(["--version", "--extension", "./ext.yaml"]);
			expect(args.extensions).toEqual(["./ext.yaml"]);
		});
	});
});
