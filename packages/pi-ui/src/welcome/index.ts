import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionStartEvent,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
  abandonDetachedPanel,
  captureResources,
  hideStartupListings,
  isResourcePanelReady,
  prepareHeaderTui,
  resourceTiming,
  type ResourceBridge,
  type WelcomeResources,
} from "./resources.ts";
import { fitLines } from "../fit-line.ts";
import { renderWelcome, type ProjectInfo } from "./render.ts";

const MAX_HEADER_CLAIM_RETRIES = 8;

const state: ProjectInfo = {
  cwd: "",
  branch: null,
};

/** Package count from settings.json — pi has no direct extension-count API. */
function readPackageExtensionCount(): number | undefined {
  try {
    const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as { packages?: unknown };
    return Array.isArray(settings.packages) ? settings.packages.length : undefined;
  } catch {
    return undefined;
  }
}

function updateProjectState(ctx: ExtensionContext): void {
  state.cwd = ctx.cwd;
  state.branch = readGitBranch(ctx.cwd);
  const withModel = ctx as ExtensionContext & {
    model?: { id?: string };
    thinkingLevel?: string;
  };
  state.model = withModel.model?.id;
  state.thinkingLevel = withModel.thinkingLevel;
}

const COUNT_DEBUG_LOG = "/tmp/pi-ui-welcome-debug.log";
function countDebugLog(line: string): void {
  try {
    appendFileSync(COUNT_DEBUG_LOG, `${new Date().toISOString()} [welcome] ${line}\n`);
  } catch {}
}

/** Refresh skill/prompt counts from the command registry. Returns true when
 *  the counts changed — callers should invalidate their render cache.
 *  Safe to call repeatedly: slash commands register after session_start, so
 *  the poll loop re-reads until the numbers settle. */
function refreshCommandCounts(): boolean {
  // getCommands lives on the ExtensionAPI (pi), NOT on the session ctx —
  // verified via debug log: session ctx has no such method.
  const commands = welcomePi?.getCommands?.() ?? [];
  const sources: Record<string, number> = {};
  for (const c of commands) sources[c.source] = (sources[c.source] ?? 0) + 1;
  countDebugLog(
    `getCommands → ${commands.length} entries, sources=${JSON.stringify(sources)} sample=${commands.slice(0, 3).map((c) => `${c.name}:${c.source}`).join(",")}`,
  );
  const skillCount = commands.filter((c) => c.source === "skill").length || undefined;
  const promptCount = commands.filter((c) => c.source === "prompt").length || undefined;
  const changed = state.skillCount !== skillCount || state.promptCount !== promptCount;
  state.skillCount = skillCount;
  state.promptCount = promptCount;
  state.extensionCount = state.extensionCount ?? readPackageExtensionCount();
  return changed;
}

let headerTui: TUI | undefined;
let welcomePi: ExtensionAPI | undefined;

/** Best-effort render kick for UI animations elsewhere in pi-ui. */
export function requestUiRender(): void {
  headerTui?.requestRender();
}

