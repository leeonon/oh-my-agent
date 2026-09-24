import type { Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { EMPTY_BATCH_RESULT, registerBatchResult, type BatchToolName } from "./batch.ts";
import { getConfig } from "./config.ts";
import { parseFindOutput, parseLsOutput } from "./output-tree.ts";
import { countListedResults, textContent } from "./tool-state.ts";

/** Plain-object single-line component. Never instantiate foreign pi-tui classes. */
function lineComponent(line: string): Component {
  return {
    render(width: number): string[] {
      return [truncateToWidth(line, Math.max(0, width), "…")];
    },
    invalidate() {},
  };
}

type RenderResult = NonNullable<ToolDefinition["renderResult"]>;
type ToolCallContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];

export type CountUnit = {
  singular: string;
  plural: string;
};

function emptyResult(): Component {
  return { render: () => [], invalidate() {} };
}

function countLine(theme: Theme, count: number, unit: CountUnit): Component {
  const label = count === 1 ? unit.singular : unit.plural;
  return lineComponent(theme.fg("muted", `↳ ${count} ${label} returned`));
}

const READ_PREVIEW_CAP = 200;

function readPreviewFromResult(
  text: string,
  details: unknown,
): { lineCount: number; contentLines: string[] } {
  const body = text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("[");
    });
  const truncation =
    typeof details === "object" && details !== null
      ? (details as { truncation?: { totalLines?: unknown } }).truncation
      : undefined;
  const total =
    typeof truncation?.totalLines === "number" && Number.isFinite(truncation.totalLines)
      ? truncation.totalLines
      : body.length;
  return { lineCount: total, contentLines: body.slice(0, READ_PREVIEW_CAP) };
}

function parseEntries(toolName: BatchToolName, text: string): string[] | undefined {
  if (toolName === "ls") return parseLsOutput(text);
  if (toolName === "find") return parseFindOutput(text);
  return undefined;
}

/**
 * Quiet-tool (read/ls/find) result renderer: registers the member result into
 * the batch registry (the leader panel renders it) and renders nothing here.
 * Errors are recorded so the leader panel keeps them inline and visible.
 */
export function batchAwareResult(toolName: BatchToolName): RenderResult {
  return (result, options, _theme, context) => {
    try {
      const text = textContent(result).trim();
      const entries =
        !context.isError && !options.isPartial ? parseEntries(toolName, text) : undefined;
      const readPreview =
        toolName === "read" && !context.isError && !options.isPartial
          ? readPreviewFromResult(text, result.details)
          : undefined;
      registerBatchResult(
        toolName,
        {
          isPartial: options.isPartial,
          isError: Boolean(context.isError),
          ...(context.isError && text ? { errorText: text } : {}),
          ...(entries !== undefined ? { entries } : {}),
          ...(readPreview ?? {}),
        },
        context as ToolCallContext,
      );
    } catch {
      // Display-only. A throw here makes Pi fall back to the native preview.
    }
    return EMPTY_BATCH_RESULT;
  };
}

export function wrapCollapsedResult<Fn>(
  original: Fn | undefined,
  unit?: CountUnit,
): Fn {
  const render = original as RenderResult | undefined;
  const wrapped: RenderResult = (result, options, theme, context) => {
    if (options.isPartial && unit) {
      return lineComponent(theme.fg("muted", "↳ running..."));
    }
    if (options.expanded) {
      return render?.(result, options, theme, context) ?? emptyResult();
    }

    const previewLines = getConfig().collapsedResultLines;
    if (previewLines > 0 && render) {
      const inner = render(
        result,
        { expanded: true, isPartial: options.isPartial },
        theme,
        context,
      );
      return {
        render(width: number): string[] {
          return inner.render(width).slice(0, previewLines);
        },
        invalidate(): void {
          inner.invalidate();
        },
      };
    }

    if (unit) {
      return countLine(theme, countListedResults(result), unit);
    }
    return emptyResult();
  };
  return wrapped as Fn;
}
