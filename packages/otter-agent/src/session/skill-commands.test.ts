/**
 * Tests for AgentSession skill command registration and buildSkillInvocationXml.
 */
import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionContext } from "../extensions/context.js";
import type { Extension } from "../extensions/extension.js";
import type { AgentEnvironment } from "../interfaces/agent-environment.js";
import type { AuthStorage } from "../interfaces/auth-storage.js";
import type { SessionManager } from "../interfaces/session-manager.js";
import type { SkillDefinition } from "../interfaces/skill-definition.js";
import { isSkillSupportedAgentEnvironment } from "../interfaces/skill-supported-agent-environment.js";
import type { SkillSupportedAgentEnvironment } from "../interfaces/skill-supported-agent-environment.js";
import { AgentSession, buildSkillInvocationXml } from "./agent-session.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockSessionManager(): SessionManager {
	let entryCounter = 0;
	return {
		appendMessage: mock(() => String(++entryCounter)),
		buildSessionContext: mock(() => ({ messages: [], thinkingLevel: "off" as const, model: null })),
		compact: mock(() => String(++entryCounter)),
		appendCustomEntry: mock(() => String(++entryCounter)),
		appendCustomMessageEntry: mock(() => String(++entryCounter)),
		appendModelChange: mock(() => String(++entryCounter)),
		appendThinkingLevelChange: mock(() => String(++entryCounter)),
		appendLabel: mock(() => String(++entryCounter)),
	};
}

function createMockAuthStorage(): AuthStorage {
	return {
		getApiKey: mock(async () => "test-api-key"),
	};
}

/** Minimal SkillSupportedAgentEnvironment for testing. */
function createSkillEnvironment(
	skills: SkillDefinition[] = [],
): AgentEnvironment & SkillSupportedAgentEnvironment {
	const store = new Map<string, SkillDefinition>(skills.map((s) => [s.name, s]));
	return {
		getSystemMessageAppend: () => undefined,
		getTools: () => [],
		addSkill(skill: SkillDefinition): boolean {
			store.set(skill.name, skill);
			return true;
		},
		getSkills(): SkillDefinition[] {
			return [...store.values()];
		},
		getSkillContent(name: string): string | undefined {
			const s = store.get(name);
			if (!s) return undefined;
			return `---\nname: ${s.name}\ndescription: ${s.description}\n---\n\n${s.content}`;
		},
		getSkillFilePath(name: string): string | undefined {
			if (!store.has(name)) return undefined;
			return `/workspace/skills/${name}/SKILL.md`;
		},
	};
}

function createSession(env: AgentEnvironment): AgentSession {
	return new AgentSession({
		sessionManager: createMockSessionManager(),
		authStorage: createMockAuthStorage(),
		environment: env,
		systemPrompt: "You are a test agent.",
	});
}

// ─── buildSkillInvocationXml ──────────────────────────────────────────────────

describe("buildSkillInvocationXml", () => {
	const skill: SkillDefinition = {
		name: "deploy",
		description: "Deploy the app",
		content: "Run npm run deploy.",
	};
	const filePath = "/workspace/skills/deploy/SKILL.md";

	test("includes skill name and location attributes", () => {
		const xml = buildSkillInvocationXml(skill, filePath, "");
		expect(xml).toContain(`name="deploy"`);
		expect(xml).toContain(`location="${filePath}"`);
	});

	test("includes skill content body", () => {
		const xml = buildSkillInvocationXml(skill, filePath, "");
		expect(xml).toContain("Run npm run deploy.");
	});

	test("includes relative reference comment pointing to skill directory", () => {
		const xml = buildSkillInvocationXml(skill, filePath, "");
		expect(xml).toContain("References are relative to /workspace/skills/deploy/.");
	});

	test("appends trimmed args after closing tag when present", () => {
		const xml = buildSkillInvocationXml(skill, filePath, "  staging  ");
		expect(xml).toContain("</skill>");
		const afterTag = xml.substring(xml.indexOf("</skill>") + "</skill>".length);
		expect(afterTag.trim()).toBe("staging");
	});

	test("does not append args section when args is empty", () => {
		const xml = buildSkillInvocationXml(skill, filePath, "");
		const afterTag = xml.substring(xml.indexOf("</skill>") + "</skill>".length);
		expect(afterTag.trim()).toBe("");
	});

	test("does not append args section when args is whitespace only", () => {
		const xml = buildSkillInvocationXml(skill, filePath, "   ");
		const afterTag = xml.substring(xml.indexOf("</skill>") + "</skill>".length);
		expect(afterTag.trim()).toBe("");
	});

	test("opens with <skill> and closes with </skill>", () => {
		const xml = buildSkillInvocationXml(skill, filePath, "");
		expect(xml.startsWith("<skill")).toBe(true);
		expect(xml).toContain("</skill>");
	});
});

