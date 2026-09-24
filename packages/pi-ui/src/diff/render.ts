import { getLanguageFromPath, highlightCode, type Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  pickDiffMode,
  planDiffEntries,
  buildDiffRows,
  type DiffEntry,
  type DiffLine,
  type DiffRow,
} from "./parse.ts";

const COLLAPSED_ROWS = 36;
const EXPANDED_ROWS = 160;
const MAX_HL_CHARS = 12_000;
const MAX_HL_ROWS = 120;

const highlightCache = new Map<string, string>();

function highlightLine(path: string, text: string, enabled: boolean): string {
  if (!enabled || text.length > 500) return text;
  const language = getLanguageFromPath(path);
  if (!language) return text;
  const key = `${language}\n${text}`;
  const cached = highlightCache.get(key);
  if (cached) return cached;
  try {
    const painted = highlightCode(text, language)[0] ?? text;
    highlightCache.set(key, painted);
    return painted;
  } catch {
    return text;
  }
}

function gutter(line: DiffLine | undefined): string {
  const num = line?.lineNumber ?? "";
  return num.padStart(4, " ");
}

export type DiffTint = "add" | "remove" | "none";

export interface DiffPaintedLine {
  text: string;
  tint: DiffTint;
}

function tintOf(prefix: string): DiffTint {
  if (prefix === "+") return "add";
  if (prefix === "-") return "remove";
  return "none";
}

function fillCell(theme: Theme, text: string, width: number, tint: DiffTint): string {
  const cut = truncateToWidth(text, width, "…");
  const padded = cut + " ".repeat(Math.max(0, width - visibleWidth(cut)));
  if (tint === "add") return theme.bg("toolSuccessBg", padded);
  if (tint === "remove") return theme.bg("toolErrorBg", padded);
  return padded;
}

function paintUnified(theme: Theme, row: DiffRow, path: string, highlight: boolean, width: number): DiffPaintedLine {
  const line = row.kind === "added" ? row.right : row.left;
  const marker = line.prefix === "+" ? "+" : line.prefix === "-" ? "-" : " ";
  const color = marker === "+" ? "toolDiffAdded" : marker === "-" ? "toolDiffRemoved" : "dim";
  const code = highlightLine(path, line.text, highlight);
  return {
    text: truncateToWidth(`${theme.fg(color, marker)} ${theme.fg("dim", gutter(line))} ${code}`, width, "…"),
    tint: tintOf(marker),
  };
}

function paintSplit(theme: Theme, row: DiffRow, path: string, highlight: boolean, width: number): DiffPaintedLine {
  const gap = 3;
  const col = Math.max(8, Math.floor((width - gap) / 2));
  const cell = (line: DiffLine | undefined) => {
    if (!line) return fillCell(theme, "", col, "none");
    const tint = tintOf(line.prefix);
    const color = tint === "add" ? "toolDiffAdded" : tint === "remove" ? "toolDiffRemoved" : "dim";
    const body = `${theme.fg(color, line.prefix)} ${theme.fg("dim", gutter(line))} ${highlightLine(path, line.text, highlight)}`;
    return fillCell(theme, body, col, tint);
  };
  const left = row.kind === "added" ? undefined : row.left;
  const right = row.kind === "removed" ? undefined : row.right;
  return {
    text: `${cell(left)} ${theme.fg("borderMuted", "│")} ${cell(right)}`,
    tint: "none",
  };
}

function paintEntry(
  theme: Theme,
  entry: DiffEntry,
  mode: "unified" | "split",
  path: string,
  highlight: boolean,
  width: number,
): DiffPaintedLine {
  if (entry.kind === "gap") {
    const noun = entry.hidden === 1 ? "line" : "lines";
    return { text: theme.fg("dim", `⋯ ${entry.hidden} unchanged ${noun} hidden`), tint: "none" };
  }
  if (entry.kind === "omitted") {
    const noun = entry.count === 1 ? "line" : "lines";
    return { text: theme.fg("dim", `⋯ ${entry.count} ${noun} omitted`), tint: "none" };
  }
  return mode === "split"
    ? paintSplit(theme, entry.row, path, highlight, width)
    : paintUnified(theme, entry.row, path, highlight, width);
}

export function renderAdaptiveDiff(
  theme: Theme,
  diff: string,
  path: string,
  width: number,
  expanded: boolean,
  additions: number,
  removals: number,
): DiffPaintedLine[] {
  const rows = buildDiffRows(diff);
  if (rows.length === 0) return [];
  const highlight = Boolean(getLanguageFromPath(path)) && diff.length <= MAX_HL_CHARS && rows.length <= MAX_HL_ROWS;
  const mode = pickDiffMode(additions, removals, width);
  const entries = planDiffEntries(rows, expanded ? EXPANDED_ROWS : COLLAPSED_ROWS);
  return entries.map((entry) => paintEntry(theme, entry, mode, path, highlight, width));
}
