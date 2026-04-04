/**
 * UIProvider stub for when no real UI is available.
 *
 * Returns sensible defaults: false for confirm, undefined for input/select,
 * no-op for dialog and notify.
 */
import type { UIProvider } from "./ui-provider.js";

export const noOpUIProvider: UIProvider = {
	dialog: async () => {},
	confirm: async () => false,
	input: async () => undefined,
	select: async () => undefined,
	notify: () => {},
};
