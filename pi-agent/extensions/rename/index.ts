import path from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { completeSimple } from "@earendil-works/pi-ai/compat";

const TYPES = ["功能", "设计", "修复", "优化", "发布", "探索", "文档", "研究"];

const TITLE_PROMPT = [
	"根据用户首条消息，为此编码会话生成标题。",
	"输出格式严格为：类型｜主题",
	`类型必须是以下之一：${TYPES.join("、")}`,
	"主题为中文，不超过12字，概括任务实质，不要包含项目名或目录名。",
	"只输出标题本身，无引号无句号。无法判断主题时只输出：未知",
].join("\n");

function mmdd(iso: string): string {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Shanghai",
		month: "2-digit",
		day: "2-digit",
	});
	const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map(p => [p.type, p.value]));
	return `${parts.month}${parts.day}`;
}

export default function (pi: ExtensionAPI) {
	let started = false;
	let isRunning = false;

	function syncTitle(ctx: ExtensionContext) {
		const name = pi.getSessionName();
		if (!name) return;
		ctx.ui.setTitle(`${isRunning ? "·" : "✳"} ${name} - ${path.basename(ctx.cwd)}`);
	}

	pi.on("agent_start", async (_event, ctx) => {
		isRunning = true;
		syncTitle(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		isRunning = false;
		syncTitle(ctx);
	});

	pi.on("input", async (event, ctx) => {
		if (started || pi.getSessionName()) return; // 只命名一次；手动命名优先
		const first = event.text.trim();
		if (!first || first.startsWith("/")) return; // 跳过斜杠命令，等第一条自然语言
		started = true;

		void (async () => {
			// createdAt = 会话首条 entry（session 行）的时间戳
			const createdAt = ctx.sessionManager.getEntries()[0]?.timestamp ?? new Date().toISOString();
			if (!ctx.model) return;

			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
			if (!auth.ok) return;

			for (let attempt = 0; attempt < 3; attempt++) {
				try {
					const response = await completeSimple(
						ctx.model,
						{
							systemPrompt: TITLE_PROMPT,
							messages: [{ role: "user", content: first, timestamp: Date.now() }],
						},
						{
							maxTokens: 60,
							apiKey: auth.apiKey,
							headers: { ...(ctx.model.headers ?? {}), ...(auth.headers ?? {}) },
						},
					);

					const part = response.content.toReversed().find(part => part.type === "text");
					if (!part) return;

					const raw = part.text.trim().replace(/^["'「」]+|["'「」]+$/g, "");
					if (!raw || raw.includes("未知")) return; // 无法判断主题 → 不命名

					pi.setSessionName(`${mmdd(createdAt)}｜${raw}`);
					syncTitle(ctx);
					return;
				} catch {
					// retry
				}
			}
		})();
	});
}
