// Repro harness: does a height-oscillating fallback card stack copies on the
// TUI screen? Drives the HOST Tui class with a fake terminal, replays all
// writes through a mini ANSI emulator, counts title rows in the final screen.
//
// Usage: node scripts/repro-stack.mjs [mode]
//   mode = "oscillate" (default) | "stable"

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const jiti = require("/Users/ly/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti")(
  import.meta.url,
  { alias: {
    "@earendil-works/pi-coding-agent":
      "/Users/ly/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js",
    "@earendil-works/pi-tui":
      "/Users/ly/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/index.js",
  } },
);

const { ToolExecutionComponent, initTheme } = await jiti.import("@earendil-works/pi-coding-agent");
const TuiMod = await jiti.import("@earendil-works/pi-tui");
const Tui = (process.argv[3] === "alt") ? TuiMod.TuiAltScreen : TuiMod.TuiMainScreen;
const { installUnknownToolDecoration } = await jiti.import("../src/decorate.ts");
const { loadConfig } = await jiti.import("../src/config.ts");

const mode = process.argv[2] ?? "oscillate";
loadConfig();
initTheme("catppuccin-mocha");
installUnknownToolDecoration();

// ---------- fake terminal ----------
const writes = [];
const term = {
  _cols: 100,
  _rows: 30,
  write(data) { writes.push(data); },
  start() {}, stop() {}, drainInput: async () => {},
  get columns() { return this._cols; },
  get rows() { return this._rows; },
  get kittyProtocolActive() { return false; },
  moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {},
  clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {},
};

// ---------- mini ANSI screen emulator ----------
const screen = Array.from({ length: term._rows }, () => "");
let cy = 0, cx = 0;
const stripSGR = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
function put(text) {
  const clean = stripSGR(text);
  if (!clean) return;
  const row = screen[cy] ?? "";
  const left = row.slice(0, cx).padEnd(cx);
  screen[cy] = (left + clean).slice(0, term._cols);
  cx += clean.length;
}
function feed(data) {
  let i = 0;
  while (i < data.length) {
    const ch = data[i];
    if (ch === "\x1b" && data[i + 1] === "[") {
      const m = /^?\x1b\[([0-9;?]*)([A-Za-z])/.exec(data.slice(i));
      if (m) {
        const [, params, cmd] = m;
        const nums = params.split(";").map((n) => (n === "" ? NaN : parseInt(n, 10)));
        const n1 = Number.isNaN(nums[0]) ? 1 : nums[0];
        if (cmd === "H" || cmd === "f") {
          cy = (nums[0] || 1) - 1; cx = (nums[1] || 1) - 1;
        } else if (cmd === "A") cy = Math.max(0, cy - n1);
        else if (cmd === "B") cy = Math.min(term._rows - 1, cy + n1);
        else if (cmd === "C") cx += n1;
        else if (cmd === "D") cx = Math.max(0, cx - n1);
        else if (cmd === "K") { const row = screen[cy] ?? ""; screen[cy] = cx === 0 ? "" : row.slice(0, cx); }
        else if (cmd === "J") {
          if (params === "2" || params === "3") { for (let r = 0; r < term._rows; r++) screen[r] = ""; }
          else if (params === "0" || params === "") { for (let r = cy; r < term._rows; r++) screen[r] = ""; }
        }
        i += m[0].length;
        continue;
      }
    }
    if (ch === "\n") { cy = Math.min(cy + 1, term._rows - 1); i++; continue; }
    if (ch === "\r") { cx = 0; i++; continue; }
    if (ch === "\x1b") {
      const m2 = /^\x1b\][^\x07]*(\x07|\x1b\\)/.exec(data.slice(i)); // OSC
      const m3 = /^\x1b\[[0-9;?<>=]*[a-zA-Z]/.exec(data.slice(i)); // unhandled CSI
      const skip = m2 ? m2[0].length : m3 ? m3[0].length : 1;
      i += skip;
      continue;
    }
    // printable run
    let j = i;
    while (j < data.length && data[j] !== "\x1b" && data[j] !== "\n" && data[j] !== "\r") j++;
    put(data.slice(i, j));
    i = j;
  }
}

// ---------- scenario ----------
const ui = { requestRender() {} };
const card = new ToolExecutionComponent(
  "ctx_execute",
  "call-1",
  { language: "shell" },
  {},
  { name: "ctx_execute" }, // registered but renderer-less → decorate fallback path
  ui,
  process.cwd(),
);

const tui = new Tui(term, false, undefined);
if (typeof tui.setLayoutRoot === "function") tui.setLayoutRoot(card); else tui.addChild(card);
tui.start();
card.markExecutionStarted();

const TICKS = 60;
let ticks = TICKS;
let on = false;
await new Promise((resolve) => {
  const timer = setInterval(() => {
    on = !on;
    if (mode === "oscillate") {
      // emulate streaming args: height flips between 1 and 2 content rows
      card.args = on ? { language: "shell", source: "Remnawave panel installation docs" } : { language: "shell" };
    }
    card.updateResult({ content: [{ type: "text", text: "" }] }, true);
    tui.requestRender();
    if (--ticks <= 0) { clearInterval(timer); resolve(undefined); }
  }, 80);
});
// finish the call like tool_execution_end
card.updateResult({ content: [{ type: "text", text: "done" }] }, false);
tui.requestRender();
await new Promise((r) => setTimeout(r, 300));
tui.stop();

const raw = writes.join("");
console.log("title occurrences in raw writes:", (raw.match(/ctx_execute/g) ?? []).length);
console.log("DECSTBM (scroll region):", /\x1b\[[0-9;]*r/.test(raw));
console.log("SU/SD scroll:", /\x1b\[[0-9]*[ST]/.test(raw));
console.log("alt screen seq:", raw.includes("\x1b[?1049"));
for (const w of writes) feed(w);
const titles = screen.filter((row) => row.includes("➔ ctx_execute")).length;
console.log(`mode=${mode} title-rows-on-final-screen=${titles}`);
console.log(screen.map((r, i) => `${String(i).padStart(2)}|${r}`).join("\n"));
