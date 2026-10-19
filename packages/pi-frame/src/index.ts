import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { FrameEditor } from "./editor-frame.ts";
import {
	loadPiFrameConfig,
	normalizeRows,
	savePiFrameConfig,
	DEFAULT_CONFIG,
	type PiFrameConfig,
	type SegmentId,
} from "./config.ts";
import {
	renderFooterRows,
	turnLive,
	sessionTotals,
	freshTurn,
	fmtTurnDur,
	statsPanel,
	type FooterCtx,
} from "./footer.ts";

function toFooterCtx(ctx: ExtensionContext): FooterCtx {
	return {
		model: ctx.model as FooterCtx["model"],
		sessionManager: ctx.sessionManager as FooterCtx["sessionManager"],
		getContextUsage: () => ctx.getContextUsage(),
		getThinkingLevel: () => ctx.thinkingLevel ?? "off",
	};
}

function installEditor(ctx: ExtensionContext, config: PiFrameConfig): void {
	ctx.ui.setEditorComponent((tui, theme, keybindings) => {
		const editor = new FrameEditor(tui, theme, keybindings, {
			paddingX: config.editor.paddingX,
			embedWorkingStatus: true,
		});
		editor.modelProvider = () => ctx.model?.id;
		return editor;
	});
}

let footerTui: { requestRender(): void } | undefined;

function installFooter(ctx: ExtensionContext, config: PiFrameConfig): void {
	const frameCtx = toFooterCtx(ctx);
	ctx.ui.setFooter((tui, theme, footerData) => {
		footerTui = tui;
		const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
		const fg = (token: string, text: string) =>
			theme.fg(token as Parameters<typeof theme.fg>[0], text);
		return {
			dispose: unsubscribe,
			invalidate() {},
			render(width: number): string[] {
				return renderFooterRows(config.footer.rows, width, frameCtx, footerData, fg);
			},
		};
	});
}

function parseOnOff(arg: string | undefined): boolean | null {
	if (arg === "on" || arg === "true" || arg === "1") return true;
	if (arg === "off" || arg === "false" || arg === "0") return false;
	return null;
}

