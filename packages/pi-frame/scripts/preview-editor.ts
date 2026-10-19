/**
 * Render the FrameEditor against a fake terminal and print the result.
 * Usage: node --experimental-strip-types scripts/preview-editor.ts
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jiti = require("/Users/ly/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti")(import.meta.url, {
	alias: {
		"@earendil-works/pi-coding-agent": "/Users/ly/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js",
		"@earendil-works/pi-tui": "/Users/ly/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/index.js",
	},
});

const { FrameEditor } = await jiti.import("../src/editor-frame.ts");

const borderColor = (s) => `\x1b[90m${s}\x1b[0m`;
const theme = { borderColor, selectList: {} };
const tui = { terminal: { rows: 30 }, requestRender() {} };

for (const text of [
	"hello world",
	"中文输入测试：圆角边框下的宽字符",
	"a-very-long-command-line --flag=value that should wrap across multiple frame rows without breaking the box",
]) {
	const editor = new FrameEditor(tui, theme, {}, { paddingX: 1, embedWorkingStatus: true });
	editor.focused = true;
	editor.setText(text);
	console.log(`┌─ width=60 ── text=${JSON.stringify(text.slice(0, 24))}…`);
	for (const line of editor.render(60)) console.log(`|${line}|`);
	console.log("└───");
}

// Strict check: every framed row must be exactly `width` visible columns.
const { visibleWidth } = await jiti.import("@earendil-works/pi-tui");
let failures = 0;
for (const [text, w] of [["hi", 60], ["中文宽字符测试", 60], ["", 80], ["x".repeat(200), 40]]) {
	const e = new FrameEditor(tui, theme, {}, { paddingX: 1, embedWorkingStatus: true });
	e.focused = true;
	e.setText(text);
	for (const line of e.render(w)) {
		const vw = visibleWidth(line);
		if (vw !== w) {
			failures++;
			console.log(`WIDTH-FAIL expect=${w} got=${vw} text=${JSON.stringify(text.slice(0, 20))}`);
		}
	}
}
console.log(failures === 0 ? "WIDTH-CHECK-OK" : `WIDTH-CHECK FAILED: ${failures}`);
