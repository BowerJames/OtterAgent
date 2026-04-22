import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { parse as parseYaml } from "yaml";

const VALID_THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

const REQUIRED_KEYS = [
	"environment",
	"session-manager",
	"auth-storage",
	"system-prompt",
	"provider",
	"model",
	"thinking-level",
	"agent-options",
	"extensions",
] as const;

/**
 * A reference to a pluggable component — either by registry name or file path.
 */
export type ComponentReference =
	| { name: string; config?: Record<string, unknown> }
	| { filepath: string; config?: Record<string, unknown> };

/**
 * Top-level otter config file. All fields are required.
 */
export interface OtterConfig {
	environment: ComponentReference;
	"session-manager": ComponentReference;
	"auth-storage": ComponentReference;
	"system-prompt": string;
	provider: string;
	model: string;
	"thinking-level": ThinkingLevel;
	"agent-options": Record<string, unknown>;
	extensions: ComponentReference[];
}

/**
 * Error thrown when a config file cannot be parsed or is invalid.
 */
export class ConfigFileError extends Error {
	constructor(
		public readonly filePath: string,
		message: string,
	) {
		super(`Config file "${filePath}": ${message}`);
		this.name = "ConfigFileError";
	}
}

/**
 * Validate that a ComponentReference has exactly one of `name` or `filepath`.
 */
function validateComponentReference(ref: unknown, label: string): ref is ComponentReference {
	if (typeof ref !== "object" || ref === null || Array.isArray(ref)) {
		return false;
	}
	const record = ref as Record<string, unknown>;
	const hasName = typeof record.name === "string" && record.name.length > 0;
	const hasFilepath = typeof record.filepath === "string" && record.filepath.length > 0;
	if (!hasName && !hasFilepath) {
		throw new ConfigFileError(
			"",
			`"${label}" must have either "name" or "filepath", but neither was provided.`,
		);
	}
	if (hasName && hasFilepath) {
		throw new ConfigFileError(
			"",
			`"${label}" must have either "name" or "filepath", but both were provided.`,
		);
	}
	// config is optional — if present it must be an object
	if (record.config !== undefined) {
		if (
			typeof record.config !== "object" ||
			record.config === null ||
			Array.isArray(record.config)
		) {
			throw new ConfigFileError("", `"${label}".config must be an object if provided.`);
		}
	}
	return true;
}

/**
 * Parse an otter config file (JSON or YAML).
 *
 * @param filePath - Path to the config file (.json, .yaml, or .yml).
 * @returns The validated OtterConfig.
 * @throws {ConfigFileError} If the file cannot be read, parsed, or fails validation.
 */
export function parseOtterConfig(filePath: string): OtterConfig {
	// --- Read file ---
	let content: string;
	try {
		content = readFileSync(filePath, "utf-8");
	} catch (err) {
		throw new ConfigFileError(filePath, err instanceof Error ? err.message : String(err));
	}

	// --- Parse format ---
	const ext = extname(filePath).toLowerCase();
	let parsed: unknown;

	if (ext === ".json") {
		try {
			parsed = JSON.parse(content);
		} catch (err) {
			throw new ConfigFileError(
				filePath,
				`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	} else if (ext === ".yaml" || ext === ".yml") {
		try {
			parsed = parseYaml(content);
		} catch (err) {
			throw new ConfigFileError(
				filePath,
				`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	} else {
		throw new ConfigFileError(
			filePath,
			`Unsupported file extension "${ext}". Expected .json, .yaml, or .yml.`,
		);
	}

	// --- Validate top-level structure ---
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new ConfigFileError(filePath, "Config must be a JSON object or YAML mapping.");
	}

	const record = parsed as Record<string, unknown>;

	// --- Check required keys ---
	const missingKeys: string[] = [];
	for (const key of REQUIRED_KEYS) {
		if (!(key in record)) {
			missingKeys.push(key);
		}
	}
	if (missingKeys.length > 0) {
		throw new ConfigFileError(filePath, `Missing required keys: ${missingKeys.join(", ")}`);
	}

	// --- Validate string fields ---
	if (typeof record["system-prompt"] !== "string" || record["system-prompt"] === "") {
		throw new ConfigFileError(filePath, '"system-prompt" must be a non-empty string.');
	}
	if (typeof record.provider !== "string" || record.provider === "") {
		throw new ConfigFileError(filePath, '"provider" must be a non-empty string.');
	}
	if (typeof record.model !== "string" || record.model === "") {
		throw new ConfigFileError(filePath, '"model" must be a non-empty string.');
	}

	// --- Validate thinking-level ---
	if (!VALID_THINKING_LEVELS.includes(record["thinking-level"] as ThinkingLevel)) {
		throw new ConfigFileError(
			filePath,
			`"thinking-level" must be one of: ${VALID_THINKING_LEVELS.join(", ")}. Got: ${String(record["thinking-level"])}`,
		);
	}

	// --- Validate agent-options ---
	if (
		typeof record["agent-options"] !== "object" ||
		record["agent-options"] === null ||
		Array.isArray(record["agent-options"])
	) {
		throw new ConfigFileError(filePath, '"agent-options" must be an object.');
	}

	// --- Validate extensions ---
	if (!Array.isArray(record.extensions)) {
		throw new ConfigFileError(filePath, '"extensions" must be an array.');
	}

	// --- Validate component references ---
	validateComponentReference(record.environment, "environment");
	validateComponentReference(record["session-manager"], "session-manager");
	validateComponentReference(record["auth-storage"], "auth-storage");

	for (let i = 0; i < record.extensions.length; i++) {
		validateComponentReference(record.extensions[i], `extensions[${i}]`);
	}

	return record as unknown as OtterConfig;
}
