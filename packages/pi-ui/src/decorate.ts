import type { ExtensionAPI, Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { renderFallbackBoxCall, renderFallbackBoxResult } from "./fallback-box.ts";
import { isReservedAgentTool } from "./mcp-name.ts";

/**
 * Tools pi-ui re-registers with its own boxed renderers in tools.ts. Their
 * definitions already carry renderShell/renderCall/renderResult, so the
 * resolver chain hands them straight to `next()`.
 */
const OWNED_TOOLS = new Set(["read", "bash", "grep", "find", "ls", "edit", "write"]);

function fallbackRenderers(toolName: string): ToolRenderers {
	return {
		renderShell: "self",
		renderCall: (args, theme, context) => {
			try {
				return renderFallbackBoxCall(toolName, args as Record<string, unknown>, theme, context as never);
			} catch {
				// Never let a malformed tool call take the transcript down.
				return { render: () => [], invalidate() {} };
			}
		},
		renderResult: (result, options, theme, context) =>
			renderFallbackBoxResult(toolName)(result, options, theme, context as never),
	};
}

/**
 * Official renderer chain (Pi 1.0.1+): the resolver runs in extension load
 * order, and whatever it returns becomes the ToolExecutionComponent's
 * definition — including for tools that were never registered (MCP tools in
 * resumed sessions, extension tools without definitions). Those used to fall
 * into Pi's generic content-text path; they now get the pi-ui open box.
 *
 * This replaces the old ToolExecutionComponent prototype patch entirely: no
 * monkey-patching, no session_start re-install, and the definition-less
 * bypass is closed by design.
 */
export function registerPiUiToolRenderer(pi: ExtensionAPI): void {
	pi.registerToolRenderer((toolName, next): ToolRenderers | undefined => {
		// pi-ui's re-registered built-ins and the agent-runner's own tools
		// keep their own (definition-level) rendering pipeline.
		if (OWNED_TOOLS.has(toolName) || isReservedAgentTool(toolName)) return next();
		return fallbackRenderers(toolName);
	});
}
