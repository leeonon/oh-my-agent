import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StatsPlacement } from "./box.ts";

export type { StatsPlacement };

export type Density = "minimal" | "default" | "detailed";

export interface PiUiColors {
  /** Body colour of thinking text (theme token). Default: thinkingText. */
  thinking?: string;
  /** Colour of the thinking guide glyph (theme token). Default: accent. */
  thinkingGuide?: string;
  /** Per-tool name colours (theme tokens), keyed by tool name, `*` = fallback. */
  tools?: Record<string, string>;
}

export type MinimalStyle = "anchor" | "name";

export interface PiUiConfig {
  /** Rendering density preset: applies a bundle of per-item budgets. */
  density: Density;
  /** Minimal-density single-line style: `│ ● npm test` (anchor) or
   *  `➔ Bash ✓ npm test` (name). */
  minimalStyle: MinimalStyle;
  /** Custom colours for thinking / tool names (theme tokens). */
  colors?: PiUiColors;
  /** Collapsed tool result body lines. 0 = hide output until expand. */
  collapsedResultLines: number;
  /** Where elapsed / file / line stats sit on a tool box. */
  statsPlacement: StatsPlacement;
  /** Blank rows inside tool boxes. 0 is tight; 1 is the old airy padding. */
  boxPadding: number;
  /** Files shown in a collapsed Grep tree. */
  grepFileLimit: number;
  /** Lines of a single-file Read shown when expanded. */
  readLineLimit: number;
  /** Thinking preview rows when hidden. 0 = plain "Thinking..." label. */
  thinkingLines: number;
  /** Recent tool cards / messages kept fully rendered. 0 = keep everything. */
  historyKeep: number;
}

/**
 * Density presets. Applied on `/pi-ui density <name>` (overwrites the
 * per-item fields); single fields remain adjustable afterwards.
 */
export const DENSITY_PRESETS: Record<Density, Partial<Omit<PiUiConfig, "density">>> = {
  minimal: {
    collapsedResultLines: 0,
    thinkingLines: 1,
    grepFileLimit: 2,
    readLineLimit: 10,
    boxPadding: 0,
  },
  default: {
    collapsedResultLines: 0,
    thinkingLines: 2,
    grepFileLimit: 4,
    readLineLimit: 40,
    boxPadding: 0,
  },
  detailed: {
    collapsedResultLines: 6,
    thinkingLines: 3,
    grepFileLimit: 8,
    readLineLimit: 80,
    boxPadding: 0,
  },
};

const DENSITIES = new Set<Density>(["minimal", "default", "detailed"]);
const MINIMAL_STYLES = new Set<MinimalStyle>(["anchor", "name"]);

const DEFAULT_CONFIG: PiUiConfig = {
  density: "default",
  minimalStyle: "anchor",
  collapsedResultLines: 0,
  statsPlacement: "bottom-left",
  boxPadding: 0,
  grepFileLimit: 5,
  readLineLimit: 50,
  thinkingLines: 2,
  historyKeep: 80,
};

const PLACEMENTS = new Set<StatsPlacement>(["bottom-left", "bottom-right", "top-right"]);

/**
 * Config state lives on globalThis so every extension generation shares it.
 * Without this, a /reload leaves prototype patches reading the stale module.
 */
const STORE_KEY = Symbol.for("pi-ui.config.store");

interface ConfigStore {
  current?: PiUiConfig;
}

function store(): ConfigStore {
  const globalAny = globalThis as Record<symbol, unknown>;
  const existing = globalAny[STORE_KEY];
  if (existing && typeof existing === "object") return existing as ConfigStore;
  const created: ConfigStore = {};
  globalAny[STORE_KEY] = created;
  return created;
}

function configPath(): string {
  return join(getAgentDir(), "pi-ui.json");
}

function persist(): void {
  writeFileSync(configPath(), `${JSON.stringify(store().current, null, 2)}\n`);
}

export function getConfig(): PiUiConfig {
  const current = store().current;
  if (current) return current;
  const fresh = { ...DEFAULT_CONFIG };
  store().current = fresh;
  return fresh;
}

