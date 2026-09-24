import { getLanguageFromPath, highlightCode } from "@earendil-works/pi-coding-agent";

const MAX_HL_CHARS = 12_000;
const MAX_HL_LINES = 120;

export function highlightSource(path: string, code: string): string[] | undefined {
  const language = getLanguageFromPath(path);
  if (!language) return undefined;
  if (code.length > MAX_HL_CHARS) return undefined;
  const lineCount = code.length === 0 ? 0 : code.split("\n").length;
  if (lineCount > MAX_HL_LINES) return undefined;
  try {
    return highlightCode(code, language);
  } catch {
    return undefined;
  }
}

export function highlightSourceLine(path: string, line: string): string | undefined {
  const language = getLanguageFromPath(path);
  if (!language || line.length > 500) return undefined;
  try {
    return highlightCode(line, language)[0];
  } catch {
    return undefined;
  }
}
