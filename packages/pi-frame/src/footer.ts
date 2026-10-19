import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { PiFrameConfig, SegmentId } from "./config.ts";

/* ------------------------------------------------------------------ */
/* Structural types — keep pi-frame decoupled from host version bumps. */
/* ------------------------------------------------------------------ */

interface UsageShape {
	input?: number;
	output?: number;
	cost?: { total?: number };
}

interface EntryShape {
	type?: string;
	message?: { role?: string; usage?: UsageShape };
}

export interface FooterCtx {
	model?: { id?: string; provider?: string } | null;
	sessionManager: {
		getEntries(): EntryShape[];
		getSessionName(): string | undefined;
	};
	getContextUsage():
		| { tokens: number | null; contextWindow: number; percent: number | null }
		| undefined;
	getThinkingLevel(): string;
}

export interface FooterData {
	getGitBranch(): string | null;
	getAvailableProviderCount(): number;
	onBranchChange(callback: () => void): () => void;
}

type FgFn = (token: string, text: string) => string;

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/** Gauge slot count of the context bar (pi-harness `look.gaugeCells` default). */
const CONTEXT_BAR_SLOTS = 8;

/** pi-harness stress colors: green while comfortable, amber past 70, red past 90. */
function stressLevel(percent: number): "success" | "warning" | "error" {
	if (percent >= 90) return "error";
	if (percent >= 70) return "warning";
	return "success";
}

/** Under 10% show one decimal (like pi-harness `percent()`), otherwise whole percents. */
function formatPercent(percent: number | null): string {
	if (percent === null) return "?";
	return percent >= 10 || percent === 0 ? `${Math.round(percent)}%` : `${percent.toFixed(1)}%`;
}

