import { Bash } from "just-bash";
import type { BashOptions, CommandName, InitialFiles, NetworkConfig } from "just-bash";
import type { AgentEnvironment } from "../../interfaces/agent-environment.js";
import type { ToolDefinition } from "../../interfaces/tool-definition.js";
import { createBashToolDefinition } from "./tools/bash.js";
import { createEditToolDefinition } from "./tools/edit.js";
import { createReadToolDefinition } from "./tools/read.js";
import { createWriteToolDefinition } from "./tools/write.js";

/** Execution limits configuration for the just-bash interpreter. */
type ExecutionLimits = NonNullable<BashOptions["executionLimits"]>;

export interface JustBashAgentEnvironmentOptions {
	/** Initial files to seed the virtual filesystem with. */
	files?: InitialFiles;
	/** Working directory for relative path resolution. Default: "/" */
	cwd?: string;
	/** Environment variables available to shell commands. */
	env?: Record<string, string>;
	/** Execution limits to prevent runaway compute. */
	executionLimits?: ExecutionLimits;
	/** Network configuration (disabled by default). */
	network?: NetworkConfig;
	/** Allowlist of built-in command names. All built-ins enabled when omitted. */
	commands?: CommandName[];
}

/**
 * A built-in {@link AgentEnvironment} backed by a sandboxed just-bash virtual
 * filesystem. Exposes the same four tools as pi-coding-agent:
 * bash, read, write, and edit.
 *
 * The {@link Bash} instance is created once at construction time and shared
 * across all tool calls, so filesystem writes persist between calls.
 */
export class JustBashAgentEnvironment implements AgentEnvironment {
	private readonly _bash: Bash;
	private readonly _cwd: string;
	private readonly _tools: ToolDefinition[];

	constructor(options: JustBashAgentEnvironmentOptions = {}) {
		const cwd = options.cwd ?? "/";
		this._cwd = cwd;

		this._bash = new Bash({
			files: options.files,
			cwd,
			env: options.env,
			executionLimits: options.executionLimits,
			network: options.network,
			commands: options.commands,
		});

		this._tools = [
			createBashToolDefinition(this._bash),
			createReadToolDefinition(this._bash, cwd),
			createWriteToolDefinition(this._bash, cwd),
			createEditToolDefinition(this._bash, cwd),
		];
	}

	getSystemMessageAppend(): string {
		const commands = [
			"awk",
			"cat",
			"cp",
			"cut",
			"diff",
			"echo",
			"find",
			"grep",
			"head",
			"jq",
			"ls",
			"mkdir",
			"mv",
			"rm",
			"sed",
			"sort",
			"tail",
			"touch",
			"tr",
			"uniq",
			"wc",
			"yq",
		].join(", ");

		return [
			"## Environment",
			"",
			"You are operating in a sandboxed virtual filesystem (just-bash). Key properties:",
			"",
			`- Working directory: \`${this._cwd}\``,
			"- All file operations are in-memory — there is no real host filesystem access.",
			"- No external binaries or processes can be spawned.",
			"- Network access is disabled unless explicitly configured.",
			`- Available shell commands include: ${commands}, and more.`,
			"- Filesystem state (written files) persists across tool calls within this session.",
		].join("\n");
	}

	getTools(): ToolDefinition[] {
		return this._tools;
	}
}
