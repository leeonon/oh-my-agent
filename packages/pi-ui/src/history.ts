// History collapse: with huge transcripts Pi re-renders the whole document on
// every keystroke. This keeps only the most recent N tool cards / assistant
// messages fully rendered; older ones render zero lines (the boundary item
// shows a single marker line). Gating happens inside the render path and is
// re-evaluated per frame, so the window slides without invalidation sweeps.
// Toggle: /pi-ui history-keep N (0 = off).

import {
  AssistantMessageComponent,
  ToolExecutionComponent,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { getConfig } from "./config.ts";

const MARK = Symbol.for("pi-ui.history.marked");
const SEQ = Symbol.for("pi-ui.history.seq");
const STORE_KEY = Symbol.for("pi-ui.history.registry");

interface Registry {
  seq: number;
  theme?: Theme;
}

function registry(): Registry {
  const globalAny = globalThis as Record<symbol, unknown>;
  const existing = globalAny[STORE_KEY];
  if (existing && typeof existing === "object") return existing as Registry;
  const created: Registry = { seq: 0 };
  globalAny[STORE_KEY] = created;
  return created;
}

function register(component: object): void {
  const owner = component as Record<symbol, unknown>;
  if (owner[SEQ] !== undefined) return;
  const reg = registry();
  reg.seq += 1;
  owner[SEQ] = reg.seq;
}

function markerLines(): string[] {
  const reg = registry();
  const collapsed = reg.seq - getConfig().historyKeep;
  const text = `⋯ 已折叠更早的 ${collapsed} 条记录（/pi-ui history-keep 调整）`;
  return [reg.theme ? reg.theme.fg("dim", text) : text];
}

function installHistoryPatches(): void {
  for (const cls of [ToolExecutionComponent, AssistantMessageComponent]) {
    const proto = cls.prototype as unknown as Record<string, unknown>;

    const originalUpdate = proto.updateDisplay ?? proto.updateContent;
    if (typeof originalUpdate === "function" && !(originalUpdate as { [MARK]?: boolean })[MARK]) {
      const wrappedUpdate = function (this: object, ...args: unknown[]) {
        register(this);
        return (originalUpdate as (...a: unknown[]) => unknown).apply(this, args);
      };
      (wrappedUpdate as { [MARK]?: boolean })[MARK] = true;
      if (cls === AssistantMessageComponent) {
        proto.updateContent = wrappedUpdate;
      } else {
        proto.updateDisplay = wrappedUpdate;
      }
    }

    const originalRender = proto.render;
    if (typeof originalRender === "function" && !(originalRender as { [MARK]?: boolean })[MARK]) {
      const wrappedRender = function (this: Record<symbol, unknown>, ...args: unknown[]) {
        register(this);
        const keep = getConfig().historyKeep;
        const seq = this[SEQ];
        if (keep > 0 && typeof seq === "number" && seq <= registry().seq - keep) {
          const next = seq + 1;
          // The newest collapsed item carries the marker line.
          return next <= registry().seq - keep ? [] : markerLines();
        }
        return (originalRender as (...a: unknown[]) => unknown).apply(this, args);
      };
      (wrappedRender as { [MARK]?: boolean })[MARK] = true;
      proto.render = wrappedRender;
    }
  }
}

interface HistoryEventsApi {
  on(event: string, handler: (event: unknown, ctx: unknown) => void): unknown;
}

export function installHistory(pi: HistoryEventsApi): void {
  installHistoryPatches();
  pi.on("session_start", (_event: unknown, ctx: unknown) => {
    // The sequence counter must NEVER reset: Pi rebuilds the chat (and
    // re-registers components 1..N) BEFORE session_start fires, so a reset
    // here would strand old components above the collapse window forever.
    registry().theme = (ctx as { ui?: { theme?: Theme } } | undefined)?.ui?.theme;
  });
}
