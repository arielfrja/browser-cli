import type { Page } from "puppeteer-core";

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

/** Inspect the current page for 3D/WebGL scene details */
export async function inspectScene(page: Page): Promise<SceneInfo> {
  const result = await page.evaluate(async () => {
    // ── helpers ───────────────────────────────────────────────────────

    async function measureFPS(sampleMs = 1500): Promise<number> {
      return new Promise((resolve) => {
        let frames = 0;
        let started = false;
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

    function getGLInfo(cvs: HTMLCanvasElement) {
      const gl = cvs.getContext("webgl2") || cvs.getContext("webgl");
      if (!gl) return null;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        webglVersion: gl instanceof WebGL2RenderingContext ? 2 : 1,
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "(hidden)",
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : "(hidden)",
      };
    }

    // ── find Three.js renderer ────────────────────────────────────────

    function findThree() {
      // Check common variable names
      const scan = (obj: Record<string, unknown>, path: string): Record<string, unknown> | null => {
        if (!obj || typeof obj !== "object") return null;
        const r = obj as Record<string, unknown>;
        // WebGLRenderer has .info with render/memory
        if (r.info && r.domElement && typeof r.render === "function") {
          const info = r.info as Record<string, unknown>;
          const ri = info.render as Record<string, unknown> || {};
          const mi = info.memory as Record<string, unknown> || {};
          // Try to get scene children count
          let sceneChildren = 0;
          try { if (obj.scene?.children) sceneChildren = obj.scene.children.length; } catch {}
          return {
            type: "WebGLRenderer",
            variable: path,
            drawCalls: ri.calls,
            triangles: ri.triangles,
            geometries: mi.geometries,
            textures: mi.textures,
            sceneChildren,
          };
        }
        // Check sub-property
        for (const sub of ["renderer", "viewer", "webgl"]) {
          if (r[sub] && typeof r[sub] === "object") {
            const subR = r[sub] as Record<string, unknown>;
            if (subR.info && subR.domElement) {
              const info = subR.info as Record<string, unknown>;
              const ri = info.render as Record<string, unknown> || {};
              const mi = info.memory as Record<string, unknown> || {};
              return {
                type: "WebGLRenderer",
                variable: `${path}.${sub}`,
                drawCalls: ri.calls,
                triangles: ri.triangles,
                geometries: mi.geometries,
                textures: mi.textures,
              };
            }
          }
        }
        return null;
      };

      // Try common globals
      for (const name of ["renderer", "app", "viewer", "engine", "world"]) {
        const val = (window as Record<string, unknown>)[name];
        if (val) {
          const found = scan(val as Record<string, unknown>, name);
          if (found) return found;
        }
      }

      // Deep scan window properties (safety-limited)
      try {
        const keys = Object.getOwnPropertyNames(window).slice(0, 200);
        for (const key of keys) {
          const val = (window as Record<string, unknown>)[key];
          if (val && typeof val === "object" && (val as Record<string, unknown>).info && (val as Record<string, unknown>).domElement) {
            const info = (val as Record<string, unknown>).info as Record<string, unknown>;
            return {
              type: "WebGLRenderer",
              variable: key,
              drawCalls: (info.render as Record<string, unknown>)?.calls,
              triangles: (info.render as Record<string, unknown>)?.triangles,
              geometries: (info.memory as Record<string, unknown>)?.geometries,
              textures: (info.memory as Record<string, unknown>)?.textures,
            };
          }
        }
      } catch {}

      return null;
    }

    // ── find Three.js scene graph ─────────────────────────────────────

    function findSceneGraph(): string | null {
      try {
        const formatObj = (obj: Record<string, unknown>, label: string, depth: number): string => {
          if (depth > 5) return "  ".repeat(depth) + `${label}: ...`;
          const type = (obj.type as string) || obj.constructor?.name || "Object3D";
          const children = (obj.children as Array<Record<string, unknown>>) || [];
          const parts: string[] = [];
          if (obj.position) {
            const p = obj.position as Record<string, number>;
            parts.push(`pos(${p.x?.toFixed(2)},${p.y?.toFixed(2)},${p.z?.toFixed(2)})`);
          }
          if (obj.material) parts.push(`mat:${(obj.material as Record<string, unknown>).type || "?"}`);
          if (obj.geometry) parts.push(`geo:${(obj.geometry as Record<string, unknown>).type || "?"}`);
          const header = `[${type}] ${label}${parts.length ? " " + parts.join(" ") : ""}`;
          if (!children.length) return "  ".repeat(depth) + header;
          const lines = children.slice(0, 20).map((c, i) => formatObj(c, `[${i}]`, depth + 1));
          const overflow = children.length > 20 ? `\n${"  ".repeat(depth + 1)}... +${children.length - 20} more` : "";
          return "  ".repeat(depth) + `${header} (${children.length})\n${lines.join("\n")}${overflow}`;
        };

        // Try window.scene
        const win = window as Record<string, unknown>;
        if (win.scene && typeof win.scene === "object" && (win.scene as Record<string, unknown>).children) {
          return formatObj(win.scene as Record<string, unknown>, "scene", 0);
        }
        // Check app.scene, viewer.scene
        for (const parent of ["app", "viewer"]) {
          const p = win[parent] as Record<string, unknown> | undefined;
          if (p && typeof p === "object") {
            const s = p.scene as Record<string, unknown> | undefined;
            if (s && typeof s === "object" && Array.isArray(s.children)) {
              return formatObj(s, `${parent}.scene`, 0);
            }
          }
        }
        // Find any object with .isScene = true
        const keys = Object.getOwnPropertyNames(window);
        for (const key of keys) {
          const v = win[key];
          if (v && typeof v === "object" && (v as Record<string, unknown>).isScene) {
            return formatObj(v as Record<string, unknown>, key, 0);
          }
        }
      } catch {}
      return null;
    }

    // ── find Babylon.js ───────────────────────────────────────────────

    function findBabylon() {
      const B = (window as Record<string, unknown>).BABYLON as Record<string, unknown> | undefined;
      if (!B) return null;
      const engine = (B.Engine as Record<string, unknown> | undefined);
      if (!engine) return { type: "BABYLON (no Engine class)" };
      const last = (engine as Record<string, unknown>).LastCreatedEngine as Record<string, unknown> | undefined;
      if (!last) return { type: "BABYLON.Engine found but no active engine" };
      const scenes = last.scenes as Array<Record<string, unknown>> | undefined;
      return {
        type: "BABYLON.Engine",
        fps: typeof last.getFps === "function" ? (last.getFps() as number) : undefined,
        sceneCount: scenes?.length || 0,
        meshesTotal: scenes?.[0]?.meshes?.length || 0,
        materialsTotal: scenes?.[0]?.materials?.length || 0,
      };
    }

    // ── Main ──────────────────────────────────────────────────────────

    // 1. Try Three.js
    const threeInfo = findThree();
    if (threeInfo) {
      const fps = await measureFPS(1500);
      const graph = findSceneGraph();
      const canvases = Array.from(document.querySelectorAll("canvas"));
      const info = canvases[0] ? getGLInfo(canvases[0]) : null;
      return {
        library: "three.js",
        renderer: threeInfo,
        sceneGraph: graph || undefined,
        canvas: canvases.length ? {
          count: canvases.length,
          width: canvases[0].width,
          height: canvases[0].height,
          ...(info || {}),
        } : undefined,
        framerate: { fps, measuredMs: 1500 },
      } as any;
    }

    // 2. Try Babylon.js
    const babylonInfo = findBabylon();
    if (babylonInfo) {
      const fps = await measureFPS(1500);
      const canvases = Array.from(document.querySelectorAll("canvas"));
      return {
        library: "babylon.js",
        renderer: babylonInfo,
        canvas: canvases.length ? {
          count: canvases.length,
          width: canvases[0].width,
          height: canvases[0].height,
          ...(canvases[0] ? getGLInfo(canvases[0]) : {}),
        } : undefined,
        framerate: { fps, measuredMs: 1500 },
      } as any;
    }

    // 3. Generic WebGL
    const canvases = Array.from(document.querySelectorAll("canvas"));
    if (canvases.length) {
      const fps = await measureFPS(1500);
      return {
        library: "webgl",
        canvas: {
          count: canvases.length,
          width: canvases[0].width,
          height: canvases[0].height,
          ...(getGLInfo(canvases[0]) || {}),
        },
        framerate: { fps, measuredMs: 1500 },
      } as any;
    }

    // 4. No 3D content
    return { library: "none" };
  });

  return result as unknown as SceneInfo;
}

/** Format scene info as human-readable text */
export function formatSceneInfo(info: SceneInfo): string {
  if (info.library === "none") {
    return "No 3D or WebGL content detected on this page.";
  }

  const lines: string[] = [];
  lines.push(`3D Library: ${info.library}`);

  if (info.framerate) {
    lines.push(`FPS: ${info.framerate.fps} (over ${info.framerate.measuredMs}ms)`);
  }

  if (info.canvas) {
    lines.push(`Canvas: ${info.canvas.width}x${info.canvas.height} (${info.canvas.count} canvas${info.canvas.count > 1 ? "es" : ""})`);
    if (info.canvas.webglVersion) lines.push(`WebGL: ${info.canvas.webglVersion === 2 ? "WebGL 2.0" : "WebGL 1.0"}`);
    if (info.canvas.gpu && info.canvas.gpu !== "(hidden)") lines.push(`GPU: ${info.canvas.gpu}`);
    if (info.canvas.vendor && info.canvas.vendor !== "(hidden)") lines.push(`Vendor: ${info.canvas.vendor}`);
  }

  if (info.renderer) {
    lines.push("");
    lines.push("── Renderer ──");
    for (const [key, val] of Object.entries(info.renderer)) {
      if (val !== undefined && val !== null) {
        lines.push(`  ${key}: ${val}`);
      }
    }
  }

  if (info.sceneGraph) {
    lines.push("");
    lines.push("── Scene Graph ──");
    lines.push(info.sceneGraph);
  }

  return lines.join("\n");
}
