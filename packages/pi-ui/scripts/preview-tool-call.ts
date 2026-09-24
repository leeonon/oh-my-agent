import type { Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { renderBashBoxCall, renderBashBoxResult } from "../src/bash-box.ts";
import { resetBatchRegistry } from "../src/batch.ts";
import {
  renderFindCall,
  renderGrepCall,
  renderLsCall,
  renderReadCall,
} from "../src/tool-call.ts";
import { batchAwareResult } from "../src/tool-result.ts";

type ToolCallContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type RenderResult = Parameters<NonNullable<ToolDefinition["renderResult"]>>[0];
type ResultOptions = Parameters<NonNullable<ToolDefinition["renderResult"]>>[1];

const colors: Record<string, string> = {
  success: "32",
  error: "31",
  muted: "2",
  dim: "2",
  text: "0",
  accent: "36",
  toolTitle: "1",
};

const theme = {
  fg(name: string, text: string) {
    const code = colors[name] ?? "0";
    return `\x1b[${code}m${text}\x1b[0m`;
  },
  bold(text: string) {
    return `\x1b[1m${text}\x1b[22m`;
  },
} as Theme;

function context(id: string, status: "pending" | "success" | "error"): ToolCallContext {
  return {
    args: {},
    toolCallId: id,
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    cwd: "/Users/ly/.agents",
    executionStarted: status !== "pending",
    argsComplete: true,
    isPartial: status === "pending",
    expanded: false,
    showImages: false,
    isError: status === "error",
  };
}

function result(text: string): RenderResult {
  return { content: [{ type: "text", text }], details: {} } as RenderResult;
}

const DONE: ResultOptions = { expanded: false, isPartial: false };
const DONE_EXPANDED: ResultOptions = { expanded: true, isPartial: false };

function show(title: string, component: { render: (width: number) => string[] }): void {
  process.stdout.write(`\n── ${title} ──\n`);
  for (const line of component.render(80)) process.stdout.write(`${line}\n`);
}

// 1. read batch: 3 calls, one fails
resetBatchRegistry();
const readPaths = ["packages/pi-ui/src/tools.ts", "packages/pi-ui/src/batch.ts", "packages/pi-ui/src/missing.ts"];
const readCtxs = ["r1", "r2", "r3"].map((id, i) => context(id, i === 2 ? "error" : "success"));
readPaths.forEach((path, i) => renderReadCall({ path }, theme, readCtxs[i]!));
const readResult = batchAwareResult("read");
readResult(result("(40 lines)"), DONE, theme, readCtxs[0]!);
readResult(result("(60 lines)"), DONE, theme, readCtxs[1]!);
readResult(result("File not found: missing.ts"), DONE, theme, readCtxs[2]!);
show("read batch · 3 calls, 1 failed", renderReadCall({ path: readPaths[0]! }, theme, readCtxs[0]!));

// 2. lone read → single inline line
resetBatchRegistry();
const loneCtx = context("r9", "success");
renderReadCall({ path: "packages/pi-ui/README.md" }, theme, loneCtx);
readResult(result("ok"), DONE, theme, loneCtx);
show("lone read", renderReadCall({ path: "packages/pi-ui/README.md" }, theme, loneCtx));

// 3. lone ls → flat output tree
resetBatchRegistry();
const lsCtx = context("l1", "success");
renderLsCall({ path: "packages/pi-ui/src" }, theme, lsCtx);
const lsText = ["config.ts", "footer.ts", "header.ts", "index.ts", "output-tree.ts", "batch.ts", "tool-call.ts", "tool-result.ts", "tool-state.ts", "tools.ts", "working.ts"].join("\n");
batchAwareResult("ls")(result(lsText), DONE, theme, lsCtx);
show("lone ls · 11 entries (6 + more)", renderLsCall({ path: "packages/pi-ui/src" }, theme, lsCtx));

// 4. find batch of 2, nested files
resetBatchRegistry();
const f1 = context("f1", "success");
const f2 = context("f2", "success");
renderFindCall({ pattern: "**/*.ts", path: "packages/pi-ui/src" }, theme, f1);
renderFindCall({ pattern: "**/*.md", path: "packages/pi-ui" }, theme, f2);
const findResult = batchAwareResult("find");
findResult(result(["batch.ts", "tool-call.ts", "tool-result.ts"].join("\n")), DONE, theme, f1);
findResult(result(["README.md", "TODO.md"].join("\n")), DONE, theme, f2);
const findPanel = renderFindCall({ pattern: "**/*.ts", path: "packages/pi-ui/src" }, theme, f1);
show("find batch · 2 members with files", findPanel);

// 5. expanded view of the find batch
const f1x = { ...f1, expanded: true };
resetBatchRegistry();
const g1 = context("f1", "success");
const g2 = context("f2", "success");
renderFindCall({ pattern: "**/*.ts", path: "packages/pi-ui/src" }, theme, g1);
renderFindCall({ pattern: "**/*.md", path: "packages/pi-ui" }, theme, g2);
findResult(result(["batch.ts", "tool-call.ts", "tool-result.ts"].join("\n")), DONE_EXPANDED, theme, g1);
findResult(result(["README.md", "TODO.md"].join("\n")), DONE_EXPANDED, theme, g2);
show("find batch · expanded", renderFindCall({ pattern: "**/*.ts", path: "packages/pi-ui/src" }, theme, { ...g1, expanded: true }));

// 6. running batch (no results yet)
resetBatchRegistry();
const p1 = context("p1", "pending");
const p2 = context("p2", "pending");
renderReadCall({ path: "a.ts" }, theme, p1);
renderReadCall({ path: "b.ts" }, theme, p2);
show("read batch · running", renderReadCall({ path: "a.ts" }, theme, p1));

// 7. bash boxed shell: running / success / failure
const colors2: Record<string, string> = {
  success: "32",
  error: "31",
  warning: "33",
  muted: "2",
  dim: "2",
  text: "0",
  accent: "36",
  toolTitle: "1",
  borderMuted: "2",
  syntaxOperator: "35",
  syntaxFunction: "33",
  syntaxComment: "2",
};
const boxTheme = {
  fg(name: string, text: string) {
    const code = colors2[name] ?? "0";
    return `\x1b[${code}m${text}\x1b[0m`;
  },
  bold(text: string) {
    return `\x1b[1m${text}\x1b[22m`;
  },
} as Theme;

function showBox(title: string, lines: string[]): void {
  process.stdout.write(`\n── ${title} ──\n`);
  for (const line of lines) process.stdout.write(`${line}\n`);
}

// running (closed card)
showBox(
  "bash box · running",
  renderBashBoxCall(
    { command: "ls -la packages/pi-ui && cat package.json # check meta" },
    boxTheme,
    context("b0", "pending"),
  ).render(80),
);

// success: open call + result continuation
const b1 = context("b1", "success");
const bashOut = ["src/", "README.md", "TODO.md", "package.json", "tsconfig.json", "one", "two", "three", "four", "five", "six", "seven"].join("\n");
const b1Call = renderBashBoxCall({ command: "ls packages/pi-ui" }, boxTheme, b1);
renderBashBoxResult(result(bashOut), DONE, boxTheme, b1);
showBox("bash box · success", [...b1Call.render(80), ...renderBashBoxResult(result(bashOut), DONE, boxTheme, b1).render(80)]);

// failure: exit 1
const b2 = context("b2", "error");
const b2Call = renderBashBoxCall({ command: "rg missing packages/pi-ui/nope" }, boxTheme, b2);
renderBashBoxResult(result(`rg: nope: no such file or directory\n\nCommand exited with code 2`), DONE, boxTheme, b2);
showBox(
  "bash box · exit 2",
  [...b2Call.render(80), ...renderBashBoxResult(result(`rg: nope: no such file or directory\n\nCommand exited with code 2`), DONE, boxTheme, b2).render(80)],
);

// grep single line unchanged
process.stdout.write("\n── grep ──\n");
const ctx = context("b1", "success");
const grepLine = renderGrepCall({ pattern: "renderCall", path: "packages/pi-ui", glob: "*.ts" }, theme, ctx);
process.stdout.write(`${grepLine.render(80)[0] ?? ""}\n`);
