import { ToolExecutionComponent, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { renderFallbackBoxCall, renderFallbackBoxResult } from "./fallback-box.ts";
import { isReservedAgentTool } from "./mcp-name.ts";
import { batchAwareResult } from "./tool-result.ts";
import { renderReadCall } from "./tool-call.ts";

const OWNED_TOOLS = new Set(["read", "bash", "grep", "find", "ls", "edit", "write"]);
const WRAPPER_MARK = Symbol.for("pi-ui.unknown-tool-decoration");
const ORIGINAL = Symbol.for("pi-ui.unknown-tool-decoration.original");

type RenderCall = (args: Record<string, unknown>, theme: Theme, context: unknown) => Component;
type RenderResult = (
  result: unknown,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: unknown,
) => Component;

type ToolHost = {
  toolName: string;
  contentBox?: {
    setBgFn?: (fn: (text: string) => string) => void;
    paddingX?: number;
    paddingY?: number;
  };
  selfRenderContainer?: {
    setBgFn?: (fn: (text: string) => string) => void;
    paddingX?: number;
    paddingY?: number;
  };
  getRenderShell?: () => string;
  getCallRenderer: () => RenderCall | undefined;
  getResultRenderer: () => RenderResult | undefined;
};

function isOurs(fn: unknown): boolean {
  return typeof fn === "function" && Boolean((fn as { [WRAPPER_MARK]?: boolean })[WRAPPER_MARK]);
}

function mark<T extends (this: ToolHost, ...args: never[]) => unknown>(fn: T, original: unknown): T {
  const tagged = fn as T & { [WRAPPER_MARK]?: boolean; [ORIGINAL]?: unknown };
  tagged[WRAPPER_MARK] = true;
  tagged[ORIGINAL] = original;
  return fn;
}

function unwrap(fn: unknown): unknown {
  if (!isOurs(fn)) return fn;
  return (fn as { [ORIGINAL]?: unknown })[ORIGINAL] ?? fn;
}

function neutralizeBackground(host: ToolHost): void {
  const container =
    host.getRenderShell?.() === "self" ? host.selfRenderContainer : host.contentBox;
  if (!container) return;
  container.paddingX = 0;
  container.paddingY = 0;
  container.setBgFn?.((text) => text);
}

export function installUnknownToolDecoration(): void {
  const proto = ToolExecutionComponent.prototype as unknown as ToolHost;
  const originalGetCall = unwrap(proto.getCallRenderer) as ToolHost["getCallRenderer"];
  const originalGetResult = unwrap(proto.getResultRenderer) as ToolHost["getResultRenderer"];
  const originalGetShell = unwrap(proto.getRenderShell) as ToolHost["getRenderShell"];

  proto.getCallRenderer = mark(function (this: ToolHost) {
    if (this.toolName === "grep" || this.toolName === "read") neutralizeBackground(this);
    if (this.toolName === "read") {
      return (args, theme, context) => {
        try {
          return renderReadCall(args as never, theme, context as never);
        } catch {
          return { render: () => [], invalidate() {} };
        }
      };
    }
    if (isReservedAgentTool(this.toolName) || OWNED_TOOLS.has(this.toolName)) {
      return originalGetCall.call(this);
    }
    neutralizeBackground(this);
    const name = this.toolName;
    return (args, theme, context) =>
      renderFallbackBoxCall(name, args, theme, context as never);
  }, originalGetCall);

  const readResult = batchAwareResult("read");
  proto.getResultRenderer = mark(function (this: ToolHost) {
    if (this.toolName === "grep" || this.toolName === "read") neutralizeBackground(this);
    if (this.toolName === "read") return readResult as RenderResult;
    if (isReservedAgentTool(this.toolName) || OWNED_TOOLS.has(this.toolName)) {
      return originalGetResult.call(this);
    }
    neutralizeBackground(this);
    return renderFallbackBoxResult(this.toolName) as RenderResult;
  }, originalGetResult);

  proto.getRenderShell = mark(function (this: ToolHost) {
    if (this.toolName === "grep" || this.toolName === "read") return "self";
    if (isReservedAgentTool(this.toolName) || OWNED_TOOLS.has(this.toolName)) {
      return originalGetShell?.call(this) ?? "default";
    }
    return "self";
  }, originalGetShell);
}
