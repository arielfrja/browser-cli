---
name: browser-cli
description: >-
  Tool for automating web browsers from the command line — navigate to URLs, click elements, type text, take screenshots, capture page snapshots, extract data, manage cookies and localStorage, handle JavaScript dialogs, find text in snapshots, save/restore browser state, execute arbitrary JavaScript, and debug WebGL/Three.js/Babylon.js 3D scenes.
  Use this skill whenever the user asks you to interact with a website, scrape web data, take a screenshot of a page, check if a site is working, fill out a form, debug a web UI, inspect a 3D scene, or automate any browser task.
  This is the primary tool for any web browsing or web automation workflow — always check this skill first for browser-related tasks.
---

# browser-cli

**browser-cli** is a CLI tool for AI agents to automate web browsers. It launches Chromium or Firefox via **direct CDP** (Chrome DevTools Protocol over WebSocket — no Puppeteer, no Playwright). Returns clean text + base64 output. Optimized for Termux on Android, works on any Linux system.

## Architecture

- **CDP-native**: Direct WebSocket connection to the browser's DevTools Protocol. No Puppeteer, Playwright, or Selenium dependencies.
- **Source**: `src/cli.ts` (47 commands), `src/cdp.ts` (WebSocket client), `src/launcher.ts` (browser spawning), `src/snapshot.ts` (DOM snapshot engine), `src/debugger.ts` (JS breakpoint debugging), `src/webgl.ts` (3D scene inspection), `src/output.ts` (AI-agent output formatter).
- **Package**: `@arielfrja/browser-cli` — TypeScript ESM, Commander.js CLI.

## Quick start

```bash
# Install
npm install -g @arielfrja/browser-cli

# Navigate and capture
browser-cli goto https://example.com --screenshot --snapshot

# Click and interact
browser-cli click "#submit-button"

# Extract data
browser-cli text ".price"

# 3D scene inspection
browser-cli --keep goto https://threejs.org/examples/#webgl_animation_cloth
browser-cli --keep scene

# Quit persistent session
browser-cli quit
```

## Options

Global options (passed before the command):

| Option | Default | Description |
|--------|---------|-------------|
| `--browser` | `auto` | Browser: `chromium`, `firefox`, `auto` |
| `--headless` | `true` | Headless mode (`true`/`false`) |
| `--port` | auto | Remote debugging port |
| `--width` | `1280` | Viewport width |
| `--height` | `720` | Viewport height |
| `--timeout` | `30000` | Command timeout in ms |
| `--keep` | off | Keep browser alive across commands (use `quit` to stop) |

## All 47 Commands

### Navigation
| Command | Description |
|---------|-------------|
| `goto [options] <url>` | Navigate to a URL. Options: `--wait-until`, `--timeout`, `--screenshot`, `--snapshot` |
| `back [options]` | Navigate back in history. `--screenshot` |
| `forward [options]` | Navigate forward in history. `--screenshot` |
| `refresh [options]` | Reload current page. `--screenshot` |

### Page Info
| Command | Description |
|---------|-------------|
| `title` | Get page title |
| `url` | Get current page URL |

### Interaction
| Command | Description |
|---------|-------------|
| `click [options] <selector>` | Click an element. `--screenshot` |
| `type <selector> <text>` | Type text into an input field |
| `select <selector> <value>` | Select an option from a `<select>` element |
| `text <selector>` | Get text content of an element |
| `hover <selector>` | Hover over an element |
| `dblclick <selector>` | Double-click an element |
| `scroll <x> <y>` | Scroll by x, y pixels |
| `press <key>` | Press a keyboard key (Enter, Escape, Tab, ArrowDown, etc.) |

### Dialogs
| Command | Description |
|---------|-------------|
| `dialog-accept [promptText]` | Accept a JavaScript dialog (alert/confirm/prompt). Optional `promptText` for prompt() dialogs |
| `dialog-dismiss` | Dismiss a JavaScript dialog (alert/confirm/prompt) |

### Screenshots & PDF
| Command | Description |
|---------|-------------|
| `screenshot` | Capture page screenshot as base64 |
| `pdf` | Generate PDF of current page |

### Page State
| Command | Description |
|---------|-------------|
| `snapshot` | Get structured page snapshot (headings, links, inputs, text) |
| `find [options] <pattern>` | Search the page snapshot for matching text. `-r, --regex` for regex mode |

### JavaScript
| Command | Description |
|---------|-------------|
| `eval <code>` | Run arbitrary JavaScript in the page |

### Cookies
| Command | Description |
|---------|-------------|
| `cookies` | List all cookies for current page |
| `clear-cookies` | Clear all cookies |
| `cookie-get <name>` | Get the value of a specific cookie |
| `cookie-set [options] <name> <value>` | Set a cookie. Options: `--domain`, `--path` |
| `cookie-delete <name>` | Delete a specific cookie |

### Storage
| Command | Description |
|---------|-------------|
| `storage` | Show browser storage info (localStorage, sessionStorage) |
| `clear-storage` | Clear localStorage and sessionStorage |
| `localstorage-get <key>` | Get a localStorage value |
| `localstorage-set <key> <value>` | Set a localStorage value |
| `localstorage-delete <key>` | Delete a localStorage key |

### State Persistence
| Command | Description |
|---------|-------------|
| `state-save [filename]` | Save cookies + localStorage to a JSON file (default: `browser-state.json`) |
| `state-load <filename>` | Restore cookies + localStorage from a JSON file |

