import { VERSION, type Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { WelcomeResources, WelcomeSection } from "./resources.ts";
import { stripAnsi } from "./resources.ts";

const PI_BANNER = ["█████████", "███   ███", "██████   ███", "███      ███"];
const BANNER_WIDTH = Math.max(...PI_BANNER.map((line) => visibleWidth(line)));
const MAX_LIST_ROWS_PER_COLUMN = 6;
const MIN_LIST_COLUMN_WIDTH = 22;
const LIST_COLUMN_GAP = 2;
const COLUMN_GAP = 4;
const TWO_COL_MIN_WIDTH = 60;
const INDENT = "  ";
const OUTER_PAD = 2;

export interface ProjectInfo {
  cwd: string;
  branch: string | null;
}

function centerLine(line: string, width: number): string {
  const vis = visibleWidth(line);
  if (vis >= width) return truncateToWidth(line, width, "");
  return " ".repeat(Math.floor((width - vis) / 2)) + line;
}

function centerBlock(lines: string[], blockWidth: number, width: number): string[] {
  const left = Math.max(0, Math.floor((width - blockWidth) / 2));
  const pad = " ".repeat(left);
  return lines.map((line) => {
    const clipped = truncateToWidth(line, Math.max(1, width - left), "");
    return pad + clipped;
  });
}

function padEndVisible(line: string, width: number): string {
  const vis = visibleWidth(line);
  if (vis >= width) return truncateToWidth(line, width, "…");
  return line + " ".repeat(width - vis);
}

function joinColumns(
  left: string[],
  right: string[],
  leftWidth: number,
  gap: number,
  totalWidth: number,
): string[] {
  const rows = Math.max(left.length, right.length);
  const lines: string[] = [];
  for (let i = 0; i < rows; i += 1) {
    const leftLine = padEndVisible(left[i] ?? "", leftWidth);
    const rightLine = right[i] ?? "";
    lines.push(truncateToWidth(`${leftLine}${" ".repeat(gap)}${rightLine}`, totalWidth, ""));
  }
  return lines;
}

function wrapPrefixed(prefix: string, text: string, width: number): string[] {
  const prefixWidth = visibleWidth(prefix);
  if (width <= prefixWidth) return [truncateToWidth(prefix, width, "")];

  const wrapped = wrapTextWithAnsi(text, width - prefixWidth);
  const continuation = " ".repeat(prefixWidth);
  return wrapped.map(
    (line, index) => `${index === 0 ? prefix : continuation}${line}`,
  );
}

function appendSingleColumnRows(
  lines: string[],
  items: string[],
  theme: Theme,
  columnWidth: number,
): void {
  for (const item of items) {
    lines.push(
      ...wrapPrefixed(
        theme.fg("dim", `${INDENT}• `),
        theme.fg("dim", item),
        columnWidth,
      ),
    );
  }
}

function getColumnWidths(listWidth: number, columnCount: number): number[] {
  const totalCellWidth = listWidth - LIST_COLUMN_GAP * (columnCount - 1);
  const baseCellWidth = Math.floor(totalCellWidth / columnCount);
  const widerCellCount = totalCellWidth % columnCount;
  return Array.from(
    { length: columnCount },
    (_, index) => baseCellWidth + (index < widerCellCount ? 1 : 0),
  );
}

function appendColumnRows(
  lines: string[],
  items: string[],
  theme: Theme,
  columnWidth: number,
): void {
  const listWidth = Math.max(1, columnWidth - 2);
  const desiredColumns = Math.ceil(items.length / MAX_LIST_ROWS_PER_COLUMN);
  const fittingColumns = Math.max(
    1,
    Math.floor(
      (listWidth + LIST_COLUMN_GAP) / (MIN_LIST_COLUMN_WIDTH + LIST_COLUMN_GAP),
    ),
  );
  const columnCount = Math.min(desiredColumns, fittingColumns);

  if (columnCount === 1) {
    appendSingleColumnRows(lines, items, theme, columnWidth);
    return;
  }

  const rowsPerColumn = Math.ceil(items.length / columnCount);
  const cellWidths = getColumnWidths(listWidth, columnCount);

  for (let row = 0; row < rowsPerColumn; row += 1) {
    const cells = cellWidths.map((cellWidth, column) => {
      const item = items[column * rowsPerColumn + row];
      if (!item) return " ".repeat(cellWidth);
      const cell = stripAnsi(truncateToWidth(`• ${item}`, cellWidth, "…"));
      return cell + " ".repeat(Math.max(0, cellWidth - visibleWidth(cell)));
    });
    const rowText = `${INDENT}${cells.join(" ".repeat(LIST_COLUMN_GAP))}`.trimEnd();
    lines.push(theme.fg("dim", rowText));
  }
}

function appendSection(
  lines: string[],
  title: WelcomeSection,
  body: string[],
  theme: Theme,
  columnWidth: number,
  singleColumn = false,
): void {
  if (lines.length > 0) lines.push("");
  lines.push(theme.bold(theme.fg("mdHeading", title)));

  if (body.length === 0) {
    lines.push(theme.fg("dim", `${INDENT}none`));
    return;
  }

  if (singleColumn) appendSingleColumnRows(lines, body, theme, columnWidth);
  else appendColumnRows(lines, body, theme, columnWidth);
}

function appendCountSection(
  lines: string[],
  title: WelcomeSection,
  count: number,
  theme: Theme,
): void {
  if (lines.length > 0) lines.push("");
  lines.push(theme.bold(theme.fg("mdHeading", title)));
  lines.push(
    `${INDENT}${theme.fg("accent", String(count))}${theme.fg("dim", " loaded")}`,
  );
}

function renderLogo(theme: Theme, width: number): string[] {
  const banner = centerBlock(
    PI_BANNER.map((line) => theme.bold(theme.fg("accent", line))),
    BANNER_WIDTH,
    width,
  );
  banner.push(centerLine(theme.fg("dim", `v${VERSION}`), width));
  return banner;
}

function renderProject(
  project: ProjectInfo,
  theme: Theme,
  columnWidth: number,
): string[] {
  const lines: string[] = [theme.bold(theme.fg("mdHeading", "Directory"))];
  lines.push(
    ...wrapPrefixed(INDENT, theme.fg("muted", project.cwd), columnWidth),
  );
  const gitLine =
    project.branch === null
      ? "not a git repository"
      : project.branch === "detached"
        ? "git · detached"
        : `git · ${project.branch}`;
  lines.push(`${INDENT}${theme.fg("dim", gitLine)}`);
  return lines;
}

function renderResources(
  resources: WelcomeResources | undefined,
  theme: Theme,
  columnWidth: number,
): string[] {
  const lines: string[] = [];
  appendSection(lines, "Context", resources?.context ?? [], theme, columnWidth, true);
  appendCountSection(lines, "Skills", resources?.skills.length ?? 0, theme);
  appendSection(lines, "Prompts", resources?.prompts ?? [], theme, columnWidth);
  appendCountSection(lines, "Extensions", resources?.extensions.length ?? 0, theme);
  return lines;
}

function renderColumns(
  resources: WelcomeResources | undefined,
  project: ProjectInfo,
  theme: Theme,
  width: number,
): string[] {
  const inner = Math.max(1, width - OUTER_PAD * 2);
  const gutter = " ".repeat(OUTER_PAD);

  if (inner < TWO_COL_MIN_WIDTH) {
    return [
      ...renderResources(resources, theme, inner),
      "",
      ...renderProject(project, theme, inner),
    ].map((line) => (line ? gutter + truncateToWidth(line, inner, "") : ""));
  }

  const rightWidth = Math.max(28, Math.min(48, Math.floor((inner - COLUMN_GAP) * 0.38)));
  const leftWidth = inner - COLUMN_GAP - rightWidth;
  const left = renderResources(resources, theme, leftWidth);
  const right = renderProject(project, theme, rightWidth);
  return joinColumns(left, right, leftWidth, COLUMN_GAP, inner).map(
    (line) => gutter + line,
  );
}

export function renderWelcome(
  resources: WelcomeResources | undefined,
  project: ProjectInfo,
  theme: Theme,
  width: number,
): string[] {
  if (width <= 0) return [];
  return [...renderLogo(theme, width), "", ...renderColumns(resources, project, theme, width)];
}
