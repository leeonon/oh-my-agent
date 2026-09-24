// Thinking rendering, cc-style: event-driven activity tracking, duration
// bookkeeping ("Thought for Ns"), animated sweep label and a tail preview.
// Implementation stays post-process — Pi's original updateContent builds all
// components (host copy!), we only swap the hidden "Thinking..." labels for
// lightweight plain-object blocks. No component class from our own pi-tui
// copy is ever instantiated (0.86 vs 0.87 dual copies made full rebuilds
// pathologically slow). Display-only — model-facing content is untouched.

import { AssistantMessageComponent, type Theme } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import { getConfig } from "./config.ts";
import { formatThoughtDuration, createThinkingBlock } from "./thinking-block.ts";
import { requestUiRender } from "./welcome/index.ts";

const MARK = Symbol.for("pi-ui.thinking-preview");
const ORIGINAL = Symbol.for("pi-ui.thinking-preview.original");
const EXPANDED = Symbol.for("pi-ui.thinking-preview.expanded");

const ANIMATION_INTERVAL_MS = 90;
/** Hard stop for the repaint ticker when boundary events never arrive. */
const STALE_THINKING_MS = 10_000;

type ThinkingBlockData = { type?: string; thinking?: string; text?: string; name?: string };

type AssistantLike = {
  content?: readonly ThinkingBlockData[];
  stopReason?: string;
  timestamp?: number;
  role?: string;
};

type Host = {
  contentContainer: { children: Component[] };
  hideThinkingBlock: boolean;
  hiddenThinkingLabel: string;
  outputPad: number;
  isStreaming: boolean;
  thinkingVisibilityOverrides: Map<number, boolean>;
  lastMessage?: AssistantLike;
  updateContent(message: AssistantLike, isStreaming?: boolean): void;
  setExpanded?(expanded: boolean): void;
  [EXPANDED]?: boolean;
};

type PatchedProto = {
  updateContent: (this: Host, message: AssistantLike, isStreaming?: boolean) => void;
  [MARK]?: boolean;
  [ORIGINAL]?: unknown;
};

interface ActiveThinking {
  timestamp: number;
  contentIndex: number;
  startedAt: number;
}

interface ThinkingRun {
  runIndex: number;
  startIndex: number;
  endIndex: number;
  text: string;
  hidden: boolean;
}

let active: ActiveThinking | undefined;
const durations = new Map<number, Map<number, number>>();
let activeTheme: Theme | undefined;
let animationTimer: ReturnType<typeof setInterval> | undefined;
let lastDeltaAt = 0;
const streamingHosts = new Set<Host>();
let latestHost: Host | undefined;
let latestTimestamp: number | undefined;

function isOurs(fn: unknown): boolean {
  return typeof fn === "function" && Boolean((fn as Partial<PatchedProto>)[MARK]);
}

/** MouseRegion-shaped: render + handleMouse. Never instanceof (dual copies). */
function isRegionLike(component: unknown): boolean {
  const candidate = component as { render?: unknown; handleMouse?: unknown } | undefined;
  return typeof candidate?.render === "function" && typeof candidate?.handleMouse === "function";
}

/** Hidden label regions wrap a Text whose payload contains the label. */
function isHiddenLabelChild(region: unknown): boolean {
  const inner = (region as { child?: unknown }).child;
  const text = (inner as { text?: unknown } | undefined)?.text;
  return typeof text === "string";
}

/** "pending" = still streaming on OpenAI-completions style providers. */
function isSettled(message: AssistantLike | undefined): boolean {
  const sr = message?.stopReason;
  return sr !== undefined && sr !== "pending";
}

function rerender(host: Host | undefined): void {
  if (host?.lastMessage) {
    try {
      host.updateContent(host.lastMessage);
    } catch {
      // display-only
    }
  }
}

function startThinking(message: AssistantLike | undefined, contentIndex: number): void {
  const timestamp = message?.timestamp;
  if (timestamp === undefined) return;
  active = { timestamp, contentIndex, startedAt: Date.now() };
  lastDeltaAt = Date.now();
  streamingHosts.clear();
  if (latestHost && latestTimestamp === timestamp) streamingHosts.add(latestHost);
  ensureTicker();
}

/** Repaint-only ticker: sweep phase is computed inside render(), so a tick
 *  never rebuilds anything. Serves both the event path (active) and the
 *  streaming fallback, and self-stops when thinking goes stale. */
function ensureTicker(): void {
  if (animationTimer) return;
  animationTimer = setInterval(() => {
    if (!active && Date.now() - lastDeltaAt > STALE_THINKING_MS) {
      if (animationTimer) clearInterval(animationTimer);
      animationTimer = undefined;
      return;
    }
    if (active && Date.now() - lastDeltaAt > STALE_THINKING_MS) {
      finishThinking();
      return;
    }
    requestUiRender();
  }, ANIMATION_INTERVAL_MS);
  if (typeof animationTimer === "object" && animationTimer && "unref" in animationTimer) {
    (animationTimer as unknown as { unref: () => void }).unref();
  }
}

