export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
/** "⌘" on macOS, "Ctrl+" elsewhere. */
export const mod = isMac ? "⌘" : "Ctrl+";
