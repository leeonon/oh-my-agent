// Memoization that survives component recreation: updateDisplay() rebuilds our
// render components on every invalidate, which defeats per-closure caches.
// Slotting the cache into `context.state` (the rendererState owned by the
// ToolExecutionComponent instance) keeps it across rebuilds.

interface MemoSlot {
  sig: string;
  width: number;
  lines: string[];
}

export function stateMemo<TState extends object>(
  state: TState,
  slotKey: string,
  compute: (width: number) => string[],
  signature: () => string,
): (width: number) => string[] {
  const bag = state as Record<string, MemoSlot | undefined>;
  const key = `__pi-ui-memo:${slotKey}`;
  return (width: number) => {
    const sig = signature();
    const slot = bag[key];
    if (slot && slot.sig === sig && slot.width === width) return slot.lines;
    const lines = compute(width);
    bag[key] = { sig, width, lines };
    return lines;
  };
}
