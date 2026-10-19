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
import { renderFooterRows, type FooterCtx } from "./footer.ts";

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

function installFooter(ctx: ExtensionContext, config: PiFrameConfig): void {
	const frameCtx = toFooterCtx(ctx);
	ctx.ui.setFooter((tui, theme, footerData) => {
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
		description: "pi-frame: status | reload | editor on/off | footer on/off | rows <json>",
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
						"usage: /frame [status|reload|editor on/off|footer on/off|rows <json>]",
						"warning",
					);
			}
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (config.editor.frame) installEditor(ctx, config);
		if (config.footer.enabled) installFooter(ctx, config);
	});
}

export { DEFAULT_CONFIG };
