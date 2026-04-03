/**
 * Minimal interface for credential retrieval.
 *
 * The agent loop calls `getApiKey()` before each LLM request to get the
 * API key for the current provider. All credential management complexity
 * (OAuth, file storage, environment variables, vaults) is the
 * implementation's concern.
 *
 * Extensions do not interact with AuthStorage.
 */
export interface AuthStorage {
	/**
	 * Retrieve an API key for the given provider.
	 *
	 * Implementations may resolve keys from any source: environment
	 * variables, files, vaults, OAuth token refresh, etc.
	 *
	 * @param provider - The LLM provider identifier (e.g., "anthropic", "openai").
	 * @returns The API key string, or `undefined` if not available.
	 */
	getApiKey(provider: string): Promise<string | undefined>;
}
