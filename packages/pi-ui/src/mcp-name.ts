const AGENT_TOOLS = new Set(["Agent", "Agents", "get_subagent_result", "steer_subagent"]);

export function isReservedAgentTool(name: string): boolean {
  return AGENT_TOOLS.has(name);
}

export function isMcpToolName(name: string): boolean {
  return name === "mcp" || name.startsWith("mcp__") || /^mcp[_:-]/i.test(name);
}

function titleCase(word: string): string {
  const spaced = word
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
}

/** omp-style: `mcp__exa__web_search` → `Exa: Web Search`. */
export function formatMcpToolName(toolName: string): string {
  if (toolName.startsWith("mcp__")) {
    const rest = toolName.slice(5);
    const split = rest.includes("__") ? rest.indexOf("__") : rest.indexOf("_");
    if (split > 0) {
      const server = titleCase(rest.slice(0, split));
      const tool = titleCase(rest.slice(split).replace(/^_+/, ""));
      if (server && tool) return `${server}: ${tool}`;
    }
  }
  const stripped = toolName.replace(/^mcp(?:[_:-]+)+/i, "");
  return titleCase(stripped || toolName) || "MCP";
}
