import { VERSION, keyText, type Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { WelcomeResources } from "./resources.ts";

/* ------------------------------------------------------------------ */
/* Pixel logo: a 12×8 π matrix rendered as 4 rows of half-block glyphs */
/* (two pixel rows merge into one text row), each row a different      */
/* theme colour for the "colourful" look.                              */
/* ------------------------------------------------------------------ */

const PIXELS = [
	"............",
	".##########.",
	".#####.####.",
	".####...###.",
	".###....###.",
	".###....###.",
	".###....###.",
	".###....###.",
];
const LOGO_RAMP: Array<{ token: Parameters<Theme["fg"]>[0]; bold?: boolean }> = [
	{ token: "muted" },
	{ token: "accent", bold: true },
	{ token: "success", bold: true },
	{ token: "warning" },
];
const LOGO_WIDTH = Math.max(...PIXELS.map((row) => row.length));

function halfBlocks(pixels: readonly string[]): string[] {
	const rows: string[] = [];
	for (let row = 0; row < pixels.length; row += 2) {
		const top = pixels[row] ?? "";
		const bottom = pixels[row + 1] ?? "";
		let line = "";
		for (let column = 0; column < Math.max(top.length, bottom.length); column++) {
			const up = top[column] === "#";
			const down = bottom[column] === "#";
			line += up && down ? "█" : up ? "▀" : down ? "▄" : " ";
		}
		rows.push(line);
	}
	return rows;
}

function renderLogo(theme: Theme): string[] {
	return halfBlocks(PIXELS).map((row, index) => {
		const ramp = LOGO_RAMP[index] ?? { token: "text" as const };
		return theme.fg(ramp.token, ramp.bold ? theme.bold(row) : row);
	});
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const LOGO_COLUMN = LOGO_WIDTH + 8;
const MIN_RIGHT = 34;
const MIN_CARD = 56;
const TAGLINE = "ready when you are";

export interface ProjectInfo {
	cwd: string;
	branch: string | null;
	/** Current model id, shown on the info column. */
	model?: string;
	/** Current thinking level, shown next to the model. */
	thinkingLevel?: string;
	/** Loaded-resource counts, shown as a compact quantity line. */
	skillCount?: number;
	promptCount?: number;
	extensionCount?: number;
}

interface Hint {
	key: string;
	does: string;
}

function HINTS(): Hint[] {
	return [
		{ key: keyText("app.model.select") || "/model", does: "model" },
		{ key: keyText("app.thinking.cycle") || "/thinking", does: "effort" },
		{ key: "/", does: "commands" },
		{ key: "!", does: "shell" },
		{ key: keyText("app.editor.external") || "/editor", does: "external editor" },
		{ key: "/tree", does: "session history" },
	];
}

function pad(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width), "…");
	return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}

function center(text: string, width: number): string {
	const clipped = truncateToWidth(text, width, "");
	const room = Math.max(0, width - visibleWidth(clipped));
	const before = Math.floor(room / 2);
	return `${" ".repeat(before)}${clipped}${" ".repeat(room - before)}`;
}

function title(theme: Theme): string {
	const glyph = theme.bold(theme.fg("accent", "π"));
	return `${glyph} ${theme.bold("pi")} ${dim(theme, `v${VERSION}`)}`;
}

function dim(theme: Theme, text: string): string {
	return theme.fg("dim", text);
}

function segmentList(
	theme: Theme,
	parts: Array<[string, string]>, // [value, label]; value pre-styled
): string {
	const pieces = parts
		.filter(([value]) => value !== "")
		.map(([value, label]) => (label ? `${value} ${dim(theme, label)}` : value));
	return pieces.join(dim(theme, " · "));
}

