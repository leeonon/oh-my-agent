import { spawnSync } from "node:child_process";
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

let headerTui: TUI | undefined;

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

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    forceInitialRender: boolean,
  ) {
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

    const captured = captureResources(this.tui);
    if (captured.status === "native") {
      abandonDetachedPanel();
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
      return new WelcomeHeader(tui, theme, forceInitialRender);
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
  pi.on("session_start", (event: SessionStartEvent, ctx) => {
    if (ctx.mode !== "tui") return;

    headerTui = undefined;
    state.cwd = ctx.cwd;
    state.branch = readGitBranch(ctx.cwd);
    claimHeaderWhenSafe(ctx, event.reason === "startup", 0);
  });

  pi.on("session_shutdown", () => {
    headerTui = undefined;
  });
}
