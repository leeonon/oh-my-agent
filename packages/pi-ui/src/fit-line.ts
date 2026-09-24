import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Never hand the TUI a line wider than `width`. One extra column crashes Pi. */
export function fitLine(text: string, width: number): string {
  const max = Math.max(0, Math.floor(width));
  if (max === 0) return "";
  let line = truncateToWidth(text, max, "…");
  let guard = 0;
  while (visibleWidth(line) > max && line.length > 0 && guard < 8) {
    line = truncateToWidth(line.slice(0, -1), max, "");
    guard += 1;
  }
  return visibleWidth(line) > max ? "" : line;
}

export function fitLines(lines: string[], width: number): string[] {
  return lines.map((line) => fitLine(line, width));
}
