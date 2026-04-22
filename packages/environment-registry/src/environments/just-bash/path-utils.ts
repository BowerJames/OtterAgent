/**
 * Path resolution utilities for the just-bash virtual filesystem.
 *
 * The virtual FS uses POSIX-style paths. Relative paths are resolved
 * against the provided cwd. No macOS quirks or realpathSync needed.
 */

import { isAbsolute, resolve as resolvePath } from "node:path/posix";

/**
 * Resolve a path relative to the given cwd.
 * Handles absolute paths and relative paths.
 * Strips a leading "@" prefix (pi-coding-agent convention).
 */
export function resolveToCwd(filePath: string, cwd: string): string {
	const normalized = filePath.startsWith("@") ? filePath.slice(1) : filePath;
	if (isAbsolute(normalized)) return normalized;
	return resolvePath(cwd, normalized);
}
