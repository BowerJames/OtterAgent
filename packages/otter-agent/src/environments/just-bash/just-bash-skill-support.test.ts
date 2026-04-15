import { describe, expect, test, vi } from "vitest";
import { isSkillSupportedAgentEnvironment } from "../../interfaces/skill-supported-agent-environment.js";
import {
	JustBashAgentEnvironment,
	isJustBashAgentEnvironment,
} from "./just-bash-agent-environment.js";

function makeEnv(options?: ConstructorParameters<typeof JustBashAgentEnvironment>[0]) {
	return new JustBashAgentEnvironment(options);
}

// ─── Type guard ───────────────────────────────────────────────────────────────

describe("isSkillSupportedAgentEnvironment", () => {
	test("returns true for JustBashAgentEnvironment", () => {
		const env = makeEnv();
		expect(isSkillSupportedAgentEnvironment(env)).toBe(true);
	});

	test("returns false for a plain AgentEnvironment object", () => {
		const plain = {
			getSystemMessageAppend: () => undefined,
			getTools: () => [],
		};
		expect(isSkillSupportedAgentEnvironment(plain)).toBe(false);
	});
});

// ─── isJustBashAgentEnvironment ───────────────────────────────────────────────

describe("isJustBashAgentEnvironment", () => {
	test("returns true for a JustBashAgentEnvironment instance", () => {
		const env = makeEnv();
		expect(isJustBashAgentEnvironment(env)).toBe(true);
	});

	test("returns false for a plain object", () => {
		const plain = { getSystemMessageAppend: () => undefined, getTools: () => [] };
		expect(isJustBashAgentEnvironment(plain)).toBe(false);
	});
});

// ─── Skill name validation ────────────────────────────────────────────────────

