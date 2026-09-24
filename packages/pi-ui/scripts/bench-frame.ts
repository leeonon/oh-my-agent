// Frame benchmark: simulates one keystroke render pass over a heavy
// transcript and reports per-frame cost. Usage:
//   node --experimental-strip-types scripts/bench-frame.ts [frames]

import type { Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { AssistantMessageComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { installThinking } from "../src/thinking.ts";
import { renderBashBoxCall, renderBashBoxResult } from "../src/bash-box.ts";
import { renderEditBoxCall, renderEditBoxResult } from "../src/mutation-box.ts";
import { renderGrepCall, renderGrepResult } from "../src/grep-view.ts";
import { renderReadCall } from "../src/tool-call.ts";
import { batchAwareResult } from "../src/tool-result.ts";
import { loadConfig } from "../src/config.ts";

loadConfig();
initTheme("catppuccin-mocha");
installThinking();

type ToolCallContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type RenderResultInput = Parameters<NonNullable<ToolDefinition["renderResult"]>>[0];
type ResultOptions = Parameters<NonNullable<ToolDefinition["renderResult"]>>[1];

const theme = {
  fg(name: string, text: string) {
    const colors: Record<string, string> = {
      success: "32", error: "31", muted: "2", dim: "2", text: "0", accent: "36",
      toolTitle: "1", toolDiffAdded: "32", toolDiffRemoved: "31",
      thinkingText: "90", borderMuted: "90",
    };
    return `\x1b[${colors[name] ?? "0"}m${text}\x1b[0m`;
  },
  bold: (t: string) => `\x1b[1m${t}\x1b[22m`,
  italic: (t: string) => `\x1b[3m${t}\x1b[23m`,
  bg: (name: string, t: string) => `\x1b[48;5;22m${t}\x1b[0m`,
} as unknown as Theme;

function context(id: string): ToolCallContext {
  return {
    args: {}, toolCallId: id, invalidate: () => {}, lastComponent: undefined,
    state: {}, cwd: "/Users/ly/.agents", executionStarted: true, argsComplete: true,
    isPartial: false, expanded: false, showImages: false, isError: false,
  };
}

const OPTS: ResultOptions = { expanded: false, isPartial: false };

interface Frame {
  name: string;
  render: (width: number) => string[];
}

const frames: Frame[] = [];

// bash cards
for (let i = 0; i < 100; i++) {
  const ctx = context(`bash-${i}`);
  const call = renderBashBoxCall({ command: "rg -n 'pattern' src --glob '*.ts' | head -40 && ../../node_modules/.bin/tsc --noEmit" }, theme, ctx);
  const result = renderBashBoxResult(
    { content: [{ type: "text", text: "src/a.ts\nsrc/b.ts\n… output line\n".repeat(12) }], details: {} } as RenderResultInput,
    OPTS, theme, ctx,
  );
  frames.push({ name: `bash-call-${i}`, render: (w) => call.render(w) });
  frames.push({ name: `bash-result-${i}`, render: (w) => result.render(w) });
}

// edit cards with a real diff
const diffLines: string[] = ["@@ -10,7 +10,9 @@"];
for (let i = 0; i < 60; i++) {
  diffLines.push(i % 9 === 0 ? `+const added${i} = compute(${i}, "literal");` : i % 7 === 0 ? `-const removed${i} = old(${i});` : ` const unchanged${i} = value;`);
}
const diff = diffLines.join("\n");
for (let i = 0; i < 60; i++) {
  const ctx = context(`edit-${i}`);
  ctx.args = { path: `/Users/ly/.agents/packages/pi-ui/src/file${i}-${i*7}.ts` };
  const call = renderEditBoxCall({ path: `/Users/ly/.agents/packages/pi-ui/src/file${i}-${i*7}.ts` } as never, theme, ctx);
  const result = renderEditBoxResult(
    { content: [{ type: "text", text: "ok" }], details: { diff } } as RenderResultInput,
    OPTS, theme, ctx,
  );
  frames.push({ name: `edit-call-${i}`, render: (w) => call.render(w) });
  frames.push({ name: `edit-result-${i}`, render: (w) => result.render(w) });
}

// grep cards
const grepText = Array.from({ length: 120 }, (_, i) => `src/mod${i % 20}.ts:${i}: match content here`).join("\n");
for (let i = 0; i < 30; i++) {
  const ctx = context(`grep-${i}`);
  ctx.args = { pattern: "needle", path: "src" };
  const call = renderGrepCall({ pattern: "needle", path: "src" } as never, theme, ctx);
  const result = renderGrepResult(
    { content: [{ type: "text", text: grepText }], details: {} } as RenderResultInput,
    OPTS, theme, ctx,
  );
  frames.push({ name: `grep-call-${i}`, render: (w) => call.render(w) });
  frames.push({ name: `grep-result-${i}`, render: (w) => result.render(w) });
}

// read batch leader
{
  const ctx = context("read-0");
  ctx.args = { path: "src/a.ts" };
  const call = renderReadCall({ path: "src/a.ts" } as never, theme, ctx);
  const resultRenderer = batchAwareResult("read");
  for (let m = 0; m < 5; m++) {
    resultRenderer(
      { content: [{ type: "text", text: "line\n".repeat(80) }], details: {} } as RenderResultInput,
      OPTS,
      theme,
      { ...ctx, toolCallId: `read-${m}` } as ToolCallContext,
    );
  }
  frames.push({ name: "read-leader", render: (w) => call.render(w) });
}

// assistant message with thinking (patched path)
const thinkingText = Array.from({ length: 120 }, (_, i) => `思考第 ${i} 行，推演某个边界条件的处理方式。`).join("\n");
const bodyText = "正文段落。".repeat(400);
const message = {
  role: "assistant" as const,
  timestamp: Date.now(),
  content: [
    { type: "thinking", thinking: thinkingText },
    { type: "text", text: bodyText },
  ],
};
const assistant = new AssistantMessageComponent(message as never, true);
frames.push({ name: "assistant-msg", render: (w) => assistant.render(w) });

// assistant updateContent rebuild cost (runs on invalidate/events)
const REBUILDS = 50;
const t0 = performance.now();
for (let i = 0; i < REBUILDS; i++) assistant.updateContent(message as never, false);
const rebuildMs = (performance.now() - t0) / REBUILDS;

const FRAMES = Number(process.argv[2] ?? 300);
const perFrame: { name: string; ms: number }[] = [];
for (const frame of frames) {
  frame.render(120); // warm
  const t = performance.now();
  for (let i = 0; i < FRAMES; i++) frame.render(120);
  perFrame.push({ name: frame.name, ms: (performance.now() - t) / FRAMES });
}
perFrame.sort((a, b) => b.ms - a.ms);
const total = perFrame.reduce((sum, p) => sum + p.ms, 0);
console.log(`frames=${FRAMES}  components=${frames.length}`);
console.log(`updateContent rebuild: ${rebuildMs.toFixed(3)} ms/call`);
console.log(`total per keystroke frame: ${total.toFixed(3)} ms`);
for (const p of perFrame.slice(0, 12)) {
  console.log(`  ${p.ms.toFixed(3)} ms  ${p.name}`);
}
