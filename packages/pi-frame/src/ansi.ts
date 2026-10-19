/**
 * Minimal ANSI handling shared by the framed editor and the footer.
 *
 * Pi renders every line as ANSI-styled text, and the editor embeds a
 * zero-width OSC cursor marker (see pi-tui CURSOR_MARKER). Width math is
 * delegated to pi-tui's own helpers (visibleWidth / truncateToWidth) which
 * understand those sequences; this module only needs two things:
 *   - strip sequences for cheap plain-text checks
 *   - swap the first/last VISIBLE character of a line without touching SGR runs
 */

const ANSI_SEQ = /\x1b(?:\[[0-9;:?]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|_[^\x07\x1b]*(?:\x07|\x1b\\))/g;

/** Remove all ANSI escape sequences (CSI, OSC, and pi-tui's APC cursor marker). */
export function stripAnsi(s: string): string {
	return s.replace(ANSI_SEQ, "");
}

const SGR_HEAD = /^(?:\x1b\[[0-9;:?]*m)+/;
const SGR_TAIL = /(?:\x1b\[[0-9;:?]*m)+$/;

/**
 * Replace the first and last visible character of a single-line border string
 * while preserving any leading/trailing SGR runs around it. `grow` inserts
 * extra `─` glyphs before the last character so an inner-width border can be
 * stretched to the outer frame width. Returns null when the line does not
 * look like a plain border (`───`) so callers can fall back unmodified.
 */
export function swapBorderEnds(line: string, first: string, last: string, grow = 0): string | null {
	const head = SGR_HEAD.exec(line)?.[0] ?? "";
	const rest = line.slice(head.length);
	const tail = SGR_TAIL.exec(rest)?.[0] ?? "";
	const plain = rest.slice(0, rest.length - tail.length);
	if (plain.length < 2) return null;
	if (!plain.startsWith("─") || !plain.endsWith("─")) return null;
	// Border glyphs are single-width, so a 1:1 swap keeps the width identical.
	return head + first + plain.slice(1, -1) + "─".repeat(grow) + last + tail;
}
