import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  getConfig,
  setBoxPadding,
  setHistoryKeep,
  setCollapsedResultLines,
  setGrepFileLimit,
  setReadLineLimit,
  setStatsPlacement,
  setThinkingLines,
  type StatsPlacement,
} from "./config.ts";
import { profileSnapshot, resetProfile } from "./profile.ts";
import { registerFooter } from "./footer.ts";
import { registerHeader } from "./header.ts";
import { registerToolRender } from "./tools.ts";
import { registerWorking } from "./working.ts";

function parseStatsPlacement(raw: string): StatsPlacement | undefined {
  const key = raw.trim().toLowerCase();
  if (key === "bottom-left" || key === "左下") return "bottom-left";
  if (key === "bottom-right" || key === "右下") return "bottom-right";
  if (key === "top-right" || key === "右上") return "top-right";
  return undefined;
}

interface NumericSetting {
  key: string;
  min: number;
  max: number;
  apply: (value: number) => void;
}

const NUMERIC_SETTINGS: NumericSetting[] = [
  { key: "collapsed-lines", min: 0, max: 200, apply: setCollapsedResultLines },
  { key: "box-padding", min: 0, max: 2, apply: setBoxPadding },
  { key: "grep-files", min: 1, max: 20, apply: setGrepFileLimit },
  { key: "read-lines", min: 1, max: 200, apply: setReadLineLimit },
  { key: "thinking-lines", min: 0, max: 5, apply: setThinkingLines },
  { key: "history-keep", min: 0, max: 2000, apply: setHistoryKeep },
];

export default function (pi: ExtensionAPI): void {
  registerHeader(pi);
  registerFooter(pi);
  registerWorking(pi);
  registerToolRender(pi);

  pi.registerCommand("pi-ui", {
    description: "pi-ui config (collapsed-lines, stats, thinking-lines, ...)",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const summary = () => {
        const config = getConfig();
        const parts = NUMERIC_SETTINGS.map(
          (setting) => `${setting.key}=${getConfigKey(config, setting.key)}`,
        );
        return `stats=${config.statsPlacement} ${parts.join(" ")}`;
      };
      if (!trimmed) {
        ctx.ui.notify(`${summary()} (collapsed-lines 0 = hide output until ctrl+o)`, "info");
        return;
      }

      const stats = trimmed.match(/^stats(?:\s+(\S+))?$/i);
      if (stats) {
        const raw = stats[1];
        if (raw === undefined) {
          ctx.ui.notify(summary(), "info");
          return;
        }
        const placement = parseStatsPlacement(raw);
        if (!placement) {
          ctx.ui.notify("Usage: /pi-ui stats bottom-left|bottom-right|top-right", "warning");
          return;
        }
        setStatsPlacement(placement);
        ctx.ui.notify(summary(), "info");
        return;
      }

      for (const setting of NUMERIC_SETTINGS) {
        const match = trimmed.match(new RegExp(`^${setting.key}(?:\\s+(\\d+))?$`, "i"));
        if (!match) continue;
        const raw = match[1];
        if (raw === undefined) {
          ctx.ui.notify(summary(), "info");
          return;
        }
        const value = Math.max(setting.min, Math.min(setting.max, Number(raw)));
        setting.apply(value);
        ctx.ui.notify(summary(), "info");
        return;
      }

      const profile = trimmed.match(/^profile(?:\s+(reset))?$/i);
      if (profile) {
        if (profile[1]) {
          resetProfile();
          ctx.ui.notify("profile reset", "info");
          return;
        }
        ctx.ui.notify(profileSnapshot(), "info");
        return;
      }
      ctx.ui.notify(
        "Usage: /pi-ui [collapsed-lines 0-200 | stats bottom-left|bottom-right|top-right | box-padding 0-2 | grep-files 1-20 | read-lines 1-200 | thinking-lines 0-5 | history-keep 0-2000 | profile [reset]]",
        "warning",
      );
    },
  });
}

function getConfigKey(config: ReturnType<typeof getConfig>, key: string): number {
  switch (key) {
    case "collapsed-lines":
      return config.collapsedResultLines;
    case "box-padding":
      return config.boxPadding;
    case "grep-files":
      return config.grepFileLimit;
    case "read-lines":
      return config.readLineLimit;
    case "thinking-lines":
      return config.thinkingLines;
    case "history-keep":
      return config.historyKeep;
    default:
      return 0;
  }
}
