// Rounded-box drawing primitives for tool calls, following pi-omp-theme's
// boxed presentation: `╭─ ➔ Bash ✓ ─────╮` / `├─ Output ─────┤` /
// `╰─ 0.12s · ~45 words ─╯`. Lines are foreground-only. bash uses
// renderShell: "self" so Pi does not paint toolPendingBg / toolSuccessBg /
// toolErrorBg behind the frame (those tokens collide with borderMuted).

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { fitLine } from "./fit-line.ts";

export const BOX_HORIZONTAL = "─";
export const BOX_VERTICAL = "│";
export const BOX_TOP_LEFT = "╭";
export const BOX_TOP_RIGHT = "╮";
export const BOX_BOTTOM_LEFT = "╰";
export const BOX_BOTTOM_RIGHT = "╯";
export const BOX_DIVIDER_LEFT = "├";
export const BOX_DIVIDER_RIGHT = "┤";

const BOX_SIDE_PADDING = 1;
/** Dashes drawn between a corner/junction and an embedded label. */
const BOX_LABEL_CAP = BOX_HORIZONTAL.repeat(3);

export function boxWidth(width: number): number {
  return Math.max(0, Math.floor(width));
}

export function boxInnerWidth(width: number): number {
  return Math.max(1, boxWidth(width) - 2 - BOX_SIDE_PADDING * 2);
}

function frame(theme: Theme, text: string): string {
  return theme.fg("borderMuted", text);
}

/**
 * Border line with a pre-styled label embedded after the left corner and an
 * optional pre-styled right-side label before the right corner:
 *
 *   ╭─ ➔ Bash ✓ ────────────╮
 *   ╰─ 0.00s · ~45 words ──── hint ───╯
 *
 * Labels arrive pre-coloured by the caller (ANSI-aware width math).
 */
export type StatsPlacement = "bottom-left" | "bottom-right" | "top-right";

export function boxLabeledBorder(
  theme: Theme,
  start: string,
  end: string,
  leftLabel: string,
  rightLabel: string | undefined,
  width: number,
): string {
  const inner = boxWidth(width) - start.length - end.length;
  const cap = visibleWidth(BOX_LABEL_CAP);
  let left = leftLabel;
  let right = rightLabel ?? "";
  const leftOverhead = (label: string) => (label ? cap + 2 : 0);
  const rightOverhead = (label: string) => (label ? 2 + cap : 0);
  const budget = Math.max(1, inner - 1);
  if (leftOverhead(left) + visibleWidth(left) + rightOverhead(right) + visibleWidth(right) > budget) {
    const maxLeft = budget - leftOverhead(left) - rightOverhead(right) - visibleWidth(right);
    left = maxLeft > 0 ? truncateToWidth(left, maxLeft, "…") : "";
  }
  if (leftOverhead(left) + visibleWidth(left) + rightOverhead(right) + visibleWidth(right) > budget) {
    const maxRight = budget - leftOverhead(left) - visibleWidth(left) - rightOverhead(right);
    right = maxRight > 0 ? truncateToWidth(right, maxRight, "…") : "";
  }
  let fill =
    inner - leftOverhead(left) - visibleWidth(left) - rightOverhead(right) - visibleWidth(right);
  if (fill < 0) {
    left = "";
    right = "";
    fill = Math.max(0, inner);
  }

  let out = frame(theme, start);
  if (left) out += frame(theme, `${BOX_LABEL_CAP} `) + left + frame(theme, " ");
  out += frame(theme, BOX_HORIZONTAL.repeat(fill));
  if (right) out += frame(theme, " ") + right + frame(theme, ` ${BOX_LABEL_CAP}`);
  out += frame(theme, end);
  return fitLine(out, width);
}

/** Title stays on the top-left. Stats follow placement: bottom-left, bottom-right, or top-right. */
export function boxStatsBorders(
  theme: Theme,
  width: number,
  title: string,
  stats: string | undefined,
  placement: StatsPlacement,
): { top: string; bottom: string } {
  const onTop = placement === "top-right" && Boolean(stats);
  const onBottomRight = placement === "bottom-right" && Boolean(stats) && !onTop;
  const onBottomLeft = placement === "bottom-left" && Boolean(stats) && !onTop;
  return {
    top: boxLabeledBorder(
      theme,
      BOX_TOP_LEFT,
      BOX_TOP_RIGHT,
      title,
      onTop ? stats : undefined,
      width,
    ),
    bottom: boxLabeledBorder(
      theme,
      BOX_BOTTOM_LEFT,
      BOX_BOTTOM_RIGHT,
      onBottomLeft ? (stats ?? "") : "",
      onBottomRight ? stats : undefined,
      width,
    ),
  };
}

/**
 * Section break between the call and its output:
 *   ├─── Output ─────────┤
 * The dashes carry the border colour; the pre-styled label is up to the caller.
 */
export function boxInsetLabel(theme: Theme, label: string, width: number): string {
  const inner = boxWidth(width) - BOX_DIVIDER_LEFT.length - BOX_DIVIDER_RIGHT.length;
  let shown = label;
  let fill = inner - (visibleWidth(BOX_LABEL_CAP) + 2 + visibleWidth(shown));
  if (fill < 0) {
    shown = truncateToWidth(label, Math.max(0, inner - visibleWidth(BOX_LABEL_CAP) - 2), "…");
    fill = inner - (visibleWidth(BOX_LABEL_CAP) + 2 + visibleWidth(shown));
  }
  if (fill < 0) {
    shown = "";
    fill = Math.max(0, inner);
  }
  return fitLine(
    frame(theme, `${BOX_DIVIDER_LEFT}${BOX_LABEL_CAP} `) +
      shown +
      frame(theme, ` ${BOX_HORIZONTAL.repeat(fill)}${BOX_DIVIDER_RIGHT}`),
    width,
  );
}

/** Content line with side padding, truncating overflow with `…`. */
export function boxLine(theme: Theme, content: string, width: number): string {
  return boxTintedLine(theme, content, width, "none");
}

/** Same as boxLine, with a full-width row background inside the border. */
export function boxTintedLine(
  theme: Theme,
  content: string,
  width: number,
  tint: "add" | "remove" | "none",
): string {
  const w = boxWidth(width);
  const inner = boxInnerWidth(w);
  const cut = truncateToWidth(content, inner, "…");
  const pad = " ".repeat(Math.max(0, inner - visibleWidth(cut)));
  const side = " ".repeat(BOX_SIDE_PADDING);
  const body = `${side}${cut}${pad}${side}`;
  const painted =
    tint === "add"
      ? theme.bg("toolSuccessBg", body)
      : tint === "remove"
        ? theme.bg("toolErrorBg", body)
        : body;
  return fitLine(`${frame(theme, BOX_VERTICAL)}${painted}${frame(theme, BOX_VERTICAL)}`, width);
}

/** Blank content line: `│                    │`. */
export function boxBlankLine(theme: Theme, width: number): string {
  return boxLine(theme, "", width);
}

/** Vertical padding inside a box. 0 removes the blank rows around content. */
export function boxPads(theme: Theme, width: number, padding: number): string[] {
  const n = Math.max(0, Math.min(2, Math.floor(padding)));
  return Array.from({ length: n }, () => boxBlankLine(theme, width));
}