function finishThinking(): void {
  if (!active) return;
  const finished = active;
  active = undefined;
  const durationMs = Math.max(1, Date.now() - finished.startedAt);
  let perMessage = durations.get(finished.timestamp);
  if (!perMessage) {
    perMessage = new Map();
    durations.set(finished.timestamp, perMessage);
  }
  perMessage.set(finished.contentIndex, durationMs);
  const hosts = [...streamingHosts];
  streamingHosts.clear();
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = undefined;
  }
  for (const host of hosts) rerender(host);
  requestUiRender();
}

function isAgentToolCall(block: ThinkingBlockData): boolean {
  return block.type === "toolCall" && (block.name === "Agent" || block.name === "Agents");
}

function messageHasAgentTool(message: AssistantLike | undefined): boolean {
  return Boolean(message?.content?.some((block) => isAgentToolCall(block)));
}

interface RegisterEventsApi {
  on(event: string, handler: (event: any, ctx: any) => void): unknown;
}

export function registerThinkingEvents(pi: RegisterEventsApi): void {
  pi.on("message_start", (event: unknown) => {
    // A new turn ends any previous thinking run, even if its boundary event
    // was swallowed by provider quirks.
    const role = (event as { message?: { role?: string } }).message?.role;
    if (role === "user" || role === "assistant") finishThinking();
  });

  pi.on("message_update", (event: unknown) => {
    const data = event as {
      message?: AssistantLike;
      assistantMessageEvent?: { type?: string; contentIndex?: number };
    };
    const message = data.message;
    if (!message || message.role !== "assistant") return;
    const update = data.assistantMessageEvent;
    if (!update?.type) return;
    if (update.type === "thinking_start") {
      lastDeltaAt = Date.now();
      if (active && active.timestamp === message.timestamp) {
        active.contentIndex = update.contentIndex ?? active.contentIndex;
      } else {
        finishThinking();
        startThinking(message, update.contentIndex ?? 0);
      }
    } else if (update.type === "thinking_delta") {
      lastDeltaAt = Date.now();
      if (!active) startThinking(message, update.contentIndex ?? 0);
      else if (active.timestamp === message.timestamp) {
        active.contentIndex = update.contentIndex ?? active.contentIndex;
      }
    } else if (update.type === "text_start") {
      finishThinking();
    } else if (update.type === "toolcall_start" || update.type === "toolcall_delta") {
      if (messageHasAgentTool(message)) {
        if (!active) {
          const index = message.content?.findIndex((block) => block.type === "thinking") ?? -1;
          if (index >= 0) startThinking(message, index);
        }
      } else {
        finishThinking();
      }
    }
    // thinking_end alone is not a boundary: providers can close one reasoning
    // item and immediately open another within the same visible run.
  });

  pi.on("tool_execution_start", (event: unknown) => {
    const name = (event as { toolName?: string }).toolName;
    if (name === "Agent" || name === "Agents") {
      if (!active) resumeAgentThinking(latestHost?.lastMessage);
    } else {
      finishThinking();
    }
  });

  pi.on("tool_execution_end", (event: unknown) => {
    const name = (event as { toolName?: string }).toolName;
    if (name === "Agent" || name === "Agents") finishThinking();
  });

  pi.on("message_end", (event: unknown) => {
    const message = (event as { message?: AssistantLike }).message;
    if (!message || message.role !== "assistant") return;
    if (messageHasAgentTool(message)) return;
    finishThinking();
  });

  pi.on("session_start", (_event: unknown, ctx: unknown) => {
    activeTheme = (ctx as { ui?: { theme?: Theme } } | undefined)?.ui?.theme;
    durations.clear();
    streamingHosts.clear();
    latestHost = undefined;
    latestTimestamp = undefined;
  });

  pi.on("session_shutdown", () => {
    finishThinking();
    durations.clear();
  });
}

function resumeAgentThinking(message: AssistantLike | undefined): void {
  if (active) return;
  const index = message?.content?.findIndex((block) => block.type === "thinking") ?? -1;
  if (index >= 0) startThinking(message, index);
}

