import type { GrepToolInput, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { closeActiveBatches } from "./batch.ts";
import { fitLine, fitLines } from "./fit-line.ts";
import { stateMemo } from "./memo-lines.ts";
import { getConfig } from "./config.ts";
import { textContent } from "./tool-state.ts";
import { oneLine, shortPath } from "./tool-call.ts";

type ToolCallContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type RenderResult = NonNullable<ToolDefinition["renderResult"]>;

const GREP_INSET = " ";
const TREE_INDENT = " ";
const SEARCH_ICON = "\u{F002}";
const FILE_ICON_DEFAULT = "\u{E612}";
const FILE_ICONS: Record<string, string> = {
  ts: "\u{E628}",
  tsx: "\u{E7BA}",
  js: "\u{E62C}",
  jsx: "\u{E7BA}",
  mjs: "\u{E62C}",
  cjs: "\u{E62C}",
  json: "\u{E62B}",
  md: "\u{E609}",
  mdx: "\u{E609}",
  css: "\u{E749}",
  scss: "\u{E749}",
  html: "\u{E60E}",
  py: "\u{E606}",
  go: "\u{E627}",
  rs: "\u{E7A8}",
  sh: "\u{E795}",
  yml: "\u{E615}",
  yaml: "\u{E615}",
  toml: "\u{E615}",
};

interface GrepHit {
  file: string;
  line: number;
  content: string;
}

function fileIcon(path: string): string {
  const name = path.split("/").pop() ?? path;
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : lower;
  return FILE_ICONS[ext] ?? FILE_ICONS[lower] ?? FILE_ICON_DEFAULT;
}

function parseHits(text: string): GrepHit[] {
  const hits: GrepHit[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("[")) continue;
    const match = /^(.*?):(\d+):[ \t]?(.*)$/.exec(line);
    if (!match?.[1] || !match[2]) continue;
    hits.push({ file: match[1], line: Number(match[2]), content: match[3] ?? "" });
  }
  return hits;
}

function groupHits(hits: readonly GrepHit[]): { file: string; hits: GrepHit[] }[] {
  const order: string[] = [];
  const buckets = new Map<string, GrepHit[]>();
  for (const hit of hits) {
    let bucket = buckets.get(hit.file);
    if (!bucket) {
      bucket = [];
      buckets.set(hit.file, bucket);
      order.push(hit.file);
    }
    bucket.push(hit);
  }
  return order.map((file) => ({ file, hits: buckets.get(file) ?? [] }));
}

export function renderGrepHeader(args: GrepToolInput, theme: Theme, cwd: string): string {
  const pattern = oneLine(args.pattern ?? "");
  const where = args.path ? shortPath(args.path, cwd) : ".";
  const extra = [args.glob ? ` (${args.glob})` : "", args.limit !== undefined ? ` limit ${args.limit}` : ""].join("");
  return (
    theme.fg("muted", `${SEARCH_ICON} Grep`) +
    theme.fg("muted", ` ${pattern ? `/${pattern}/` : ""}`) +
    theme.fg("dim", ` in ${where}${extra}`)
  );
}

export function renderGrepTree(
  theme: Theme,
  text: string,
  width: number,
  expanded: boolean,
  isError: boolean,
): string[] {
  if (isError) {
    return text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .slice(0, 4)
      .map((line) => truncateToWidth(`${GREP_INSET}${theme.fg("error", line)}`, width, "…"));
  }
  const groups = groupHits(parseHits(text));
  if (groups.length === 0) {
    return [truncateToWidth(`${GREP_INSET}${TREE_INDENT}${theme.fg("dim", "└─")} ${theme.fg("dim", "no matches")}`, width, "…")];
  }
  const limit = expanded ? groups.length : getConfig().grepFileLimit;
  const visible = groups.slice(0, limit);
  const hidden = groups.length - visible.length;
  const rows = visible.map((group, index) => {
    const last = index === visible.length - 1 && hidden === 0;
    const branch = last ? "└─" : "├─";
    const count = theme.fg("dim", ` (${group.hits.length})`);
    return truncateToWidth(
      `${GREP_INSET}${TREE_INDENT}${theme.fg("dim", branch)} ${fileIcon(group.file)} ${theme.fg("text", group.file)}${count}`,
      width,
      "…",
    );
  });
  if (hidden > 0) {
    rows.push(
      truncateToWidth(
        `${GREP_INSET}${TREE_INDENT}${theme.fg("dim", "└─")} ${theme.fg("dim", `… ${hidden} more`)}`,
        width,
        "…",
      ),
    );
  }
  return rows;
}

const EMPTY: Component = { render: () => [], invalidate() {} };

export function renderGrepCall(
  args: GrepToolInput,
  theme: Theme,
  context: ToolCallContext,
): Component {
  closeActiveBatches();
  const memo = stateMemo(context.state, "grep-call", (width: number) => {
    const line = `${GREP_INSET}${renderGrepHeader(args, theme, context.cwd)}`;
    return [fitLine(line, width)];
  }, () => `${args.pattern ?? ""}|${args.path ?? ""}|${args.glob ?? ""}|${args.limit ?? ""}`);
  return {
    invalidate() {},
    render: memo,
  };
}

export const renderGrepResult: RenderResult = (result, options, theme, context) => {
  const text = textContent(result).trimEnd();
  if (options.isPartial && text.length === 0) return EMPTY;
  return {
    invalidate() {},
    render: stateMemo(
      context.state,
      "grep-result",
      (width) =>
        fitLines(renderGrepTree(theme, text, width, options.expanded, Boolean(context.isError)), width),
      () => `${options.expanded ? 1 : 0}${context.isError ? 1 : 0}${text.length}${getConfig().grepFileLimit}`,
    ),
  };
};