describe("addSkill — name validation", () => {
	test("accepts a valid lowercase name", () => {
		const env = makeEnv();
		expect(env.addSkill({ name: "my-skill", description: "desc", content: "content" })).toBe(true);
	});

	test("accepts a single character name", () => {
		const env = makeEnv();
		expect(env.addSkill({ name: "a", description: "desc", content: "content" })).toBe(true);
	});

	test("accepts name with digits", () => {
		const env = makeEnv();
		expect(env.addSkill({ name: "skill-v2", description: "desc", content: "content" })).toBe(true);
	});

	test("accepts name at max length (64 chars)", () => {
		const env = makeEnv();
		const name = "a".repeat(64);
		expect(env.addSkill({ name, description: "desc", content: "content" })).toBe(true);
	});

	test("rejects empty name", () => {
		const env = makeEnv();
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(env.addSkill({ name: "", description: "desc", content: "content" })).toBe(false);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	test("rejects name exceeding 64 characters", () => {
		const env = makeEnv();
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const name = "a".repeat(65);
		expect(env.addSkill({ name, description: "desc", content: "content" })).toBe(false);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	test("rejects uppercase letters", () => {
		const env = makeEnv();
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(env.addSkill({ name: "MySkill", description: "desc", content: "content" })).toBe(false);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	test("rejects name with leading hyphen", () => {
		const env = makeEnv();
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(env.addSkill({ name: "-skill", description: "desc", content: "content" })).toBe(false);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	test("rejects name with trailing hyphen", () => {
		const env = makeEnv();
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(env.addSkill({ name: "skill-", description: "desc", content: "content" })).toBe(false);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	test("rejects name with consecutive hyphens", () => {
		const env = makeEnv();
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(env.addSkill({ name: "my--skill", description: "desc", content: "content" })).toBe(
			false,
		);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	test("rejects name with spaces", () => {
		const env = makeEnv();
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(env.addSkill({ name: "my skill", description: "desc", content: "content" })).toBe(false);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	test("invalid name does not crash or throw", () => {
		const env = makeEnv();
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(() =>
			env.addSkill({ name: "INVALID!", description: "desc", content: "x" }),
		).not.toThrow();
		spy.mockRestore();
	});
});

// ─── addSkill / getSkills / getSkillContent ───────────────────────────────────

describe("addSkill / getSkills / getSkillContent", () => {
	test("getSkills() returns empty array initially", () => {
		const env = makeEnv();
		expect(env.getSkills()).toEqual([]);
	});

	test("getSkills() returns registered skills", () => {
		const env = makeEnv();
		env.addSkill({ name: "skill-a", description: "A", content: "content A" });
		env.addSkill({ name: "skill-b", description: "B", content: "content B" });
		const skills = env.getSkills();
		expect(skills).toHaveLength(2);
		expect(skills.map((s) => s.name)).toEqual(["skill-a", "skill-b"]);
	});

	test("getSkillContent() returns undefined for unknown skill", () => {
		const env = makeEnv();
		expect(env.getSkillContent("nonexistent")).toBeUndefined();
	});

	test("getSkillContent() returns full file content with YAML frontmatter", () => {
		const env = makeEnv();
		env.addSkill({ name: "my-skill", description: "My description", content: "Do the thing." });
		const content = env.getSkillContent("my-skill");
		expect(content).toContain("---");
		expect(content).toContain("name: my-skill");
		expect(content).toContain('"My description"');
		expect(content).toContain("Do the thing.");
	});

	test("getSkillContent() quotes description containing a colon", () => {
		const env = makeEnv();
		env.addSkill({ name: "deploy", description: "Deploy: run npm build", content: "steps" });
		const content = env.getSkillContent("deploy");
		// JSON.stringify wraps the value in double quotes, keeping YAML valid
		expect(content).toContain('description: "Deploy: run npm build"');
	});

	test("getSkillContent() quotes description containing a newline", () => {
		const env = makeEnv();
		env.addSkill({ name: "my-skill", description: "Line 1\nLine 2", content: "x" });
		const content = env.getSkillContent("my-skill");
		// Newline must be escaped, not a literal line break in the frontmatter
		expect(content).toContain("description:");
		expect(content).not.toMatch(/description:.*\n.*Line 2/);
	});

	test("getSkillContent() quotes description containing double quotes", () => {
		const env = makeEnv();
		env.addSkill({ name: "my-skill", description: 'It\'s a "test"', content: "x" });
		const content = env.getSkillContent("my-skill");
		expect(content).toContain("description:");
		// Quotes inside the value must be escaped
		expect(content).toContain('\\"test\\"');
	});

	test("addSkill() overwrites existing skill with same name (last-write-wins)", () => {
		const env = makeEnv();
		env.addSkill({ name: "my-skill", description: "First", content: "v1" });
		env.addSkill({ name: "my-skill", description: "Second", content: "v2" });
		const skills = env.getSkills();
		expect(skills).toHaveLength(1);
		expect(skills[0].description).toBe("Second");
	});

	test("invalid skill is not added to getSkills()", () => {
		const env = makeEnv();
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		env.addSkill({ name: "INVALID", description: "desc", content: "x" });
		expect(env.getSkills()).toHaveLength(0);
		spy.mockRestore();
	});
});

// ─── Virtual file creation ────────────────────────────────────────────────────

describe("virtual file creation", () => {
	test("SKILL.md is written with correct frontmatter and content", async () => {
		const env = makeEnv({ cwd: "/workspace", tools: ["bash", "read", "write", "edit"] });
		env.addSkill({ name: "my-skill", description: "Does something", content: "Step 1.\nStep 2." });

		// Give the async writeFile a tick to complete
		await new Promise((r) => setTimeout(r, 10));

		const readTool = env.getTools().find((t) => t.name === "read");
		if (!readTool) throw new Error("read tool not found");
		const result = await readTool.execute(
			"test",
			{ path: "/workspace/skills/my-skill/SKILL.md" },
			undefined,
			undefined,
		);
		const text = (result.content[0] as { type: "text"; text: string }).text;
		expect(text).toContain("name: my-skill");
		expect(text).toContain('description: "Does something"');
		expect(text).toContain("Step 1.");
		expect(text).toContain("Step 2.");
	});

	test("SKILL.md is written at <cwd>/skills/<name>/SKILL.md", async () => {
		const env = makeEnv({ cwd: "/project", tools: ["bash", "read"] });
		env.addSkill({ name: "review", description: "Review code", content: "Review it." });

		await new Promise((r) => setTimeout(r, 10));

		const bashTool = env.getTools().find((t) => t.name === "bash");
		if (!bashTool) throw new Error("bash tool not found");
		const result = await bashTool.execute(
			"test",
			{ command: "ls /project/skills/review/" },
			undefined,
			undefined,
		);
		const text = (result.content[0] as { type: "text"; text: string }).text;
		expect(text).toContain("SKILL.md");
	});
});

// ─── getSkillFilePath ─────────────────────────────────────────────────────────

describe("getSkillFilePath", () => {
	test("returns undefined for an unknown skill", () => {
		const env = makeEnv({ cwd: "/workspace" });
		expect(env.getSkillFilePath("nonexistent")).toBeUndefined();
	});

	test("returns the correct path for a registered skill", () => {
		const env = makeEnv({ cwd: "/workspace" });
		env.addSkill({ name: "my-skill", description: "desc", content: "content" });
		expect(env.getSkillFilePath("my-skill")).toBe("/workspace/skills/my-skill/SKILL.md");
	});

	test("handles cwd with trailing slash", () => {
		const env = makeEnv({ cwd: "/workspace/" });
		env.addSkill({ name: "review", description: "desc", content: "content" });
		expect(env.getSkillFilePath("review")).toBe("/workspace/skills/review/SKILL.md");
	});

	test("returns undefined after only invalid skills were added", () => {
		const env = makeEnv({ cwd: "/workspace" });
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		env.addSkill({ name: "INVALID", description: "desc", content: "x" });
		expect(env.getSkillFilePath("INVALID")).toBeUndefined();
		spy.mockRestore();
	});
});

// ─── XML escaping in _buildSkillsSection ─────────────────────────────────────

describe("getSystemMessageAppend — XML escaping", () => {
	test("escapes & < > \" ' in skill description within XML output", () => {
		// Skill name validation prevents special chars in names,
		// but escapeXml is applied defensively — test via description.
		const env = makeEnv({ tools: ["read"] });
		env.addSkill({
			name: "a-skill",
			description: 'A & B <test> "quoted" it\'s',
			content: "content",
		});
		const append = env.getSystemMessageAppend();
		expect(append).toContain("A &amp; B &lt;test&gt; &quot;quoted&quot; it&apos;s");
		expect(append).not.toContain("A & B <test>");
	});
});

// ─── getSystemMessageAppend — skills section ──────────────────────────────────

describe("getSystemMessageAppend — skills section", () => {
	test("does not include skills section when no skills registered", () => {
		const env = makeEnv({ tools: ["bash", "read"] });
		const append = env.getSystemMessageAppend();
		expect(append).not.toContain("## Skills");
		expect(append).not.toContain("<available_skills>");
	});

	test("does not include skills section when read tool is not active", () => {
		const env = makeEnv({ tools: ["bash"] });
		env.addSkill({ name: "my-skill", description: "A skill", content: "content" });
		const append = env.getSystemMessageAppend();
		expect(append).not.toContain("## Skills");
	});

	test("includes skills section when read tool is active and skills are registered", () => {
		const env = makeEnv({ tools: ["bash", "read"] });
		env.addSkill({ name: "my-skill", description: "A skill", content: "content" });
		const append = env.getSystemMessageAppend();
		expect(append).toContain("## Skills");
		expect(append).toContain("<available_skills>");
		expect(append).toContain("<name>my-skill</name>");
		expect(append).toContain("<description>A skill</description>");
		expect(append).toContain("skills/my-skill/SKILL.md");
	});

	test("includes all registered skills in the section", () => {
		const env = makeEnv({ tools: ["read"] });
		env.addSkill({ name: "skill-a", description: "Skill A", content: "a" });
		env.addSkill({ name: "skill-b", description: "Skill B", content: "b" });
		const append = env.getSystemMessageAppend();
		expect(append).toContain("<name>skill-a</name>");
		expect(append).toContain("<name>skill-b</name>");
	});

	test("environment section is always present regardless of skills", () => {
		const env = makeEnv({ cwd: "/workspace" });
		const append = env.getSystemMessageAppend();
		expect(append).toContain("## Environment");
		expect(append).toContain("/workspace");
	});
});