function readGitBranch(cwd: string): string | null {
  const inside = spawnSync(
    "git",
    ["--no-optional-locks", "rev-parse", "--is-inside-work-tree"],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (inside.status !== 0 || inside.stdout.trim() !== "true") return null;

  const symbolic = spawnSync(
    "git",
    ["--no-optional-locks", "symbolic-ref", "--quiet", "--short", "HEAD"],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const branch = symbolic.status === 0 ? symbolic.stdout.trim() : "";
  return branch || "detached";
}

class WelcomeHeader implements Component {
  private resourceReadyTimer: ReturnType<typeof setTimeout> | undefined;
  private resources: WelcomeResources | undefined;
  private bridge: ResourceBridge | undefined;
  private cachedWidth: number | undefined;
  private cachedCwd: string | undefined;
  private cachedBranch: string | null | undefined;
  private cachedLines: string[] | undefined;
  private disposed = false;

  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly ctx: ExtensionContext;

  constructor(tui: TUI, theme: Theme, forceInitialRender: boolean, ctx: ExtensionContext) {
    this.tui = tui;
    this.theme = theme;
    this.ctx = ctx;
    this.resourceReadyTimer = setTimeout(
      () => this.captureResourcesWhenReady(forceInitialRender, 0),
      0,
    );
  }

  private captureResourcesWhenReady(
    forceInitialRender: boolean,
    attempt: number,
  ): void {
    if (this.disposed) return;

    // Kill any native startup resource listing on sight — it re-renders on
    // session events, so this runs on every poll attempt.
    hideStartupListings(this.tui);

    // Skill/prompt commands register after session_start — poll until settled.
    if (refreshCommandCounts()) this.clearRenderCache();

    const captured = captureResources(this.tui);
    if (captured.status === "native") {
      // The panel carries non-resource UI (diagnostics etc.) — leave it alone
      // but do not restore anything either; hideStartupListings already dealt
      // with the resource sections.
      this.resourceReadyTimer = undefined;
      if (attempt === 0) this.tui.requestRender(forceInitialRender);
      return;
    }

    if (captured.status === "ready") {
      this.resources = captured.resources;
      this.bridge = captured.bridge;
      this.clearRenderCache();
      this.resourceReadyTimer = undefined;
      this.tui.requestRender(forceInitialRender);
      return;
    }

    if (attempt === 0) this.tui.requestRender(forceInitialRender);
    if (attempt < resourceTiming.maxRetries) {
      this.resourceReadyTimer = setTimeout(
        () => this.captureResourcesWhenReady(false, attempt + 1),
        resourceTiming.pollIntervalMs,
      );
    } else {
      abandonDetachedPanel();
      this.resourceReadyTimer = undefined;
    }
  }

  private clearRenderCache(): void {
    this.cachedWidth = undefined;
    this.cachedCwd = undefined;
    this.cachedBranch = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (
      this.cachedLines &&
      this.cachedWidth === width &&
      this.cachedCwd === state.cwd &&
      this.cachedBranch === state.branch
    ) {
      return this.cachedLines;
    }

    const lines = fitLines(renderWelcome(this.resources, state, this.theme, width), width);
    if (this.resources) {
      this.cachedWidth = width;
      this.cachedCwd = state.cwd;
      this.cachedBranch = state.branch;
      this.cachedLines = lines;
    }
    return lines;
  }

  invalidate(): void {
    this.clearRenderCache();
    this.bridge?.panel.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.resourceReadyTimer) clearTimeout(this.resourceReadyTimer);
  }
}

function claimHeaderWhenSafe(
  ctx: ExtensionContext,
  forceInitialRender: boolean,
  attempt: number,
): void {
  if (ctx.mode !== "tui") return;

  const claim = () => {
    ctx.ui.setHeader((tui, theme) => {
      headerTui = tui;
      prepareHeaderTui(tui);
      return new WelcomeHeader(tui, theme, forceInitialRender, ctx);
    });
  };

  if (!headerTui) {
    claim();
  } else if (
    isResourcePanelReady(headerTui) ||
    attempt >= MAX_HEADER_CLAIM_RETRIES
  ) {
    claim();
    return;
  }

  setTimeout(
    () => claimHeaderWhenSafe(ctx, forceInitialRender, attempt + 1),
    resourceTiming.pollIntervalMs,
  );
}

export function registerWelcome(pi: ExtensionAPI): void {
  welcomePi = pi;
  pi.on("session_start", (event: SessionStartEvent, ctx) => {
    if (ctx.mode !== "tui") return;

    headerTui = undefined;
    updateProjectState(ctx);
    claimHeaderWhenSafe(ctx, event.reason === "startup", 0);
  });

  pi.on("session_shutdown", () => {
    headerTui = undefined;
  });
}