### 3D Debugging
| Command | Description |
|---------|-------------|
| `scene` | Inspect 3D scene (Three.js/Babylon.js/WebGL) — renderer stats, FPS, scene graph, GPU info |
| `console [options]` | Show buffered console messages. `--clear` to reset |
| `network [options]` | Show buffered network requests. `--all` for all requests, default shows only failures |

### JavaScript Debugging
| Command | Description |
|---------|-------------|
| `debug-set <location>` | Set a JavaScript breakpoint at a `file:line` location (e.g. `scene.html:45`) |
| `debug-list` | List all active breakpoints |
| `debug-remove <id>` | Remove a breakpoint by ID |
| `debug-continue` | Resume execution after a breakpoint pause |
| `debug-step-over` | Step over the next function call |
| `debug-step-into` | Step into the next function call |
| `debug-step-out` | Step out of the current function |
| `debug-locals` | Show current breakpoint pause state (call stack + scoped variables) |
| `debug-eval <expression>` | Evaluate an expression in the paused call frame context |

### Session Management
| Command | Description |
|---------|-------------|
| `quit` | Kill the persistent browser session started with `--keep` |
| `close-all` | Close all active browser sessions |
| `kill-all` | Forcefully kill all browser processes |

### Wait
| Command | Description |
|---------|-------------|
| `wait <ms>` | Wait for a duration in milliseconds |
| `wait-for <selector>` | Wait for element to appear. `--timeout`, `--hidden` |

## Session Mode (`--keep`)

By default each command launches a fresh browser and kills it after the command finishes. For multi-step workflows, pass `--keep`:

- The browser process is **detached** (`detached: true` + `proc.unref()`) so it survives CLI exit.
- Session metadata (WebSocket endpoint, port, page target ID) persists in `~/.browser-cli/session.json`.
- On the next `--keep` command, browser-cli reads the session file, reconnects to the same browser via CDP, and re-attaches to the same page.

```bash
# Start persistent session
browser-cli --keep goto https://example.com

# All subsequent --keep commands reuse the same browser
browser-cli --keep click "#login"
browser-cli --keep type "#username" "admin"
browser-cli --keep screenshot

# End session
browser-cli quit
```

**Cleanup commands:**
- `quit` — graceful shutdown of the persistent session
- `close-all` — close all active sessions (clears global state)
- `kill-all` — forcefully kill all browser processes (for cleanup after crashes)

## State Persistence

You can save and restore full browser state (cookies + localStorage) across sessions:

```bash
# Navigate, log in, save state
browser-cli --keep goto "https://example.com/login"
browser-cli --keep type "#username" "user@example.com"
browser-cli --keep type "#password" "secret123"
browser-cli --keep click "#submit"
browser-cli --keep state-save myapp-state.json

# Later — restore state without logging in again
browser-cli --keep goto "https://example.com/dashboard"
browser-cli --keep state-load myapp-state.json
browser-cli --keep refresh
```

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
2. For screenshots: use the markdown image tag `![page-screenshot](data:...)` — multimodal models see the image directly
3. For snapshots: the `--- PAGE SNAPSHOT ---` section has structured text (headings, links, inputs, buttons)
4. For errors: `ERROR: ...` after the result comment

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

## JavaScript Breakpoint Debugging

browser-cli supports full JavaScript debugging via CDP's Debugger domain. Breakpoints persist across commands in `~/.browser-cli/breakpoints.json`.

```bash
# Set a breakpoint
browser-cli --keep debug-set scene.html:23

# Trigger it by interacting with the page
browser-cli --keep click "#run-btn"

# The CLI will pause and show breakpoint info automatically
# Then inspect variables:
browser-cli --keep debug-locals

# Evaluate expressions in the paused context:
browser-cli --keep debug-eval "myVariable"
browser-cli --keep debug-eval "JSON.stringify(scene.children.map(c => c.type))"

# Step through code:
browser-cli --keep debug-step-over
browser-cli --keep debug-step-into

# Resume execution:
browser-cli --keep debug-continue
```

## Termux Notes

- Install: `npm install -g @arielfrja/browser-cli`
- Browser: `pkg install chromium` (or `firefox`)
- `--no-sandbox` is set automatically
- Chromium stderr noise (D-Bus, inotify) is discarded for clean output
- Screenshots work with hardware GPU (Adreno on this device)
- WebGL works in Chromium for Android

## Examples

### Web scraping
```bash
browser-cli goto "https://news.ycombinator.com" --snapshot
browser-cli find "Show HN"       # Search snapshot text
```

### Form filling
```bash
browser-cli goto "https://example.com/login"
browser-cli type "#email" "user@example.com"
browser-cli type "#password" "secret123"
browser-cli click "#submit"
```

### Dialog handling
```bash
browser-cli --keep goto "https://example.com/with-alert"
browser-cli --keep click "#show-alert-btn"
browser-cli --keep dialog-accept
```

### Save and restore authenticated state
```bash
# First visit — log in and save
browser-cli --keep goto "https://example.com/login"
browser-cli --keep type "#user" "admin"
browser-cli --keep type "#pass" "password123"
browser-cli --keep click "#login-btn"
browser-cli --keep state-save logged-in.json
browser-cli --keep quit

# Next visit — restore state directly
browser-cli goto "https://example.com"
browser-cli state-load logged-in.json
browser-cli refresh
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

### Cookie management
```bash
browser-cli cookies
browser-cli cookie-get "session_id"
browser-cli cookie-set "theme" "dark" --domain "example.com"
browser-cli cookie-delete "tracking"
browser-cli clear-cookies
```
