/**
 * A value that may be synchronous or wrapped in a Promise.
 *
 * Allows interface methods to accept both sync and async implementations.
 * Callers uniformly `await` the result — `await value` is a no-op
 * when `value` is not a Thenable.
 */
export type MaybePromise<T> = T | Promise<T>;
