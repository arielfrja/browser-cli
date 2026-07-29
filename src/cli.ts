#!/usr/bin/env node

import { program } from "commander";
import { launchBrowser, killBrowser, BrowserType, BrowserInstance } from "./launcher.js";
import { takeSnapshot, formatSnapshotAsText } from "./snapshot.js";
import { formatAgentOutput, formatError } from "./output.js";
import puppeteer from "puppeteer-core";

let browser: BrowserInstance | null = null;
let page: import("puppeteer-core").Page | null = null;

program
  .name("browser-cli")
  .description("Browser automation CLI for AI agents. Termux-optimized. Supports Chromium + Firefox.")
  .version("1.0.0")
  .option("--browser <type>", "Browser type: chromium, firefox, auto", "auto")
  .option("--headless <bool>", "Run headless", "true")
  .option("--port <number>", "Remote debugging port", (v) => parseInt(v))
  .option("--width <px>", "Viewport width", "1280")
  .option("--height <px>", "Viewport height", "720");

// ── goto ─────────────────────────────────────────────────────────────────
program
  .command("goto")
  .argument("<url>", "URL to navigate to")
  .option("--wait-until <event>", "waitUntil: load, domcontentloaded, networkidle0", "networkidle0")
  .option("--timeout <ms>", "Navigation timeout", "30000")
  .option("--screenshot", "Include screenshot")
  .option("--snapshot", "Include page snapshot")
  .description("Navigate to a URL and return page state")
  .action(async (url, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.goto(url, {
        waitUntil: opts.waitUntil as any,
        timeout: parseInt(opts.timeout),
      });
      await sleep(500);
      await outputResult({ start, message: `Navigated to ${url}`, screenshot: opts.screenshot, snapshot: opts.snapshot });
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
      await page!.goBack({ waitUntil: "networkidle0" });
      await outputResult({ start, message: `Navigated back to ${page!.url()}`, screenshot: opts.screenshot });
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
      await page!.goForward({ waitUntil: "networkidle0" });
      await outputResult({ start, message: `Navigated forward to ${page!.url()}`, screenshot: opts.screenshot });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── refresh ───────────────────────────────────────────────────────────────
program
  .command("refresh")
  .option("--screenshot", "Include screenshot")
  .description("Reload the current page")
  .action(async (opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.reload({ waitUntil: "networkidle0" });
      await outputResult({ start, message: "Page reloaded", screenshot: opts.screenshot });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── click ─────────────────────────────────────────────────────────────────
program
  .command("click")
  .argument("<selector>", "CSS selector to click")
  .option("--screenshot", "Include screenshot")
  .option("--snapshot", "Include page snapshot")
  .description("Click an element on the page")
  .action(async (selector, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.waitForSelector(selector, { timeout: 10000 });
      await page!.click(selector);
      await sleep(500);
      await outputResult({ start, message: `Clicked "${selector}"`, screenshot: opts.screenshot, snapshot: opts.snapshot });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── type ──────────────────────────────────────────────────────────────────
program
  .command("type")
  .argument("<selector>", "CSS selector for input")
  .argument("<text>", "Text to type")
  .option("--clear", "Clear field before typing", "true")
  .option("--delay <ms>", "Delay between keystrokes", "10")
  .option("--screenshot", "Include screenshot")
  .description("Type text into an input field")
  .action(async (selector, text, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.waitForSelector(selector, { timeout: 10000 });
      if (opts.clear !== "false") {
        await page!.click(selector, { clickCount: 3 });
        await page!.type(selector, "", { delay: 5 });
      }
      await page!.type(selector, text, { delay: parseInt(opts.delay) });
      await sleep(300);
      await outputResult({ start, message: `Typed "${text.slice(0, 200)}" into "${selector}"`, screenshot: opts.screenshot });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── select ────────────────────────────────────────────────────────────────
program
  .command("select")
  .argument("<selector>", "CSS selector for <select> element")
  .argument("<value>", "Option value to select")
  .description("Select an option in a <select> element")
  .action(async (selector, value) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.waitForSelector(selector, { timeout: 10000 });
      await page!.select(selector, value);
      console.log(formatAgentOutput({ message: `Selected "${value}" in "${selector}"`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── hover ─────────────────────────────────────────────────────────────────
program
  .command("hover")
  .argument("<selector>", "CSS selector to hover over")
  .option("--screenshot", "Include screenshot")
  .description("Hover over an element")
  .action(async (selector, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.waitForSelector(selector, { timeout: 10000 });
      await page!.hover(selector);
      await outputResult({ start, message: `Hovered "${selector}"`, screenshot: opts.screenshot });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── scroll ────────────────────────────────────────────────────────────────
program
  .command("scroll")
  .argument("<x>", "Scroll X pixels (or '0')")
  .argument("<y>", "Scroll Y pixels")
  .description("Scroll the page by x, y pixels")
  .action(async (x, y) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.evaluate((dx, dy) => window.scrollBy(dx, dy), parseInt(x), parseInt(y));
      console.log(formatAgentOutput({ message: `Scrolled by (${x}, ${y})`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── press ─────────────────────────────────────────────────────────────────
program
  .command("press")
  .argument("<key>", "Key to press (e.g. Enter, Escape, Tab, ArrowDown)")
  .description("Press a keyboard key")
  .action(async (key) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.keyboard.press(key as any);
      await sleep(200);
      console.log(formatAgentOutput({ message: `Pressed "${key}"`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── extract ───────────────────────────────────────────────────────────────
program
  .command("extract")
  .argument("[selector]", "CSS selector (defaults to body)")
  .option("--attr <name>", "Attribute to extract")
  .option("--html", "Get inner HTML instead of text")
  .description("Extract text, HTML, or attributes from an element")
  .action(async (selector, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const sel = selector || "body";
      await page!.waitForSelector(sel, { timeout: 10000 });
      let content: string;
      if (opts.attr) {
        content = await page!.$eval(sel, (el, name) => el.getAttribute(name as string) || "", opts.attr);
      } else if (opts.html) {
        content = await page!.$eval(sel, (el) => (el as HTMLElement).innerHTML);
      } else {
        content = await page!.$eval(sel, (el) => (el as HTMLElement).innerText);
      }
      console.log(formatAgentOutput({ message: content.trim(), success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── screenshot ────────────────────────────────────────────────────────────
program
  .command("screenshot")
  .argument("[path]", "File path to save screenshot")
  .option("--full-page", "Capture full page (not just viewport)")
  .option("--selector <sel>", "Element selector to capture")
  .option("--base64", "Output base64 to stdout", "true")
  .description("Capture a screenshot")
  .action(async (path, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      let buf: Buffer;
      if (opts.selector) {
        const el = await page!.$(opts.selector);
        if (!el) throw new Error(`Element "${opts.selector}" not found`);
        buf = (await el.screenshot({ encoding: "binary" })) as Buffer;
      } else {
        buf = (await page!.screenshot({ fullPage: !!opts["full-page"], encoding: "binary" })) as Buffer;
      }
      if (path) {
        const { writeFile } = await import("fs/promises");
        await writeFile(path, buf);
        console.log(formatAgentOutput({ message: `Screenshot saved to ${path} (${buf.length} bytes)`, success: true, startTime: start }));
      } else if (opts.base64 !== "false") {
        console.log(formatAgentOutput({ message: `Screenshot (${buf.length} bytes)`, screenshotBase64: buf.toString("base64"), success: true, startTime: start }));
      } else {
        process.stdout.write(buf);
      }
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── snapshot ──────────────────────────────────────────────────────────────
program
  .command("snapshot")
  .description("Capture full page state as structured text")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const snap = await takeSnapshot(page!);
      if (opts.json) {
        console.log(JSON.stringify(snap, null, 2));
      } else {
        console.log(formatAgentOutput({ message: formatSnapshotAsText(snap), success: true, startTime: start }));
      }
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── wait ──────────────────────────────────────────────────────────────────
program
  .command("wait")
  .argument("<ms>", "Milliseconds to wait")
  .option("--screenshot", "Include screenshot")
  .description("Wait for a specified time")
  .action(async (ms, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await sleep(parseInt(ms));
      await outputResult({ start, message: `Waited ${ms}ms`, screenshot: opts.screenshot });
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── wait-for ──────────────────────────────────────────────────────────────
program
  .command("wait-for")
  .argument("<selector>", "CSS selector to wait for")
  .option("--timeout <ms>", "Timeout", "10000")
  .option("--hidden", "Wait for element to be hidden instead of visible")
  .description("Wait for an element to appear (or disappear)")
  .action(async (selector, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const hidden = opts.hidden ? true : false;
      await page!.waitForSelector(selector, { timeout: parseInt(opts.timeout), hidden });
      console.log(formatAgentOutput({ message: `Element "${selector}" ${hidden ? "hidden" : "visible"}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── cookies (get) ─────────────────────────────────────────────────────────
program
  .command("cookies")
  .description("Get all cookies (pass --json for formatted output)")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const cookies = await page!.cookies();
      const out = opts.json
        ? JSON.stringify(cookies, null, 2)
        : cookies.map((c) => `${c.name}=${c.value} (${c.domain})`).join("\n");
      console.log(formatAgentOutput({ message: out || "(no cookies)", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── set-cookie ────────────────────────────────────────────────────────────
program
  .command("set-cookie")
  .argument("<name>", "Cookie name")
  .argument("<value>", "Cookie value")
  .description("Set a cookie on the current page")
  .action(async (name, value) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.setCookie({ name, value, url: page!.url() });
      console.log(formatAgentOutput({ message: `Cookie set: ${name}=${value}`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── delete-cookies ────────────────────────────────────────────────────────
program
  .command("delete-cookies")
  .argument("[names...]", "Cookie names to delete (all if empty)")
  .description("Delete cookies")
  .action(async (names) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      if (names && names.length > 0) {
        for (const n of names) await page!.deleteCookie({ name: n });
      } else {
        const all = await page!.cookies();
        for (const c of all) await page!.deleteCookie({ name: c.name });
      }
      console.log(formatAgentOutput({ message: "Cookies deleted", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── storage (localStorage get) ────────────────────────────────────────────
program
  .command("storage-get")
  .argument("<key>", "localStorage key")
  .description("Get a localStorage value")
  .action(async (key) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      const val = await page!.evaluate((k) => localStorage.getItem(k), key);
      console.log(formatAgentOutput({ message: val !== null ? `${key}=${val}` : `(no value for "${key}")`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── storage-set (localStorage set) ────────────────────────────────────────
program
  .command("storage-set")
  .argument("<key>", "localStorage key")
  .argument("<value>", "localStorage value")
  .description("Set a localStorage value")
  .action(async (key, value) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.evaluate((k, v) => localStorage.setItem(k, v), key, value);
      console.log(formatAgentOutput({ message: `${key}=${value} set`, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── storage-clear (localStorage clear) ────────────────────────────────────
program
  .command("storage-clear")
  .description("Clear all localStorage")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      await page!.evaluate(() => localStorage.clear());
      console.log(formatAgentOutput({ message: "localStorage cleared", success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── list-browsers ─────────────────────────────────────────────────────────
program
  .command("list-browsers")
  .description("Detect available browsers on this system")
  .action(async () => {
    const { getChromeExecutable, getFirefoxExecutable } = await import("./launcher.js");
    const chrome = await getChromeExecutable();
    const ff = await getFirefoxExecutable();
    const lines: string[] = ["Available browsers:"];
    if (chrome) lines.push(`  ✓ Chromium: ${chrome}`);
    else lines.push("  ✗ Chromium: not found (pkg install chromium)");
    if (ff) lines.push(`  ✓ Firefox: ${ff}`);
    else lines.push("  ✗ Firefox: not found (pkg install firefox)");
    console.log(lines.join("\n"));
  });

// ── eval ──────────────────────────────────────────────────────────────────
program
  .command("eval")
  .argument("<code>", "JavaScript code to execute in the page")
  .option("--arg <json>", "JSON argument passed to the function")
  .description("Run arbitrary JavaScript in the browser page")
  .action(async (code, opts) => {
    const start = Date.now();
    try {
      await ensureBrowser();
      let result: unknown;
      if (opts.arg) {
        const arg = JSON.parse(opts.arg);
        result = await page!.evaluate((a) => {
          try { return eval(code); } catch (e) { return (e as Error).message; }
        }, arg);
      } else {
        result = await page!.evaluate(code);
      }
      const output = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
      console.log(formatAgentOutput({ message: output, success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── url ───────────────────────────────────────────────────────────────────
program
  .command("url")
  .description("Print the current page URL")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      console.log(formatAgentOutput({ message: page!.url(), success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ── title ─────────────────────────────────────────────────────────────────
program
  .command("title")
  .description("Print the current page title")
  .action(async () => {
    const start = Date.now();
    try {
      await ensureBrowser();
      console.log(formatAgentOutput({ message: await page!.title(), success: true, startTime: start }));
    } catch (e) { console.log(formatError(e, start)); }
    finally { await cleanup(); }
  });

// ════════════════════ HELPERS ═════════════════════════════════════════════

async function ensureBrowser(): Promise<void> {
  if (browser) return;
  const browserType = program.getOptionValue("browser") as BrowserType;
  const headless = program.getOptionValue("headless") !== "false";
  const port = program.getOptionValue("port") as number | undefined;
  const w = parseInt(program.getOptionValue("width") as string);
  const h = parseInt(program.getOptionValue("height") as string);

  browser = await launchBrowser(browserType, { headless, port });
  const pb = await puppeteer.connect({
    browserWSEndpoint: browser.wsEndpoint,
    defaultViewport: { width: w, height: h },
  });
  const pages = await pb.pages();
  page = pages[0] || (await pb.newPage());
}

async function outputResult(params: {
  start: number;
  message?: string;
  screenshot?: boolean | string;
  snapshot?: boolean | string;
}): Promise<void> {
  let screenshotB64: string | undefined;
  let snapshotText: string | undefined;

  if (params.screenshot) {
    const buf = (await page!.screenshot({ encoding: "base64" })) as string;
    screenshotB64 = buf;
  }
  if (params.snapshot) {
    const snap = await takeSnapshot(page!);
    snapshotText = formatSnapshotAsText(snap);
  }

  console.log(
    formatAgentOutput({
      message: params.message || `Navigated to ${page!.url()}`,
      screenshotBase64: screenshotB64,
      snapshotText,
      success: true,
      startTime: params.start,
    })
  );
}

async function cleanup(): Promise<void> {
  if (browser) {
    try { await page?.close(); } catch {}
    try { await killBrowser(browser); } catch {}
    browser = null;
    page = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Run ───────────────────────────────────────────────────────────────────
program.parse(process.argv);
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
