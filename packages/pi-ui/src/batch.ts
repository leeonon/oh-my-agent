// Quiet-tool (read/ls/find) call batching, following pi-omp-theme's approach:
// consecutive calls of the same quiet tool merge into a single boxless tree
// panel. The first call (leader) renders the whole panel; every other member
// renders zero lines. Member results register into the batch registry and the
// leader panel re-reads it on every render pass, so no cross-component
// invalidation plumbing is needed beyond the leader's own invalidate.
//
// Batch boundaries (closeActiveBatches): a non-batchable tool starts
// executing, a new user/assistant message starts, or the session resets.

import type { Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { fitLines } from "./fit-line.ts";
import { getConfig } from "./config.ts";
import { stateMemo } from "./memo-lines.ts";
import { renderOutputTree, TREE_EXPANDED_LIMIT, TREE_INDENT } from "./output-tree.ts";

type ToolCallContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type ThemeColor = Parameters<Theme["fg"]>[0];

export type BatchToolName = "read" | "ls" | "find";

const LABELS: Record<BatchToolName, string> = { read: "Read", ls: "List", find: "Find" };
const BATCH_TREE_INDENT = TREE_INDENT;
const BATCH_TREE_HEAD_LIMIT = 6;
const BATCH_TREE_EXPANDED_LIMIT = 50;
const MEMBER_FILE_HEAD_LIMIT = 4;
const MEMBER_FILE_EXPANDED_LIMIT = TREE_EXPANDED_LIMIT;
const ERROR_PREVIEW_LINES = 3;

interface BatchMember {
  readonly toolCallId: string;
  detail: string;
  /** Search pattern, kept for the lone-find header. */
  pattern?: string;
  status: "pending" | "running" | "done";
  isError: boolean;
  errorLines: string[];
  /** Parsed ls/find output entries. */
  entries?: string[];
  /** Read-only display cache. Not sent back to the model. */
  lineCount?: number;
  contentLines?: string[];
}

interface BatchState {
  readonly toolName: BatchToolName;
  readonly leaderId: string;
  readonly startedAt: number;
  members: BatchMember[];
  closed: boolean;
  completedAt?: number;
  invalidateLeader?: () => void;
  lastLines?: string[];
  /** Bumped on every member/result change; drives the leader paint memo. */
  version: number;
}

const activeBatches = new Map<BatchToolName, BatchState>();
const memberByCallId = new Map<string, { batch: BatchState; member: BatchMember }>();

/** Renders zero lines: batch members hide inside the leader's panel. */
export const EMPTY_BATCH_COMPONENT: Component = Object.freeze({
  render: () => [],
  invalidate() {},
});

/** Empty result component for batch members and leaders (distinct identity). */
export const EMPTY_BATCH_RESULT: Component = Object.freeze({
  render: () => [],
  invalidate() {},
});

export function isBatchableTool(name: string): boolean {
  return name === "read" || name === "ls" || name === "find";
}

/** Close every open batch. Existing members keep rendering via the registry. */
export function closeActiveBatches(): void {
  for (const batch of activeBatches.values()) batch.closed = true;
  activeBatches.clear();
}

export function resetBatchRegistry(): void {
  activeBatches.clear();
  memberByCallId.clear();
}

export interface BatchCallInfo {
  readonly isLeader: boolean;
  readonly batch: BatchState;
}

export function registerBatchCall(
  toolName: BatchToolName,
  detail: string,
  context: ToolCallContext,
  opts?: { pattern?: string },
): BatchCallInfo {
  const existing = memberByCallId.get(context.toolCallId);
  if (existing && existing.batch.toolName === toolName) {
    existing.member.detail = detail;
    if (opts?.pattern !== undefined) existing.member.pattern = opts.pattern;
    existing.batch.version += 1;
    return { isLeader: existing.batch.leaderId === context.toolCallId, batch: existing.batch };
  }
  let batch = activeBatches.get(toolName);
  if (!batch || batch.closed) {
    batch = {
      toolName,
      leaderId: context.toolCallId,
      startedAt: performance.now(),
      members: [],
      closed: false,
      version: 0,
    };
    activeBatches.set(toolName, batch);
  }
  const member: BatchMember = {
    toolCallId: context.toolCallId,
    detail,
    status: context.executionStarted ? "running" : "pending",
    isError: false,
    errorLines: [],
    ...(opts?.pattern !== undefined ? { pattern: opts.pattern } : {}),
  };
  batch.members.push(member);
  batch.version += 1;
  memberByCallId.set(context.toolCallId, { batch, member });
  return { isLeader: batch.leaderId === context.toolCallId, batch };
}

export interface BatchResultData {
  readonly isPartial: boolean;
  readonly isError: boolean;
  readonly errorText?: string;
  readonly entries?: readonly string[];
  readonly lineCount?: number;
  readonly contentLines?: readonly string[];
}

export function registerBatchResult(
  toolName: BatchToolName,
  data: BatchResultData,
  context: ToolCallContext,
): void {
  const entry = memberByCallId.get(context.toolCallId);
  if (!entry || entry.batch.toolName !== toolName) return;
  const { batch, member } = entry;
  member.status = data.isPartial ? "running" : "done";
  member.isError = !data.isPartial && data.isError;
  member.errorLines =
    member.isError && data.errorText !== undefined ? previewErrorLines(data.errorText) : [];
  if (data.entries !== undefined) member.entries = [...data.entries];
  if (data.lineCount !== undefined) member.lineCount = data.lineCount;
  if (data.contentLines !== undefined) member.contentLines = [...data.contentLines];
  if (batch.completedAt === undefined && batch.members.every((m) => m.status === "done")) {
    batch.completedAt = performance.now();
  }
  batch.version += 1;
  // Invalidating the leader while it is the one registering (its own
  // updateDisplay → renderResult → here) recurses until stack overflow —
  // that was the million-call invalidate storm. Self-registration needs no
  // kick: the leader's paint memo re-evaluates via its version signature.
  if (context.toolCallId !== batch.leaderId) batch.invalidateLeader?.();
}

function previewErrorLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, ERROR_PREVIEW_LINES);
}