/** Info column: model/thinking, cwd/branch, loaded-resource counts. */
function infoRows(
	resources: WelcomeResources | undefined,
	project: ProjectInfo,
	theme: Theme,
): string[] {
	const model = project.model || "no model";
	const effort = project.thinkingLevel && project.thinkingLevel !== "off" ? project.thinkingLevel : "";
	const modelRow = segmentList(theme, [
		[theme.fg("accent", model), "model"],
		[theme.fg("muted", effort), effort ? "thinking" : ""],
	]);

	const home = process.env.HOME ?? "";
	const cwd = home && project.cwd.startsWith(home) ? `~${project.cwd.slice(home.length)}` : project.cwd;
	const branch =
		project.branch === null
			? dim(theme, "no git")
			: project.branch === "detached"
				? dim(theme, "git · detached")
				: theme.fg("success", project.branch);
	const pathRow = segmentList(theme, [
		[theme.fg("muted", cwd), ""],
		[branch, ""],
	]);

	const counts: Array<[string, string]> = [];
	if (project.skillCount) counts.push([theme.fg("text", String(project.skillCount)), "skills"]);
	if (project.promptCount) counts.push([theme.fg("text", String(project.promptCount)), "prompts"]);
	if (project.extensionCount) counts.push([theme.fg("text", String(project.extensionCount)), "extensions"]);
	const contextCount = resources?.context.length ?? 0;
	if (contextCount > 0) counts.push([theme.fg("text", String(contextCount)), "context files"]);
	const countRow = counts.length > 0 ? segmentList(theme, counts) : "";

	const rows = [modelRow, pathRow];
	if (countRow) rows.push(countRow);
	return rows;
}

/** Key hints, responsive: two aligned columns when wide, one short row otherwise. */
function hintRows(theme: Theme, width: number): string[] {
	const hints = HINTS();
	const keyWidth = Math.max(...hints.map((hint) => visibleWidth(hint.key)));
	const cell = (hint: Hint) => `${theme.fg("accent", hint.key.padEnd(keyWidth))} ${dim(theme, hint.does)}`;
	const cellWidth = keyWidth + 1 + Math.max(...hints.map((hint) => visibleWidth(hint.does)));
	if (cellWidth * 2 + 3 > width) {
		return hints.slice(0, 3).map(cell);
	}
	const rows: string[] = [];
	for (let index = 0; index < hints.length; index += 2) {
		const first = hints[index];
		const second = hints[index + 1];
		if (first === undefined) break;
		rows.push(
			second === undefined ? cell(first) : `${pad(cell(first), cellWidth)}   ${cell(second)}`,
		);
	}
	return rows;
}

function card(resources: WelcomeResources | undefined, project: ProjectInfo, theme: Theme, width: number): string[] {
	const inner = Math.max(1, width - 4);
	const withLogo = inner - LOGO_COLUMN - 3 >= MIN_RIGHT;
	const rightWidth = withLogo ? inner - LOGO_COLUMN - 3 : inner;

	const right = [
		...infoRows(resources, project, theme),
		dim(theme, "─".repeat(Math.max(0, rightWidth))),
		...hintRows(theme, rightWidth),
	];
	const left = [
		...renderLogo(theme).map((row) => center(row, LOGO_COLUMN)),
		"",
		dim(theme, TAGLINE),
	];

	const rows = Math.max(left.length, right.length);
	const lines: string[] = [];
	lines.push(
		theme.fg("borderMuted", `╭─ ${theme.bold(theme.fg("accent", "π"))} ${theme.bold("pi")} ${dim(theme, `v${VERSION}`)} `) +
			theme.fg("borderMuted", "─".repeat(Math.max(0, width - visibleWidth(title(theme)) - 7)) + "╮"),
	);
	for (let row = 0; row < rows; row++) {
		const content = withLogo
			? `${center(left[row] ?? "", LOGO_COLUMN)} ${theme.fg("borderMuted", "│")} ${pad(right[row] ?? "", rightWidth)}`
			: pad(right[row] ?? "", rightWidth);
		lines.push(`${theme.fg("borderMuted", "│")} ${content} ${theme.fg("borderMuted", "│")}`);
	}
	lines.push(theme.fg("borderMuted", `╰${"─".repeat(Math.max(0, width - 2))}╯`));
	return lines.map((line) => truncateToWidth(line, width, ""));
}

function compact(resources: WelcomeResources | undefined, project: ProjectInfo, theme: Theme, width: number): string[] {
	const separator = dim(theme, " · ");
	const first = [
		title(theme),
		...infoRows(resources, project, theme),
	]
		.filter((part) => part !== "")
		.join(separator);
	const hints = HINTS()
		.map((hint) => `${theme.fg("accent", hint.key)} ${dim(theme, hint.does)}`)
		.join(separator);
	return [first, hints, ""].map((line) => truncateToWidth(` ${line}`, width, "…"));
}

export function renderWelcome(
	resources: WelcomeResources | undefined,
	project: ProjectInfo,
	theme: Theme,
	width: number,
): string[] {
	if (width <= 0) return [];
	if (width < MIN_CARD) return compact(resources, project, theme, width);
	return card(resources, project, theme, width);
}
