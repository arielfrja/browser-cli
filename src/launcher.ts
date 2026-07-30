import { spawn, ChildProcess } from "child_process";
import { createServer, AddressInfo } from "net";
import { randomBytes } from "crypto";
import { accessSync, constants, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Termux-safe temp directory
const TMP = (process.env.TMPDIR || tmpdir()).replace(/\/+$/, "");

export type BrowserType = "chromium" | "firefox" | "auto";

export interface BrowserInstance {
  process: ChildProcess;
  port: number;
  wsEndpoint: string;
  type: BrowserType;
}

const BROWSER_PATHS: Record<BrowserType, string[]> = {
  chromium: [
    "/data/data/com.termux/files/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ],
  firefox: [
    "/data/data/com.termux/files/usr/bin/firefox",
    "/data/data/com.termux/files/usr/bin/firefox-bin",
    "/usr/bin/firefox",
  ],
  auto: [],
};

function findExecutable(paths: string[]): string | null {
  for (const p of paths) {
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      continue;
    }
  }
  return null;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

export async function getChromeExecutable(): Promise<string | null> {
  return findExecutable(BROWSER_PATHS.chromium);
}

export async function getFirefoxExecutable(): Promise<string | null> {
  return findExecutable(BROWSER_PATHS.firefox);
}

export async function detectBrowser(): Promise<{ type: BrowserType; path: string } | null> {
  const chrome = await getChromeExecutable();
  if (chrome) return { type: "chromium", path: chrome };
  const ff = await getFirefoxExecutable();
  if (ff) return { type: "firefox", path: ff };
  return null;
}

export async function launchBrowser(
  type: BrowserType = "auto",
  options: {
    headless?: boolean;
    port?: number;
    extraArgs?: string[];
  } = {}
): Promise<BrowserInstance> {
  const detected = type === "auto" ? await detectBrowser() : null;
  const browserType: BrowserType =
    type !== "auto" ? type : detected?.type || "chromium";
  const browserPath =
    type !== "auto"
      ? findExecutable(BROWSER_PATHS[type])
      : detected?.path || null;

  if (!browserPath) {
    throw new Error(
      `No ${browserType} executable found. Install it:\n` +
        `  pkg install ${browserType === "chromium" ? "chromium" : "firefox"}`
    );
  }

  const port = options.port || (await findFreePort());
  const headless = options.headless !== false;

  const args: string[] = [];

  if (browserType === "chromium") {
    args.push(
      "--no-sandbox",
      `--remote-debugging-port=${port}`,
      "--remote-allow-origins=*",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-sync",
      "--disable-translate",
      "--mute-audio",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-breakpad",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-features=Translate,ChromeWhatsNewUI",
      `--user-data-dir=${join(TMP, `browser-cli-${randomBytes(4).toString("hex")}`)}`
    );
    if (headless) args.push("--headless=new");
    if (options.extraArgs) args.push(...options.extraArgs);
  } else if (browserType === "firefox") {
    if (headless) args.push("--headless");
    args.push(`--remote-debugging-port=${port}`);

    const profileDir = join(TMP, `browser-cli-firefox-${randomBytes(4).toString("hex")}`);
    args.push("-profile", profileDir, "-no-remote");
    if (options.extraArgs) args.push(...options.extraArgs);
  }

  const proc = spawn(browserPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || "",
    },
  });
  proc.unref();

  // Suppress Chromium noise on Termux (D-Bus, inotify, NETLINK are harmless)
  // AI agents should get clean stdout without browser stderr pollution.
  proc.stderr?.on("data", (_d: Buffer) => {
    // Intentionally discard — Termux Chromium produces ~50 lines of harmless
    // D-Bus/inotify/NETLINK errors on every launch. These confuse AI agents.
  });

  const wsEndpoint = await waitForWSEndpoint(port, 30000);

  return { process: proc, port, wsEndpoint, type: browserType };
}

async function waitForWSEndpoint(
  port: number,
  timeoutMs: number
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = (await res.json()) as { webSocketDebuggerUrl?: string };
      if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
    } catch {
      // browser not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `Browser did not start within ${timeoutMs}ms on port ${port}`
  );
}

export async function killBrowser(instance: BrowserInstance): Promise<void> {
  try {
    instance.process.kill("SIGKILL");
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
  try {
    instance.process.kill("SIGKILL");
  } catch {}
}
