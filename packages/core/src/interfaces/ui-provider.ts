import type { MaybePromise } from "../utils/maybe-promise.js";

/**
 * Optional interface for extension-to-user interaction.
 *
 * Provides universal interaction primitives that work regardless of
 * frontend (TUI, web UI, RPC client). The host application provides
 * the implementation.
 *
 * If no UIProvider is bound, extensions calling these methods should
 * receive a sensible default (e.g., error or default value).
 */
export interface UIProvider {
	/**
	 * Show an informational dialog to the user.
	 *
	 * @param title - Dialog title.
	 * @param body - Dialog body text.
	 */
	dialog(title: string, body: string): MaybePromise<void>;

	/**
	 * Show a yes/no confirmation dialog.
	 *
	 * @param title - Confirmation title.
	 * @param body - Confirmation body text.
	 * @returns `true` if the user confirmed, `false` otherwise.
	 */
	confirm(title: string, body: string): MaybePromise<boolean>;

	/**
	 * Prompt the user for free text input.
	 *
	 * @param title - Input prompt title.
	 * @param placeholder - Optional placeholder text.
	 * @returns The entered text, or `undefined` if cancelled.
	 */
	input(title: string, placeholder?: string): MaybePromise<string | undefined>;

	/**
	 * Show a selection list for the user to pick from.
	 *
	 * @param title - Selection prompt title.
	 * @param items - The items to choose from.
	 * @returns The selected item, or `undefined` if cancelled.
	 */
	select<T>(title: string, items: T[]): MaybePromise<T | undefined>;

	/**
	 * Show a transient notification to the user.
	 *
	 * @param message - Notification message text.
	 * @param type - Notification severity. Defaults to "info".
	 */
	notify(message: string, type?: "info" | "warning" | "error"): MaybePromise<void>;
}
