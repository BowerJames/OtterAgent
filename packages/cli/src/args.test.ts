import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseCliArgs } from "./args.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../dist/cli.js");

function runCli(
	args: string[],
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
	return new Promise((res, reject) => {
		const proc = spawn("node", [cliPath, ...args], {
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		proc.stdout?.on("data", (data) => {
			stdout += data;
		});
		proc.stderr?.on("data", (data) => {
			stderr += data;
		});
		proc.on("close", (code) => {
			res({ exitCode: code, stdout, stderr });
		});
		proc.on("error", reject);
	});
}

describe("parseCliArgs", () => {
	test("parses run with --config and mode", () => {
		const args = parseCliArgs(["run", "--config", "./config.yaml", "rpc"]);
		expect(args).toEqual({ command: "run", configPath: "./config.yaml", mode: "rpc" });
	});

	test("run defaults mode to rpc", () => {
		const args = parseCliArgs(["run", "--config", "./config.yaml"]);
		expect(args).toEqual({ command: "run", configPath: "./config.yaml", mode: "rpc" });
	});

	test("run with json config", () => {
		const args = parseCliArgs(["run", "--config", "./config.json"]);
		expect(args).toEqual({ command: "run", configPath: "./config.json", mode: "rpc" });
	});

	test("--help returns help command", () => {
		const args = parseCliArgs(["--help"]);
		expect(args).toEqual({ command: "help" });
	});

	test("-h returns help command", () => {
		const args = parseCliArgs(["-h"]);
		expect(args).toEqual({ command: "help" });
	});

	test("help returns help command", () => {
		const args = parseCliArgs(["help"]);
		expect(args).toEqual({ command: "help" });
	});

	test("--version returns version command", () => {
		const args = parseCliArgs(["--version"]);
		expect(args).toEqual({ command: "version" });
	});

	test("-v returns version command", () => {
		const args = parseCliArgs(["-v"]);
		expect(args).toEqual({ command: "version" });
	});

	test("version returns version command", () => {
		const args = parseCliArgs(["version"]);
		expect(args).toEqual({ command: "version" });
	});

	test("exits when run has no --config", async () => {
		const { exitCode, stderr } = await runCli(["run"]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("--config");
	});

	test("exits for unknown subcommand", async () => {
		const { exitCode, stderr } = await runCli(["bogus"]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("unknown command");
	});

	test("exits for unknown flags", async () => {
		const { exitCode, stderr } = await runCli(["run", "--bogus"]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Unknown option");
	});

	test("exits for unsupported mode", async () => {
		const { exitCode, stderr } = await runCli(["run", "--config", "./config.yaml", "web"]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("unsupported mode");
	});

	test("--version prints version", async () => {
		const { exitCode, stdout } = await runCli(["--version"]);
		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe("0.0.1");
	});

	test("--help prints usage", async () => {
		const { exitCode, stdout } = await runCli(["--help"]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Usage:");
		expect(stdout).toContain("run --config");
	});

	test("no args prints usage", async () => {
		const { exitCode, stdout } = await runCli([]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Usage:");
	});
});
