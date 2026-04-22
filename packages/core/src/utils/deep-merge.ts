/**
 * Recursively deep-merge `source` into `target`.
 *
 * Plain objects are merged key-by-key (source values win).
 * Arrays, nulls, and non-object values from source replace target values entirely.
 *
 * Neither `target` nor `source` is mutated; a new object is returned.
 */
export function deepMerge(target: unknown, source: unknown): unknown {
	if (typeof source !== "object" || source === null || Array.isArray(source)) {
		return source;
	}
	if (typeof target !== "object" || target === null || Array.isArray(target)) {
		return source;
	}
	const result = { ...target };
	for (const key of Object.keys(source as Record<string, unknown>)) {
		const sourceVal = (source as Record<string, unknown>)[key];
		const targetVal = (target as Record<string, unknown>)[key];
		if (
			typeof sourceVal === "object" &&
			sourceVal !== null &&
			!Array.isArray(sourceVal) &&
			typeof targetVal === "object" &&
			targetVal !== null &&
			!Array.isArray(targetVal)
		) {
			(result as Record<string, unknown>)[key] = deepMerge(targetVal, sourceVal);
		} else {
			(result as Record<string, unknown>)[key] = sourceVal;
		}
	}
	return result;
}
