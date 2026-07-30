#!/usr/bin/env node
import { program } from "commander";
import { launchBrowser, killBrowser, BrowserType, BrowserInstance } from "./launcher.js";
import { inspectScene, formatSceneInfo } from "./webgl.js";
import { PageDebugger } from "./debugger.js";
import { CdpConnection, createPageConnection, sendPage, evaluate, getPageUrl, getPageTitle } from "./cdp.js";
import { takeSnapshot, formatSnapshotAsText } from "./snapshot.js";
import { formatAgentOutput, formatError } from "./output.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ── Globals ───────────────────────────────────────────────────────────────
let conn: CdpConnection | null = null;
let sessionId = "";
let targetId = "";
let browser: BrowserInstance | null = null;
let pageUrl = "";

let persistentBrowser: BrowserInstance | null = null;
let persistentConn: CdpConnection | null = null;
let persistentSessionId = "";
let persistentTargetId = "";
let pageDebugger: PageDebugger | null = null;

interface ConsoleMsg { type: string; text: string; ts: number }
const consoleLog: ConsoleMsg[] = [];
interface NetReq { method: string; url: string; resourceType: string; status?: number; error?: string; ts: number }
const networkLog: NetReq[] = [];

// ── Session persistence ───────────────────────────────────────────────────
const BROWSER_STORE = join(homedir(), ".browser-cli", "session.json");
function loadBrowserSession(): { wsEndpoint?: string; port?: number; targetId?: string } | null {
  try { if (existsSync(BROWSER_STORE)) return JSON.parse(readFileSync(BROWSER_STORE, "utf8")); } catch {}
  return null;
}
function saveBrowserSession(data: { wsEndpoint?: string; port?: number; targetId?: string }) {
  try { if (!existsSync(join(homedir(), ".browser-cli"))) mkdirSync(join(homedir(), ".browser-cli"), { recursive: true }); writeFileSync(BROWSER_STORE, JSON.stringify(data)); } catch {}
}
function clearBrowserSession() { try { writeFileSync(BROWSER_STORE, "{}"); } catch {} }

// ── Event handlers ────────────────────────────────────────────────────────
function cdpConsoleHandler(params: any) {
  const type = params.type || "log";
  const args = params.args || [];
  const texts = args.map((a: any) => {
    if (a.value !== undefined) return String(a.value);
    if (a.description) return a.description;
    return JSON.stringify(a);
  });
  consoleLog.push({ type, text: texts.join(" "), ts: Date.now() });
}
function cdpNetRequestHandler(params: any) {
  const req = params.request || {};
  networkLog.push({ method: req.method || "?", url: req.url || "?", resourceType: params.type || "?", ts: Date.now() });
}
function cdpNetFailedHandler(params: any) {
  const entry = networkLog.find(n => n.url === params.request?.url);
  if (entry) entry.error = params.errorText || "failed";
  else networkLog.push({ method: params.request?.method || "?", url: params.request?.url || "?", resourceType: params.type || "?", error: params.errorText || "failed", ts: Date.now() });
}
function cdpNetResponseHandler(params: any) {
  const entry = networkLog.find(n => n.url === params.request?.url);
  if (entry) entry.status = params.response?.status;
}