interface BatchStatus {
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  readonly allDone: boolean;
  readonly elapsedMs: number | undefined;
}

function batchStatus(batch: BatchState): BatchStatus {
  let done = 0;
  let failed = 0;
  for (const member of batch.members) {
    if (member.status !== "done") continue;
    done++;
    if (member.isError) failed++;
  }
  const total = batch.members.length;
  const allDone = total > 0 && done === total;
  return {
    total,
    done,
    failed,
    allDone,
    elapsedMs:
      allDone && batch.completedAt !== undefined ? batch.completedAt - batch.startedAt : undefined,
  };
}

function elapsedSuffix(theme: Theme, status: BatchStatus): string {
  if (status.elapsedMs === undefined) return "";
  return theme.fg("dim", ` · ${(status.elapsedMs / 1000).toFixed(2)}s`);
}

function pluralForm(unit: string, count: number): string {
  if (count === 1) return unit;
  if (unit === "entry") return "entries";
  return `${unit}s`;
}

function memberGlyph(theme: Theme, member: BatchMember): string {
  if (member.isError) return theme.fg("error", "✘");
  if (member.status === "done") return theme.fg("success", "✓");
  return theme.fg("muted", "◌");
}

function memberPathColor(member: BatchMember): ThemeColor {
  if (member.isError) return "error";
  return member.status === "done" ? "accent" : "text";
}

function renderErrorLines(theme: Theme, member: BatchMember, width: number): string[] {
  return member.errorLines.map((line) =>
    truncateToWidth(`${BATCH_TREE_INDENT}  ${theme.fg("error", line)}`, width, "…"),
  );
}

