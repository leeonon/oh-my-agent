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
import { formatMcpToolName, isMcpToolName } from "./mcp-name.ts";
import { fitLine } from "./fit-line.ts";

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

function stripAnsi(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function markerLines(): string[] {
  const reg = registry();
  const collapsed = reg.seq - getConfig().historyKeep;
  const text = `⋯ 已折叠更早的 ${collapsed} 条记录（/pi-ui history-keep 调整）`;
  return [reg.theme ? reg.theme.fg("dim", text) : text];
}


/** One-line summary for a tool card in minimal density: a status mark, the
 *  tool name, and the primary argument. No box chrome, natural width. */
/** Per-tool display name and colour so each module reads distinctly. */
const TOOL_META: Record<string, { title: string; token: string }> = {
  bash: { title: "Bash", token: "warning" },
  edit: { title: "Edit", token: "success" },
  write: { title: "Write", token: "success" },
  read: { title: "Read", token: "accent" },
  grep: { title: "Grep", token: "accent" },
  ls: { title: "Ls", token: "accent" },
  find: { title: "Find", token: "accent" },
};

function minimalToolLine(
  tool: Record<string, unknown>,
  theme: Theme | undefined,
  width: number,
): string {
  const fg = (token: string, text: string) => {
    if (!theme) return text;
    try {
      return theme.fg(token as never, text);
    } catch {
      return text;
    }
  };
  const rawName = String(tool.toolName ?? "?");
  const meta = TOOL_META[rawName];
  const toolName = meta?.title ?? (isMcpToolName(rawName) ? formatMcpToolName(rawName) : rawName);
  const custom = getConfig().colors?.tools ?? {};
  const nameToken = custom[rawName] ?? custom["*"] ?? meta?.token ?? "muted";
  const result = tool.result as { isError?: boolean } | undefined;
  const mark = result === undefined || result === null ? "⟳" : result.isError ? "✘" : "✓";
  const markToken = result?.isError ? "error" : result ? "success" : "muted";
  const args = (tool.args ?? {}) as Record<string, unknown>;
  const summary = summarizeArgs(args);
  const line = `${fg(nameToken, `➔ ${toolName}`)} ${fg(markToken, mark)}${summary ? ` ${fg("dim", summary)}` : ""}`;
  // Align with assistant text: both carry the same outputPad indent.
  const pad = " ".repeat(Math.max(0, Math.floor(Number(tool.outputPad ?? 1)) || 0));
  return fitLine(pad + line, Math.max(1, width));
}

function firstLine(text: string, max: number): string {
  const line = text.replace(/\\/g, "/").split("\n", 1)[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function summarizeArgs(args: Record<string, unknown>): string {
  const preferred = ["command", "file_path", "path", "pattern", "query", "url", "skill", "name"];
  for (const key of preferred) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return firstLine(value, 64);
  }
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.trim()) return firstLine(value, 64);
  }
  return "";
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
        const isTool = cls === ToolExecutionComponent;
        register(this);
        const density = getConfig().density;
        const keep = getConfig().historyKeep;

        // history-keep window: same for every density, marker on the
        // newest collapsed item, exactly as the user configured it.
        const seq = this[SEQ];
        if (keep > 0 && typeof seq === "number" && seq <= registry().seq - keep) {
          const next = seq + 1;
          return next <= registry().seq - keep ? [] : markerLines();
        }

        // Minimal density replaces every tool/MCP card with a clean
        // single-line summary (no box chrome): `➔ Bash ✓ 3.44s · npm test`.
        // Assistant text always renders in full. Native ctrl+o expand
        // bypasses the compaction.
        if (density === "minimal" && isTool) {
          if ((this as { expanded?: boolean })["expanded"] === true) {
            return (originalRender as (...a: unknown[]) => unknown).apply(this, args);
          }
          const width = (args[0] as number) ?? 120;
          return [minimalToolLine(this, registry().theme, width)];
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
