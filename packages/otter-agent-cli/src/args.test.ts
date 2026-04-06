import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "./args.js";

describe("parseCliArgs", () => {
	test("defaults to rpc mode", () => {
		const args = parseCliArgs([]);
		expect(args.mode).toBe("rpc");
	});

	test("parses --provider and --model", () => {
		const args = parseCliArgs(["--provider", "anthropic", "--model", "claude-sonnet-4-5-20250514"]);
		expect(args.provider).toBe("anthropic");
		expect(args.model).toBe("claude-sonnet-4-5-20250514");
	});

	test("parses --thinking with all valid levels", () => {
		const levels = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
		for (const level of levels) {
			const args = parseCliArgs(["--thinking", level]);
			expect(args.thinking).toBe(level);
		}
	});

	test("parses --system-prompt", () => {
		const args = parseCliArgs(["--system-prompt", "You are a helpful assistant."]);
		expect(args.systemPrompt).toBe("You are a helpful assistant.");
	});

	test("parses --cwd", () => {
		const args = parseCliArgs(["--cwd", "/workspace"]);
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
		const args = parseCliArgs([]);
		expect(args.provider).toBeUndefined();
		expect(args.model).toBeUndefined();
		expect(args.thinking).toBeUndefined();
		expect(args.systemPrompt).toBeUndefined();
		expect(args.cwd).toBeUndefined();
	});
});
