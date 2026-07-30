import { CdpConnection, sendPage } from "./cdp.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface BpInfo { id: string; url: string; line: number; enabled: boolean }
export interface PauseInfo { callFrames: string; reason: string; ts: number }

const STORE_DIR = join(homedir(), ".browser-cli");
const STORE_FILE = join(STORE_DIR, "breakpoints.json");

function loadBreakpoints(): BpInfo[] {
  try { if (existsSync(STORE_FILE)) return JSON.parse(readFileSync(STORE_FILE, "utf8")); } catch {}
  return [];
}
function saveBreakpoints(bps: BpInfo[]) {
  try { if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true }); writeFileSync(STORE_FILE, JSON.stringify(bps, null, 2)); } catch {}
}

export class PageDebugger {
  private conn: CdpConnection | null = null;
  private sessionId = "";
  private bps: BpInfo[] = [];
  private bpN = 0;
  public paused: PauseInfo | null = null;
  public useStore = false;

  async init(conn: CdpConnection, sessionId: string) {
    this.conn = conn;
    this.sessionId = sessionId;
    await sendPage(conn, sessionId, "Debugger.enable");
    sendPage(conn, sessionId, "Debugger.setPauseOnExceptions", { state: "none" });

    sendPage(conn, sessionId, "Runtime.evaluate", {
      expression: "(function(){})",
      returnByValue: true,
    }).catch(() => {});

    conn.on("Debugger.paused", (p: any) => {
      if (p.sessionId && p.sessionId !== sessionId) return;
      const frames = (p.callFrames || []).slice(0, 15);
      const lines = frames.map((f: any, i: number) => {
        const loc = f.location ? `${f.location.url || "(anon)"}:${f.location.lineNumber}` : "?";
        return `  #${i} ${f.functionName || "(anon)"} at ${loc}`;
      });
      this.paused = { callFrames: lines.join("\n"), reason: p.reason || "other", ts: Date.now() };
    });

    conn.on("Debugger.resumed", (p: any) => {
      if (p.sessionId && p.sessionId !== sessionId) return;
      this.paused = null;
    });

    if (this.useStore) {
      this.bps = loadBreakpoints();
      this.bpN = this.bps.length;
      for (const bp of this.bps) {
        try { sendPage(conn, sessionId, "Debugger.setBreakpointByUrl", { url: bp.url, lineNumber: bp.line, columnNumber: 0 }); } catch {}
      }
    }
  }

  async setBreakpoint(url: string, line: number): Promise<BpInfo> {
    await sendPage(this.conn!, this.sessionId, "Debugger.setBreakpointByUrl", { url, lineNumber: line, columnNumber: 0 });
    const id = `bp-${++this.bpN}`;
    const bp: BpInfo = { id, url, line, enabled: true };
    this.bps.push(bp);
    if (this.useStore) saveBreakpoints(this.bps);
    return bp;
  }

  list(): BpInfo[] { return this.useStore ? loadBreakpoints() : [...this.bps]; }

  remove(id: string): boolean {
    const i = this.bps.findIndex(b => b.id === id);
    if (i === -1) return false;
    this.bps.splice(i, 1);
    if (this.useStore) saveBreakpoints(this.bps);
    return true;
  }

  async resume() { if (this.paused) { await sendPage(this.conn!, this.sessionId, "Debugger.resume"); this.paused = null; } }
  async stepOver() { if (this.paused) { await sendPage(this.conn!, this.sessionId, "Debugger.stepOver"); this.paused = null; } }
  async stepInto() { if (this.paused) { await sendPage(this.conn!, this.sessionId, "Debugger.stepInto"); this.paused = null; } }
  async stepOut() { if (this.paused) { await sendPage(this.conn!, this.sessionId, "Debugger.stepOut"); this.paused = null; } }

  async evaluate(expr: string): Promise<any> {
    if (!this.paused || !this.conn) throw new Error("Not paused");
    const r = await sendPage(this.conn, this.sessionId, "Debugger.evaluateOnCallFrame", {
      callFrameId: "0",
      expression: expr,
    }) as any;
    if (r.exceptionDetails) return { error: r.exceptionDetails.text };
    const v = r.result;
    return v.value ?? v.description ?? v.preview ?? "(no value)";
  }
}
