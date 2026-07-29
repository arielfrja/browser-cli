---
name: browser-cli
description: >-
  Tool for automating web browsers from the command line — navigate to URLs, click elements, type text, take screenshots, capture page snapshots, extract data, manage cookies/localStorage, execute JavaScript in the browser, and debug WebGL/Three.js/Babylon.js 3D scenes.
  Use this skill whenever the user asks you to interact with a website, scrape web data, take a screenshot of a page, check if a site is working, fill out a form, debug a web UI, inspect a 3D scene, or automate any browser task.
  This is the primary tool for any web browsing or web automation workflow — always check this skill first for browser-related tasks.
---

# browser-cli

**browser-cli** is a CLI tool for AI agents to automate web browsers. It launches Chromium or Firefox via CDP, executes commands, and returns clean text + base64 output. Optimized for Termux on Android, works on any Linux system.

## Quick start

```bash
# Install
npm install -g @arielfrja/browser-cli

# Navigate and capture
browser-cli goto https://example.com --screenshot --snapshot

# Click and interact
browser-cli click "#submit-button"

# Extract data
browser-cli extract ".price" --attr textContent

# 3D scene inspection
browser-cli --keep goto https://threejs.org/examples/#webgl_animation_cloth
browser-cli --keep scene

# Quit persistent session
browser-cli quit
```

## Commands

### Navigation
| Command | Description |
|---------|-------------|
| `goto <url>` | Navigate to URL. `--wait-until`, `--timeout`, `--screenshot`, `--snapshot` |
| `back` | History back |
| `forward` | History forward |
| `refresh` | Reload page |

### Interaction
| Command | Description |
|---------|-------------|
| `click <selector>` | Click element. `--screenshot`, `--snapshot` |
| `type <selector> <text>` | Type into input. `--clear`, `--delay` |
| `select <selector> <value>` | Choose `<select>` option |
| `hover <selector>` | Hover over element |
| `scroll <x> <y>` | Scroll by pixels |
| `press <key>` | Press keyboard key (Enter, Escape, Tab, ArrowDown, etc.) |

### Extraction
| Command | Description |
|---------|-------------|
| `extract [selector]` | Get text from element. `--attr`, `--html` |
| `screenshot [path]` | Capture screenshot. `--full-page`, `--selector`, `--base64` |
| `snapshot` | Full page state as structured text (headings, links, inputs, buttons) |

### Wait
| Command | Description |
|---------|-------------|
| `wait <ms>` | Wait milliseconds |
| `wait-for <selector>` | Wait for element. `--timeout`, `--hidden` |

### Storage
| Command | Description |
|---------|-------------|
| `cookies` | List all cookies. `--json` |
| `set-cookie <name> <value>` | Set a cookie |
| `delete-cookies [names]` | Delete cookies (all if no names) |
| `storage-get <key>` | Get localStorage value |
| `storage-set <key> <value>` | Set localStorage value |
| `storage-clear` | Clear localStorage |

### Info
| Command | Description |
|---------|-------------|
| `url` | Print current page URL |
| `title` | Print page title |
| `list-browsers` | Detect available browser installations |

### JavaScript
| Command | Description |
|---------|-------------|
| `eval <code>` | Execute JavaScript in the page. `--arg <json>` |

### Session
| Command | Description |
|---------|-------------|
| (use `--keep` flag) | Keep browser alive between commands |
| `quit` | Kill persistent browser session |

### 3D Debugging
| Command | Description |
|---------|-------------|
| `scene` | Inspect WebGL/Three.js/Babylon.js scene (renderer stats, FPS, scene graph, GPU info) |
| `console` | Show buffered console messages. `--clear` to reset |
| `network` | Show network requests. `--all` for all, default shows only failures |

## AI-Agent Output Format

Every command returns clean output wrapped in HTML comments:

```
<!-- browser-cli result: OK (4832ms) -->

--- PAGE SNAPSHOT ---
URL: https://example.com
Title: Example Domain
...

--- SCREENSHOT (base64) ---
iVBORw0KGgo...

![page-screenshot](data:image/png;base64,iVBORw0KGgo...)
```

