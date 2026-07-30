import { CdpConnection, sendPage } from "./cdp.js";

export interface SceneInfo {
  library: "three.js" | "babylon.js" | "webgl" | "none";
  framerate?: { fps: number; measuredMs: number };
  canvas?: {
    count: number;
    width: number;
    height: number;
    webglVersion?: number;
    gpu?: string;
    vendor?: string;
  };
  renderer?: Record<string, unknown>;
  sceneGraph?: string;
}

export async function inspectScene(conn: CdpConnection, sessionId: string): Promise<SceneInfo> {
  const r = await sendPage(conn, sessionId, "Runtime.evaluate", {
    expression: `(async () => {
      function measureFPS(sampleMs) {
        return new Promise(resolve => {
          let frames = 0, started = false;
          const start = performance.now();
          function frame() {
            if (!started) { started = true; requestAnimationFrame(frame); return; }
            frames++;
            if (performance.now() - start >= sampleMs) resolve(frames);
            else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        });
      }
      function getGLInfo(cvs) {
        const gl = cvs.getContext("webgl2") || cvs.getContext("webgl");
        if (!gl) return null;
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return {
          webglVersion: gl instanceof WebGL2RenderingContext ? 2 : 1,
          gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "(hidden)",
          vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : "(hidden)",
        };
      }

      let library = "none";
      const can3 = (typeof THREE !== "undefined");
      const canB = (typeof BABYLON !== "undefined");
      if (can3) library = "three.js";
      else if (canB) library = "babylon.js";
      else if (document.querySelector("canvas")) library = "webgl";

      const canvases = document.querySelectorAll("canvas");
      const canvasInfo = canvases.length ? {
        count: canvases.length,
        width: canvases[0].width,
        height: canvases[0].height,
        ...getGLInfo(canvases[0]),
      } : undefined;

      const fps = await measureFPS(1500);

      let renderer = undefined;
      if (can3 && THREE && THREE.WebGLRenderer) {
        const els = document.querySelectorAll("canvas");
        for (const el of els) {
          const key = Object.keys(el).find(k => k.startsWith("__"));
          if (key) {
            try {
              const obj = el[key];
              if (obj && obj.render) {
                renderer = { info: "Three.js renderer detected", domElement: "canvas" };
                break;
              }
            } catch {}
          }
        }
      }

      let sceneGraph = undefined;
      if (can3 && window.__THREE_DEVTOOLS__) {
        try {
          sceneGraph = "Three.js DevTools available";
        } catch {}
      }

      return { library, framerate: { fps, measuredMs: 1500 }, canvas: canvasInfo, renderer, sceneGraph };
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });

  return (r?.result?.value || { library: "none" }) as SceneInfo;
}

export function formatSceneInfo(info: SceneInfo): string {
  const lines: string[] = [];
  lines.push(`3D Library: ${info.library}`);
  if (info.framerate) lines.push(`FPS: ${info.framerate.fps} (measured ${info.framerate.measuredMs}ms)`);
  if (info.canvas) {
    const c = info.canvas;
    lines.push(`Canvas: ${c.count}x, ${c.width}x${c.height}px`);
    if (c.webglVersion) lines.push(`WebGL: v${c.webglVersion}`);
    if (c.gpu) lines.push(`GPU: ${c.gpu}`);
    if (c.vendor) lines.push(`Vendor: ${c.vendor}`);
  }
  if (info.renderer) {
    lines.push(`Renderer: ${JSON.stringify(info.renderer)}`);
  }
  if (info.sceneGraph) lines.push(`Scene: ${info.sceneGraph}`);
  return lines.join("\n") || "No 3D content detected";
}
