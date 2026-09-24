// Boxed presentation for the bash tool, following pi-omp-theme:
//
//   ╭─ ➔ Bash ✓ ───────────────────╮
//   │                              │
//   │ $ ls -la packages/pi-ui      │
//   │                              │
//   ├─ Output ─────────────────────┤
//   │ src/                         │
//   │ …                            │
//   ╰─ 0.12s · ~45 words ──────────╯
//
// While the tool runs, the call renders a closed box with a running footer.
// Once the first (partial) result is seen, the call box stays open and the
// result component continues it with the Output divider and the footer.
// Per-row state lives in context.state (shared between call and result).

import type { BashToolInput, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { closeActiveBatches } from "./batch.ts";
import {
  boxBlankLine,
  boxInsetLabel,
  boxLine,
  boxPads,
  boxStatsBorders,
  boxWidth,
} from "./box.ts";
import { getConfig } from "./config.ts";
import { selectBodyLines } from "./body-lines.ts";
import { stateMemo } from "./memo-lines.ts";
import { textContent } from "./tool-state.ts";

type ToolCallContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type RenderResultFn = NonNullable<ToolDefinition["renderResult"]>;

interface BashBoxState {
  startedAt?: number;
  elapsedMs?: number;
  resultSeen?: boolean;
  firstPartialSeen?: boolean;
  statsLabel?: string;
}

const MAX_COMMAND_LINES = 5;
const PARTIAL_BODY_LIMIT = 8;

const EMPTY_RESULT: Component = Object.freeze({
  render: () => [],
  invalidate() {},
});

// ── Terminal status detection ────────────────────────────────────────────────
// pi's bash tool appends a `\n\n<status>` suffix to failed results (nonzero
// exit, timeout, abort). Parse it off so the footer carries the real status.

export type BashTerminalStatus =
  | { kind: "exit"; exitCode: number }
  | { kind: "timeout"; seconds: number }
  | { kind: "cancelled" };

const STATUS_PATTERNS: ReadonlyArray<{
  re: RegExp;
  build: (match: RegExpMatchArray) => BashTerminalStatus;
}> = [
  {
    re: /(?:^|\n\n)Command timed out after ([\d.]+) seconds$/i,
    build: (match) => ({ kind: "timeout", seconds: Number(match[1]) }),
  },
  { re: /(?:^|\n\n)[^\n]*aborted$/i, build: () => ({ kind: "cancelled" }) },
  {
    re: /(?:^|\n\n)Command exited with code (\d+)$/i,
    build: (match) => ({ kind: "exit", exitCode: Number(match[1]) }),
  },
];

export function parseBashTerminalStatus(text: string): {
  status: BashTerminalStatus | undefined;
  body: string;
} {
  const clean = String(text ?? "").replace(/\r/g, "");
  for (const { re, build } of STATUS_PATTERNS) {
    const match = clean.match(re);
    if (match && match.index !== undefined) {
      return { status: build(match), body: clean.slice(0, match.index).trimEnd() };
    }
  }
  if (/^(?:operation )?aborted(?: after \d+ retry attempts?)?$/i.test(clean.trim())) {
    return { status: { kind: "cancelled" }, body: "" };
  }
  return { status: undefined, body: clean };
}

// ── Shell command highlighting (simplified) ─────────────────────────────────

const SHELL_OPS = new Set(["&&", "||", "|", ";", ">", ">>", "<", "2>", "&"]);

function commentStart(line: string): number {
  const match = /(^|\s)#/.exec(line);
  return match ? (match.index ?? 0) + (match[1]?.length ?? 0) : -1;
}

function highlightShellLine(theme: Theme, line: string): string {
  const hash = commentStart(line);
  const head = hash >= 0 ? line.slice(0, hash) : line;
  const tail = hash >= 0 ? line.slice(hash) : "";
  let commandExpected = true;
  const styled = head
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token;
      if (SHELL_OPS.has(token)) {
        commandExpected = token === "|" || token === "||" || token === "&&" || token === ";" || token === "&";
        return theme.fg("syntaxOperator", token);
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) return token; // env assignment
      const colored = commandExpected ? theme.fg("syntaxFunction", token) : token;
      commandExpected = false;
      return colored;
    })
    .join("");
  return tail ? styled + theme.fg("syntaxComment", tail) : styled;
}

