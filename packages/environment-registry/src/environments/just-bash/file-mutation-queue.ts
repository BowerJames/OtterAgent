/**
 * Serialise file mutation operations targeting the same path.
 * Operations for different paths still run in parallel.
 *
 * Ported from pi-coding-agent. Simplified for the virtual filesystem:
 * no realpathSync — just uses the string path as the queue key.
 */

const fileMutationQueues = new Map<string, Promise<void>>();

export async function withFileMutationQueue<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
	const key = filePath;
	const currentQueue = fileMutationQueues.get(key) ?? Promise.resolve();

	let releaseNext!: () => void;
	const nextQueue = new Promise<void>((resolve) => {
		releaseNext = resolve;
	});
	const chainedQueue = currentQueue.then(() => nextQueue);
	fileMutationQueues.set(key, chainedQueue);

	await currentQueue;
	try {
		return await fn();
	} finally {
		releaseNext();
		if (fileMutationQueues.get(key) === chainedQueue) {
			fileMutationQueues.delete(key);
		}
	}
}
