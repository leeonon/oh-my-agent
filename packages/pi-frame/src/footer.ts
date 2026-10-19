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

/* ------------------------------------------------------------------ */
/* Current-turn stats (⏱ segment): wall time · TTFT · TPS               */
/* ------------------------------------------------------------------ */

/**
 * Stats for the agent turn in progress — ONE full conversational turn,
 * bounded by before_agent_start → agent_settled (NOT agent_start/end,
 * which re-fire for every internal LLM request and would reset the clock
 * on each tool call). Event collectors live in index.ts; the footer only
 * formats. Ticking is driven by index.ts (250ms interval while running).
 */
export interface TurnLive {
	/** Whole-turn start instant (before_agent_start), undefined when idle-since-boot. */
	startedAt: number | undefined;
	/** Frozen wall duration once the turn settles. */
	settledMs: number | undefined;
	/** Set when the turn ended via user abort. */
	aborted: boolean;
	/** Most recent first-token latency (last completed streaming step). */
	ttftLastMs: number | undefined;
	ttftSumMs: number;
	ttftSamples: number;
	/** Output tokens reported by message_end usage, summed over the turn. */
	outputTokens: number;
	/** Streaming time (post-TTFT) accumulated from settled steps. */
	streamMs: number;
	modelMs: number;
	toolMs: number;
	steps: number;
}

export function freshTurn(): TurnLive {
	return {
		startedAt: undefined,
		settledMs: undefined,
		aborted: false,
		ttftLastMs: undefined,
		ttftSumMs: 0,
		ttftSamples: 0,
		outputTokens: 0,
		streamMs: 0,
		modelMs: 0,
		toolMs: 0,
		steps: 0,
	};
}

export const turnLive: TurnLive = freshTurn();

/** Session-wide accumulators shown in /frame stats. */
export const sessionTotals = {
	turns: 0,
	steps: 0,
	wallMs: 0,
	modelMs: 0,
	toolMs: 0,
	ttftSumMs: 0,
	ttftSamples: 0,
	outputTokens: 0,
};

export function fmtTurnDur(ms: number): string {
	const whole = Math.round(ms / 1000);
	if (whole < 60) return `${Math.max(1, Math.round(ms / 100) / 10)}s`;
	const m = Math.floor(whole / 60);
	if (m < 60) return `${m}m ${String(whole % 60).padStart(2, "0")}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Live TPS over completed streaming steps (usage only exists at message_end). */
export function liveTps(turn: TurnLive): number | undefined {
	if (turn.streamMs <= 0 || turn.outputTokens <= 0) return undefined;
	return (turn.outputTokens / turn.streamMs) * 1000;
}

/** Multi-line /frame stats panel: current turn + session totals. */
export function statsPanel(fg: FgFn): string {
	const dim = (t: string) => tint(fg, "dim", t);
	const val = (t: string) => tint(fg, "muted", t);
	const rows: string[] = [];

	const t = turnLive;
	const running = t.startedAt !== undefined && t.settledMs === undefined;
	const wall = running && t.startedAt !== undefined ? Date.now() - t.startedAt : t.settledMs;
	if (wall !== undefined) {
		const parts = [
			`${val(fmtTurnDur(wall))}${t.aborted ? tint(fg, "error", " ✘") : ""}`,
			`${dim("模型 ")}${val(fmtTurnDur(t.modelMs))}`,
			`${dim("工具 ")}${val(fmtTurnDur(t.toolMs))}`,
			`${val(String(t.steps))}${dim(" 步")}`,
		];
		if (t.ttftLastMs !== undefined) parts.push(`${dim("TTFT ")}${val((t.ttftLastMs / 1000).toFixed(1))}s`);
		const tps = liveTps(t);
		if (tps !== undefined) parts.push(`${val(String(Math.round(tps)))} ${dim("tok/s")}`);
		rows.push(`${dim(running ? "本轮（进行中）" : "本轮")}: ${parts.join(dim(" · "))}`);
	} else {
		rows.push(`${dim("本轮")}: ${dim("还没有完成的对话轮")}`);
	}

	const s = sessionTotals;
	if (s.turns > 0) {
		const streamMs = Math.max(0, s.modelMs - s.ttftSumMs);
		const parts = [
			`${val(String(s.turns))}${dim(" 轮 ")}${val(String(s.steps))}${dim(" 步")}`,
			`${dim("总耗时 ")}${val(fmtTurnDur(s.wallMs))}`,
			`${dim("模型 ")}${val(fmtTurnDur(s.modelMs))}`,
			`${dim("工具 ")}${val(fmtTurnDur(s.toolMs))}`,
		];
		if (s.ttftSamples > 0) {
			parts.push(`${dim("TTFT 均值 ")}${val((s.ttftSumMs / s.ttftSamples / 1000).toFixed(1))}s`);
		}
		if (streamMs > 0) parts.push(`${val(String(Math.round((s.outputTokens / streamMs) * 1000)))} ${dim("tok/s")}`);
		parts.push(`${dim("累计输出 ")}${val(String(Math.round(s.outputTokens)))} ${dim("tok")}`);
		rows.push(`${dim("会话")}: ${parts.join(dim(" · "))}`);
	}
	return rows.join("\n");
}

function segmentText(id: SegmentId, ctx: FooterCtx, footerData: FooterData, fg: FgFn): string | null {
	switch (id) {
		case "cwd":
			return tint(fg, "accent", shortHome(process.cwd()));
		case "git": {
			const branch = footerData.getGitBranch();
			if (!branch || branch === "detached") return null;
			return tint(fg, "dim", `⎇ ${branch}`);
		}
		case "turn": {
			const t = turnLive;
			const running = t.startedAt !== undefined;
			const wall = running && t.startedAt !== undefined ? Date.now() - t.startedAt : t.settledMs;
			if (wall === undefined) return null;
			const sep = tint(fg, "dim", " · ");
			const parts = [
				`${tint(fg, running ? "warning" : "dim", `⏱ ${fmtTurnDur(wall)}`)}`,
			];
			if (t.ttftLastMs !== undefined) {
				parts.push(tint(fg, "dim", `TTFT ${(t.ttftLastMs / 1000).toFixed(1)}s`));
			}
			const tps = liveTps(t);
			if (tps !== undefined) parts.push(tint(fg, "dim", `${Math.round(tps)} tok/s`));
			return parts.join(sep);
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

/** Environment segments drop first on narrow terminals; metrics never drop. */
function dropsWhenNarrow(id: SegmentId): boolean {
	return id === "mcp" || id === "plugins";
}

export function renderFooterRows(
	rows: SegmentId[][],
	width: number,
	ctx: FooterCtx,
	footerData: FooterData,
	fg: FgFn,
): string[] {
	const narrow = width < 90;
	return rows
		.map((row) => {
			const effective = narrow ? row.filter((id) => !dropsWhenNarrow(id)) : row;
			// texts must be parallel to the NON-spacer ids: renderRow walks ids
			// and only advances the text cursor for non-spacer positions.
			const texts = effective
				.filter((id) => id !== "spacer")
				.map((id) => segmentText(id, ctx, footerData, fg));
			return renderRow(effective, width, texts);
		})
		.filter((line) => line.length > 0)
		.map((line) => truncateToWidth(line, width));
}
