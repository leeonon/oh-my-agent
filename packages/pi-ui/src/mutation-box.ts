// Boxed edit/write, same open-box topology as bash:
//
//   ╭─ ➔ Edit ✓ ────────────────────╮
//   │                               │
//   │ packages/pi-ui/src/tools.ts   │
//   │                               │
//   ├─ Diff ────────────────────────┤
//   │ @@ -1,3 +1,4 @@               │
//   │                               │
//   ╰─ 0.12s · 1 file · +3 -1 ──────╯
//
// Stats live in the footer. The call stays an open box once the result arrives.

import type {
  EditToolDetails,
  EditToolInput,
  Theme,
  ToolDefinition,
  WriteToolInput,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { closeActiveBatches } from "./batch.ts";
import { selectBodyLines } from "./body-lines.ts";
import { renderAdaptiveDiff } from "./diff/render.ts";
import { highlightSource } from "./highlight.ts";
import {
  boxInnerWidth,
  boxInsetLabel,
  boxLine,
  boxPads,
  boxStatsBorders,
  boxTintedLine,
  boxWidth,
} from "./box.ts";
import { getConfig } from "./config.ts";
import { stateMemo } from "./memo-lines.ts";
import { shortPath } from "./tool-call.ts";
import { textContent } from "./tool-state.ts";

type ToolCallContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type RenderResultFn = NonNullable<ToolDefinition["renderResult"]>;

interface MutationBoxState {
  startedAt?: number;
  elapsedMs?: number;
  resultSeen?: boolean;
  firstPartialSeen?: boolean;
  statsLabel?: string;
}

const PARTIAL_BODY_LIMIT = 8;

const EMPTY_RESULT: Component = Object.freeze({
  render: () => [],
  invalidate() {},
});

function noteStarted(state: MutationBoxState, _context: ToolCallContext): void {
  if (state.startedAt === undefined) {
    state.startedAt = performance.now();
  }
}

function liveElapsedMs(state: MutationBoxState): number | undefined {
  return state.startedAt === undefined ? undefined : performance.now() - state.startedAt;
}

function freezeElapsed(state: MutationBoxState): number | undefined {
  if (state.elapsedMs === undefined) state.elapsedMs = liveElapsedMs(state);
  return state.elapsedMs;
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

export function countDiffStats(diff: string): { additions: number; removals: number } {
  let additions = 0;
  let removals = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) removals += 1;
  }
  return { additions, removals };
}

function statsFooter(
  theme: Theme,
  elapsedMs: number | undefined,
  additions: number,
  removals: number,
  isError: boolean,
): string {
  const elapsed = elapsedMs === undefined ? "" : `${formatElapsed(elapsedMs)} · `;
  if (isError) {
    return theme.fg("error", "✘ Failed") + theme.fg("dim", elapsedMs === undefined ? "" : ` · ${formatElapsed(elapsedMs)}`);
  }
  const plus =
    additions > 0 ? theme.fg("toolDiffAdded", `+${additions}`) : theme.fg("dim", "+0");
  const minus =
    removals > 0 ? theme.fg("toolDiffRemoved", `-${removals}`) : theme.fg("dim", "-0");
  return theme.fg("dim", `${elapsed}1 file · `) + plus + " " + minus;
}

function mutationTitle(
  theme: Theme,
  label: string,
  context: ToolCallContext,
  running: boolean,
): string {
  const mark = context.isError ? "✘" : running ? "⟳" : "✓";
  const markColor = context.isError ? "error" : running ? "muted" : "success";
  return `${theme.fg("muted", `➔ ${label} `)}${theme.fg(markColor, mark)}`;
}

function renderMutationCall(
  label: string,
  path: string,
  pendingHint: string,
  theme: Theme,
  context: ToolCallContext,
): Component {
  closeActiveBatches();
  const state = context.state as MutationBoxState;
  noteStarted(state, context);
  const display = shortPath(path, context.cwd) || path || "(unknown)";
  const memo = stateMemo(state, "call", (width: number): string[] => buildMutationRows(theme, state, context, width, label, display, pendingHint), () => `${state.resultSeen ? 1 : 0}${context.isError ? 1 : 0}${getConfig().statsPlacement}${getConfig().boxPadding}`);
  return {
    invalidate() {},
    render(width: number): string[] {
      if (!state.resultSeen && context.isPartial !== false) {
        return buildMutationRows(theme, state, context, boxWidth(width), label, display, pendingHint);
      }
      return memo(width);
    },
  };
}

