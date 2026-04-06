#!/usr/bin/env bun
/**
 * RPC REPL — interactive multi-turn conversation with the otter agent.
 *
 * Spawns the `otter` CLI binary and communicates over JSONL stdin/stdout.
 * Provides a terminal REPL for sending prompts, viewing streamed responses,
 * tool calls, and extension UI requests.
 *
 * Usage:
 *   bun scripts/rpc-repl.ts --provider anthropic --model claude-sonnet-4-5-20250514
 *   bun scripts/rpc-repl.ts --provider openai --model gpt-4o --thinking high
 *   bun scripts/rpc-repl.ts --provider anthropic --model claude-sonnet-4-5-20250514 --show-events message_update,tool_execution_start
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

// ─── ANSI helpers (no external deps) ──────────────────────────────────

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ─── Default event set ───────────────────────────────────────────────

const DEFAULT_EVENTS = new Set([
	"agent_start",
	"agent_end",
	"message_start",
	"message_end",
	"message_update",
	"tool_execution_start",
	"tool_execution_end",
	"state_change",
]);

/** All known event types (shown in --help). */
const ALL_EVENT_NAMES = [
	"agent_start",
	"agent_end",
	"turn_start",
	"turn_end",
	"message_start",
	"message_update",
	"message_end",
	"tool_execution_start",
	"tool_execution_update",
	"tool_execution_end",
	"compaction_start",
	"compaction_end",
	"state_change",
	"session_start",
	"session_shutdown",
];

// ─── Args ─────────────────────────────────────────────────────────────

function printHelp(): void {
	const help = `
${bold("otter RPC REPL — interactive multi-turn conversation")}

${bold("Usage:")}
  bun scripts/rpc-repl.ts [options]

${bold("Options:")}
  --provider <name>         LLM provider (e.g. anthropic, openai, google). Required.
  --model <id>              Model ID (e.g. claude-sonnet-4-5-20250514). Required.
  --api-key <key>           API key. Overrides environment variable.
  --thinking <level>        Thinking level: off, minimal, low, medium, high, xhigh.
  --system-prompt <text>    Base system prompt.
  --cwd <path>              Working directory for the agent environment.
  --show-events <list>      Comma-separated list of events to display (whitelist).
                            By default shows: ${Array.from(DEFAULT_EVENTS).join(", ")}
                            Available: ${ALL_EVENT_NAMES.join(", ")}
  --help                    Show this help message.

${bold("REPL commands:")}
  /help                     Show this help message
  /state                    Show current session state
  /commands                 List available slash commands
  /shutdown                 Gracefully shut down the agent
  Ctrl+C                    Send shutdown (first time), force-kill (second time)
`.trim();
	console.log(help);
}

interface ReplArgs {
	provider: string;
	model: string;
	apiKey?: string;
	thinking?: string;
	systemPrompt?: string;
	cwd?: string;
	showEvents: Set<string> | null; // null = use defaults
	help: boolean;
}

function parseArgs(argv: string[]): ReplArgs {
	const args: ReplArgs = {
		provider: "",
		model: "",
		showEvents: null,
		help: false,
	};

	for (let i = 0; i < argv.length; i++) {
		switch (argv[i]) {
			case "--provider":
				args.provider = argv[++i] ?? "";
				break;
			case "--model":
				args.model = argv[++i] ?? "";
				break;
			case "--api-key":
				args.apiKey = argv[++i];
				break;
			case "--thinking":
				args.thinking = argv[++i];
				break;
			case "--system-prompt":
				args.systemPrompt = argv[++i];
				break;
			case "--cwd":
				args.cwd = argv[++i];
				break;
			case "--show-events":
				args.showEvents = new Set(argv[++i]?.split(",").map((s) => s.trim()));
				break;
			case "--help":
				args.help = true;
				break;
			default:
				console.error(red(`Unknown option: ${argv[i]}`));
				process.exit(1);
		}
	}

	return args;
}

// ─── JSONL reader (LF-only, no readline dependency) ──────────────────