### Parsing rules for agents:
1. Check `<!-- browser-cli result: OK|FAIL (Nms) -->` for success/failure
2. For screenshots: use the markdown image tag `![page-screenshot](data:...)` - multimodal models see the image directly
3. For snapshots: the `--- PAGE SNAPSHOT ---` section has structured text (headings, links, inputs, buttons)
4. For errors: `ERROR: ...` after the result comment

## Session Mode (`--keep`)

By default each command launches and kills a browser. For multi-step workflows, pass `--keep`:

```bash
# Start session
browser-cli --keep goto https://example.com --console

# All subsequent --keep commands reuse the same browser
browser-cli --keep click "#login"
browser-cli --keep type "#username" "admin"
browser-cli --keep screenshot

# End session
browser-cli quit
```

## 3D Scene Debugging

For Three.js, Babylon.js, or WebGL pages:

```bash
# Navigate to a 3D scene
browser-cli --keep goto https://threejs.org/examples/#webgl_animation_cloth

# Inspect the scene
browser-cli --keep scene

# Sample output:
#   3D Library: three.js
#   FPS: 59 (over 1500ms)
#   Canvas: 1280x720 (1 canvas)
#   WebGL: WebGL 2.0
#   GPU: Adreno (TM) 619
#   ── Renderer ──
#     drawCalls: 3
#     triangles: 10716
#     geometries: 3
#     textures: 2
#   ── Scene Graph ──
#   [Scene] scene (3 children)
#     [Mesh] [0] pos(0.00,0.00,0.00) mat:MeshNormalMaterial geo:BufferGeometry
#     [DirectionalLight] [1]
#     [PerspectiveCamera] [2] pos(0.00,5.00,15.00)

# Check for console errors (WebGL/shader errors)
browser-cli --keep console

# Check for failed network requests (missing models/textures)
browser-cli --keep network

# See changed state after interaction
browser-cli --keep click "#animate-btn"
browser-cli --keep scene
```

### What `scene` detects:
- **Three.js**: renderer stats (draw calls, triangles, geometries, textures), scene graph with positions/materials/geometry types, FPS
- **Babylon.js**: engine FPS, scene/mesh/material counts
- **Generic WebGL**: canvas info, WebGL version, GPU vendor/renderer

### What `console` shows:
- All `console.log`, `console.warn`, `console.error`, `console.info` from the page
- WebGL shader compilation errors
- JavaScript runtime errors
- Asset loading warnings

### What `network` shows:
- Failed requests by default (404s, CORS errors, timeouts)
- `--all` for all requests with status codes
- Resource types (document, script, image, fetch, xhr, etc.)

## Options

Global options (passed before the command):
| Option | Default | Description |
|--------|---------|-------------|
| `--browser` | `auto` | Browser: `chromium`, `firefox`, `auto` |
| `--headless` | `true` | Run headless |
| `--port` | auto | Remote debugging port |
| `--width` | `1280` | Viewport width |
| `--height` | `720` | Viewport height |
| `--keep` | off | Keep browser alive between commands |

## Termux Notes

- Install: `npm install -g @arielfrja/browser-cli`
- Browser: `pkg install chromium` (or `firefox`)
- `--no-sandbox` is set automatically
- Chromium stderr noise (D-Bus, inotify) is silenced
- Screenshots work with hardware GPU (Adreno on this device)
- WebGL works in Chromium for Android

## Examples

### Web scraping
```bash
browser-cli goto "https://news.ycombinator.com" --snapshot
```

### Form filling
```bash
browser-cli goto "https://example.com/login"
browser-cli type "#email" "user@example.com"
browser-cli type "#password" "secret123"
browser-cli click "#submit"
```

### Debug a failing page
```bash
browser-cli --keep goto "https://myapp.com" --console
browser-cli --keep console
browser-cli --keep network
browser-cli --keep screenshot
```

### Check render performance
```bash
browser-cli --keep goto "https://threejs.org/examples/#webgl_performance"
browser-cli --keep scene
```
