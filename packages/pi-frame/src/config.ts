import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** A footer row is an ordered list of segment ids; "spacer" absorbs leftover width. */
export type SegmentId =
	| "cwd"
	| "git"
	| "title"
	| "model"
	| "thinking"
	| "tokens"
	| "cost"
	| "context"
	| "mcp"
	| "plugins"
	| "spacer";

export interface PiFrameConfig {
	editor: {
		/** Draw the closed rounded frame around the input editor. */
		frame: boolean;
		/** Inner horizontal padding of the editor (Pi default: 0). */
		paddingX: number;
	};
	footer: {
		enabled: boolean;
		rows: SegmentId[][];
	};
}

export const DEFAULT_CONFIG: PiFrameConfig = {
	editor: { frame: true, paddingX: 0 },
	footer: {
		enabled: true,
		// Model id lives in the editor top border (right-aligned); keep it out
		// of the footer to avoid showing it twice.
		rows: [
			["cwd", "git", "title", "spacer", "thinking"],
			["tokens", "cost", "context", "spacer", "mcp", "plugins"],
		],
	},
};

const SEGMENT_IDS = new Set<string>([
	"cwd",
	"git",
	"title",
	"model",
	"thinking",
	"tokens",
	"cost",
	"context",
	"mcp",
	"plugins",
	"spacer",
]);

export function configPath(): string {
	return join(homedir(), ".config", "pi", "pi-frame.json");
}

export function normalizeRows(value: unknown): SegmentId[][] | undefined {
	if (!Array.isArray(value)) return undefined;
	const rows: SegmentId[][] = [];
	for (const row of value) {
		if (!Array.isArray(row)) continue;
		const ids = row.filter((id): id is SegmentId => typeof id === "string" && SEGMENT_IDS.has(id));
		if (ids.length > 0) rows.push(ids);
	}
	return rows.length > 0 ? rows : undefined;
}

function mergeConfig(raw: unknown): PiFrameConfig {
	const cfg: PiFrameConfig = {
		editor: { ...DEFAULT_CONFIG.editor },
		footer: {
			enabled: DEFAULT_CONFIG.footer.enabled,
			rows: DEFAULT_CONFIG.footer.rows,
		},
	};
	if (typeof raw !== "object" || raw === null) return cfg;
	const root = raw as Record<string, unknown>;

	const editor = root.editor as Record<string, unknown> | undefined;
	if (editor) {
		if (typeof editor.frame === "boolean") cfg.editor.frame = editor.frame;
		if (typeof editor.paddingX === "number" && Number.isFinite(editor.paddingX)) {
			cfg.editor.paddingX = Math.max(0, Math.min(3, Math.floor(editor.paddingX)));
		}
	}

	const footer = root.footer as Record<string, unknown> | undefined;
	if (footer) {
		if (typeof footer.enabled === "boolean") cfg.footer.enabled = footer.enabled;
		const rows = normalizeRows(footer.rows);
		if (rows) cfg.footer.rows = rows;
	}
	return cfg;
}

export function loadPiFrameConfig(): PiFrameConfig {
	try {
		const file = configPath();
		if (!existsSync(file)) return structuredClone(DEFAULT_CONFIG);
		return mergeConfig(JSON.parse(readFileSync(file, "utf8")));
	} catch {
		return structuredClone(DEFAULT_CONFIG);
	}
}

export function savePiFrameConfig(config: PiFrameConfig): void {
	const file = configPath();
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(config, null, 2) + "\n", "utf8");
}
