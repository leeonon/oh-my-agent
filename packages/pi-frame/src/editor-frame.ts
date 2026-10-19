import { CustomEditor, type CustomEditorOptions } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { stripAnsi, swapBorderEnds } from "./ansi.ts";

/**
 * Closed, rounded input editor.
 *
 * Pi's stock editor draws only two horizontal rules above and below the text
 * ("no side borders"). This subclass re-frames the whole render: the top rule
 * becomes `╭───╮`, the bottom `╰───╯`, and every content line is flanked with
 * `│`. The render is narrowed by 2 columns so nothing overflows the frame.
 *
 * The top border additionally carries the current model id, right-aligned
 * next to the embedded working status (which stays left-aligned):
 *
 *   ── ✻ Working… ──────────────────── gpt-5.6-sol
 *
 * Scroll indicators ("↑ N more") drawn inside the border rows are preserved.
 *
 * When the autocomplete dropdown is open the stock render order is
 * [topBorder, content…, bottomBorder, list…]; the bottom border is moved
 * below the list so the whole dropdown closes inside the frame.
 */
export class FrameEditor extends CustomEditor {
	/** Injected by the extension so the top border can show the active model. */
	modelProvider: (() => string | undefined) | undefined;

	/** True when a line is a plain `───` border row (after stripping ANSI). */
	private isBorderRow(line: string): boolean {
		const plain = stripAnsi(line);
		return plain.length >= 2 && plain.startsWith("─") && plain.endsWith("─");
	}

	override renderTopBorder(width: number, hiddenLineCount: number): string {
		const base = super.renderTopBorder(width, hiddenLineCount);
		const model = this.modelProvider?.();
		if (!model) return base;
		const label = ` ${model} `;
		const labelWidth = visibleWidth(label);
		// The row is drawn at the inner frame width; the outer swap turns the
		// trailing `─` into the corner glyph (+2 grow). Keep one filler glyph on
		// each side of the label so the model never touches the corners.
		if (labelWidth + 4 > width) return base;
		const available = width - labelWidth - 1;
		const truncated = truncateToWidth(base, available, "");
		const filler = "─".repeat(Math.max(0, available - visibleWidth(truncated)));
		return truncated + this.borderColor(filler + label + "─");
	}
	override render(width: number): string[] {
		const innerWidth = Math.max(6, width - 2);
		const inner = super.render(innerWidth);
		if (inner.length === 0) return inner;

		// Locate the border rows by shape, not position: with the autocomplete
		// dropdown open the stock bottom border sits BEFORE the list rows.
		let topIndex = -1;
		let bottomIndex = -1;
		for (let i = 0; i < inner.length; i++) {
			if (!this.isBorderRow(inner[i]!)) continue;
			if (topIndex === -1) {
				topIndex = i;
			} else {
				bottomIndex = i;
				break;
			}
		}

		const out: string[] = [];
		const bottomLine = bottomIndex !== -1 ? inner[bottomIndex] : undefined;
		for (let i = 0; i < inner.length; i++) {
			if (i === bottomIndex) continue;
			const line = inner[i]!;
			if (i === topIndex) {
				out.push(swapBorderEnds(line, "╭", "╮", 2) ?? line);
				continue;
			}
			out.push(this.flankLine(line, width));
		}
		if (bottomLine !== undefined) {
			out.push(swapBorderEnds(bottomLine, "╰", "╯", 2) ?? this.flankLine(bottomLine, width));
		}
		return out;
	}

	/** Add `│` side borders to a content line, hard-truncating overflow. */
	private flankLine(line: string, width: number): string {
		const bar = this.borderColor("│");
		const body = truncateToWidth(line, Math.max(1, width - 2));
		const pad = " ".repeat(Math.max(0, width - 2 - visibleWidth(body)));
		return bar + body + pad + bar;
	}
}