/** Nested file subtree under one ls/find member row. */
function renderMemberFiles(
  theme: Theme,
  member: BatchMember,
  width: number,
  expanded: boolean,
  indent: string,
): string[] {
  const entries = member.entries ?? [];
  if (entries.length === 0) return [];
  return renderOutputTree(theme, entries, width, {
    expanded,
    indent,
    headLimit: MEMBER_FILE_HEAD_LIMIT,
    expandedLimit: MEMBER_FILE_EXPANDED_LIMIT,
  });
}

function renderMemberRows(
  theme: Theme,
  batch: BatchState,
  status: BatchStatus,
  width: number,
  expanded: boolean,
): string[] {
  const showGlyphs = !status.allDone || status.failed > 0;
  const limit = expanded ? BATCH_TREE_EXPANDED_LIMIT : BATCH_TREE_HEAD_LIMIT;
  const visible = batch.members.slice(0, limit);
  const more = batch.members.length - visible.length;
  const lastIdx = visible.length - 1;
  const rows: string[] = [];
  for (let i = 0; i < visible.length; i++) {
    const member = visible[i];
    if (!member) continue;
    const branch = i < lastIdx || more > 0 ? "├─" : "└─";
    const glyph = showGlyphs ? ` ${memberGlyph(theme, member)}` : "";
    const line = `${BATCH_TREE_INDENT}${theme.fg("dim", branch)}${glyph} ${theme.fg(
      memberPathColor(member),
      member.detail,
    )}`;
    rows.push(truncateToWidth(line, width, "…"));
    if (member.isError) rows.push(...renderErrorLines(theme, member, width));
    if (batch.toolName !== "read") {
      rows.push(...renderMemberFiles(theme, member, width, expanded, `${BATCH_TREE_INDENT}  `));
    }
  }
  if (more > 0) {
    const moreLine = `${BATCH_TREE_INDENT}${theme.fg("dim", "└─")} ${theme.fg("dim", `… ${more} more`)}`;
    rows.push(truncateToWidth(moreLine, width, "…"));
  }
  return rows;
}

function renderBatchHeader(theme: Theme, batch: BatchState, status: BatchStatus, expanded: boolean): string {
  const label = `${LABELS[batch.toolName]} (${status.total})`;
  if (status.failed > 0) {
    const noun = pluralForm("failure", status.failed);
    return `${theme.fg("error", "✘")} ${theme.fg("muted", theme.bold(label))}${theme.fg("error", ` · ${status.failed} ${noun}`)}`;
  }
  if (status.allDone) {
    const glyph = expanded ? "▾" : "▸";
    return `${theme.fg("muted", glyph)} ${theme.fg("muted", theme.bold(label))}${elapsedSuffix(theme, status)}`;
  }
  if (status.done > 0) {
    return `${theme.fg("muted", "◌")} ${theme.fg("muted", theme.bold(label))}${theme.fg("dim", ` · ${status.done}/${status.total}`)}`;
  }
  return theme.fg("muted", theme.bold(label));
}

/** A lone read collapses to a single inline line: `➔ Read <path>`. */
function readCountSuffix(theme: Theme, member: BatchMember): string {
  if (member.lineCount === undefined) return "";
  const noun = member.lineCount === 1 ? "line" : "lines";
  return theme.fg("dim", ` · ${member.lineCount} ${noun}`);
}