// ── ensureBrowser ─────────────────────────────────────────────────────────
async function ensureBrowser(): Promise<void> {
  const keep = program.getOptionValue("keep") as boolean;

  if (keep && persistentConn) {
    conn = persistentConn;
    sessionId = persistentSessionId;
    targetId = persistentTargetId;
    pageUrl = await getPageUrl(conn, sessionId);
    return;
  }
  if (conn) return;
  if (browser) return;

  const browserType = program.getOptionValue("browser") as BrowserType;
  const headless = program.getOptionValue("headless") !== "false";
  const port = program.getOptionValue("port") as number | undefined;
  const w = parseInt(program.getOptionValue("width") as string);
  const h = parseInt(program.getOptionValue("height") as string);

  // Cross-process reconnect — open fresh tab in existing browser
  if (keep && !persistentConn) {
    const saved = loadBrowserSession();
    if (saved?.wsEndpoint && saved?.targetId) {
      try {
        const cc = new CdpConnection(saved.wsEndpoint);
        // Try to use existing targetId first
        let activeSid = "";
        let activeTid = saved.targetId;
        try {
          const att = await cc.send("Target.attachToTarget", { targetId: activeTid, flatten: true });
          activeSid = att.sessionId;
        } catch { activeTid = ""; }

        // If saved target failed, create a new page
        if (!activeSid) {
          const cr = await cc.send("Target.createTarget", { url: "about:blank" });
          activeTid = cr.targetId;
          const att = await cc.send("Target.attachToTarget", { targetId: activeTid, flatten: true });
          activeSid = att.sessionId;
        }

        conn = cc;
        sessionId = activeSid;
        targetId = activeTid;
        pageUrl = await getPageUrl(cc, activeSid);

        conn.on("Runtime.consoleAPICalled", cdpConsoleHandler);
        await sendPage(cc, activeSid, "Page.enable");
        await sendPage(cc, activeSid, "Runtime.enable");
        await sendPage(cc, activeSid, "Network.enable");
        conn.on("Network.requestWillBeSent", cdpNetRequestHandler);
        conn.on("Network.loadingFailed", cdpNetFailedHandler);
        conn.on("Network.responseReceived", cdpNetResponseHandler);

        persistentConn = cc;
        persistentSessionId = activeSid;
        persistentTargetId = activeTid;

        pageDebugger = new PageDebugger();
        pageDebugger.useStore = true;
        await pageDebugger.init(cc, activeSid);
        return;
      } catch { /* reconnect failed, launch fresh */ }
    }
  }

  // Fresh launch
  const b = await launchBrowser(browserType, { headless, port });
  browser = b;
  const cc = new CdpConnection(b.wsEndpoint);
  const pcinfo = await createPageConnection(cc);
  conn = cc;
  sessionId = pcinfo.sessionId;
  targetId = pcinfo.targetId;
  pageUrl = await getPageUrl(conn, sessionId);

  // Enable domains
  await sendPage(conn, sessionId, "Page.enable");
  await sendPage(conn, sessionId, "Runtime.enable");
  await sendPage(conn, sessionId, "Network.enable");
  conn.on("Runtime.consoleAPICalled", cdpConsoleHandler);
  conn.on("Network.requestWillBeSent", cdpNetRequestHandler);
  conn.on("Network.loadingFailed", cdpNetFailedHandler);
  conn.on("Network.responseReceived", cdpNetResponseHandler);

  // Init debugger
  pageDebugger = new PageDebugger();
  pageDebugger.useStore = keep;
  await pageDebugger.init(conn, sessionId);

  // Set viewport
  await sendPage(conn, sessionId, "Emulation.setDeviceMetricsOverride", {
    width: w, height: h, deviceScaleFactor: 1, mobile: false,
  });

  if (keep) {
    persistentConn = conn;
    persistentSessionId = sessionId;
    persistentTargetId = targetId;
    persistentBrowser = browser;
    saveBrowserSession({ wsEndpoint: b.wsEndpoint, port: b.port, targetId });
  }
}

// ── outputResult ──────────────────────────────────────────────────────────
async function outputResult(params: {
  start: number;
  message?: string;
  screenshot?: boolean | string;
  snapshot?: boolean | string;
  console?: boolean | string;
}): Promise<void> {
  let screenshotB64: string | undefined;
  let snapshotText: string | undefined;
  let consoleText: string | undefined;

  if (params.screenshot) {
    const r = await sendPage(conn!, sessionId, "Page.captureScreenshot", { format: "png", fromSurface: true });
    if (r?.data) screenshotB64 = r.data;
  }
  if (params.snapshot) {
    const snap = await takeSnapshot(conn!, sessionId, pageUrl);
    snapshotText = formatSnapshotAsText(snap);
  }
  if (params.console) {
    const lines = consoleLog.map(m => `[${m.type}] ${m.text}`);
    consoleText = lines.length > 0 ? lines.join("\n") : "(no console messages)";
  }

  console.log(
    formatAgentOutput({
      message: params.message || `Navigated to ${pageUrl}`,
      screenshotBase64: screenshotB64,
      snapshotText,
      consoleText,
      success: true,
      startTime: params.start,
    })
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────
async function cdpNavigate(url: string): Promise<void> {
  await sendPage(conn!, sessionId, "Page.navigate", { url });
  await sleep(3000);
  pageUrl = await getPageUrl(conn!, sessionId);
}

async function cdpClick(selector: string): Promise<void> {
  const r = await sendPage(conn!, sessionId, "Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector('${selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}');
      if (!el) return { error: "Element not found" };
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
    })()`,
    returnByValue: true,
  });
  const pos = r?.result?.value;
  if (pos?.error) throw new Error(pos.error);
  await sendPage(conn!, sessionId, "Input.dispatchMouseEvent", {
    type: "mousePressed", x: pos.x, y: pos.y, button: "left", clickCount: 1,
  });
  await sendPage(conn!, sessionId, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x: pos.x, y: pos.y, button: "left", clickCount: 1,
  });
}

async function cdpType(selector: string, text: string): Promise<void> {
  await sendPage(conn!, sessionId, "Runtime.evaluate", {
    expression: `document.querySelector('${selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')?.focus()`,
    returnByValue: true,
  });
  for (const ch of text) {
    await sendPage(conn!, sessionId, "Input.dispatchKeyEvent", { type: "keyDown", text: ch });
    await sendPage(conn!, sessionId, "Input.dispatchKeyEvent", { type: "keyUp", text: ch });
  }
}

async function cdpSelect(selector: string, value: string): Promise<void> {
  await sendPage(conn!, sessionId, "Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector('${selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}');
      if (!el) return;
      el.value = '${value.replace(/'/g, "\\'")}';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
    returnByValue: true,
  });
}

async function cdpGetText(selector: string): Promise<string> {
  const r = await sendPage(conn!, sessionId, "Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector('${selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}');
      return el ? el.innerText || el.textContent || el.value || "" : "";
    })()`,
    returnByValue: true,
  });
  return r?.result?.value || "";
}