/** Token count formatting, matching pi-harness `count()` (21k, 337k, 1M, 1.5M…). */
function fmtCount(value: number | null | undefined): string {
	if (value === null || value === undefined) return "?";
	const n = Math.max(0, Math.round(value));
	const trim = (fixed: string) => (fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed);
	if (n < 1000) return String(n);
	if (n < 10_000) return `${trim((n / 1000).toFixed(1))}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	if (n < 10_000_000) return `${trim((n / 1_000_000).toFixed(1))}M`;
	return `${Math.round(n / 1_000_000)}M`;
}

function fmtK(n: number): string {
	return fmtCount(n);
}

/** pi-harness stress colors: green while comfortable, amber past 70, red past 90. */
function shortHome(p: string): string {
	const home = homedir();
	return p === home || p.startsWith(home + "/") ? "~" + p.slice(home.length) : p;
}

/** theme.fg throws on unknown tokens — never let a color name kill the footer. */
function tint(fg: FgFn | undefined, token: string, text: string): string {
	if (!fg) return text;
	try {
		return fg(token, text);
	} catch {
		try {
			return fg("dim", text);
		} catch {
			return text;
		}
	}
}

/* ------------------------------------------------------------------ */
/* Token/cost stats with append-only cache                             */
/* ------------------------------------------------------------------ */

interface Stats {
	input: number;
	output: number;
	cost: number;
}

let statsCache: { count: number; last: EntryShape | undefined; stats: Stats } = {
	count: -1,
	last: undefined,
	stats: { input: 0, output: 0, cost: 0 },
};

/**
 * Sum assistant usage over the session. `getEntries()` returns a shallow copy
 * on every call, so cache on (length + last-entry identity): the session is
 * append-only, so an unchanged length + same last entry means nothing changed.
 * This keeps the per-frame render cost at O(1) instead of O(entries).
 */
function tokenStats(ctx: FooterCtx): Stats {
	const entries = ctx.sessionManager.getEntries();
	const last = entries.at(-1);
	if (entries.length === statsCache.count && last === statsCache.last) return statsCache.stats;
	const stats: Stats = { input: 0, output: 0, cost: 0 };
	for (const entry of entries) {
		const message = entry.message;
		if (!message || message.role !== "assistant") continue;
		const usage = message.usage;
		if (!usage) continue;
		stats.input += usage.input ?? 0;
		stats.output += usage.output ?? 0;
		stats.cost += usage.cost?.total ?? 0;
	}
	statsCache = { count: entries.length, last, stats };
	return stats;
}

/* ------------------------------------------------------------------ */
/* One-shot plugin count from settings.json                            */
/* ------------------------------------------------------------------ */

let pluginCount: number | null = null;

function pluginTotal(): number | null {
	if (pluginCount !== null) return pluginCount;
	try {
		const file = join(homedir(), ".pi", "agent", "settings.json");
		if (!existsSync(file)) return (pluginCount = 0);
		const raw = JSON.parse(readFileSync(file, "utf8")) as { packages?: unknown };
		pluginCount = Array.isArray(raw.packages) ? raw.packages.length : 0;
	} catch {
		pluginCount = 0;
	}
	return pluginCount;
}

/* ------------------------------------------------------------------ */
/* Segment rendering                                                   */
/* ------------------------------------------------------------------ */

function segmentText(id: SegmentId, ctx: FooterCtx, footerData: FooterData, fg: FgFn): string | null {
	switch (id) {
		case "cwd":
			return tint(fg, "accent", shortHome(process.cwd()));
		case "git": {
			const branch = footerData.getGitBranch();
			if (!branch || branch === "detached") return null;
			return tint(fg, "dim", branch);
		}
		case "title": {
			const name = ctx.sessionManager.getSessionName();
			if (!name) return null;
			return tint(fg, "dim", `「${name}」`);
		}
		case "model": {
			const model = ctx.model?.id;
			if (!model) return null;
			return tint(fg, "accent", model);
		}
		case "thinking": {
			const level = ctx.getThinkingLevel();
			if (!level || level === "off") return null;
			return tint(fg, "muted", `think ${level}`);
		}
		case "tokens": {
			const { input, output } = tokenStats(ctx);
			if (input === 0 && output === 0) return null;
			return tint(fg, "dim", `↑${fmtK(input)} ↓${fmtK(output)}`);
		}
		case "cost": {
			const { cost } = tokenStats(ctx);
			if (cost <= 0) return null;
			return tint(fg, "dim", `$${cost.toFixed(2)}`);
		}
		case "context": {
			// pi-harness `look` style: `◔ 34% ███░░░░░ 68k/200k`
			const usage = ctx.getContextUsage();
			if (!usage) return null;
			const percent = usage.percent === null ? null : Math.max(0, Math.min(100, usage.percent));
			const p = percent ?? 0;
			const filled = Math.max(0, Math.min(CONTEXT_BAR_SLOTS, Math.round((p / 100) * CONTEXT_BAR_SLOTS)));
			const icon = `${tint(fg, stressLevel(p), "◔")} `;
			const value = tint(fg, stressLevel(p), formatPercent(percent));
			const bar = `${tint(fg, stressLevel(p), "█".repeat(filled))}${tint(fg, "dim", "░".repeat(CONTEXT_BAR_SLOTS - filled))}`;
			const size = tint(fg, "dim", ` ${fmtCount(usage.tokens)}/${fmtCount(usage.contextWindow)}`);
			return `${icon}${value} ${bar}${size}`;
		}
		case "mcp": {
			const count = footerData.getAvailableProviderCount();
			if (!count) return null;
			return tint(fg, "dim", `mcp ${count}`);
		}
		case "plugins": {
			const count = pluginTotal();
			if (!count) return null;
			return tint(fg, "dim", `plugins ${count}`);
		}
		case "spacer":
			return null;
	}
}

/** Join segments into one line; every "spacer" absorbs an equal share of leftover width. */
function renderRow(ids: SegmentId[], width: number, texts: (string | null)[]): string {
	const sep = "  ";
	const parts: string[] = [];
	for (const text of texts) {
		if (text !== null) parts.push(text);
	}
	if (parts.length === 0) return "";

	const spacers = ids.filter((id) => id === "spacer").length;

	if (spacers === 0) return parts.join(sep);

	const contentWidth =
		parts.reduce((n, p) => n + visibleWidth(p), 0) + sep.length * (parts.length - 1);
	const free = Math.max(0, width - contentWidth);
	const share = Math.floor(free / spacers);
	let extra = free - share * spacers;

	// A spacer directly after the first segment must not erase the separator
	// before it; spacers replace the separator role only when adjacent to one.

	// Interleave spacers back at their configured positions. The separator
	// only applies between directly adjacent text segments — a spacer already
	// provides the gap on its own.
	const out: string[] = [];
	let textIndex = 0;
	let pendingSep = false;
	for (const id of ids) {
		if (id === "spacer") {
			out.push(" ".repeat(share + (extra-- > 0 ? 1 : 0)));
			pendingSep = false;
		} else {
			const text = texts[textIndex++];
			if (text) {
				if (pendingSep) out.push(sep);
				out.push(text);
				pendingSep = true;
			}
		}
	}
	return out.join("").trimEnd();
}

/* ------------------------------------------------------------------ */
/* Footer component                                                    */
/* ------------------------------------------------------------------ */

export function renderFooterRows(
	rows: SegmentId[][],
	width: number,
	ctx: FooterCtx,
	footerData: FooterData,
	fg: FgFn,
): string[] {
	return rows
		.map((row) => {
			// texts must be parallel to the NON-spacer ids: renderRow walks ids
			// and only advances the text cursor for non-spacer positions.
			const texts = row
				.filter((id) => id !== "spacer")
				.map((id) => segmentText(id, ctx, footerData, fg));
			return renderRow(row, width, texts);
		})
		.filter((line) => line.length > 0)
		.map((line) => truncateToWidth(line, width));
}
