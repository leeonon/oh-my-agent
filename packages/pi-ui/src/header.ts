import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWelcome } from "./welcome/index.ts";

export function registerHeader(pi: ExtensionAPI): void {
  registerWelcome(pi);
}
