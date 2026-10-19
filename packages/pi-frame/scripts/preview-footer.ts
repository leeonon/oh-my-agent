/**
 * Render the footer rows with mocked session data.
 * Usage: node --experimental-strip-types scripts/preview-footer.ts
 */
import { createRequire } from "node:module";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
const jiti = require("/Users/ly/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti")(import.meta.url, {
	alias: {
		"@earendil-works/pi-coding-agent": "/Users/ly/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js",
		"@earendil-works/pi-tui": "/Users/ly/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/index.js",
	},
});

const { renderFooterRows, turnLive } = await jiti.import("../src/footer.ts");
const { DEFAULT_CONFIG } = await jiti.import("../src/config.ts");

const DIM = "\x1b[2m";
const ACCENT = "\x1b[36m";
const MUTED = "\x1b[90m";
const RESET = "\x1b[0m";
const COLORS = { dim: DIM, accent: ACCENT, muted: MUTED, error: "\x1b[31m" };
const fg = (token, text) => `${COLORS[token] ?? ""}${text}${RESET}`;

const ctx = {
	model: { id: "gpt-5.6-sol", provider: "openai-codex" },
	sessionManager: {
		getEntries: () => [
			{ type: "message", message: { role: "user", text: "hi" } },
			{ type: "message", message: { role: "assistant", usage: { input: 12400, output: 3200, cost: { total: 0.4231 } } } },
		],
		getSessionName: () => "pi-frame 美化",
	},
	getContextUsage: () => ({ tokens: 68_000, contextWindow: 200_000, percent: 34 }),
	getThinkingLevel: () => "high",
};

const footerData = {
	getGitBranch: () => "main",
	getAvailableProviderCount: () => 8,
	onBranchChange: () => () => {},
};

for (const width of [100, 60]) {
	console.log(`┌─ width=${width}`);
	for (const line of renderFooterRows(DEFAULT_CONFIG.footer.rows, width, ctx, footerData, fg)) {
		console.log(`|${line}|`);
	}
	console.log("|— running —");
	turnLive.startedAt = Date.now() - 4200;
	turnLive.settledMs = undefined;
	turnLive.ttftLastMs = 1800;
	turnLive.outputTokens = 220;
	turnLive.streamMs = 5200;
	for (const line of renderFooterRows(DEFAULT_CONFIG.footer.rows, width, ctx, footerData, fg)) {
		console.log(`|${line}|`);
	}
	console.log("|— frozen —");
	turnLive.startedAt = undefined;
	turnLive.settledMs = 72_400;
	turnLive.aborted = false;
	for (const line of renderFooterRows(DEFAULT_CONFIG.footer.rows, width, ctx, footerData, fg)) {
		console.log(`|${line}|`);
	}
	turnLive.startedAt = undefined;
	turnLive.settledMs = undefined;
	console.log("└───");
}