export function loadConfig(): void {
  try {
    const raw: unknown = JSON.parse(readFileSync(configPath(), "utf8"));
    if (typeof raw !== "object" || raw === null) return;
    const record = raw as {
      density?: unknown;
      minimalStyle?: unknown;
      colors?: unknown;
      collapsedResultLines?: unknown;
      statsPlacement?: unknown;
      boxPadding?: unknown;
      grepFileLimit?: unknown;
      readLineLimit?: unknown;
      thinkingLines?: unknown;
      historyKeep?: unknown;
    };
    const next: PiUiConfig = { ...DEFAULT_CONFIG };
    if (typeof record.density === "string" && DENSITIES.has(record.density as Density)) {
      next.density = record.density as Density;
    }
    if (typeof record.minimalStyle === "string" && MINIMAL_STYLES.has(record.minimalStyle as MinimalStyle)) {
      next.minimalStyle = record.minimalStyle as MinimalStyle;
    }
    const colors = record.colors as Record<string, unknown> | undefined;
    if (colors && typeof colors === "object") {
      const parsed: PiUiColors = {};
      if (typeof colors.thinking === "string") parsed.thinking = colors.thinking;
      if (typeof colors.thinkingGuide === "string") parsed.thinkingGuide = colors.thinkingGuide;
      if (colors.tools && typeof colors.tools === "object" && !Array.isArray(colors.tools)) {
        const tools: Record<string, string> = {};
        for (const [key, value] of Object.entries(colors.tools as Record<string, unknown>)) {
          if (typeof value === "string") tools[key] = value;
        }
        if (Object.keys(tools).length > 0) parsed.tools = tools;
      }
      if (Object.keys(parsed).length > 0) next.colors = parsed;
    }
    if (typeof record.collapsedResultLines === "number" && Number.isFinite(record.collapsedResultLines)) {
      next.collapsedResultLines = Math.max(0, Math.floor(record.collapsedResultLines));
    }
    if (typeof record.statsPlacement === "string" && PLACEMENTS.has(record.statsPlacement as StatsPlacement)) {
      next.statsPlacement = record.statsPlacement as StatsPlacement;
    }
    if (typeof record.boxPadding === "number" && Number.isFinite(record.boxPadding)) {
      next.boxPadding = Math.max(0, Math.min(2, Math.floor(record.boxPadding)));
    }
    if (typeof record.grepFileLimit === "number" && Number.isFinite(record.grepFileLimit)) {
      next.grepFileLimit = Math.max(1, Math.min(20, Math.floor(record.grepFileLimit)));
    }
    if (typeof record.readLineLimit === "number" && Number.isFinite(record.readLineLimit)) {
      next.readLineLimit = Math.max(1, Math.min(200, Math.floor(record.readLineLimit)));
    }
    if (typeof record.thinkingLines === "number" && Number.isFinite(record.thinkingLines)) {
      next.thinkingLines = Math.max(0, Math.min(5, Math.floor(record.thinkingLines)));
    }
    if (typeof record.historyKeep === "number" && Number.isFinite(record.historyKeep)) {
      next.historyKeep = Math.max(0, Math.min(2000, Math.floor(record.historyKeep)));
    }
    // `density` only records the active preset name; the preset values are
    // applied by /pi-ui density (which never touches historyKeep — that is
    // the user's own collapse control and lives outside the presets).
    store().current = next;
  } catch {
    store().current = { ...DEFAULT_CONFIG };
  }
}

export function setMinimalStyle(style: MinimalStyle): void {
  store().current = { ...getConfig(), minimalStyle: style };
  persist();
}

export function applyDensity(density: Density): void {
  store().current = { ...getConfig(), ...DENSITY_PRESETS[density], density };
  persist();
}

export function setCollapsedResultLines(lines: number): void {
  store().current = { ...getConfig(), collapsedResultLines: Math.max(0, Math.floor(lines)) };
  persist();
}

export function setStatsPlacement(placement: StatsPlacement): void {
  store().current = { ...getConfig(), statsPlacement: placement };
  persist();
}

export function setBoxPadding(padding: number): void {
  store().current = { ...getConfig(), boxPadding: Math.max(0, Math.min(2, Math.floor(padding))) };
  persist();
}

export function setGrepFileLimit(limit: number): void {
  store().current = { ...getConfig(), grepFileLimit: Math.max(1, Math.min(20, Math.floor(limit))) };
  persist();
}

export function setReadLineLimit(limit: number): void {
  store().current = { ...getConfig(), readLineLimit: Math.max(1, Math.min(200, Math.floor(limit))) };
  persist();
}

export function setThinkingLines(lines: number): void {
  store().current = { ...getConfig(), thinkingLines: Math.max(0, Math.min(5, Math.floor(lines))) };
  persist();
}

export function setHistoryKeep(keep: number): void {
  store().current = { ...getConfig(), historyKeep: Math.max(0, Math.min(2000, Math.floor(keep))) };
  persist();
}

