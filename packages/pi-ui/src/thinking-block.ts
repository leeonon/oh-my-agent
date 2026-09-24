// Thinking block presentation: animated sweep label, "Thought for Ns" heading,
// tail preview or full body. Styling follows cc's approach — theme colours for
// base text and the highlight band — with omp's width-safe line discipline.

import type { Theme } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import { getConfig } from "./config.ts";
import { fitLine } from "./fit-line.ts";

type ThinkingTheme = Pick<Theme, "fg" | "italic" | "bold">;
type ThinkingStyle = ThinkingTheme;

function styled(theme: ThinkingStyle | undefined, text: string): string {
  if (!theme) return text;
  const colored = theme.fg("thinkingText", text);
  return theme.italic(colored);
}

function highlighted(theme: ThinkingStyle | undefined, text: string): string {
  if (!theme) return text;
  const colored = theme.fg("text", text);
  const weighted = theme.bold(colored);
  return theme.italic(weighted);
}

function dim(theme: ThinkingStyle | undefined, text: string): string {
  if (!theme) return text;
  return theme.fg("dim", text);
}

/** cc-style sweep: a bright bold band gliding over dim italic base text.
 *  Phase derives from the clock at render time, so advancing the animation
 *  only needs a repaint — never a component rebuild. */
const SWEEP_FRAME_MS = 90;

function sweepHeading(label: string, theme: ThinkingStyle | undefined): string {
  const chars = Array.from(label);
  if (chars.length === 0) return "";
  const band = Math.max(1, Math.min(5, Math.ceil(chars.length * 0.28)));
  const frame = Math.floor(Date.now() / SWEEP_FRAME_MS);
  const start = (frame % (chars.length + band)) - band;
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const active = i >= start && i < start + band;
    out += active ? highlighted(theme, chars[i] ?? "") : styled(theme, chars[i] ?? "");
  }
  return out;
}

export function formatThoughtDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

export interface ThinkingBlockInput {
  /** Raw heading text; empty/undefined hides the heading row. */
  heading: string;
  animated: boolean;
  /** "8s" style suffix shown dim next to the heading. */
  durationText: string | undefined;
  text: string;
  padding: number;
  expanded: boolean;
  theme: ThinkingStyle | undefined;
}

export function createThinkingBlock(input: ThinkingBlockInput): Component {
  // Painted-row cache: the block re-renders every TUI frame while its text is
  // unchanged. Cache the fully-styled body rows (wrap + colour + fit), so a
  // frame only recomputes the animated heading. Keyed by width, text length
  // and row budget.
  let cacheWidth = -1;
  let cacheLength = -1;
  let cacheMax = -1;
  let cacheRows: string[] = [];
  return {
    invalidate() {},
    render(width: number): string[] {
      const pad = " ".repeat(input.padding);
      const rows: string[] = [];
      if (input.heading) {
        const head = input.animated
          ? sweepHeading(input.heading, input.theme)
          : styled(input.theme, input.heading);
        const suffix = input.durationText ? dim(input.theme, ` · ${input.durationText}`) : "";
        rows.push(fitLine(`${pad}${head}${suffix}`, width));
      }
      const max = input.expanded ? Number.POSITIVE_INFINITY : getConfig().thinkingLines;
      if (!input.text || max <= 0) return rows;
      const maxKey = Number.isFinite(max) ? max : Number.MAX_SAFE_INTEGER;
      if (cacheWidth !== width || cacheLength !== input.text.length || cacheMax !== maxKey) {
        const inner = Math.max(1, width - input.padding * 2);
        const wrapped = wrapTextWithAnsi(input.text, inner).map((row) => row.trimEnd());
        const body =
          Number.isFinite(max) && wrapped.length > max ? wrapped.slice(-max) : wrapped;
        cacheRows = body.map((row) =>
          fitLine(`${pad}${styled(input.theme, row)}`, width),
        );
        cacheWidth = width;
        cacheLength = input.text.length;
        cacheMax = maxKey;
      }
      rows.push(...cacheRows);
      return rows;
    },
  };
}
