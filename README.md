# browser-cli

**Browser automation CLI for AI agents.** Termux-optimized. CDP-native (no Puppeteer/Playwright). Supports Chromium + Firefox.

47 commands covering navigation, interaction, extraction, screenshots, dialogs, cookies, localStorage, state persistence, JavaScript evaluation, breakpoint debugging, and 3D scene inspection. Designed to be called by AI agents (Claude Code, OpenCode, Gemini, Codex) with clean output for both **text-only** and **multimodal** models.

```
npm install -g @arielfrja/browser-cli
```

```bash
browser-cli goto https://example.com --snapshot
browser-cli click "#search" --screenshot
browser-cli type "#search" "hello world"
browser-cli screenshot
```

---

## Why browser-cli?

Existing browser automation tools (Playwright, Puppeteer, Selenium) are designed for testing frameworks and Node.js scripts — not for AI agents calling them from a terminal.

**browser-cli** is:
- **CDP-native** — direct WebSocket to Chrome DevTools Protocol. No Puppeteer, no Playwright, no Selenium. ~20KB gzipped.
- **CLI-native** — every action is a single command. No scripts, no setup, no framework.
- **Termux-optimized** — works on Android/Termux out of the box. Handles the quirks (no D-Bus, no `/tmp`, no sandboxing).
- **AI-agent-friendly** — output is clean text for text-only models, with optional base64 screenshots embedded for multimodal models.
- **Multi-browser** — detects and launches Chromium or Firefox automatically.

---

## Installation

### Via npm (recommended)

```bash
npm install -g @arielfrja/browser-cli
```

Then use anywhere:

```bash
browser-cli --help
```

### Via npx (no install)

```bash
npx @arielfrja/browser-cli goto https://example.com --snapshot
```

### Via GitHub

```bash
npx github:arielfrja/browser-cli goto https://example.com
```

### From source

```bash
git clone https://github.com/arielfrja/browser-cli.git
cd browser-cli
npm install && npm run build
node dist/cli.js --help
```

---

## Quick Start

### 1. Check what browsers are available

```bash
browser-cli list-browsers
```

```
Available browsers:
  ✓ Chromium: /data/data/com.termux/files/usr/bin/chromium-browser
  ✗ Firefox: not found (pkg install firefox)
```

### 2. Navigate and take a snapshot

```bash
browser-cli goto https://example.com --snapshot
```

Output for AI agents:

```
<!-- browser-cli result: OK (4377ms) -->

--- PAGE SNAPSHOT ---
URL: https://example.com/
Title: Example Domain
Viewport: 1280x720

=== HEADINGS ===
# Example Domain

=== LINKS ===
  Learn more → https://iana.org/domains/example

=== PAGE TEXT ===
Example Domain
This domain is for use in documentation examples...

Navigated to https://example.com
```

### 3. Take a screenshot

```bash
browser-cli goto https://example.com --screenshot
```

Output includes base64 image data:

```
<!-- browser-cli result: OK (5174ms) -->

Navigated to https://example.com

--- SCREENSHOT (base64) ---
iVBORw0KGgoAAAANSUhEUgAABQAAA...

![page-screenshot](data:image/png;base64,iVBORw0KGgoAAA...)
```

### 4. Save screenshot to file

```bash
browser-cli screenshot ~/page.png
```

### 5. Click something

```bash
browser-cli click "#submit-btn" --screenshot
```

### 6. Type into an input

```bash
browser-cli type "#search" "hello world"
```

---

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
| `press <key>` | Press a keyboard key |

### Dialogs
| Command | Description |
|---------|-------------|
| `dialog-accept [promptText]` | Accept a JS dialog (alert/confirm/prompt) |
| `dialog-dismiss` | Dismiss a JS dialog |

### Screenshots & PDF
| Command | Description |
|---------|-------------|
| `screenshot` | Capture page screenshot as base64 |
| `pdf` | Generate PDF of current page |

### Page State
| Command | Description |
|---------|-------------|
| `snapshot` | Get structured page snapshot (headings, links, inputs, text) |
| `find [options] <pattern>` | Search snapshot text. `-r` for regex |

### JavaScript
| Command | Description |
|---------|-------------|
| `eval <code>` | Run arbitrary JavaScript in the page |

### Cookies
| Command | Description |
|---------|-------------|
| `cookies` | List all cookies |
| `clear-cookies` | Clear all cookies |
| `cookie-get <name>` | Get a specific cookie value |
| `cookie-set [options] <name> <value>` | Set a cookie (`--domain`, `--path`) |
| `cookie-delete <name>` | Delete a specific cookie |

### Storage
| Command | Description |
|---------|-------------|
| `storage` | Show localStorage/sessionStorage info |
| `clear-storage` | Clear localStorage and sessionStorage |
| `localstorage-get <key>` | Get a localStorage value |
| `localstorage-set <key> <value>` | Set a localStorage value |
| `localstorage-delete <key>` | Delete a localStorage key |

### State Persistence
| Command | Description |
|---------|-------------|
| `state-save [filename]` | Save cookies + localStorage to JSON |
| `state-load <filename>` | Restore cookies + localStorage from JSON |

### 3D Debugging
| Command | Description |
|---------|-------------|
| `scene` | Inspect 3D scene (renderer, FPS, scene graph, GPU) |
| `console [options]` | Show buffered console messages. `--clear` |
| `network [options]` | Show network requests. `--all` for all |

### JavaScript Debugging
| Command | Description |
|---------|-------------|
| `debug-set <location>` | Set breakpoint at `file:line` |
| `debug-list` | List all breakpoints |
| `debug-remove <id>` | Remove a breakpoint |
| `debug-continue` | Resume after breakpoint pause |
| `debug-step-over` | Step over next function call |
| `debug-step-into` | Step into next function call |
| `debug-step-out` | Step out of current function |
| `debug-locals` | Show call stack + scoped variables |
| `debug-eval <expression>` | Evaluate expression in paused context |