// ── Elapsed bookkeeping ──────────────────────────────────────────────────────

function noteStarted(state: BashBoxState, _context: ToolCallContext): void {
  if (state.startedAt === undefined) {
    state.startedAt = performance.now();
  }
}

function liveElapsedMs(state: BashBoxState): number | undefined {
  return state.startedAt === undefined ? undefined : performance.now() - state.startedAt;
}

function freezeElapsed(state: BashBoxState): number | undefined {
  if (state.elapsedMs === undefined) state.elapsedMs = liveElapsedMs(state);
  return state.elapsedMs;
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function footerText(
  theme: Theme,
  status: BashTerminalStatus | undefined,
  isError: boolean,
  elapsedMs: number | undefined,
  body: string,
): string {
  const elapsed = elapsedMs === undefined ? "" : ` · ${formatElapsed(elapsedMs)}`;
  if (status?.kind === "timeout") {
    const seconds = status.seconds > 0 ? status.seconds : Number.NaN;
    return theme.fg(
      "warning",
      Number.isFinite(seconds) ? `Terminated after ${seconds.toFixed(1)}s` : "Terminated by timeout",
    );
  }
  if (status?.kind === "cancelled") {
    return theme.fg("warning", "Cancelled") + theme.fg("dim", elapsed);
  }
  if (status?.kind === "exit" && isError) {
    return theme.fg("error", `✘ Exit ${status.exitCode}`) + theme.fg("dim", elapsed);
  }
  if (isError) {
    return theme.fg("error", "✘ Failed") + theme.fg("dim", elapsed);
  }
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const elapsedPart = elapsedMs === undefined ? "" : formatElapsed(elapsedMs);
  if (words === 0) return theme.fg("dim", elapsedPart || "Done");
  const prefix = elapsedPart ? `${elapsedPart} · ` : "";
  return theme.fg("dim", `${prefix}~${words} words`);
}

function bodyLine(theme: Theme, line: string, isError: boolean, width: number): string {
  return boxLine(theme, isError ? theme.fg("error", line) : line, width);
}

function emptyBodyText(status: BashTerminalStatus | undefined, isError: boolean): string {
  if (status?.kind === "timeout") return "No output was received before the timeout";
  if (status?.kind === "cancelled") return "Command was cancelled without producing output";
  if (isError) return "Command failed without producing output";
  return "Command completed without producing output";
}

// ── Call renderer ────────────────────────────────────────────────────────────

export function renderBashBoxCall(
  args: BashToolInput,
  theme: Theme,
  context: ToolCallContext,
): Component {
  closeActiveBatches();
  const state = context.state as BashBoxState;
  noteStarted(state, context);
  const memo = stateMemo(state, "call", (width: number): string[] => {
    return buildBashCallRows(args, theme, state, context, width);
  }, () => `${state.resultSeen ? 1 : 0}${context.isError ? 1 : 0}${getConfig().statsPlacement}${getConfig().boxPadding}`);
  return {
    invalidate() {},
    render(width: number): string[] {
      // Running cards re-derive per frame (live elapsed); settled ones memoize.
      if (!state.resultSeen && context.isPartial !== false) {
        return buildBashCallRows(args, theme, state, context, boxWidth(width));
      }
      return memo(width);
    },
  };
}

function buildBashCallRows(
  args: BashToolInput,
  theme: Theme,
  state: BashBoxState,
  context: ToolCallContext,
  width: number,
): string[] {
  return (() => {
      const w = boxWidth(width);
      const command = typeof args?.command === "string" ? args.command : "";
      const commandLines = command.length > 0 ? command.split("\n") : [""];
      const rows: string[] = [];
      const shown = Math.min(commandLines.length, MAX_COMMAND_LINES + 1);
      for (let i = 0; i < shown; i++) {
        const prefix = i === 0 ? theme.fg("dim", "$ ") : theme.fg("dim", "> ");
        rows.push(boxLine(theme, `${prefix}${highlightShellLine(theme, commandLines[i] ?? "")}`, w));
      }
      if (commandLines.length > MAX_COMMAND_LINES + 1) {
        rows.push(
          boxLine(theme, theme.fg("muted", `... ${commandLines.length - MAX_COMMAND_LINES - 1} more lines`), w),
        );
      }

      const running = !state.resultSeen && context.isPartial !== false;
      const mark = context.isError ? "✘" : running ? "⟳" : "✓";
      const markColor = context.isError ? "error" : running ? "muted" : "success";
      const title = `${theme.fg("muted", "➔ Bash ")}${theme.fg(markColor, mark)}`;
      const elapsed = liveElapsedMs(state);
      const runningLabel = theme.fg(
        "dim",
        elapsed === undefined ? "Running" : `Running · ${formatElapsed(elapsed)}`,
      );
      const stats = state.statsLabel ?? (running ? runningLabel : undefined);
      const frame = boxStatsBorders(theme, w, title, stats, getConfig().statsPlacement);

      const pad = boxPads(theme, w, getConfig().boxPadding);
      if (!running) {
        return [frame.top, ...pad, ...rows, ...pad];
      }
      return [
        frame.top,
        ...pad,
        ...rows,
        ...pad,
        boxLine(theme, theme.fg("dim", "No output received yet"), w),
        frame.bottom,
      ];
  })();
}

// ── Result renderer ──────────────────────────────────────────────────────────

export const renderBashBoxResult: RenderResultFn = (result, options, theme, context) => {
  const state = context.state as BashBoxState;
  state.resultSeen = true;
  const raw = textContent(result).trimEnd();

  if (options.isPartial) {
    // Streaming continuation into the open call box: no Output divider and no
    // footer until the tool settles. The first partial pass renders nothing so
    // the running call card stands alone.
    const first = !state.firstPartialSeen;
    state.firstPartialSeen = true;
    if (first) return EMPTY_RESULT;
    return {
      invalidate() {},
      render(width: number): string[] {
        const w = boxWidth(width);
        const lines = raw.split("\n").slice(0, PARTIAL_BODY_LIMIT);
        return lines.map((line) => boxLine(theme, line, w));
      },
    };
  }

  const elapsedMs = freezeElapsed(state);
  const parsed = parseBashTerminalStatus(raw);
  const status = parsed.status;
  const body = /^\(no output\)$/i.test(parsed.body.trim()) ? "" : parsed.body;
  const isError = Boolean(context.isError);
  state.statsLabel = footerText(theme, status, isError, elapsedMs, body);

  return {
    invalidate() {},
    render: stateMemo(
      state,
      "result",
      (width: number): string[] => {
        const w = boxWidth(width);
        const { lines, omitted } = selectBodyLines(body, options.expanded);
        const keepFailureNote =
          body.length === 0 && (isError || status?.kind === "timeout" || status?.kind === "cancelled");
        const rows: string[] = [];
        const pad = boxPads(theme, w, getConfig().boxPadding);
        if (lines.length > 0) {
          rows.push(boxInsetLabel(theme, theme.fg("muted", "Output"), w), ...pad);
          for (const line of lines) rows.push(bodyLine(theme, line, isError, w));
          if (omitted > 0) {
            rows.push(boxLine(theme, theme.fg("dim", `… ${omitted} more lines omitted`), w));
          }
          rows.push(...pad);
        } else if (keepFailureNote) {
          rows.push(...pad, boxLine(theme, theme.fg("error", emptyBodyText(status, isError)), w), ...pad);
        }
        rows.push(boxStatsBorders(theme, w, "", state.statsLabel, getConfig().statsPlacement).bottom);
        return rows;
      },
      () =>
        `${options.expanded ? 1 : 0}${isError ? 1 : 0}${state.resultSeen ? 1 : 0}${status?.kind ?? ""}${body.length}${getConfig().boxPadding}${getConfig().statsPlacement}`,
    ),
  };
};
