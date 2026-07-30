import WebSocket from "ws";

export type CdpEventCallback = (params: any) => void;

export class CdpConnection {
  private ws: WebSocket;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private handlers = new Map<string, CdpEventCallback[]>();
  private _closed = false;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            else p.resolve(msg.result);
          }
        } else if (msg.method) {
          const cbs = this.handlers.get(msg.method);
          if (cbs) cbs.forEach((cb) => cb(msg.params));
        }
      } catch {}
    });
    this.ws.on("close", () => {
      this._closed = true;
      for (const [, p] of this.pending) p.reject(new Error("CDP connection closed"));
      this.pending.clear();
    });
    this.ws.on("error", () => {});
  }

  async send(method: string, params?: any, timeout = 30000, sessionId?: string): Promise<any> {
    if (this._closed) throw new Error("CDP connection closed");
    // Wait for WebSocket to be open
    if (this.ws.readyState !== WebSocket.OPEN) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("CDP ws connect timeout")), 15000);
        const onOpen = () => { clearTimeout(t); resolve(); };
        const onErr = (e: Error) => { clearTimeout(t); reject(e); };
        if (this.ws.readyState === WebSocket.OPEN) { clearTimeout(t); resolve(); return; }
        this.ws.once("open", onOpen);
        this.ws.once("error", onErr);
      });
    }
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeout);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(t); resolve(v); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
      try {
        const msg: any = { id, method, params: params || {} };
        if (sessionId) msg.sessionId = sessionId;
        this.ws.send(JSON.stringify(msg));
      } catch (e) {
        this.pending.delete(id);
        clearTimeout(t);
        reject(e);
      }
    });
  }

  on(method: string, cb: CdpEventCallback): () => void {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method)!.push(cb);
    return () => {
      const arr = this.handlers.get(method);
      if (arr) {
        const i = arr.indexOf(cb);
        if (i >= 0) arr.splice(i, 1);
      }
    };
  }

  close() {
    this._closed = true;
    this.ws.close();
  }
}

export async function createPageConnection(browser: CdpConnection): Promise<{
  targetId: string;
  sessionId: string;
}> {
  const targets: any = await browser.send("Target.getTargets");
  let page = targets.targetInfos?.find((t: any) => t.type === "page");
  if (!page) {
    const result: any = await browser.send("Target.createTarget", { url: "about:blank" });
    page = { targetId: result.targetId };
  }
  const attached: any = await browser.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  return { targetId: page.targetId, sessionId: attached.sessionId };
}

export function sendPage<T = any>(conn: CdpConnection, sessionId: string, method: string, params?: any): Promise<T> {
  return conn.send(method, params, 30000, sessionId) as Promise<T>;
}

export function evaluate(conn: CdpConnection, sessionId: string, expression: string): Promise<any> {
  return sendPage(conn, sessionId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
}

export async function getPageUrl(conn: CdpConnection, sessionId: string): Promise<string> {
  const r = await evaluate(conn, sessionId, "window.location.href");
  return r?.result?.value ?? "";
}

export async function getPageTitle(conn: CdpConnection, sessionId: string): Promise<string> {
  const r = await evaluate(conn, sessionId, "document.title");
  return r?.result?.value ?? "";
}
