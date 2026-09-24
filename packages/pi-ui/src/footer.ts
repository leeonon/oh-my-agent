import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerFooter(_pi: ExtensionAPI): void {
  // Statusline / footer. Do not call setFooter until this package owns the TUI chrome.
}
