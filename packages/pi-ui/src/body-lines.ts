import { getConfig } from "./config.ts";

const OUTPUT_EXPANDED_LIMIT = 50;

export function selectBodyLines(body: string, expanded: boolean): { lines: string[]; omitted: number } {
  const all = body.length === 0 ? [] : body.split("\n");
  if (all.length === 0) return { lines: [], omitted: 0 };
  if (expanded) {
    const visible = all.slice(0, OUTPUT_EXPANDED_LIMIT);
    return { lines: visible, omitted: all.length - visible.length };
  }
  const budget = getConfig().collapsedResultLines;
  if (budget <= 0) return { lines: [], omitted: all.length };
  const visible = all.slice(0, budget);
  return { lines: visible, omitted: all.length - visible.length };
}
