export type DiffPrefix = "+" | "-" | " ";

export interface DiffLine {
  prefix: DiffPrefix;
  lineNumber: string;
  text: string;
}

export type DiffRow =
  | { kind: "context"; left: DiffLine; right: DiffLine }
  | { kind: "changed"; left: DiffLine; right: DiffLine }
  | { kind: "added"; right: DiffLine }
  | { kind: "removed"; left: DiffLine };

export type DiffEntry =
  | { kind: "row"; row: DiffRow }
  | { kind: "gap"; hidden: number }
  | { kind: "omitted"; count: number };

const CONTEXT_KEEP = 2;
const CONTEXT_RUN_SHOW_MAX = 4;
/** Inner width before a side-by-side diff is readable. */
export const SPLIT_MIN_WIDTH = 100;

function clean(text: string): string {
  return text.replace(/\t/g, "    ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function parseDiffLine(raw: string): DiffLine | undefined {
  if (/^(?:diff --git |index |--- |\+\+\+ |@@)/.test(raw)) return undefined;
  const match = raw.match(/^([+\- ])(.*)$/);
  if (!match) return undefined;
  const prefix = match[1] as DiffPrefix;
  const rest = match[2] ?? "";
  const body = rest.startsWith(" ") || rest.startsWith("\t") ? rest.slice(1) : rest;
  const gutter = body.match(/^(\d+)\s(.*)$/);
  return {
    prefix,
    lineNumber: gutter?.[1] ?? "",
    text: clean(gutter?.[2] ?? body),
  };
}

function line(prefix: DiffPrefix, lineNumber: number | undefined, text: string): DiffLine {
  return { prefix, lineNumber: lineNumber === undefined ? "" : String(lineNumber), text };
}

export function buildDiffRows(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  const pendingLeft: DiffLine[] = [];
  const pendingRight: DiffLine[] = [];
  let oldCursor: number | undefined;
  let newCursor: number | undefined;

  const flush = () => {
    while (pendingLeft.length > 0 || pendingRight.length > 0) {
      const left = pendingLeft.shift();
      const right = pendingRight.shift();
      if (left && right) rows.push({ kind: "changed", left, right });
      else if (left) rows.push({ kind: "removed", left });
      else if (right) rows.push({ kind: "added", right });
    }
  };

  for (const raw of diff.split("\n")) {
    const parsed = parseDiffLine(raw);
    if (!parsed) continue;
    const num = /^\d+$/.test(parsed.lineNumber) ? Number(parsed.lineNumber) : undefined;
    if (parsed.prefix === "-") {
      const oldNum = num ?? oldCursor;
      if (oldNum !== undefined) oldCursor = oldNum + 1;
      pendingLeft.push(line("-", oldNum, parsed.text));
      continue;
    }
    if (parsed.prefix === "+") {
      const newNum = num ?? newCursor;
      if (newNum !== undefined) newCursor = newNum + 1;
      pendingRight.push(line("+", newNum, parsed.text));
      continue;
    }
    flush();
    const oldNum = num ?? oldCursor;
    const newNum = newCursor ?? oldNum;
    if (oldNum !== undefined) oldCursor = oldNum + 1;
    if (newNum !== undefined) newCursor = newNum + 1;
    rows.push({
      kind: "context",
      left: line(" ", oldNum, parsed.text),
      right: line(" ", newNum, parsed.text),
    });
  }
  flush();
  return rows;
}

export function pickDiffMode(additions: number, removals: number, width: number): "unified" | "split" {
  if (additions <= 0 || removals <= 0) return "unified";
  if (width < SPLIT_MIN_WIDTH) return "unified";
  return "split";
}

function collapseContext(rows: DiffRow[], keep: number, runShowMax: number): DiffEntry[] {
  const out: DiffEntry[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (!row || row.kind !== "context") {
      if (row) out.push({ kind: "row", row });
      i += 1;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j]?.kind === "context") j += 1;
    const run = j - i;
    if (run <= runShowMax) {
      for (let k = i; k < j; k++) out.push({ kind: "row", row: rows[k] as DiffRow });
    } else {
      const keepHead = i === 0 ? 0 : Math.min(keep, run);
      const keepTail = j >= rows.length ? 0 : Math.min(keep, Math.max(0, run - keepHead));
      const hidden = Math.max(0, run - keepHead - keepTail);
      for (let k = i; k < i + keepHead; k++) out.push({ kind: "row", row: rows[k] as DiffRow });
      if (hidden > 0) out.push({ kind: "gap", hidden });
      for (let k = j - keepTail; k < j; k++) out.push({ kind: "row", row: rows[k] as DiffRow });
    }
    i = j;
  }
  return out;
}

export function planDiffEntries(rows: DiffRow[], maxRows: number): DiffEntry[] {
  const budget = Math.max(1, maxRows);
  let entries = collapseContext(rows, CONTEXT_KEEP, CONTEXT_RUN_SHOW_MAX);
  if (entries.length <= budget) return entries;
  entries = collapseContext(rows, 0, 0);
  if (entries.length <= budget) return entries;
  const kept = entries.slice(0, Math.max(1, budget - 1));
  const omitted = entries.length - kept.length;
  return omitted > 0 ? [...kept, { kind: "omitted", count: omitted }] : kept;
}
