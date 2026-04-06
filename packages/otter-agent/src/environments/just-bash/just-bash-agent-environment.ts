import { Bash } from "just-bash";
import type { BashOptions, CommandName, InitialFiles, NetworkConfig } from "just-bash";
import type { AgentEnvironment } from "../../interfaces/agent-environment.js";
import type { SkillDefinition } from "../../interfaces/skill-definition.js";
import type { SkillSupportedAgentEnvironment } from "../../interfaces/skill-supported-agent-environment.js";
import type { ToolDefinition } from "../../interfaces/tool-definition.js";
import { escapeXml } from "../../utils/xml.js";
import { createBashToolDefinition } from "./tools/bash.js";
import { createEditToolDefinition } from "./tools/edit.js";
import { createReadToolDefinition } from "./tools/read.js";
import { createWriteToolDefinition } from "./tools/write.js";

/** Execution limits configuration for the just-bash interpreter. */
type ExecutionLimits = NonNullable<BashOptions["executionLimits"]>;

/** Names of the tools exposed by {@link JustBashAgentEnvironment}. */
export type JustBashToolName = "bash" | "read" | "write" | "edit";

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
	/**
	 * Tools to expose to the agent. When omitted, all four tools are included.
	 * Pass an explicit array to restrict which tools are available.
	 *
	 * @example
	 * ```ts
	 * // Only expose bash and read — no write or edit.
	 * new JustBashAgentEnvironment({ tools: ["bash", "read"] });
	 * ```
	 */
	tools?: JustBashToolName[];
}

/** Pattern for valid skill names: lowercase a-z, 0-9, hyphens; max 64 chars. */
const VALID_SKILL_NAME = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Returns `true` if the skill name meets the naming requirements:
 * - Only lowercase a-z, 0-9, and hyphens
 * - No leading or trailing hyphens
 * - No consecutive hyphens
 * - Between 1 and 64 characters
 */
function isValidSkillName(name: string): boolean {
	if (name.length === 0 || name.length > 64) return false;
	if (!VALID_SKILL_NAME.test(name)) return false;
	if (name.includes("--")) return false;
	return true;
}

/** Build the full SKILL.md file content (YAML frontmatter + body). */
function buildSkillFileContent(skill: SkillDefinition): string {
	return [
		"---",
		`name: ${skill.name}`,
		`description: ${JSON.stringify(skill.description)}`,
		"---",
		"",
		skill.content,
	].join("\n");
}

/**
 * A built-in {@link AgentEnvironment} backed by a sandboxed just-bash virtual
 * filesystem. Exposes the same four tools as pi-coding-agent:
 * bash, read, write, and edit.
 *
 * The {@link Bash} instance is created once at construction time and shared
 * across all tool calls, so filesystem writes persist between calls.
 *
 * Implements {@link SkillSupportedAgentEnvironment}: skills registered via
 * `addSkill()` are written as virtual `SKILL.md` files under
 * `<cwd>/skills/<name>/SKILL.md` and their descriptions are included in the
 * system prompt when the `read` tool is active.
 */
export class JustBashAgentEnvironment implements AgentEnvironment, SkillSupportedAgentEnvironment {
	private readonly _bash: Bash;
	private readonly _cwd: string;
	private readonly _tools: ToolDefinition[];
	private readonly _skills: Map<string, SkillDefinition> = new Map();

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

		const allTools: Record<JustBashToolName, ToolDefinition> = {
			bash: createBashToolDefinition(this._bash),
			read: createReadToolDefinition(this._bash, cwd),
			write: createWriteToolDefinition(this._bash, cwd),
			edit: createEditToolDefinition(this._bash, cwd),
		};

