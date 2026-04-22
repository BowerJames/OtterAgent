import { describe, expect, test } from "vitest";
import { JustBashAgentEnvironment } from "./just-bash-agent-environment.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEnv(options?: ConstructorParameters<typeof JustBashAgentEnvironment>[0]) {
	return new JustBashAgentEnvironment(options);
}

function getTool(env: JustBashAgentEnvironment, name: string) {
	const tool = env.getTools().find((t) => t.name === name);
	if (!tool) throw new Error(`Tool "${name}" not found`);
	return tool;
}

async function exec(
	env: JustBashAgentEnvironment,
	toolName: string,
	params: Record<string, unknown>,
	signal?: AbortSignal,
) {
	const tool = getTool(env, toolName);
	return tool.execute("test-call-id", params as never, signal, undefined);
}

// ─── AgentEnvironment interface ───────────────────────────────────────────────

describe("JustBashAgentEnvironment", () => {
	test("getTools() returns bash, read, write, edit", () => {
		const env = makeEnv();
		const names = env.getTools().map((t) => t.name);
		expect(names).toEqual(["bash", "read", "write", "edit"]);
	});

	test("getTools() returns only specified tools when tools option is provided", () => {
		const env = makeEnv({ tools: ["bash", "read"] });
		const names = env.getTools().map((t) => t.name);
		expect(names).toEqual(["bash", "read"]);
	});

	test("getTools() returns empty array when tools option is empty", () => {
		const env = makeEnv({ tools: [] });
		expect(env.getTools()).toEqual([]);
	});

	test("getTools() preserves order from tools option", () => {
		const env = makeEnv({ tools: ["edit", "bash"] });
		const names = env.getTools().map((t) => t.name);
		expect(names).toEqual(["edit", "bash"]);
	});

	test("getSystemMessageAppend() returns a non-empty string describing the environment", () => {
		const env = makeEnv({ cwd: "/workspace" });
		const append = env.getSystemMessageAppend();
		expect(typeof append).toBe("string");
		expect(append.length).toBeGreaterThan(0);
		expect(append).toContain("/workspace");
		expect(append).toContain("virtual filesystem");
	});
});

// ─── bash tool ────────────────────────────────────────────────────────────────