export default function (pi: ExtensionAPI) {
	let config: PiFrameConfig = loadPiFrameConfig();

	pi.registerCommand("frame", {
		description: "pi-frame: status | stats | reload | editor on/off | footer on/off | rows <json>",
		handler: async (args, ctx) => {
			const [verb, ...rest] = args.trim().split(/\s+/);

			switch (verb) {
				case undefined:
				case "": {
					const segments = new Set<SegmentId>();
					for (const row of config.footer.rows) for (const id of row) segments.add(id);
					segments.delete("spacer");
					ctx.ui.notify(
						`pi-frame editor:${config.editor.frame ? "on" : "off"} footer:${
							config.footer.enabled ? "on" : "off"
						} segments:[${[...segments].join(",")}] config:~/.config/pi/pi-frame.json`,
						"info",
					);
					return;
				}
				case "reload": {
					config = loadPiFrameConfig();
					if (config.editor.frame) installEditor(ctx, config);
					if (config.footer.enabled) installFooter(ctx, config);
					ctx.ui.notify("pi-frame config reloaded", "info");
					return;
				}
				case "editor": {
					const value = parseOnOff(rest[0]);
					if (value === null) {
						ctx.ui.notify("usage: /frame editor on|off", "warning");
						return;
					}
					config.editor.frame = value;
					savePiFrameConfig(config);
					if (value) installEditor(ctx, config);
					ctx.ui.notify(`pi-frame editor ${value ? "enabled" : "disabled"} (saved)`, "info");
					return;
				}
				case "footer": {
					const value = parseOnOff(rest[0]);
					if (value === null) {
						ctx.ui.notify("usage: /frame footer on|off", "warning");
						return;
					}
					config.footer.enabled = value;
					savePiFrameConfig(config);
					if (value) installFooter(ctx, config);
					ctx.ui.notify(`pi-frame footer ${value ? "enabled" : "disabled"} (saved)`, "info");
					return;
				}
				case "stats": {
					const fg = (token: string, text: string) => {
						try {
							return ctx.ui.theme.fg(token as Parameters<typeof ctx.ui.theme.fg>[0], text);
						} catch {
							return text;
						}
					};
					ctx.ui.notify(statsPanel(fg), "info");
					return;
				}
				case "rows": {
					const json = args.trim().slice("rows".length).trim();
					try {
						const rows = normalizeRows(JSON.parse(json));
						if (!rows) throw new Error("no valid rows");
						config.footer.rows = rows;
						savePiFrameConfig(config);
						ctx.ui.notify(`pi-frame rows: ${JSON.stringify(rows)}`, "info");
					} catch (error) {
						ctx.ui.notify(
							`invalid rows: ${error instanceof Error ? error.message : String(error)}`,
							"error",
						);
					}
					return;
				}
				default:
					ctx.ui.notify(
						"usage: /frame [status|stats|reload|editor on/off|footer on/off|rows <json>]",
						"warning",
					);
			}
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (config.editor.frame) installEditor(ctx, config);
		if (config.footer.enabled) installFooter(ctx, config);
	});

	// ⏱ current-turn stats. ONE turn = before_agent_start → agent_settled
	// (agent_start/end re-fire per internal LLM request — using them would
	// reset the clock on every tool call). Tick 250ms while running.
	let tick: ReturnType<typeof setInterval> | undefined;
	let turnStartedAt = 0;
	let assistantStartedAt = 0;
	let firstDeltaAt = 0;

	const stopTick = () => {
		if (tick) {
			clearInterval(tick);
			tick = undefined;
		}
	};

	pi.on("before_agent_start", () => {
		turnStartedAt = Date.now();
		Object.assign(turnLive, freshTurn(), { startedAt: turnStartedAt });
		assistantStartedAt = 0;
		firstDeltaAt = 0;
		stopTick();
		tick = setInterval(() => footerTui?.requestRender(), 250);
	});

	pi.on("message_start", (event) => {
		const message = event.message as { role?: string };
		if (message.role !== "assistant") return;
		assistantStartedAt = Date.now();
		firstDeltaAt = 0;
	});

	pi.on("message_update", (event) => {
		if (!assistantStartedAt) return;
		const type = String((event.assistantMessageEvent as { type?: string })?.type ?? "");
		if (type.endsWith("_delta") && !firstDeltaAt) {
			firstDeltaAt = Date.now();
			const ttft = firstDeltaAt - assistantStartedAt;
			turnLive.ttftLastMs = ttft;
			turnLive.ttftSumMs += ttft;
			turnLive.ttftSamples += 1;
		}
	});

	pi.on("message_end", (event) => {
		const message = event.message as { role?: string; usage?: { output?: number } };
		if (message.role !== "assistant") return;
		if (assistantStartedAt) {
			const modelMs = Date.now() - assistantStartedAt;
			turnLive.modelMs += modelMs;
			if (firstDeltaAt) {
				turnLive.streamMs += Math.max(0, Date.now() - firstDeltaAt);
			}
			assistantStartedAt = 0;
		}
		turnLive.outputTokens += message.usage?.output ?? 0;
	});

	pi.on("tool_execution_end", (event) => {
		turnLive.toolMs += event.durationMs ?? 0;
	});

	pi.on("turn_end", () => {
		turnLive.steps += 1;
	});

	pi.on("agent_settled", (event) => {
		stopTick();
		if (!turnStartedAt) return;
		const wallMs = Date.now() - turnStartedAt;
		turnStartedAt = 0;

		// Freeze the live turn, roll it into session totals.
		turnLive.settledMs = wallMs;
		turnLive.aborted = Boolean((event as { aborted?: boolean }).aborted);
		const totals = sessionTotals;
		totals.turns += 1;
		totals.steps += turnLive.steps;
		totals.wallMs += wallMs;
		totals.modelMs += turnLive.modelMs;
		totals.toolMs += turnLive.toolMs;
		totals.ttftSumMs += turnLive.ttftSumMs;
		totals.ttftSamples += turnLive.ttftSamples;
		totals.outputTokens += turnLive.outputTokens;
		footerTui?.requestRender();
	});
}

export { DEFAULT_CONFIG };
