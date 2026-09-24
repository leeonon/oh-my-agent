// Boxed fallback for MCP / unknown tools (omp generic box).
// Same open-box topology as bash: running card, then Output + footer.

import type { Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { closeActiveBatches } from "./batch.ts";
import {
  boxInsetLabel,
  boxLine,
  boxPads,
  boxStatsBorders,
  boxWidth,
} from "./box.ts";
import { getConfig } from "./config.ts";
import { stateMemo } from "./memo-lines.ts";
import { selectBodyLines } from "./body-lines.ts";
import { formatMcpToolName, isMcpToolName } from "./mcp-name.ts";
import { textContent } from "./tool-state.ts";

type ToolCallContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type RenderResultFn = NonNullable<ToolDefinition["renderResult"]>;

interface FallbackBoxState {
  startedAt?: number;
  elapsedMs?: number;
  resultSeen?: boolean;
  firstPartialSeen?: boolean;
  statsLabel?: string;
}

const PARTIAL_BODY_LIMIT = 8;
const MAX_PARAM_LINES = 8;
const MAX_PARAM_VALUE = 120;

const EMPTY_RESULT: Component = Object.freeze({
  render: () => [],
  invalidate() {},
});

function noteStarted(state: FallbackBoxState): void {
  if (state.startedAt === undefined) state.startedAt = performance.now();
}

function liveElapsedMs(state: FallbackBoxState): number | undefined {
  return state.startedAt === undefined ? undefined : performance.now() - state.startedAt;
}

function freezeElapsed(state: FallbackBoxState): number | undefined {
  if (state.elapsedMs === undefined) state.elapsedMs = liveElapsedMs(state);
  return state.elapsedMs;
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return String(value);
  if (typeof value === "string") {
    return value.length <= MAX_PARAM_VALUE ? value : `${value.slice(0, MAX_PARAM_VALUE)}…`;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  if (typeof value === "object") {
    const keys = Object.keys(value);
    return `{${keys.length} ${keys.length === 1 ? "key" : "keys"}}`;
  }
  return String(value);
}

function paramLines(args: unknown, theme: Theme): string[] {
  if (args === undefined || args === null || typeof args !== "object" || Array.isArray(args)) {
    return [];
  }
  return Object.entries(args as Record<string, unknown>)
    .slice(0, MAX_PARAM_LINES)
    .map(([key, value]) => `${theme.fg("dim", `${key}: `)}${theme.fg("text", formatValue(value))}`);
}

function displayName(toolName: string): string {
  return isMcpToolName(toolName) ? formatMcpToolName(toolName) : toolName;
}

function titleLine(theme: Theme, name: string, context: ToolCallContext, running: boolean): string {
  const mark = context.isError ? "✘" : running ? "⟳" : "✓";
  const markColor = context.isError ? "error" : running ? "muted" : "success";
  return `${theme.fg("muted", `➔ ${displayName(name)} `)}${theme.fg(markColor, mark)}`;
}

export function renderFallbackBoxCall(
  toolName: string,
  args: Record<string, unknown>,
  theme: Theme,
  context: ToolCallContext,
): Component {
  closeActiveBatches();
  const state = context.state as FallbackBoxState;
  noteStarted(state);
  const memo = stateMemo(state, "call", (width: number): string[] => buildFallbackRows(theme, state, context, width, toolName, args), () => `${state.resultSeen ? 1 : 0}${context.isError ? 1 : 0}${getConfig().statsPlacement}${getConfig().boxPadding}`);
  return {
    invalidate() {},
    render(width: number): string[] {
      if (!state.resultSeen && context.isPartial !== false) {
        return buildFallbackRows(theme, state, context, boxWidth(width), toolName, args);
      }
      return memo(width);
    },
  };
}

function buildFallbackRows(
  theme: Theme,
  state: FallbackBoxState,
  context: ToolCallContext,
  width: number,
  toolName: string,
  args: Record<string, unknown>,
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
        titleLine(theme, toolName, context, running),
        stats,
        getConfig().statsPlacement,
      );
      const params = paramLines(args, theme).map((line) => boxLine(theme, line, w));
      const body = params.length > 0 ? params : [boxLine(theme, theme.fg("dim", ""), w)];
      const pad = boxPads(theme, w, getConfig().boxPadding);
      if (!running) {
        return [frame.top, ...pad, ...body, ...pad];
      }
      return [frame.top, ...pad, ...body, ...pad, frame.bottom];
  })();
}

export function renderFallbackBoxResult(
  toolName: string,
): RenderResultFn {
  return (result, options, theme, context) => {
    const state = context.state as FallbackBoxState;
    state.resultSeen = true;
    const raw = textContent(result).trimEnd();

    if (options.isPartial) {
      const first = !state.firstPartialSeen;
      state.firstPartialSeen = true;
      if (first) return EMPTY_RESULT;
      return {
        invalidate() {},
        render(width: number): string[] {
          const w = boxWidth(width);
          return raw
            .split("\n")
            .slice(0, PARTIAL_BODY_LIMIT)
            .map((line) => boxLine(theme, line, w));
        },
      };
    }

    const elapsedMs = freezeElapsed(state);
    const isError = Boolean(context.isError);
    void toolName;
    const elapsed = elapsedMs === undefined ? "" : `${formatElapsed(elapsedMs)} · `;
    state.statsLabel = isError
      ? theme.fg("error", "✘ Failed") + theme.fg("dim", elapsedMs === undefined ? "" : ` · ${formatElapsed(elapsedMs)}`)
      : theme.fg("dim", `${elapsed}~${raw.trim().split(/\s+/).filter(Boolean).length} words`);

    return {
      invalidate() {},
      render: stateMemo(
        state,
        "result",
        (width: number): string[] => {
          const w = boxWidth(width);
          const { lines, omitted } = selectBodyLines(raw, options.expanded);
        const rows: string[] = [];
        if (lines.length > 0) {
          rows.push(boxInsetLabel(theme, theme.fg("muted", "Output"), w), ...boxPads(theme, w, getConfig().boxPadding));
          for (const line of lines) {
            rows.push(boxLine(theme, isError ? theme.fg("error", line) : line, w));
          }
          if (omitted > 0) {
            rows.push(boxLine(theme, theme.fg("dim", `… ${omitted} more lines omitted`), w));
          }
          rows.push(...boxPads(theme, w, getConfig().boxPadding));
        } else if (isError && raw.trim().length === 0) {
          const pad = boxPads(theme, w, getConfig().boxPadding);
          rows.push(...pad, boxLine(theme, theme.fg("error", "Failed without producing output"), w), ...pad);
        }
        rows.push(boxStatsBorders(theme, w, "", state.statsLabel, getConfig().statsPlacement).bottom);
          return rows;
        },
        () => `${options.expanded ? 1 : 0}${isError ? 1 : 0}${raw.length}${getConfig().boxPadding}${getConfig().statsPlacement}`,
      ),
    };
  };
}