		const enabled = options.tools ?? (["bash", "read", "write", "edit"] as JustBashToolName[]);
		this._tools = enabled.map((name) => allTools[name]);
	}

	// ─── SkillSupportedAgentEnvironment ──────────────────────────────────────────

	/**
	 * Register a skill with the environment.
	 *
	 * Validates the name, writes a virtual `SKILL.md` file at
	 * `<cwd>/skills/<name>/SKILL.md`, and stores the definition.
	 *
	 * If the name is invalid, logs a warning and returns `false` without
	 * throwing — the session is not affected.
	 *
	 * If a skill with the same name is already registered, it is overwritten
	 * (last-write-wins). This is intentional to support reload scenarios.
	 */
	addSkill(skill: SkillDefinition): boolean {
		if (!isValidSkillName(skill.name)) {
			console.warn(
				`[JustBashAgentEnvironment] Skill "${skill.name}" was not registered: name must be 1–64 characters, contain only lowercase a-z, 0-9, or hyphens, and must not start, end, or contain consecutive hyphens.`,
			);
			return false;
		}

		this._skills.set(skill.name, skill);

		const filePath = this._skillFilePath(skill.name);
		const fileContent = buildSkillFileContent(skill);

		// Fire-and-forget: writeFile is async but completes well before the agent
		// can issue a read tool call, so the file is available when needed.
		this._bash.writeFile(filePath, fileContent).catch((err: unknown) => {
			console.warn(
				`[JustBashAgentEnvironment] Failed to write virtual file for skill "${skill.name}": ${err}`,
			);
		});

		return true;
	}

	/** Return all registered skill definitions. */
	getSkills(): SkillDefinition[] {
		return [...this._skills.values()];
	}

	/**
	 * Return the full content of the skill's virtual file (YAML frontmatter + body),
	 * or `undefined` if no skill with that name is registered.
	 */
	getSkillContent(name: string): string | undefined {
		const skill = this._skills.get(name);
		if (!skill) return undefined;
		return buildSkillFileContent(skill);
	}

	/**
	 * Return the absolute virtual filesystem path to the skill's `SKILL.md` file,
	 * or `undefined` if no skill with that name is registered.
	 *
	 * Not part of {@link SkillSupportedAgentEnvironment} — this is specific to
	 * `JustBashAgentEnvironment` because it exposes skills via the `read` tool and
	 * the agent needs the file path to load them.
	 *
	 * Use the {@link isJustBashAgentEnvironment} type guard to narrow an
	 * {@link AgentEnvironment} before calling this method.
	 */
	getSkillFilePath(name: string): string | undefined {
		if (!this._skills.has(name)) return undefined;
		return this._skillFilePath(name);
	}

	// ─── AgentEnvironment ─────────────────────────────────────────────────────────

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

		const parts: string[] = [
			[
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
			].join("\n"),
		];

		const skillsSection = this._buildSkillsSection();
		if (skillsSection) {
			parts.push(skillsSection);
		}

		return parts.join("\n\n");
	}

	getTools(): ToolDefinition[] {
		return this._tools;
	}

	// ─── Internal ─────────────────────────────────────────────────────────────────

	/** Build the skills section for the system prompt (only when read tool is active). */
	private _buildSkillsSection(): string | undefined {
		if (this._skills.size === 0) return undefined;
		if (!this._tools.some((t) => t.name === "read")) return undefined;

		const skillItems = [...this._skills.values()]
			.map((skill) => {
				const filePath = this._skillFilePath(skill.name);
				return [
					"  <skill>",
					`    <name>${escapeXml(skill.name)}</name>`,
					`    <description>${escapeXml(skill.description)}</description>`,
					`    <location>${escapeXml(filePath)}</location>`,
					"  </skill>",
				].join("\n");
			})
			.join("\n");

		return [
			"## Skills",
			"",
			"The following skills provide specialized instructions for specific tasks.",
			"Use the read tool to load a skill's file when the task matches its description.",
			"When a skill file references a relative path, resolve it against the skill directory (shown in the location field).",
			"",
			"<available_skills>",
			skillItems,
			"</available_skills>",
		].join("\n");
	}

	/** Derive the virtual filesystem path for a skill's SKILL.md file. */
	private _skillFilePath(name: string): string {
		const base = this._cwd.endsWith("/") ? this._cwd.slice(0, -1) : this._cwd;
		return `${base}/skills/${name}/SKILL.md`;
	}
}

/**
 * Type guard that narrows an {@link AgentEnvironment} to
 * {@link JustBashAgentEnvironment}.
 *
 * Use this before accessing JustBash-specific methods (e.g.
 * {@link JustBashAgentEnvironment.getSkillFilePath}) that are not part of
 * any shared interface.
 */
export function isJustBashAgentEnvironment(env: object): env is JustBashAgentEnvironment {
	return env instanceof JustBashAgentEnvironment;
}
