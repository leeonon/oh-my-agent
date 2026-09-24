export function readResultCount(state: unknown): number | undefined {
  if (typeof state !== "object" || state === null) return undefined;
  if (!("resultCount" in state)) return undefined;
  const value = (state as { resultCount?: unknown }).resultCount;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function writeResultCount(state: unknown, count: number): boolean {
  if (typeof state !== "object" || state === null) return false;
  const prev = readResultCount(state);
  (state as { resultCount?: number }).resultCount = count;
  return prev !== count;
}

type ResultContent = {
  content?: ReadonlyArray<{ type?: string; text?: string }>;
  details?: unknown;
};

function limitFromDetails(details: unknown): number | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const record = details as {
    matchLimitReached?: unknown;
    resultLimitReached?: unknown;
    entryLimitReached?: unknown;
  };
  if (typeof record.matchLimitReached === "number") return record.matchLimitReached;
  if (typeof record.resultLimitReached === "number") return record.resultLimitReached;
  if (typeof record.entryLimitReached === "number") return record.entryLimitReached;
  return undefined;
}

export function textContent(result: ResultContent): string {
  return (result.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("\n");
}

export function countListedResults(result: ResultContent): number {
  const limited = limitFromDetails(result.details);
  if (limited !== undefined) return limited;

  const text = textContent(result).trim();
  if (!text) return 0;
  return text.split("\n").filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("[");
  }).length;
}
