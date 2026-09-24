// Render profiler: wraps hot prototype methods of Pi's own components and
// accumulates call counts + wall time. Survives reloads via globalThis.
// For invalidate-heavy keys it also samples stacks so the sweep source can be
// identified. Usage: /pi-ui profile [reset]

import { AssistantMessageComponent, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";

const STORE_KEY = Symbol.for("pi-ui.profile.store");
const MARK = Symbol.for("pi-ui.profile.marked");

interface Stats {
  calls: number;
  ms: number;
  stacks?: string[];
  nextSample?: number;
}

type Store = Record<string, Stats>;

const SAMPLING_INTERVAL = 97;
const MAX_STACKS = 4;

function store(): Store {
  const globalAny = globalThis as Record<symbol, unknown>;
  const existing = globalAny[STORE_KEY];
  if (existing && typeof existing === "object") return existing as Store;
  const created: Store = {};
  globalAny[STORE_KEY] = created;
  return created;
}

function add(key: string, ms: number, sampleStack = false): void {
  const all = store();
  const entry = all[key] ?? (all[key] = { calls: 0, ms: 0, nextSample: SAMPLING_INTERVAL });
  entry.calls += 1;
  entry.ms += ms;
  if (sampleStack && entry.nextSample !== undefined && entry.calls >= entry.nextSample) {
    entry.nextSample = entry.calls + SAMPLING_INTERVAL;
    const stack = new Error().stack ?? "";
    const kept = (entry.stacks ??= []);
    if (!kept.includes(stack)) {
      kept.push(stack);
      if (kept.length > MAX_STACKS) kept.shift();
    }
  }
}

function wrap(proto: object, method: string, label: string, sampleStack = false): void {
  const owner = proto as Record<string, unknown>;
  const original = owner[method];
  if (typeof original !== "function") return;
  if ((original as { [MARK]?: boolean })[MARK]) return;
  const wrapped = function (this: unknown, ...args: unknown[]) {
    const start = performance.now();
    try {
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    } finally {
      add(label, performance.now() - start, sampleStack);
    }
  };
  (wrapped as { [MARK]?: boolean })[MARK] = true;
  owner[method] = wrapped;
}

export function installProfiler(): void {
  for (const [cls, tag] of [
    [ToolExecutionComponent, "tool"],
    [AssistantMessageComponent, "msg"],
  ] as const) {
    const proto = cls.prototype as unknown as object;
    wrap(proto, "updateDisplay", `${tag}.updateDisplay`, tag === "tool");
    wrap(proto, "render", `${tag}.render`);
    wrap(proto, "updateContent", `${tag}.updateContent`);
    wrap(proto, "invalidate", `${tag}.invalidate`, tag === "tool");
    wrap(proto, "setExpanded", `${tag}.setExpanded`);
  }
}

export function resetProfile(): void {
  for (const key of Object.keys(store())) delete store()[key];
}

function briefStack(stack: string): string {
  const frames = stack
    .split("\n")
    .filter((line) => /pi-ui|interactive-mode|tool-execution|tui\.js|loader\.js/.test(line))
    .slice(0, 3)
    .map((line) => line.trim().replace(/^at\s+/, "").replace(/\(file:\/\/.*$/, ""));
  return frames.join(" ← ");
}

export function profileSnapshot(): string {
  const entries = Object.entries(store())
    .map(([key, stats]) => ({ key, ...stats }))
    .filter((entry) => entry.calls > 0)
    .sort((left, right) => right.ms - left.ms);
  if (entries.length === 0) return "no samples yet — type a few chars, then run /pi-ui profile";
  const total = entries.reduce((sum, entry) => sum + entry.ms, 0);
  const lines = entries.slice(0, 8).map((entry) => {
    const avg = entry.ms / entry.calls;
    return `${entry.ms.toFixed(0)}ms ×${entry.calls} (avg ${avg.toFixed(2)}ms)  ${entry.key}`;
  });
  const stackLines: string[] = [];
  for (const entry of entries.slice(0, 8)) {
    for (const stack of entry.stacks ?? []) {
      const brief = briefStack(stack);
      if (brief) stackLines.push(`[${entry.key}] ${brief}`);
    }
  }
  return `total ${total.toFixed(0)}ms\n${lines.join("\n")}${stackLines.length ? `\n--- stacks ---\n${stackLines.slice(0, 6).join("\n")}` : ""}`;
}