async function cleanup(): Promise<void> {
  const keep = program.getOptionValue("keep") as boolean;
  if (keep) return;
  if (browser) {
    try { conn?.close(); } catch {}
    try { await killBrowser(browser); } catch {}
    conn = null;
    browser = null;
    sessionId = "";
    targetId = "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ════════════════════ COMMANDS ═══════════════════════════════════════════

// ── Program config ────────────────────────────────────────────────────────
program
  .name("browser-cli")
  .description("Browser automation CLI for AI agents. Direct CDP — no Puppeteer/Playwright.")
  .version("1.1.0")
  .option("--browser <type>", "Browser type: chromium, firefox, auto", "auto")
  .option("--headless <bool>", "Headless mode (true/false)", "true")
  .option("--width <px>", "Viewport width", "1280")
  .option("--height <px>", "Viewport height", "720")
  .option("--timeout <ms>", "Command timeout", "30000")
  .option("--keep", "Keep browser alive across commands (use 'quit' to stop)")
  .option("--port <number>", "Remote debugging port");

// ── goto ──────────────────────────────────────────────────────────────────
program
  .command("goto")
  .argument("<url>", "URL to navigate to")
  .option("--screenshot", "Include screenshot")
  .option("--snapshot", "Include page snapshot")
  .option("--console", "Include console logs in output")
  .description("Navigate to a URL and return page state")
  .action(async (url, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await cdpNavigate(url);
      pageUrl = url;
      await outputResult({ start, message: `Navigated to ${url}`, ...opts });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── back ──────────────────────────────────────────────────────────────────
program
  .command("back")
  .option("--screenshot", "Include screenshot")
  .description("Navigate back in history")
  .action(async (opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await sendPage(conn!, sessionId, "Page.navigateToHistoryEntry", { entryId: -1 });
      pageUrl = await getPageUrl(conn!, sessionId);
      await outputResult({ start, message: `Navigated back to ${pageUrl}`, screenshot: opts.screenshot });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── forward ───────────────────────────────────────────────────────────────
program
  .command("forward")
  .option("--screenshot", "Include screenshot")
  .description("Navigate forward in history")
  .action(async (opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await sendPage(conn!, sessionId, "Page.navigateToHistoryEntry", { entryId: 1 });
      pageUrl = await getPageUrl(conn!, sessionId);
      await outputResult({ start, message: `Navigated forward to ${pageUrl}`, screenshot: opts.screenshot });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── refresh ───────────────────────────────────────────────────────────────
program
  .command("refresh")
  .option("--screenshot", "Include screenshot")
  .description("Reload current page")
  .action(async (opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await sendPage(conn!, sessionId, "Page.reload");
      pageUrl = await getPageUrl(conn!, sessionId);
      await outputResult({ start, message: `Reloaded ${pageUrl}`, screenshot: opts.screenshot });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── title ─────────────────────────────────────────────────────────────────
program
  .command("title")
  .description("Get page title")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const t = await getPageTitle(conn!, sessionId);
      console.log(formatAgentOutput({ message: t, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── url ───────────────────────────────────────────────────────────────────
program
  .command("url")
  .description("Get current page URL")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      console.log(formatAgentOutput({ message: pageUrl, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── click ─────────────────────────────────────────────────────────────────
program
  .command("click")
  .argument("<selector>", "CSS selector to click")
  .option("--screenshot", "Include screenshot")
  .description("Click an element on the page")
  .action(async (selector, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await cdpClick(selector);
      pageUrl = await getPageUrl(conn!, sessionId);
      await outputResult({ start, message: `Clicked ${selector}`, screenshot: opts.screenshot });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── type ──────────────────────────────────────────────────────────────────
program
  .command("type")
  .argument("<selector>", "CSS selector for input element")
  .argument("<text>", "Text to type")
  .description("Type text into an input field")
  .action(async (selector, text) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await cdpType(selector, text);
      console.log(formatAgentOutput({ message: `Typed '${text}' into ${selector}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── select ────────────────────────────────────────────────────────────────
program
  .command("select")
  .argument("<selector>", "CSS selector for <select> element")
  .argument("<value>", "Option value to select")
  .description("Select an option from a <select> element")
  .action(async (selector, value) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await cdpSelect(selector, value);
      console.log(formatAgentOutput({ message: `Selected '${value}' in ${selector}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── text ──────────────────────────────────────────────────────────────────
program
  .command("text")
  .argument("<selector>", "CSS selector to get text from")
  .description("Get text content of an element")
  .action(async (selector) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const t = await cdpGetText(selector);
      console.log(formatAgentOutput({ message: t || "(empty)", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── hover ─────────────────────────────────────────────────────────────────
program
  .command("hover")
  .argument("<selector>", "CSS selector to hover over")
  .description("Hover over an element on the page")
  .action(async (selector) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const r = await sendPage(conn!, sessionId, "Runtime.evaluate", {
        expression: `(() => {
          const el = document.querySelector('${selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}');
          if (!el) return { error: "Element not found" };
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
        })()`,
        returnByValue: true,
      });
      const pos = r?.result?.value;
      if (pos?.error) throw new Error(pos.error);
      await sendPage(conn!, sessionId, "Input.dispatchMouseEvent", {
        type: "mouseMoved", x: pos.x, y: pos.y,
      });
      console.log(formatAgentOutput({ message: `Hovered over ${selector}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── dblclick ──────────────────────────────────────────────────────────────
program
  .command("dblclick")
  .argument("<selector>", "CSS selector to double-click")
  .description("Double-click an element on the page")
  .action(async (selector) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const r = await sendPage(conn!, sessionId, "Runtime.evaluate", {
        expression: `(() => {
          const el = document.querySelector('${selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}');
          if (!el) return { error: "Element not found" };
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
        })()`,
        returnByValue: true,
      });
      const pos = r?.result?.value;
      if (pos?.error) throw new Error(pos.error);
      await sendPage(conn!, sessionId, "Input.dispatchMouseEvent", {
        type: "mousePressed", x: pos.x, y: pos.y, button: "left", clickCount: 2,
      });
      await sendPage(conn!, sessionId, "Input.dispatchMouseEvent", {
        type: "mouseReleased", x: pos.x, y: pos.y, button: "left", clickCount: 2,
      });
      console.log(formatAgentOutput({ message: `Double-clicked ${selector}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── dialog-accept ─────────────────────────────────────────────────────────
program
  .command("dialog-accept")
  .argument("[promptText]", "Optional text to provide for prompt() dialogs")
  .description("Accept a JavaScript dialog (alert/confirm/prompt)")
  .action(async (promptText) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const params: any = { accept: true };
      if (promptText) params.promptText = promptText;
      await sendPage(conn!, sessionId, "Page.handleJavaScriptDialog", params);
      console.log(formatAgentOutput({ message: "Dialog accepted", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── dialog-dismiss ────────────────────────────────────────────────────────
program
  .command("dialog-dismiss")
  .description("Dismiss a JavaScript dialog (alert/confirm/prompt)")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await sendPage(conn!, sessionId, "Page.handleJavaScriptDialog", { accept: false });
      console.log(formatAgentOutput({ message: "Dialog dismissed", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── screenshot ────────────────────────────────────────────────────────────
program
  .command("screenshot")
  .description("Capture page screenshot as base64")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const r = await sendPage(conn!, sessionId, "Page.captureScreenshot", { format: "png", fromSurface: true });
      console.log(formatAgentOutput({ message: "Screenshot captured", screenshotBase64: r?.data, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── pdf ───────────────────────────────────────────────────────────────────
program
  .command("pdf")
  .description("Generate PDF of current page")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const r = await sendPage(conn!, sessionId, "Page.printToPDF");
      console.log(formatAgentOutput({ message: "PDF generated (base64)", screenshotBase64: r?.data, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── snapshot ──────────────────────────────────────────────────────────────
program
  .command("snapshot")
  .description("Get structured page snapshot (headings, links, inputs, text)")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const snap = await takeSnapshot(conn!, sessionId, pageUrl);
      const text = formatSnapshotAsText(snap);
      console.log(formatAgentOutput({ message: text, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── find ──────────────────────────────────────────────────────────────────
program
  .command("find")
  .argument("<pattern>", "Text or regex pattern to search for")
  .option("-r, --regex", "Interpret pattern as regex")
  .description("Search the page snapshot for matching text")
  .action(async (pattern, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const snap = await takeSnapshot(conn!, sessionId, pageUrl);
      const text = formatSnapshotAsText(snap);
      const lines = text.split("\n");
      const matches: { line: number; text: string }[] = [];
      if (opts.regex) {
        const re = new RegExp(pattern, "gi");
        lines.forEach((l, i) => { if (re.test(l)) matches.push({ line: i + 1, text: l.trim() }); });
      } else {
        const lower = pattern.toLowerCase();
        lines.forEach((l, i) => { if (l.toLowerCase().includes(lower)) matches.push({ line: i + 1, text: l.trim() }); });
      }
      if (!matches.length) {
        console.log(formatAgentOutput({ message: `No matches for "${pattern}"`, success: true, startTime: start }));
      } else {
        const msg = matches.slice(0, 50).map(m => `${m.line}: ${m.text}`).join("\n");
        const tail = matches.length > 50 ? `\n... and ${matches.length - 50} more` : "";
        console.log(formatAgentOutput({ message: `Found ${matches.length} match(es) for "${pattern}"\n${msg}${tail}`, success: true, startTime: start }));
      }
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── eval ──────────────────────────────────────────────────────────────────
program
  .command("eval")
  .argument("<code>", "JavaScript code to execute")
  .description("Run arbitrary JavaScript in the page")
  .action(async (code) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const r = await sendPage(conn!, sessionId, "Runtime.evaluate", {
        expression: code,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) {
        console.log(formatAgentOutput({ message: `Error: ${r.exceptionDetails.text || r.exceptionDetails.exception?.description}`, success: false, startTime: start }));
      } else {
        const val = r.result?.value !== undefined ? JSON.stringify(r.result.value, null, 2) : r.result?.description || "(undefined)";
        console.log(formatAgentOutput({ message: val, success: true, startTime: start }));
      }
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── cookies ───────────────────────────────────────────────────────────────
program
  .command("cookies")
  .description("List all cookies for current page")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const r = await sendPage(conn!, sessionId, "Network.getCookies", { urls: [pageUrl] });
      const cookies = r?.cookies || [];
      const lines = cookies.map((c: any) => `${c.name}=${c.value} (domain: ${c.domain}, path: ${c.path})`);
      console.log(formatAgentOutput({ message: lines.length ? lines.join("\n") : "(no cookies)", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── clear-cookies ─────────────────────────────────────────────────────────
program
  .command("clear-cookies")
  .description("Clear all cookies")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await sendPage(conn!, sessionId, "Network.clearBrowserCookies");
      console.log(formatAgentOutput({ message: "Cookies cleared", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── cookie-get ────────────────────────────────────────────────────────────
program
  .command("cookie-get")
  .argument("<name>", "Cookie name")
  .description("Get the value of a specific cookie")
  .action(async (name) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const r = await sendPage(conn!, sessionId, "Network.getCookies", { urls: [pageUrl] });
      const c = (r?.cookies || []).find((c: any) => c.name === name);
      if (!c) throw new Error(`Cookie "${name}" not found`);
      console.log(formatAgentOutput({ message: `${c.name}=${c.value} (domain: ${c.domain})`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── cookie-set ────────────────────────────────────────────────────────────
program
  .command("cookie-set")
  .argument("<name>", "Cookie name")
  .argument("<value>", "Cookie value")
  .option("--domain <domain>", "Cookie domain", "localhost")
  .option("--path <path>", "Cookie path", "/")
  .description("Set a cookie")
  .action(async (name, value, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await sendPage(conn!, sessionId, "Network.setCookie", { name, value, domain: opts.domain, path: opts.path });
      console.log(formatAgentOutput({ message: `Cookie set: ${name}=${value}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── cookie-delete ─────────────────────────────────────────────────────────
program
  .command("cookie-delete")
  .argument("<name>", "Cookie name")
  .description("Delete a specific cookie")
  .action(async (name) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const r = await sendPage(conn!, sessionId, "Network.getCookies", { urls: [pageUrl] });
      const cookies = (r?.cookies || []).filter((c: any) => c.name === name);
      for (const c of cookies) {
        await sendPage(conn!, sessionId, "Network.deleteCookies", { name: c.name, url: pageUrl, domain: c.domain, path: c.path });
      }
      console.log(formatAgentOutput({ message: `Cookie "${name}" deleted`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── storage ───────────────────────────────────────────────────────────────
program
  .command("storage")
  .description("Show browser storage info (localStorage, sessionStorage)")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const r = await sendPage(conn!, sessionId, "Runtime.evaluate", {
        expression: `JSON.stringify({ localStorage: Object.entries(localStorage).map(([k,v])=>k+'='+v), sessionStorage: Object.entries(sessionStorage).map(([k,v])=>k+'='+v) })`,
        returnByValue: true,
      });
      const data = JSON.parse(r?.result?.value || "{}");
      const lines: string[] = [];
      if (data.localStorage?.length) lines.push("localStorage:", ...data.localStorage.map((s: string) => `  ${s}`));
      if (data.sessionStorage?.length) lines.push("sessionStorage:", ...data.sessionStorage.map((s: string) => `  ${s}`));
      if (!lines.length) lines.push("(no storage data)");
      console.log(formatAgentOutput({ message: lines.join("\n"), success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── clear-storage ─────────────────────────────────────────────────────────
program
  .command("clear-storage")
  .description("Clear localStorage and sessionStorage")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await sendPage(conn!, sessionId, "Runtime.evaluate", { expression: "localStorage.clear(); sessionStorage.clear()", returnByValue: true });
      console.log(formatAgentOutput({ message: "Storage cleared", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── localstorage-get ──────────────────────────────────────────────────────
program
  .command("localstorage-get")
  .argument("<key>", "localStorage key")
  .description("Get a localStorage value")
  .action(async (key) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const r = await sendPage(conn!, sessionId, "Runtime.evaluate", {
        expression: `localStorage.getItem('${key.replace(/'/g, "\\'")}')`,
        returnByValue: true,
      });
      const val = r?.result?.value;
      console.log(formatAgentOutput({ message: val !== null ? `${key}=${val}` : `Key "${key}" not found in localStorage`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── localstorage-set ──────────────────────────────────────────────────────
program
  .command("localstorage-set")
  .argument("<key>", "localStorage key")
  .argument("<value>", "Value to store")
  .description("Set a localStorage value")
  .action(async (key, value) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await sendPage(conn!, sessionId, "Runtime.evaluate", {
        expression: `localStorage.setItem('${key.replace(/'/g, "\\'")}','${value.replace(/'/g, "\\'")}')`,
        returnByValue: true,
      });
      console.log(formatAgentOutput({ message: `localStorage set: ${key}=${value}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── localstorage-delete ───────────────────────────────────────────────────
program
  .command("localstorage-delete")
  .argument("<key>", "localStorage key")
  .description("Delete a localStorage key")
  .action(async (key) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await sendPage(conn!, sessionId, "Runtime.evaluate", {
        expression: `localStorage.removeItem('${key.replace(/'/g, "\\'")}')`,
        returnByValue: true,
      });
      console.log(formatAgentOutput({ message: `localStorage key "${key}" deleted`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── state-save ────────────────────────────────────────────────────────────
program
  .command("state-save")
  .argument("[filename]", "Output file (default: browser-state.json in current dir)")
  .description("Save cookies + localStorage to a JSON file")
  .action(async (filename) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const file = filename || "browser-state.json";
      const [cr, lr] = await Promise.all([
        sendPage(conn!, sessionId, "Network.getCookies", { urls: [pageUrl] }),
        sendPage(conn!, sessionId, "Runtime.evaluate", {
          expression: "JSON.stringify(Object.entries(localStorage).map(([k,v])=>({name:k,value:v})))",
          returnByValue: true,
        }),
      ]);
      const cookies = cr?.cookies || [];
      const localItems = JSON.parse(lr?.result?.value || "[]");
      const state = { url: pageUrl, cookies, localStorage: localItems, savedAt: new Date().toISOString() };
      writeFileSync(file, JSON.stringify(state, null, 2));
      console.log(formatAgentOutput({ message: `State saved to ${file} (${cookies.length} cookies, ${localItems.length} localStorage items)`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── state-load ────────────────────────────────────────────────────────────
program
  .command("state-load")
  .argument("<filename>", "JSON state file to load")
  .description("Restore cookies + localStorage from a JSON file")
  .action(async (filename) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const raw = readFileSync(filename, "utf8");
      const state = JSON.parse(raw);
      if (state.cookies) {
        for (const c of state.cookies) {
          try { await sendPage(conn!, sessionId, "Network.setCookie", { name: c.name, value: c.value, domain: c.domain || "localhost", path: c.path || "/" }); } catch {}
        }
      }
      if (state.localStorage) {
        for (const item of state.localStorage) {
          await sendPage(conn!, sessionId, "Runtime.evaluate", {
            expression: `localStorage.setItem('${item.name.replace(/'/g, "\\'")}','${String(item.value).replace(/'/g, "\\'")}')`,
            returnByValue: true,
          });
        }
      }
      console.log(formatAgentOutput({ message: `State loaded from ${filename}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── scene ─────────────────────────────────────────────────────────────────
program
  .command("scene")
  .description("Inspect 3D scene (Three.js/Babylon.js/WebGL)")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const info = await inspectScene(conn!, sessionId);
      const msg = formatSceneInfo(info);
      console.log(formatAgentOutput({ message: msg, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── console ───────────────────────────────────────────────────────────────
program
  .command("console")
  .option("--clear", "Clear the console buffer after reading")
  .description("Show buffered console messages")
  .action(async (opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const lines = consoleLog.map(m => `[${m.type}] ${m.text}`);
      const msg = lines.length > 0 ? lines.join("\n") : "(no console messages)";
      if (opts.clear) consoleLog.length = 0;
      console.log(formatAgentOutput({ message: msg, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── network ───────────────────────────────────────────────────────────────
program
  .command("network")
  .option("--all", "Show all requests (default: only failed/errored)")
  .option("--clear", "Clear the network buffer after reading")
  .description("Show buffered network requests")
  .action(async (opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const filtered = opts.all ? networkLog : networkLog.filter(r => r.error || (r.status && r.status >= 400));
      const lines = filtered.map(r => {
        const status = r.error ? `FAIL: ${r.error}` : `${r.status}`;
        return `${r.method} ${r.resourceType} ${status} ${r.url}`;
      });
      const msg = lines.length > 0 ? lines.join("\n") : "(no network requests)";
      if (opts.clear) networkLog.length = 0;
      console.log(formatAgentOutput({ message: msg, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── quit ──────────────────────────────────────────────────────────────────
program
  .command("quit")
  .description("Kill the persistent browser session started with --keep")
  .action(async () => {
    if (persistentConn) {
      try { persistentConn?.close(); } catch {}
      try { if (persistentBrowser) await killBrowser(persistentBrowser); } catch {}
      persistentConn = null;
      persistentBrowser = null;
      persistentSessionId = "";
      persistentTargetId = "";
      clearBrowserSession();
      console.log(formatAgentOutput({ message: "Browser session ended", success: true, startTime: Date.now() }));
    } else {
      const saved = loadBrowserSession();
      if (saved?.port) {
        try {
          const res = await fetch(`http://127.0.0.1:${saved.port}/json/version`);
          if (res.ok) {
            // Browser is still running, can't kill without process ref
          }
        } catch {}
        clearBrowserSession();
      }
      console.log(formatAgentOutput({ message: "No active persistent session", success: true, startTime: Date.now() }));
    }
    process.exit(0);
  });

// ── close-all ─────────────────────────────────────────────────────────────
program
  .command("close-all")
  .description("Close all active browser sessions")
  .action(async () => {
    const start = Date.now();
    try {
      if (persistentConn) {
        try { persistentConn?.close(); } catch {}
        try { if (persistentBrowser) await killBrowser(persistentBrowser); } catch {}
        persistentConn = null;
        persistentBrowser = null;
        persistentSessionId = "";
        persistentTargetId = "";
      }
      conn = null;
      browser = null;
      sessionId = "";
      targetId = "";
      clearBrowserSession();
      console.log(formatAgentOutput({ message: "All browser sessions closed", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
  });

// ── kill-all ──────────────────────────────────────────────────────────────
program
  .command("kill-all")
  .description("Forcefully kill all browser processes")
  .action(async () => {
    const start = Date.now();
    try {
      if (persistentConn) { try { persistentConn?.close(); } catch {} }
      if (persistentBrowser) { try { await killBrowser(persistentBrowser); } catch {} }
      if (browser) { try { await killBrowser(browser); } catch {} }
      persistentConn = null;
      persistentBrowser = null;
      conn = null;
      browser = null;
      sessionId = "";
      targetId = "";
      persistentSessionId = "";
      persistentTargetId = "";
      clearBrowserSession();
      console.log(formatAgentOutput({ message: "All browser processes killed", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
  });

// ── debug-set ─────────────────────────────────────────────────────────────
program
  .command("debug-set")
  .argument("<location>", "Breakpoint location as 'file.js:line' (e.g. 'scene.html:45')")
  .description("Set a JavaScript breakpoint at a file:line location")
  .action(async (loc) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      if (!pageDebugger) throw new Error("Debugger not initialized");
      const parts = loc.split(":");
      if (parts.length < 2) throw new Error("Use format: file:line (e.g. scene.html:42)");
      const line = parseInt(parts.pop()!, 10);
      const file = parts.join(":");
      const baseUrl = pageUrl.substring(0, pageUrl.lastIndexOf("/") + 1);
      const url = file.includes("://") ? file : new URL(file, baseUrl).href;
      const bp = await pageDebugger.setBreakpoint(url, line - 1);
      console.log(formatAgentOutput({ message: `Breakpoint set: ${bp.id} at ${url}:${line}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── debug-list ────────────────────────────────────────────────────────────
program
  .command("debug-list")
  .description("List all active breakpoints")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      if (!pageDebugger) throw new Error("Debugger not initialized");
      const list = pageDebugger.list();
      const msg = list.length ? list.map(b => `${b.id}: ${b.url}:${b.line + 1} (${b.enabled ? "enabled" : "disabled"})`).join("\n") : "(no breakpoints set)";
      console.log(formatAgentOutput({ message: msg, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── debug-remove ──────────────────────────────────────────────────────────
program
  .command("debug-remove")
  .argument("<id>", "Breakpoint ID (e.g. bp-1)")
  .description("Remove a breakpoint")
  .action(async (id) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      if (!pageDebugger) throw new Error("Debugger not initialized");
      pageDebugger.remove(id);
      console.log(formatAgentOutput({ message: `Breakpoint ${id} removed`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── debug-continue ────────────────────────────────────────────────────────
program
  .command("debug-continue")
  .description("Resume execution after a breakpoint pause")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      if (!pageDebugger) throw new Error("Debugger not initialized");
      if (!pageDebugger.paused) throw new Error("Not paused");
      await pageDebugger.resume();
      console.log(formatAgentOutput({ message: "Resumed execution", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── debug-step-over ───────────────────────────────────────────────────────
program
  .command("debug-step-over")
  .description("Step over the next function call")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      if (!pageDebugger) throw new Error("Debugger not initialized");
      if (!pageDebugger.paused) throw new Error("Not paused");
      await pageDebugger.stepOver();
      console.log(formatAgentOutput({ message: "Stepped over", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── debug-step-into ───────────────────────────────────────────────────────
program
  .command("debug-step-into")
  .description("Step into the next function call")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      if (!pageDebugger) throw new Error("Debugger not initialized");
      if (!pageDebugger.paused) throw new Error("Not paused");
      await pageDebugger.stepInto();
      console.log(formatAgentOutput({ message: "Stepped into", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── debug-step-out ────────────────────────────────────────────────────────
program
  .command("debug-step-out")
  .description("Step out of the current function")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      if (!pageDebugger) throw new Error("Debugger not initialized");
      if (!pageDebugger.paused) throw new Error("Not paused");
      await pageDebugger.stepOut();
      console.log(formatAgentOutput({ message: "Stepped out", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── debug-locals ──────────────────────────────────────────────────────────
program
  .command("debug-locals")
  .description("Show current breakpoint pause state")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      if (!pageDebugger) throw new Error("Debugger not initialized");
      const msg = pageDebugger.paused
        ? `Paused at breakpoint (${pageDebugger.paused.reason})\nCall stack:\n${pageDebugger.paused.callFrames}\n\nUse \`debug-eval <expr>\` to inspect variables.`
        : "(not paused)";
      console.log(formatAgentOutput({ message: msg, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── debug-eval ────────────────────────────────────────────────────────────
program
  .command("debug-eval")
  .argument("<expression>", "JavaScript expression to evaluate in the paused frame")
  .description("Evaluate an expression in the paused call frame context")
  .action(async (expr) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      if (!pageDebugger) throw new Error("Debugger not initialized");
      if (!pageDebugger.paused) throw new Error("Not paused (no active breakpoint)");
      const result = await pageDebugger.evaluate(expr);
      const output = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
      console.log(formatAgentOutput({ message: `» ${expr}\n${output}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── Run ───────────────────────────────────────────────────────────────────
program.parse(process.argv);
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