function buildMutationRows(
  theme: Theme,
  state: MutationBoxState,
  context: ToolCallContext,
  width: number,
  label: string,
  display: string,
  pendingHint: string,
): string[] {
  return (() => {
      const w = boxWidth(width);
      const running = !state.resultSeen && context.isPartial !== false;
      const elapsed = liveElapsedMs(state);
      const runningLabel = theme.fg(
        "dim",
        elapsed === undefined ? "Running" : `Running · ${formatElapsed(elapsed)}`,
      );
      const stats = state.statsLabel ?? (running ? runningLabel : undefined);
      const frame = boxStatsBorders(
        theme,
        w,
        mutationTitle(theme, label, context, running),
        stats,
        getConfig().statsPlacement,
      );
      const pathLine = boxLine(theme, theme.fg("accent", display), w);
      const pad = boxPads(theme, w, getConfig().boxPadding);
      if (!running) {
        return [frame.top, ...pad, pathLine, ...pad];
      }
      return [
        frame.top,
        ...pad,
        pathLine,
        ...pad,
        boxLine(theme, theme.fg("dim", pendingHint), w),
        frame.bottom,
      ];
  })();
}

function renderMutationResult(
  section: string,
  body: string,
  additions: number,
  removals: number,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: ToolCallContext,
  highlightPath: string,
  kind: "diff" | "content",
): Component {
  const state = context.state as MutationBoxState;
  state.resultSeen = true;

  if (options.isPartial) {
    const first = !state.firstPartialSeen;
    state.firstPartialSeen = true;
    if (first) return EMPTY_RESULT;
    return {
      invalidate() {},
      render(width: number): string[] {
        const w = boxWidth(width);
        return body
          .split("\n")
          .slice(0, PARTIAL_BODY_LIMIT)
          .map((line) => boxLine(theme, line, w));
      },
    };
  }

  const elapsedMs = freezeElapsed(state);
  const isError = Boolean(context.isError);
  state.statsLabel = statsFooter(theme, elapsedMs, additions, removals, isError);

  return {
    invalidate() {},
    render: stateMemo(
      state,
      "result",
      (width: number): string[] => {
      const w = boxWidth(width);
      const diffLines =
        kind === "diff" && !isError
          ? renderAdaptiveDiff(
              theme,
              body,
              highlightPath,
              boxInnerWidth(w),
              options.expanded,
              additions,
              removals,
            )
          : [];
      const selected = kind === "diff" ? undefined : selectBodyLines(body, options.expanded);
      const hasBody = diffLines.length > 0 || (selected?.lines.length ?? 0) > 0 || (isError && body.trim().length === 0);
      const rows: string[] = [];
      if (hasBody) {
        rows.push(boxInsetLabel(theme, theme.fg("muted", section), w), ...boxPads(theme, w, getConfig().boxPadding));
        if (isError) {
          const message = body.trim() || "Failed";
          rows.push(boxLine(theme, theme.fg("error", message), w));
        } else if (kind === "diff") {
          for (const line of diffLines) {
            rows.push(
              line.tint === "none" ? boxLine(theme, line.text, w) : boxTintedLine(theme, line.text, w, line.tint),
            );
          }
        } else {
          const contentLines = selected?.lines ?? [];
          const highlighted = highlightSource(highlightPath, contentLines.join("\n"));
          for (let i = 0; i < contentLines.length; i++) {
            rows.push(boxLine(theme, highlighted?.[i] ?? contentLines[i] ?? "", w));
          }
          if ((selected?.omitted ?? 0) > 0) {
            rows.push(boxLine(theme, theme.fg("dim", `… ${selected?.omitted} more lines omitted`), w));
          }
        }
        rows.push(...boxPads(theme, w, getConfig().boxPadding));
      }
      rows.push(boxStatsBorders(theme, w, "", state.statsLabel, getConfig().statsPlacement).bottom);
      return rows;
      },
      () => `${options.expanded ? 1 : 0}${isError ? 1 : 0}${body.length}${getConfig().boxPadding}${getConfig().statsPlacement}`,
    ),
  };
}

export function renderEditBoxCall(
  args: EditToolInput,
  theme: Theme,
  context: ToolCallContext,
): Component {
  return renderMutationCall("Edit", args.path ?? "", "Applying edit…", theme, context);
}

export const renderEditBoxResult: RenderResultFn = (result, options, theme, context) => {
  const details = result.details as EditToolDetails | undefined;
  const diff = typeof details?.diff === "string" ? details.diff : "";
  const stats = countDiffStats(diff);
  const body = context.isError ? textContent(result).trim() : diff;
  const path = String((context.args as EditToolInput).path ?? "");
  return renderMutationResult(
    "Diff",
    body,
    stats.additions,
    stats.removals,
    options,
    theme,
    context,
    path,
    "diff",
  );
};

export function renderWriteBoxCall(
  args: WriteToolInput,
  theme: Theme,
  context: ToolCallContext,
): Component {
  return renderMutationCall("Write", args.path ?? "", "Writing file…", theme, context);
}

export const renderWriteBoxResult: RenderResultFn = (result, options, theme, context) => {
  const args = context.args as WriteToolInput;
  const content = typeof args.content === "string" ? args.content : "";
  const lines = content.length === 0 ? 0 : content.split("\n").length;
  const body = context.isError ? textContent(result).trim() : content;
  return renderMutationResult(
    "Content",
    body,
    lines,
    0,
    options,
    theme,
    context,
    args.path,
    "content",
  );
};