/** Split message content into thinking runs, mirroring Pi's own grouping. */
function thinkingRuns(host: Host, message: AssistantLike): ThinkingRun[] {
  const content = message.content ?? [];
  const runs: ThinkingRun[] = [];
  let runIndex = 0;
  for (let i = 0; i < content.length; i++) {
    const block = content[i];
    if (!block || block.type !== "thinking") continue;
    const startIndex = i;
    const parts: string[] = [];
    for (; i < content.length; i++) {
      const inner = content[i];
      if (!inner || inner.type !== "thinking") break;
      const text = (inner.thinking ?? "").trim();
      if (text) parts.push(text);
    }
    i -= 1;
    if (parts.length === 0) continue;
    const hidden = Boolean(host[EXPANDED])
      ? false
      : (host.thinkingVisibilityOverrides.get(runIndex) ?? host.hideThinkingBlock);
    runs.push({
      runIndex,
      startIndex,
      endIndex: i,
      text: parts.join("\n\n"),
      hidden,
    });
    runIndex += 1;
  }
  return runs;
}

function postProcess(host: Host, message: AssistantLike): void {
  const runs = thinkingRuns(host, message);
  if (runs.length === 0) return;
  const regions = host.contentContainer.children.filter(isRegionLike);
  const lastRunIndex = runs.length - 1;
  const hasFollowUp = (endIndex: number): boolean => {
    const content = message.content ?? [];
    return content.slice(endIndex + 1).some(
      (block) =>
        (block.type === "text" && Boolean(block.text?.trim())) ||
        block.type === "toolCall",
    );
  };
  for (let i = 0; i < runs.length && i < regions.length; i++) {
    const run = runs[i];
    if (!run || !run.hidden) continue;
    const region = regions[i];
    if (!region || !isHiddenLabelChild(region)) continue;
    const index = host.contentContainer.children.indexOf(region);
    if (index < 0) continue;

    // Active = the event stream flagged this run, or (fallback, for providers
    // whose thinking events never surface) the message is still streaming and
    // nothing visible (text/tool call) has followed the thinking run yet.
    const streamingFallback =
      Boolean(host.isStreaming) &&
      !isSettled(message) &&
      i === lastRunIndex &&
      !hasFollowUp(run.endIndex);
    const runActive =
      i === lastRunIndex &&
      Boolean((active && active.timestamp === message.timestamp) || streamingFallback);
    if (streamingFallback) {
      lastDeltaAt = Date.now();
      ensureTicker();
    }
    const max = getConfig().thinkingLines;
    if (!runActive && max === 0) continue; // settled + preview off → keep the plain label

    const doneDuration = durations.get(message.timestamp ?? -1)?.get(run.startIndex);
    const durationMs =
      runActive && active ? Math.max(1, Date.now() - active.startedAt) : doneDuration;
    const durationText = durationMs === undefined ? undefined : formatThoughtDuration(durationMs);
    const label = host.hiddenThinkingLabel || "Thinking...";
    const heading = runActive
      ? `✻ ${label}`
      : doneDuration !== undefined
        ? `Thought for ${formatThoughtDuration(doneDuration)}`
        : "";
    const block = createThinkingBlock({
      heading,
      animated: runActive,
      durationText: runActive ? durationText : undefined,
      text: run.text,
      padding: host.outputPad,
      expanded: Boolean(host[EXPANDED]),
      theme: activeTheme,
    });
    const toggle: Component = {
      render(width: number): string[] {
        return block.render(width);
      },
      invalidate() {
        block.invalidate();
      },
      handleMouse(event: { type?: string; button?: string }): { handled: boolean } | undefined {
        if (event.type !== "click" || event.button !== "left") return undefined;
        host.thinkingVisibilityOverrides.set(run.runIndex, !run.hidden);
        rerender(host);
        return { handled: true };
      },
    };
    host.contentContainer.children[index] = toggle;
  }
}

export function installThinking(): void {
  const proto = AssistantMessageComponent.prototype as unknown as PatchedProto & Host;
  if (isOurs(proto.updateContent)) return;

  const original = proto.updateContent;
  const patched = function (this: Host, message: AssistantLike, isStreaming?: boolean) {
    // Invalidate-driven rebuilds drop the streaming flag; preserving it stops
    // visible-mode flicker (same fix cc applies for mermaid).
    this.isStreaming = isStreaming ?? this.isStreaming;
    this.lastMessage = message;
    latestHost = this;
    latestTimestamp = message?.timestamp;
    if (active && active.timestamp === latestTimestamp && !isSettled(message)) {
      streamingHosts.add(this);
    }

    original.call(this, message, this.isStreaming);
    try {
      postProcess(this, message);
    } catch {
      // Display-only decoration; never break message rendering.
    }
  };
  patched[MARK] = true;
  patched[ORIGINAL] = original;
  proto.updateContent = patched;

  if (typeof proto.setExpanded !== "function") {
    (proto as unknown as { setExpanded: (expanded: boolean) => void }).setExpanded = function (
      this: Host,
      expanded: boolean,
    ) {
      this[EXPANDED] = expanded;
      if (this.lastMessage) this.updateContent(this.lastMessage);
    };
  }
}