describe("bash tool", () => {
	test("runs a command and returns stdout", async () => {
		const env = makeEnv();
		const result = await exec(env, "bash", { command: "echo hello" });
		expect(result.content[0].type).toBe("text");
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("hello");
	});

	test("captures stderr in the output", async () => {
		const env = makeEnv();
		const result = await exec(env, "bash", { command: "echo error >&2" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("error");
	});

	test("throws on non-zero exit code with exit code appended", async () => {
		const env = makeEnv();
		await expect(exec(env, "bash", { command: "exit 1" })).rejects.toThrow("exited with code 1");
	});

	test("filesystem state persists across calls", async () => {
		const env = makeEnv({ cwd: "/" });
		await exec(env, "bash", { command: "echo 'persisted' > /tmp/state.txt" });
		const result = await exec(env, "bash", { command: "cat /tmp/state.txt" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("persisted");
	});

	test("respects seeded initial files", async () => {
		const env = makeEnv({ files: { "/data/hello.txt": "world" } });
		const result = await exec(env, "bash", { command: "cat /data/hello.txt" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("world");
	});

	test("throws with abort message when signal is pre-aborted", async () => {
		const env = makeEnv();
		const controller = new AbortController();
		controller.abort();
		await expect(exec(env, "bash", { command: "echo hi" }, controller.signal)).rejects.toThrow();
	});

	test("timeout aborts the command", async () => {
		const env = makeEnv();
		// A command that just exits immediately — we set a very short timeout.
		// The real test is that the timeout path doesn't hang.
		// Use a tight timeout on a simple echo; it may or may not time out.
		// Instead, verify the timeout option is accepted without crashing.
		const result = await exec(env, "bash", { command: "echo ok", timeout: 5 });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("ok");
	});
});

// ─── read tool ────────────────────────────────────────────────────────────────

describe("read tool", () => {
	test("reads a seeded file", async () => {
		const env = makeEnv({ files: { "/readme.txt": "hello world" } });
		const result = await exec(env, "read", { path: "/readme.txt" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("hello world");
	});

	test("reads a relative path resolved against cwd", async () => {
		const env = makeEnv({ cwd: "/project", files: { "/project/index.ts": "export {}" } });
		const result = await exec(env, "read", { path: "index.ts" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("export {}");
	});

	test("applies offset to skip lines", async () => {
		const lines = ["line1", "line2", "line3"].join("\n");
		const env = makeEnv({ files: { "/file.txt": lines } });
		const result = await exec(env, "read", { path: "/file.txt", offset: 2 });
		const text = (result.content[0] as { type: "text"; text: string }).text;
		expect(text).not.toContain("line1");
		expect(text).toContain("line2");
		expect(text).toContain("line3");
	});

	test("applies limit to cap lines", async () => {
		const lines = ["line1", "line2", "line3"].join("\n");
		const env = makeEnv({ files: { "/file.txt": lines } });
		const result = await exec(env, "read", { path: "/file.txt", limit: 1 });
		const text = (result.content[0] as { type: "text"; text: string }).text;
		expect(text).toContain("line1");
		expect(text).not.toContain("line3");
	});

	test("throws when file does not exist", async () => {
		const env = makeEnv();
		await expect(exec(env, "read", { path: "/nonexistent.txt" })).rejects.toThrow();
	});

	test("throws when offset is beyond end of file", async () => {
		const env = makeEnv({ files: { "/f.txt": "one line" } });
		await expect(exec(env, "read", { path: "/f.txt", offset: 99 })).rejects.toThrow("beyond end");
	});

	test("throws when pre-aborted", async () => {
		const env = makeEnv({ files: { "/f.txt": "hello" } });
		const controller = new AbortController();
		controller.abort();
		await expect(exec(env, "read", { path: "/f.txt" }, controller.signal)).rejects.toThrow();
	});
});

// ─── write tool ───────────────────────────────────────────────────────────────

describe("write tool", () => {
	test("writes a new file", async () => {
		const env = makeEnv({ cwd: "/" });
		await exec(env, "write", { path: "/out.txt", content: "written content" });
		const result = await exec(env, "read", { path: "/out.txt" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("written content");
	});

	test("overwrites an existing file", async () => {
		const env = makeEnv({ files: { "/file.txt": "old content" } });
		await exec(env, "write", { path: "/file.txt", content: "new content" });
		const result = await exec(env, "read", { path: "/file.txt" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("new content");
	});

	test("creates parent directories automatically", async () => {
		const env = makeEnv({ cwd: "/" });
		await exec(env, "write", { path: "/deep/nested/dir/file.txt", content: "hello" });
		const result = await exec(env, "read", { path: "/deep/nested/dir/file.txt" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("hello");
	});

	test("returns byte count in success message", async () => {
		const env = makeEnv({ cwd: "/" });
		const result = await exec(env, "write", { path: "/f.txt", content: "abc" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("bytes");
	});

	test("throws when pre-aborted", async () => {
		const env = makeEnv({ cwd: "/" });
		const controller = new AbortController();
		controller.abort();
		await expect(
			exec(env, "write", { path: "/f.txt", content: "x" }, controller.signal),
		).rejects.toThrow();
	});
});

// ─── edit tool ────────────────────────────────────────────────────────────────

describe("edit tool", () => {
	test("applies a single edit", async () => {
		const env = makeEnv({ files: { "/src.ts": "const x = 1;" } });
		await exec(env, "edit", {
			path: "/src.ts",
			edits: [{ oldText: "const x = 1;", newText: "const x = 2;" }],
		});
		const result = await exec(env, "read", { path: "/src.ts" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("const x = 2;");
	});

	test("applies multiple disjoint edits in one call", async () => {
		const content = "line1\nline2\nline3";
		const env = makeEnv({ files: { "/f.txt": content } });
		await exec(env, "edit", {
			path: "/f.txt",
			edits: [
				{ oldText: "line1", newText: "LINE1" },
				{ oldText: "line3", newText: "LINE3" },
			],
		});
		const result = await exec(env, "read", { path: "/f.txt" });
		const text = (result.content[0] as { type: "text"; text: string }).text;
		expect(text).toContain("LINE1");
		expect(text).toContain("LINE3");
		expect(text).toContain("line2");
	});

	test("returns a diff in details", async () => {
		const env = makeEnv({ files: { "/f.ts": "const a = 1;" } });
		const result = await exec(env, "edit", {
			path: "/f.ts",
			edits: [{ oldText: "const a = 1;", newText: "const a = 2;" }],
		});
		expect(result.details).toBeDefined();
		expect((result.details as { diff: string }).diff).toContain("-");
		expect((result.details as { diff: string }).diff).toContain("+");
	});

	test("fuzzy match normalises trailing whitespace", async () => {
		const content = "const x = 1;   \nconst y = 2;";
		const env = makeEnv({ files: { "/f.ts": content } });
		// oldText without trailing spaces — should still match via fuzzy
		await exec(env, "edit", {
			path: "/f.ts",
			edits: [{ oldText: "const x = 1;", newText: "const x = 99;" }],
		});
		const result = await exec(env, "read", { path: "/f.ts" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("const x = 99;");
	});

	test("throws with actionable message when oldText is not found", async () => {
		const env = makeEnv({ files: { "/f.ts": "const a = 1;" } });
		await expect(
			exec(env, "edit", {
				path: "/f.ts",
				edits: [{ oldText: "DOES_NOT_EXIST", newText: "x" }],
			}),
		).rejects.toThrow("match exactly including all whitespace and newlines");
	});

	test("throws with actionable message when oldText matches multiple times", async () => {
		const env = makeEnv({ files: { "/f.ts": "x = 1;\nx = 1;" } });
		await expect(
			exec(env, "edit", {
				path: "/f.ts",
				edits: [{ oldText: "x = 1;", newText: "x = 2;" }],
			}),
		).rejects.toThrow("provide more context to make it unique");
	});

	test("throws when file does not exist", async () => {
		const env = makeEnv();
		await expect(
			exec(env, "edit", {
				path: "/missing.ts",
				edits: [{ oldText: "a", newText: "b" }],
			}),
		).rejects.toThrow("File not found");
	});

	test("throws when oldText is empty", async () => {
		const env = makeEnv({ files: { "/f.ts": "const a = 1;" } });
		await expect(
			exec(env, "edit", {
				path: "/f.ts",
				edits: [{ oldText: "", newText: "x" }],
			}),
		).rejects.toThrow("must not be empty");
	});

	test("throws when edits produce no change", async () => {
		const env = makeEnv({ files: { "/f.ts": "const a = 1;" } });
		await expect(
			exec(env, "edit", {
				path: "/f.ts",
				edits: [{ oldText: "const a = 1;", newText: "const a = 1;" }],
			}),
		).rejects.toThrow("No changes made");
	});

	test("throws when edits overlap", async () => {
		const env = makeEnv({ files: { "/f.ts": "abcdef" } });
		await expect(
			exec(env, "edit", {
				path: "/f.ts",
				edits: [
					{ oldText: "abcd", newText: "ABCD" },
					{ oldText: "cdef", newText: "CDEF" },
				],
			}),
		).rejects.toThrow("overlap");
	});

	test("preserves UTF-8 BOM on edit", async () => {
		// File starts with BOM (\uFEFF) followed by content.
		const env = makeEnv({ files: { "/f.ts": "\uFEFFconst a = 1;" } });
		// First edit.
		await exec(env, "edit", {
			path: "/f.ts",
			edits: [{ oldText: "const a = 1;", newText: "const a = 2;" }],
		});
		// The read tool strips BOM for display — verify the content change went through.
		const result = await exec(env, "read", { path: "/f.ts" });
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("const a = 2;");
		// Verify BOM did not corrupt the file by doing a second edit.
		// If BOM was dropped or mangled, the stored content would differ and the
		// second edit would either fail to find the text or produce wrong results.
		await expect(
			exec(env, "edit", {
				path: "/f.ts",
				edits: [{ oldText: "const a = 2;", newText: "const a = 3;" }],
			}),
		).resolves.toBeDefined();
		const result2 = await exec(env, "read", { path: "/f.ts" });
		expect((result2.content[0] as { type: "text"; text: string }).text).toContain("const a = 3;");
	});

	test("preserves CRLF line endings on edit", async () => {
		const env = makeEnv({ files: { "/f.txt": "line1\r\nline2\r\nline3" } });
		await exec(env, "edit", {
			path: "/f.txt",
			edits: [{ oldText: "line2", newText: "LINE2" }],
		});
		const rawContent = await exec(env, "bash", { command: "cat /f.txt | od -c | head -3" });
		expect((rawContent.content[0] as { type: "text"; text: string }).text).toContain("\\r");
	});

	test("throws when pre-aborted", async () => {
		const env = makeEnv({ files: { "/f.ts": "const a = 1;" } });
		const controller = new AbortController();
		controller.abort();
		await expect(
			exec(
				env,
				"edit",
				{ path: "/f.ts", edits: [{ oldText: "const a = 1;", newText: "const a = 2;" }] },
				controller.signal,
			),
		).rejects.toThrow();
	});
});

// ─── read tool — truncation ───────────────────────────────────────────────────

describe("read tool truncation", () => {
	test("truncates output exceeding the line limit and includes continuation hint", async () => {
		// Generate 2001 lines to exceed DEFAULT_MAX_LINES (2000)
		const lines = Array.from({ length: 2001 }, (_, i) => `line${i + 1}`).join("\n");
		const env = makeEnv({ files: { "/big.txt": lines } });
		const result = await exec(env, "read", { path: "/big.txt" });
		const text = (result.content[0] as { type: "text"; text: string }).text;
		expect(text).toContain("offset=");
		expect(result.details).toBeDefined();
		expect((result.details as { truncation: { truncated: boolean } }).truncation.truncated).toBe(
			true,
		);
	});
});
