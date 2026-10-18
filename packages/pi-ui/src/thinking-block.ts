// Thinking block presentation: animated sweep label, "Thought for Ns" heading,
// tail preview or full body. Styling follows cc's approach — theme colours for
// base text and the highlight band — with omp's width-safe line discipline.
// Visual layer adds: inline markup (bold/code/headings/lists), a muted `│`
// guide with hanging indents, a breathing pulse while the agent is still
// running, and tree connectors for multi-paragraph expanded bodies.

import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import { getConfig, type PiUiColors } from "./config.ts";
import { fitLine } from "./fit-line.ts";

type ThinkingTheme = Pick<Theme, "fg" | "italic" | "bold">;
type ThinkingStyle = ThinkingTheme;

function colorsConfig(): PiUiColors | undefined {
  return getConfig().colors;
}

/** theme.fg with a safe fallback — an unknown token must never kill render. */
function safeFg(theme: ThinkingStyle | undefined, token: string, fallbackToken: string, text: string): string {
  if (!theme) return text;
  try {
    return theme.fg(token as never, text);
  } catch {
    try {
      return theme.fg(fallbackToken as never, text);
    } catch {
      return text;
    }
  }
}

function styled(theme: ThinkingStyle | undefined, text: string): string {
  if (!theme) return text;
  const colored = safeFg(theme, colorsConfig()?.thinking ?? "thinkingText", "thinkingText", text);
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

function muted(theme: ThinkingStyle | undefined, text: string): string {
  if (!theme) return text;
  return theme.fg("muted", text);
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

/** Breathing pulse for "thinking settled, agent still working": a dot whose
 *  brightness cycles dim → muted → accent → muted. Phase comes from the
 *  clock, so it only needs the repaints the running spinner already does. */
const PULSE_FRAME_MS = 180;

function pulseGlyph(theme: ThinkingStyle | undefined, now: number): string {
  const frame = Math.floor(now / PULSE_FRAME_MS) % 4;
  if (frame === 2) return theme ? theme.fg("accent", "•") : "•";
  if (frame === 1 || frame === 3) return muted(theme, "•");
  return dim(theme, "·");
}

export function formatThoughtDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/* ------------------------------------------------------------------ */
/* Lightweight inline markup for thinking text                         */
/* ------------------------------------------------------------------ */

/** Render one physical line: `**bold**`, `` `code` ``, `# heading`, `- list`.
 *  Returns a fully-styled line (markup glyphs consumed), ANSI-safe. */
function renderInlineMarkup(theme: ThinkingStyle | undefined, line: string): string {
  const heading = line.match(/^(\s{0,3})#{1,6}\s+(.*)$/);
  if (heading) {
    const indent = heading[1] ?? "";
    return indent + (theme ? theme.bold(theme.fg("thinkingText", heading[2] ?? "")) : (heading[2] ?? ""));
  }
  const list = line.match(/^(\s*)[-*+]\s+(.*)$/);
  let body = line;
  if (list) body = `${list[1]}${muted(theme, "•")} ${list[2] ?? ""}`;

  // Split on `code` first, then style **bold** inside the plain runs.
  const out: string[] = [];
  const codeParts = body.split(/`([^`]+)`/g);
  for (let i = 0; i < codeParts.length; i++) {
    if (i % 2 === 1) {
      out.push(theme ? theme.bold(theme.fg("accent", codeParts[i] ?? "")) : (codeParts[i] ?? ""));
      continue;
    }
    const run = codeParts[i] ?? "";
    const boldParts = run.split(/\*\*([^*]+)\*\*/g);
    for (let j = 0; j < boldParts.length; j++) {
      if (j % 2 === 1) {
        out.push(highlighted(theme, boldParts[j] ?? ""));
      } else {
        out.push(styled(theme, boldParts[j] ?? ""));
      }
    }
  }
  return out.join("");
}

/** Guide glyph column widths (display columns consumed before body text). */
/** Nerd Font brain glyph used as the thinking guide marker. */
const THINK_GUIDE = "\u{f02b9}";
const THINK_GUIDE_TEXT = THINK_GUIDE + " ";
const TREE_WIDTH = 3; // `├─ ` / `│  ` / `   `

function treePrefix(
  theme: ThinkingStyle | undefined,
  paragraphIndex: number,
  paragraphCount: number,
  firstBodyLine: boolean,
  active: boolean,
): string {
  const color = (text: string) => (active ? (theme ? theme.fg("accent", text) : text) : muted(theme, text));
  const last = paragraphIndex === paragraphCount - 1;
  if (firstBodyLine) return color(last ? "└─ " : "├─ ");
  return last ? "   " : muted(theme, "│  ");
}

export interface ThinkingBlockInput {
  /** Raw heading text; empty/undefined hides the heading row. */
  heading: string;
  /** Streaming sweep on the heading. */
  animated: boolean;
  /** "8s" style suffix shown dim next to the heading. */
  durationText: string | undefined;
  text: string;
  padding: number;
  expanded: boolean;
  theme: ThinkingStyle | undefined;
  /** Agent still running (thinking settled): heading breathes instead of freezing. */
  agentActive?: boolean;
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
        let head: string;
        if (input.animated) {
          head = sweepHeading(input.heading, input.theme);
        } else {
          head = styled(input.theme, input.heading);
          if (input.agentActive) head += ` ${pulseGlyph(input.theme, Date.now())}`;
          else head += ` ${dim(input.theme, "·")}`;
        }
        const suffix = input.durationText ? dim(input.theme, ` · ${input.durationText}`) : "";
        rows.push(fitLine(`${pad}${head}${suffix}`, width));
      }
      const max = input.expanded ? Number.POSITIVE_INFINITY : getConfig().thinkingLines;
      if (!input.text || max <= 0) return rows;
      const maxKey = Number.isFinite(max) ? max : Number.MAX_SAFE_INTEGER;
      if (cacheWidth !== width || cacheLength !== input.text.length || cacheMax !== maxKey) {
        const paragraphs = input.text
          .split(/\n{2,}/)
          .map((chunk) => chunk.replace(/\s+$/, ""))
          .filter((chunk) => chunk.trim().length > 0);
        const useTree = input.expanded && paragraphs.length > 1;
        const guidePrefix = safeFg(input.theme, colorsConfig()?.thinkingGuide ?? "accent", "accent", THINK_GUIDE_TEXT);
        const guideWidth = visibleWidth(guidePrefix);
        const prefixWidth = input.padding + (useTree ? TREE_WIDTH : guideWidth);
        const inner = Math.max(1, width - prefixWidth);

        const painted: string[] = [];
        paragraphs.forEach((paragraph, pIndex) => {
          const wrapped = wrapTextWithAnsi(renderInlineMarkupPerLine(paragraph, input.theme), inner)
            .map((row) => row.trimEnd());
          wrapped.forEach((row, lineIndex) => {
            if (useTree) {
              // treePrefix already carries its trailing space (`├─ `, `│  `, `   `)
              painted.push(`${treePrefix(input.theme, pIndex, paragraphs.length, lineIndex === 0, false)}${row}`);
            } else {
              painted.push(`${guidePrefix}${row}`);
            }
          });
        });

        const body =
          Number.isFinite(max) && painted.length > max ? painted.slice(-max) : painted;
        cacheRows = body.map((row) => fitLine(`${" ".repeat(input.padding)}${row}`, width));
        cacheWidth = width;
        cacheLength = input.text.length;
        cacheMax = maxKey;
      }
      rows.push(...cacheRows);
      return rows;
    },
  };
}

/** Apply inline markup line-by-line, then re-join so wrapping sees final ANSI. */
function renderInlineMarkupPerLine(text: string, theme: ThinkingStyle | undefined): string {
  return text
    .split("\n")
    .map((line) => renderInlineMarkup(theme, line))
    .join("\n");
}
