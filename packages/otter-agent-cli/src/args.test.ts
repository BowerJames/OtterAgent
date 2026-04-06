import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "./args.js";

describe("parseCliArgs", () => {
	const baseArgs = ["--provider", "anthropic", "--model", "claude-sonnet-4-5-20250514"];

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
		const cliPath = new URL("../dist/cli.js", import.meta.url).pathname;
		const proc = Bun.spawn(["bun", "run", cliPath, "--model", "claude-sonnet-4-5-20250514"], {
			stderr: "pipe",
		});
		await proc.exited;
		expect(proc.exitCode).toBe(1);
		const stderr = await new Response(proc.stderr).text();
		expect(stderr).toContain("--provider is required");
	});

	test("exits when --model is missing", async () => {
		const cliPath = new URL("../dist/cli.js", import.meta.url).pathname;
		const proc = Bun.spawn(["bun", "run", cliPath, "--provider", "anthropic"], {
			stderr: "pipe",
		});
		await proc.exited;
		expect(proc.exitCode).toBe(1);
		const stderr = await new Response(proc.stderr).text();
		expect(stderr).toContain("--model is required");
	});

	test("parses --api-key", () => {
		const args = parseCliArgs([...baseArgs, "--api-key", "sk-test-key"]);
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

	test("parses --cwd", () => {
		const args = parseCliArgs([...baseArgs, "--cwd", "/workspace"]);
		expect(args.cwd).toBe("/workspace");
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
		expect(args.cwd).toBeUndefined();
		expect(args.apiKey).toBeUndefined();
	});
});