function renderLoneRead(
  theme: Theme,
  batch: BatchState,
  status: BatchStatus,
  width: number,
  expanded: boolean,
): string[] {
  const member = batch.members[0];
  if (!member) return [];
  if (member.isError) {
    const head = truncateToWidth(
      `${theme.fg("error", "✘")} ${theme.fg("muted", theme.bold("Read"))} ${theme.fg("error", member.detail)}`,
      width,
      "…",
    );
    return [head, ...renderErrorLines(theme, member, width)];
  }
  const pathColor = member.status === "done" ? "accent" : "text";
  const head = truncateToWidth(
    `${theme.fg("dim", "➔")} ${theme.fg("muted", theme.bold("Read"))} ${theme.fg(
      pathColor,
      member.detail,
    )}${readCountSuffix(theme, member)}${member.status === "done" ? elapsedSuffix(theme, status) : ""}`,
    width,
    "…",
  );
  if (!expanded || member.status !== "done") return [head];
  const lines = member.contentLines ?? [];
  const limit = getConfig().readLineLimit;
  const shown = lines.slice(0, limit);
  const rows = shown.map((line) => truncateToWidth(`  ${theme.fg("muted", line)}`, width, "…"));
  const total = member.lineCount ?? lines.length;
  if (total > shown.length) {
    rows.push(truncateToWidth(`  ${theme.fg("dim", `… ${total - shown.length} more`)}`, width, "…"));
  }
  return [head, ...rows];
}

/** A lone ls/find renders a flat output tree under a summary header. */
function renderLoneOutputPanel(
  theme: Theme,
  batch: BatchState,
  status: BatchStatus,
  width: number,
  expanded: boolean,
): string[] {
  const member = batch.members[0];
  if (!member) return [];
  const label = LABELS[batch.toolName];
  const unit = batch.toolName === "ls" ? "entry" : "file";
  let head = `${theme.fg("muted", theme.bold(`${label}:`))} `;
  if (batch.toolName === "find" && member.pattern !== undefined) {
    head += `${theme.fg("text", member.pattern)} ${theme.fg("dim", `in ${member.detail}`)}`;
  } else {
    head += theme.fg("text", member.detail);
  }
  if (member.status === "done" && !member.isError) {
    const count = member.entries?.length ?? 0;
    head += ` ${theme.fg("accent", `${count} ${pluralForm(unit, count)}`)}${elapsedSuffix(theme, status)}`;
  }
  if (member.isError) {
    return [
      truncateToWidth(`${theme.fg("error", "✘")} ${head}`, width, "…"),
      ...renderErrorLines(theme, member, width),
    ];
  }
  return [
    truncateToWidth(head, width, "…"),
    ...renderOutputTree(theme, member.entries ?? [], width, { expanded }),
  ];
}

function renderBatchPanelLines(
  theme: Theme,
  batch: BatchState,
  width: number,
  expanded: boolean,
): string[] {
  const status = batchStatus(batch);
  if (batch.members.length === 1) {
    if (batch.toolName === "read") {
      return renderLoneRead(theme, batch, status, width, expanded).map((line) =>
        truncateToWidth(` ${line}`, width, "…"),
      );
    }
    return renderLoneOutputPanel(theme, batch, status, width, expanded);
  }
  const header = renderBatchHeader(theme, batch, status, expanded);
  const lines = [truncateToWidth(header, width, "…"), ...renderMemberRows(theme, batch, status, width, expanded)];
  if (batch.toolName !== "read") return lines;
  return lines.map((line) => truncateToWidth(` ${line}`, width, "…"));
}

/**
 * Leader call component: renders the live batch panel (header + tree) by
 * reading the registry on every render pass. Members render EMPTY_BATCH_COMPONENT.
 */
export function renderBatchAwareCall(
  theme: Theme,
  batch: BatchState,
  context: ToolCallContext,
): Component {
  batch.invalidateLeader = context.invalidate;
  const paint = stateMemo(
    batch as unknown as object,
    "leader-paint",
    (width: number): string[] => {
      try {
        const lines = fitLines(
          renderBatchPanelLines(theme, batch, Math.max(1, width), Boolean(context.expanded)),
          width,
        );
        batch.lastLines = lines;
        return lines;
      } catch {
        return batch.lastLines ?? [];
      }
    },
    () => `${context.expanded ? 1 : 0}|${batch.version}`,
  );
  return {
    invalidate() {},
    render: paint,
  };
}
