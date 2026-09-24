import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

/** Indent for top-level tree rows (matches pi-omp-theme's quiet-tool panels). */
export const TREE_INDENT = "  ";
/** Entries shown per member/panel before collapsing to "… N more". */
export const TREE_HEAD_LIMIT = 6;
/** Entries shown when the block is expanded. */
export const TREE_EXPANDED_LIMIT = 24;

/**
 * Drop model-facing notice lines (e.g. "[10 results limit reached. ...]")
 * and blank lines from native tool output.
 */
export function stripNoticeLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("[");
    });
}

/** Native ls output: one entry per line, directories carry a trailing `/`. */
export function parseLsOutput(text: string): string[] {
  return stripNoticeLines(text).map((line) => line.trim()).filter(Boolean);
}

/** Native find output: one path per line. */
export function parseFindOutput(text: string): string[] {
  return stripNoticeLines(text).map((line) => line.trim()).filter(Boolean);
}

/** Boxless tree rows for a flat entry list: `  ├─ name` / `  └─ … N more`. */
export function renderOutputTree(
  theme: Theme,
  entries: readonly string[],
  width: number,
  opts: {
    expanded: boolean;
    indent?: string;
    headLimit?: number;
    expandedLimit?: number;
  },
): string[] {
  const limit = opts.expanded
    ? (opts.expandedLimit ?? TREE_EXPANDED_LIMIT)
    : (opts.headLimit ?? TREE_HEAD_LIMIT);
  const indent = opts.indent ?? TREE_INDENT;
  const visible = entries.slice(0, limit);
  const more = entries.length - visible.length;
  const lastIdx = visible.length - 1;
  const rows: string[] = [];
  for (let i = 0; i < visible.length; i++) {
    const name = visible[i] ?? "";
    const branch = i < lastIdx || more > 0 ? "├─" : "└─";
    const color = name.endsWith("/") ? "accent" : "text";
    const line = `${indent}${theme.fg("dim", branch)} ${theme.fg(color, name)}`;
    rows.push(truncateToWidth(line, width, "…"));
  }
  if (more > 0) {
    const moreLine = `${indent}${theme.fg("dim", "└─")} ${theme.fg("dim", `… ${more} more`)}`;
    rows.push(truncateToWidth(moreLine, width, "…"));
  }
  return rows;
}