// ─── Skill command registration ───────────────────────────────────────────────

describe("skill command registration", () => {
	test("skills registered in session_start are available as commands after loadExtensions", async () => {
		const env = createSkillEnvironment();
		const session = createSession(env);

		const extension: Extension = (_api) => {
			_api.on("session_start", (_event, ctx) => {
				if (isSkillSupportedAgentEnvironment(ctx.agentEnvironment)) {
					ctx.agentEnvironment.addSkill({
						name: "my-skill",
						description: "Does something",
						content: "Do it.",
					});
				}
			});
		};

		await session.loadExtensions([extension]);

		const commands = session.extensionRunner.getCommands().map((c) => c.name);
		expect(commands).toContain("my-skill");
		expect(commands).toContain("skill:my-skill");
	});

	test("both bare name and skill: prefix are registered for each skill", async () => {
		const env = createSkillEnvironment([
			{ name: "lint", description: "Run linter", content: "Run lint." },
		]);
		const session = createSession(env);
		await session.loadExtensions([]);

		const commands = session.extensionRunner.getCommands().map((c) => c.name);
		expect(commands).toContain("lint");
		expect(commands).toContain("skill:lint");
	});

	test("extension command takes precedence over bare skill name", async () => {
		const env = createSkillEnvironment([
			{ name: "deploy", description: "Skill deploy", content: "skill content" },
		]);
		const session = createSession(env);

		const extensionHandlerCalled = { value: false };
		const extension: Extension = (api) => {
			api.registerCommand("deploy", {
				description: "Extension deploy",
				handler: async () => {
					extensionHandlerCalled.value = true;
				},
			});
		};

		await session.loadExtensions([extension]);

		const commands = session.extensionRunner.getCommands();
		const deployCmd = commands.find((c) => c.name === "deploy");
		// Extension registered first — its description should win
		expect(deployCmd?.description).toBe("Extension deploy");

		// skill:deploy is still registered (namespaced form is unaffected)
		expect(commands.map((c) => c.name)).toContain("skill:deploy");
	});

	test("skill commands include description from skill definition", async () => {
		const env = createSkillEnvironment([
			{ name: "review", description: "Review pull requests", content: "Review the PR." },
		]);
		const session = createSession(env);
		await session.loadExtensions([]);

		const commands = session.extensionRunner.getCommands();
		const reviewCmd = commands.find((c) => c.name === "review");
		expect(reviewCmd?.description).toBe("Review pull requests");
	});

	test("no skill commands are registered when environment does not support skills", async () => {
		const plainEnv: AgentEnvironment = {
			getSystemMessageAppend: () => undefined,
			getTools: () => [],
		};
		const session = createSession(plainEnv);
		await session.loadExtensions([]);

		const commands = session.extensionRunner.getCommands();
		const skillCommands = commands.filter(
			(c) => c.name.startsWith("skill:") || c.name === "deploy",
		);
		expect(skillCommands).toHaveLength(0);
	});

	test("reload re-registers skill commands after extension runner clear", async () => {
		const env = createSkillEnvironment([
			{ name: "test-skill", description: "A test skill", content: "content" },
		]);
		const session = createSession(env);
		await session.loadExtensions([]);

		// Commands present after initial load
		expect(session.extensionRunner.getCommands().map((c) => c.name)).toContain("test-skill");

		// Reload clears and re-registers
		await session.reload();
		expect(session.extensionRunner.getCommands().map((c) => c.name)).toContain("test-skill");
		expect(session.extensionRunner.getCommands().map((c) => c.name)).toContain("skill:test-skill");
	});
});
