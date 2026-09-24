import {
  closeActiveBatches,
  isBatchableTool,
  resetBatchRegistry,
} from "./batch.ts";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { renderBashBoxCall, renderBashBoxResult } from "./bash-box.ts";
import {
  renderEditBoxCall,
  renderEditBoxResult,
  renderWriteBoxCall,
  renderWriteBoxResult,
} from "./mutation-box.ts";
import { loadConfig } from "./config.ts";
import { installUnknownToolDecoration } from "./decorate.ts";
import { installProfiler, profileSnapshot, resetProfile } from "./profile.ts";
import { installThinking, registerThinkingEvents } from "./thinking.ts";
import { installHistory } from "./history.ts";
import { renderGrepCall, renderGrepResult } from "./grep-view.ts";
import {
  renderFindCall,
  renderLsCall,
  renderReadCall,
} from "./tool-call.ts";
import { batchAwareResult } from "./tool-result.ts";

export function registerToolRender(pi: ExtensionAPI): void {
  loadConfig();
  installUnknownToolDecoration();
  installThinking();
  registerThinkingEvents(pi);
  installHistory(pi);
  installProfiler();

  pi.on("session_start", () => {
    resetBatchRegistry();
    installUnknownToolDecoration();
  });
  pi.on("session_shutdown", () => resetBatchRegistry());
  pi.on("message_start", (event: { message?: { role?: string } }) => {
    const role = event.message?.role;
    if (role === "user" || role === "assistant") closeActiveBatches();
  });
  pi.on("tool_execution_start", (event: { toolName?: string }) => {
    if (!isBatchableTool(event.toolName ?? "")) closeActiveBatches();
  });

  const read = createReadToolDefinition(process.cwd());
  pi.registerTool({
    ...read,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return createReadToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
    renderShell: "self",
    renderCall: renderReadCall,
    renderResult: batchAwareResult("read"),
  });

  const ls = createLsToolDefinition(process.cwd());
  pi.registerTool({
    ...ls,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return createLsToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
    renderCall: renderLsCall,
    renderResult: batchAwareResult("ls"),
  });

  const find = createFindToolDefinition(process.cwd());
  pi.registerTool({
    ...find,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return createFindToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
    renderCall: renderFindCall,
    renderResult: batchAwareResult("find"),
  });

  const bash = createBashToolDefinition(process.cwd());
  pi.registerTool({
    ...bash,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return createBashToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
    renderShell: "self",
    renderCall: renderBashBoxCall,
    renderResult: renderBashBoxResult,
  });

  const edit = createEditToolDefinition(process.cwd());
  pi.registerTool({
    ...edit,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return createEditToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
    renderShell: "self",
    renderCall: renderEditBoxCall,
    renderResult: renderEditBoxResult,
  });

  const write = createWriteToolDefinition(process.cwd());
  pi.registerTool({
    ...write,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return createWriteToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
    renderShell: "self",
    renderCall: renderWriteBoxCall,
    renderResult: renderWriteBoxResult,
  });

  const grep = createGrepToolDefinition(process.cwd());
  pi.registerTool({
    ...grep,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return createGrepToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
    renderShell: "self",
    renderCall: renderGrepCall,
    renderResult: renderGrepResult,
  });
}
