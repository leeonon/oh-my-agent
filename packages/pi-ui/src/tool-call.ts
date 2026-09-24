import type {
  FindToolInput,
  LsToolInput,
  ReadToolInput,
  Theme,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { fitLine } from "./fit-line.ts";
import { isAbsolute, relative } from "node:path";
import {
  EMPTY_BATCH_COMPONENT,
  registerBatchCall,
  renderBatchAwareCall,
} from "./batch.ts";

type ToolCallContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type CallStatus = "pending" | "success" | "error";

function callStatus(context: ToolCallContext): CallStatus {
  if (context.isPartial !== false) return "pending";
  return context.isError ? "error" : "success";
}

function statusIcon(status: CallStatus): string {
  // Nerd Font: spinner U+F110 / hand_okay U+F0A50 / seti-error U+E654
  if (status === "success") return "\u{F0A50}";
  if (status === "error") return "\uE654";
  return "\uF110";
}

function statusColor(status: CallStatus): "success" | "error" | "muted" {
  if (status === "success") return "success";
  if (status === "error") return "error";
  return "muted";
}

export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function shortPath(value: string, cwd: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return trimmed;
  if (!isAbsolute(trimmed)) return trimmed;
  try {
    const rel = relative(cwd || ".", trimmed);
    if (!rel) return ".";
    if (rel.startsWith("..")) return trimmed;
    return rel;
  } catch {
    return trimmed;
  }
}

function renderCallLine(
  theme: Theme,
  context: ToolCallContext,
  title: string,
  subject: string,
  extra = "",
): Component {
  const status = callStatus(context);
  const icon = theme.fg(statusColor(status), statusIcon(status));
  const titleText = theme.fg("muted", title);
  const extraText = extra ? theme.fg("muted", extra) : "";
  const plainExtra = extra;
  const prefix = `${icon} ${title}`;

  return {
    render(width: number): string[] {
      const extraWidth = visibleWidth(plainExtra);
      const subjectBudget = Math.max(0, width - visibleWidth(`${prefix} `) - extraWidth);
      const clippedSubject = subject
        ? ` ${theme.fg("accent", truncateToWidth(subject, subjectBudget, "…"))}`
        : "";
      return [fitLine(`${icon} ${titleText}${clippedSubject}${extraText}`, width)];
    },
    invalidate() {},
  };
}

export function renderReadCall(
  args: ReadToolInput,
  theme: Theme,
  context: ToolCallContext,
): Component {
  try {
    const path = typeof args?.path === "string" ? args.path : "";
    const cwd = typeof context?.cwd === "string" ? context.cwd : "";
    const info = registerBatchCall("read", shortPath(path, cwd), context);
    if (!info.isLeader) return EMPTY_BATCH_COMPONENT;
    return renderBatchAwareCall(theme, info.batch, context);
  } catch {
    return EMPTY_BATCH_COMPONENT;
  }
}

export function renderFindCall(
  args: FindToolInput,
  theme: Theme,
  context: ToolCallContext,
): Component {
  const path = shortPath(args.path || ".", context.cwd);
  const info = registerBatchCall("find", path, context, { pattern: args.pattern });
  if (!info.isLeader) return EMPTY_BATCH_COMPONENT;
  return renderBatchAwareCall(theme, info.batch, context);
}

export function renderLsCall(
  args: LsToolInput,
  theme: Theme,
  context: ToolCallContext,
): Component {
  const path = shortPath(args.path || ".", context.cwd);
  const info = registerBatchCall("ls", path, context);
  if (!info.isLeader) return EMPTY_BATCH_COMPONENT;
  return renderBatchAwareCall(theme, info.batch, context);
}