### Session Management
| Command | Description |
|---------|-------------|
| `quit` | Kill persistent browser session |
| `close-all` | Close all active sessions |
| `kill-all` | Forcefully kill all browser processes |

### Wait
| Command | Description |
|---------|-------------|
| `wait <ms>` | Wait for a duration |
| `wait-for <selector>` | Wait for element. `--timeout`, `--hidden` |

---

## Options

```
--browser <type>     Browser: chromium, firefox, auto (default: auto)
--headless <bool>    Run headless (default: true)
--port <number>      Remote debugging port (auto if not set)
--width <px>         Viewport width (default: 1280)
--height <px>        Viewport height (default: 720)
--timeout <ms>       Command timeout (default: 30000)
--keep               Keep browser alive across commands (use 'quit' to stop)
```

### Example with custom viewport and Firefox

```bash
browser-cli goto https://example.com --browser firefox --width 375 --height 812 --snapshot
```

---

## Session Mode (`--keep`)

By default each command launches a fresh browser and kills it after finishing. For multi-step workflows, pass `--keep`:

- The browser process is **detached** (`detached: true` + `proc.unref()`) so it survives CLI exit
- Session metadata persists in `~/.browser-cli/session.json`
- Subsequent `--keep` commands reconnect to the same browser and page

```bash
# Start persistent session
browser-cli --keep goto https://example.com

# Reuse the same browser
browser-cli --keep click "#login"
browser-cli --keep type "#username" "admin"
browser-cli --keep screenshot

# End session
browser-cli quit
```

---

## State Persistence

Save and restore full browser state (cookies + localStorage) across sessions:

```bash
# Log in and save state
browser-cli --keep goto "https://example.com/login"
browser-cli --keep type "#user" "admin"
browser-cli --keep type "#pass" "secret123"
browser-cli --keep click "#login-btn"
browser-cli --keep state-save logged-in.json
browser-cli --keep quit

# Later — restore without logging in
browser-cli goto "https://example.com/dashboard"
browser-cli state-load logged-in.json
browser-cli refresh
```

---

## JavaScript Breakpoint Debugging

Full JS debugging via CDP Debugger domain. Breakpoints persist in `~/.browser-cli/breakpoints.json`.

```bash
# Set a breakpoint
browser-cli --keep debug-set scene.html:23

# Trigger it
browser-cli --keep click "#run-btn"

# Inspect state
browser-cli --keep debug-locals
browser-cli --keep debug-eval "myVariable"

# Step through
browser-cli --keep debug-step-over
browser-cli --keep debug-continue
```

---

## Installing Browsers on Termux

### Chromium

```bash
pkg install chromium
browser-cli list-browsers  # verify
```

### Firefox

```bash
pkg install firefox
browser-cli list-browsers  # verify
```

---

## Output Format for AI Agents

browser-cli is designed to be called by AI coding agents. The output format is:

```
<!-- browser-cli result: OK|FAIL (elapsed_ms) -->

[message or snapshot text]

--- SCREENSHOT (base64) ---
[base64 encoded PNG]

![page-screenshot](data:image/png;base64,...)
```

**For text-only models** (Claude Haiku, GPT-3.5, Gemini Nano):
- The snapshot and message sections provide full page context as structured text
- Headings, links, inputs, buttons, and page text are all extracted

**For multimodal models** (Claude Sonnet/Opus, GPT-4o, Gemini Pro):
- The markdown image tag lets the model "see" the page
- The snapshot text provides accessibility structure the model can reason about

**Machine-readable metadata:**
- Line 1 format: `<!-- browser-cli result: OK (4377ms) -->`
- Parse this for success/failure and timing

---

## Architecture

```
browser-cli/
├── src/
│   ├── cli.ts         # CLI entry — 47 commander commands
│   ├── cdp.ts         # CDP WebSocket client (direct protocol, no Puppeteer)
│   ├── launcher.ts    # Browser launcher — spawns Chromium/Firefox with CDP args
│   ├── snapshot.ts    # DOM snapshot engine — text + structured extraction
│   ├── debugger.ts    # JS breakpoint debugging via CDP Debugger domain
│   ├── webgl.ts       # 3D scene inspector (Three.js/Babylon.js/WebGL)
│   └── output.ts      # AI-agent output formatter — text + base64
├── dist/              # Compiled JavaScript
├── package.json
└── tsconfig.json
```

Browser automation uses **direct CDP** (Chrome DevTools Protocol via WebSocket). No Puppeteer, Playwright, or Selenium. No browser binary is bundled — it uses whatever is installed on your system.

---

## Development

```bash
## Build
npm run build

# Dev with hot reload
npm run dev

# Type-check
npx tsc --noEmit

# Run
node dist/cli.js goto https://example.com --snapshot
```

### AI Agent Skill

This repo includes an embedded **skill** at `.agents/skills/browser-cli/SKILL.md` that teaches AI coding agents (OpenCode, Claude Code, Cursor, etc.) how to use browser-cli for web automation.

| File | What it is |
|------|------------|
| `.agents/skills/browser-cli/SKILL.md` | The skill — all commands, output format, session mode, 3D debugging |
| `.agents/agents.md` | Instructions for agents working on this codebase |
| `.agents/claude.md` | Claude Code-specific project setup |
| `AGENTS.md` | Root-only pointer to the skill |

When you update browser-cli commands or behavior, update the skill too so AI agents stay in sync.

---

## License

MIT