function attachJsonlReader(
	stream: NodeJS.ReadableStream,
	onLine: (line: string) => void,
): () => void {
	let buffer = "";

	const onData = (chunk: Buffer | string): void => {
		buffer += typeof chunk === "string" ? chunk : String(chunk);
		while (true) {
			const idx = buffer.indexOf("\n");
			if (idx === -1) return;
			const line = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 1);
			if (line.length > 0) onLine(line);
		}
	};

	stream.on("data", onData);
	return () => {
		stream.off("data", onData);
	};
}

// ─── Formatting ───────────────────────────────────────────────────────

function truncate(s: string, max = 120): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 3)}...`;
}

function formatJson(obj: unknown, max = 120): string {
	return truncate(JSON.stringify(obj, null, 2)?.replace(/\n/g, " ") ?? "", max);
}

/**
 * Extract text from an assistant message delta event.
 *
 * The pi-ai AssistantMessageEvent has a `delta` field with content blocks.
 * We look for `{ type: "text", text: "..." }` blocks and extract the text.
 */
function extractTextFromDelta(event: unknown): string | undefined {
	const e = event as Record<string, unknown>;
	const delta = e?.payload as Record<string, unknown> | undefined;
	const assistantEvent = delta?.assistantMessageEvent as Record<string, unknown> | undefined;
	const deltaBlocks = assistantEvent?.delta as Array<Record<string, unknown>> | undefined;

	if (!Array.isArray(deltaBlocks)) return undefined;

	const parts: string[] = [];
	for (const block of deltaBlocks) {
		if (block.type === "text" && typeof block.text === "string") {
			parts.push(block.text);
		} else if (block.type === "thinking" && typeof block.thinking === "string") {
			// Show thinking in dim
			parts.push(dim(block.thinking));
		}
	}
	return parts.length > 0 ? parts.join("") : undefined;
}

// ─── Event display ────────────────────────────────────────────────────

function displayEvent(event: Record<string, unknown>): void {
	const eventName = event.event as string;
	const payload = event.payload as Record<string, unknown> | undefined;

	switch (eventName) {
		case "agent_start":
			console.log(dim("── agent started ──"));
			break;

		case "agent_end":
			console.log(dim("── agent ended ──"));
			break;

		case "message_start": {
			const message = payload?.message as Record<string, unknown> | undefined;
			const role = (message?.role as string) ?? "unknown";
			if (role === "assistant") {
				console.log(bold(cyan("assistant:")));
			} else if (role === "user") {
				console.log(bold(green("user:")));
			}
			break;
		}

		case "message_update": {
			const text = extractTextFromDelta(event);
			if (text) {
				process.stdout.write(text);
			}
			break;
		}

		case "message_end":
			// Final newline after streaming text
			console.log();
			break;

		case "tool_execution_start": {
			const toolName = (payload?.toolName as string) ?? "unknown";
			const args = payload?.args;
			console.log(yellow(`  ⚙ ${bold(toolName)}(${formatJson(args, 80)})`));
			break;
		}

		case "tool_execution_end": {
			const toolName = (payload?.toolName as string) ?? "unknown";
			const isError = payload?.isError as boolean | undefined;
			const result = payload?.result as Record<string, unknown> | undefined;
			if (isError) {
				console.log(red(`  ✗ ${toolName} error: ${formatJson(result?.content, 100)}`));
			} else {
				const content = result?.content as Array<Record<string, unknown>> | undefined;
				const text = content
					?.filter((b) => b.type === "text")
					.map((b) => truncate(String(b.text), 100))
					.join(" ");
				console.log(dim(`  ✓ ${toolName} → ${text ?? "(no text output)"}`));
			}
			break;
		}

		case "state_change": {
			const isStreaming = payload?.isStreaming as boolean | undefined;
			const model = payload?.model as Record<string, unknown> | undefined;
			const messageCount = payload?.messageCount as number | undefined;
			if (model) {
				console.log(
					dim(
						`  [state] model=${model.provider}/${model.modelId} streaming=${isStreaming} messages=${messageCount}`,
					),
				);
			}
			break;
		}

		default:
			// For events not in the default set but shown via --show-events,
			// dump a minimal summary
			console.log(dim(`  [${eventName}] ${formatJson(payload, 80)}`));
			break;
	}
}

// ─── Extension UI handling ────────────────────────────────────────────

async function handleExtensionUiRequest(
	request: Record<string, unknown>,
	sendCommand: (cmd: Record<string, unknown>) => void,
	rl: NodeJS.ReadlineInterface,
): Promise<void> {
	const id = request.id as string;
	const method = request.method as string;

	switch (method) {
		case "notify": {
			const message = request.message as string;
			const notifyType = request.notifyType as string | undefined;
			const label =
				notifyType === "error" ? red("⚠") : notifyType === "warning" ? yellow("⚠") : "ℹ";
			console.log(`\n${label} ${message}\n`);
			break;
		}

		case "dialog": {
			const title = request.title as string;
			const body = request.body as string;
			console.log(`\n${bold(title)}`);
			console.log(body);
			rl.prompt();
			break;
		}

		case "confirm": {
			const title = request.title as string;
			const body = request.body as string;
			const answer = await new Promise<string>((res) => {
				rl.question(`\n${bold(title)}\n${body} (y/n) `, (a) => res(a.trim().toLowerCase()));
			});
			const confirmed = answer === "y" || answer === "yes";
			sendCommand({ type: "extension_ui_response", id, confirmed });
			console.log();
			break;
		}

		case "input": {
			const title = request.title as string;
			const placeholder = request.placeholder as string | undefined;
			const hint = placeholder ? ` (${placeholder})` : "";
			const value = await new Promise<string>((res) => {
				rl.question(`\n${bold(title)}${hint}: `, (v) => res(v));
			});
			sendCommand({ type: "extension_ui_response", id, value, cancelled: false });
			console.log();
			break;
		}

		case "select": {
			const title = request.title as string;
			const items = (request.items ?? []) as unknown[];
			console.log(`\n${bold(title)}`);
			for (let i = 0; i < items.length; i++) {
				console.log(`  ${bold(String(i + 1))}. ${items[i]}`);
			}
			const answer = await new Promise<string>((res) => {
				rl.question("Enter number: ", (a) => res(a.trim()));
			});
			const idx = Number.parseInt(answer, 10) - 1;
			if (idx >= 0 && idx < items.length) {
				const item = items[idx];
				const value = typeof item === "string" ? item : JSON.stringify(item);
				sendCommand({ type: "extension_ui_response", id, value, cancelled: false });
			} else {
				sendCommand({ type: "extension_ui_response", id, cancelled: true });
			}
			console.log();
			break;
		}
	}
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	if (args.help) {
		printHelp();
		process.exit(0);
	}

	if (!args.provider || !args.model) {
		console.error(red("Error: --provider and --model are required."));
		console.error("Use --help for usage information.");
		process.exit(1);
	}

	const eventFilter = args.showEvents;

	// Resolve the otter binary path
	const cliPath = resolve(import.meta.dir, "..", "packages", "otter-agent-cli", "dist", "cli.js");

	// Build the CLI command arguments
	const childArgs = ["--provider", args.provider, "--model", args.model];
	if (args.apiKey) childArgs.push("--api-key", args.apiKey);
	if (args.thinking) childArgs.push("--thinking", args.thinking);
	if (args.systemPrompt) childArgs.push("--system-prompt", args.systemPrompt);
	if (args.cwd) childArgs.push("--cwd", args.cwd);

	// Spawn the otter CLI
	const child = spawn(process.execPath, [cliPath, ...childArgs], {
		stdio: ["pipe", "pipe", "inherit"], // stdin=pipe, stdout=pipe, stderr=inherit
		env: { ...process.env },
	});

	let isStreaming = false;
	let forceKill = false;

	// ─── Handle child stdout (JSONL from agent) ───────────────────

	const stdout = child.stdout;
	if (!stdout) throw new Error("child stdout is not available");
	const detachReader = attachJsonlReader(stdout, (line) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			// Malformed line — dump raw for debugging
			console.error(dim(`[raw] ${line}`));
			return;
		}

		const msg = parsed as Record<string, unknown>;

		if (msg.type === "response") {
			if (msg.success) {
				if (msg.command !== "prompt") {
					// Don't echo prompt fire-and-forget acks
					console.log(green(`  ✓ ${msg.command}`));
				}
				if (msg.data) {
					console.log(dim(`    ${formatJson(msg.data, 100)}`));
				}
			} else {
				console.log(red(`  ✗ ${msg.command}: ${msg.error}`));
			}
			return;
		}

		if (msg.type === "event") {
			const eventName = msg.event as string;

			// Track streaming state for prompt display
			if (eventName === "agent_start") isStreaming = true;
			if (eventName === "agent_end") {
				isStreaming = false;
				// Re-show the prompt after agent finishes
				process.nextTick(() => rl.prompt());
			}
			if (eventName === "state_change") {
				const payload = msg.payload as Record<string, unknown> | undefined;
				isStreaming = (payload?.isStreaming as boolean) ?? isStreaming;
			}

			// Apply event filter
			const shouldShow = eventFilter ? eventFilter.has(eventName) : DEFAULT_EVENTS.has(eventName);
			if (shouldShow) {
				displayEvent(msg);
			}
			return;
		}

		if (msg.type === "extension_ui_request") {
			handleExtensionUiRequest(msg, sendCommand, rl).catch((err) => {
				console.error(red(`UI handler error: ${err}`));
			});
			return;
		}

		// Unknown message type
		console.error(dim(`[unknown] ${line}`));
	});

	// ─── Send command to child ────────────────────────────────────

	function sendCommand(cmd: Record<string, unknown>): void {
		const line = `${JSON.stringify(cmd)}\n`;
		child.stdin?.write(line);
	}

	// ─── REPL readline ────────────────────────────────────────────

	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: "> ",
		terminal: true,
	});

	rl.prompt();

	rl.on("line", async (input) => {
		const trimmed = input.trim();
		if (!trimmed) {
			rl.prompt();
			return;
		}

		// Slash commands
		if (trimmed.startsWith("/")) {
			const spaceIdx = trimmed.indexOf(" ");
			const cmd = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
			const cmdArgs = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

			switch (cmd) {
				case "help":
					printHelp();
					rl.prompt();
					return;
				case "state":
					sendCommand({ type: "get_state", id: "repl_state" });
					rl.prompt();
					return;
				case "commands":
					sendCommand({ type: "get_commands", id: "repl_commands" });
					rl.prompt();
					return;
				case "shutdown":
					console.log(dim("Shutting down..."));
					sendCommand({ type: "shutdown", id: "repl_shutdown" });
					return;
				default:
					console.log(dim(`Unknown command: /${cmd}. Type /help for available commands.`));
					rl.prompt();
					return;
			}
		}

		// Regular prompt — send to agent
		sendCommand({ type: "prompt", message: trimmed });
		// The prompt will be re-shown after agent_end event
	});

	rl.on("close", () => {
		if (!forceKill) {
			// Ctrl+C — send graceful shutdown
			sendCommand({ type: "shutdown", id: "repl_ctrlc" });
		}
	});

	// ─── Graceful shutdown timeout ────────────────────────────────

	let shutdownTimeout: ReturnType<typeof setTimeout> | undefined;

	child.on("exit", (code) => {
		detachReader();
		if (shutdownTimeout) clearTimeout(shutdownTimeout);
		rl.close();
		console.log(dim(`\nProcess exited with code ${code}`));
		process.exit(code ?? 0);
	});

	child.on("error", (err) => {
		console.error(red(`Child process error: ${err.message}`));
		rl.close();
		process.exit(1);
	});

	// ─── Ctrl+C handling (two strikes) ────────────────────────────

	process.on("SIGINT", () => {
		if (forceKill) return;

		if (child.exitCode !== null) {
			// Already exiting
			return;
		}

		// Check if we already sent shutdown (no more stdin)
		if (child.stdin?.writableEnded) {
			// Force kill
			forceKill = true;
			console.log(red("\nForce killing..."));
			child.kill("SIGKILL");
			return;
		}

		// First Ctrl+C — send graceful shutdown
		forceKill = true;
		console.log(yellow("\nSending shutdown... (Ctrl+C again to force kill)"));
		sendCommand({ type: "shutdown", id: "repl_sigint" });

		// Safety timeout — force kill after 10s
		shutdownTimeout = setTimeout(() => {
			console.log(red("\nShutdown timed out — force killing..."));
			child.kill("SIGKILL");
		}, 10_000);
	});
}

main().catch((err) => {
	console.error(red(`Fatal: ${err.message}`));
	process.exit(1);
});
