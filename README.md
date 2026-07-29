# browser-cli

**Browser automation CLI for AI agents.** Termux-optimized. Supports Chromium + Firefox.

26 commands covering navigation, interaction, extraction, screenshots, cookies, storage, and JavaScript evaluation. Designed to be called by AI agents (Claude Code, OpenCode, Gemini, Codex) with clean output for both **text-only** and **multimodal** models.

```
npm install -g @arielfrja/browser-cli
```

```bash
browser-cli goto https://example.com --snapshot
browser-cli click "#search" --screenshot
browser-cli type "#search" "hello world"
browser-cli screenshot --full-page
```

---

## Why browser-cli?

Existing browser automation tools (Playwright, Puppeteer, Selenium) are designed for testing frameworks and Node.js scripts — not for AI agents calling them from a terminal.

**browser-cli** is:
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

The markdown image tag at the bottom lets multimodal models "see" the page.

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

## All 26 Commands

### Navigation

| Command | Description |
|---------|-------------|
| `goto <url>` | Navigate and return page state |
| `back` | Navigate back in history |
| `forward` | Navigate forward in history |
| `refresh` | Reload the current page |

### Interaction

| Command | Description |
|---------|-------------|
| `click <selector>` | Click an element |
| `type <selector> <text>` | Type text into an input |
| `select <selector> <value>` | Select an option in a `<select>` |
| `hover <selector>` | Hover over an element |
| `scroll <x> <y>` | Scroll by x, y pixels |
| `press <key>` | Press a keyboard key |

### Extraction

| Command | Description |
|---------|-------------|
| `extract [selector]` | Get text content of an element |
| `extract [selector] --html` | Get inner HTML |
| `extract [selector] --attr <name>` | Get an attribute value |
| `url` | Print current page URL |
| `title` | Print current page title |

### Screenshots

| Command | Description |
|---------|-------------|
| `screenshot [path]` | Capture viewport screenshot |
| `screenshot --full-page` | Capture full page (scrolling) |
| `screenshot --selector <sel>` | Capture a specific element |

### Page State

| Command | Description |
|---------|-------------|
| `snapshot` | Full page state as structured text |
| `snapshot --json` | Full page state as JSON |

### Waiting

| Command | Description |
|---------|-------------|
| `wait <ms>` | Wait for a duration |
| `wait-for <selector>` | Wait for element to appear |
| `wait-for <selector> --hidden` | Wait for element to disappear |

### Cookies & Storage

| Command | Description |
|---------|-------------|
| `cookies` | List all cookies |
| `cookies --json` | List cookies as JSON |
| `set-cookie <name> <value>` | Set a cookie |
| `delete-cookies [names...]` | Delete cookies |
| `storage-get <key>` | Get localStorage value |
| `storage-set <key> <value>` | Set localStorage value |
| `storage-clear` | Clear all localStorage |

### Advanced

| Command | Description |
|---------|-------------|
| `eval <code>` | Run JavaScript in the page |
| `eval <code> --arg <json>` | Run JS with an argument |
| `list-browsers` | Detect available browsers |

---

## Options

```
--browser <type>     Browser: chromium, firefox, auto (default: auto)
--headless <bool>    Run headless (default: true)
--port <number>      Remote debugging port (auto if not set)
--width <px>         Viewport width (default: 1280)
--height <px>        Viewport height (default: 720)
```

### Example with custom viewport and Firefox

```bash
browser-cli goto https://example.com --browser firefox --width 375 --height 812 --snapshot
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
│   ├── cli.ts         # CLI entry — 26 commander commands
│   ├── launcher.ts    # Browser launcher — CDP connection to Chromium/Firefox
│   ├── snapshot.ts    # DOM snapshot engine — text + structured extraction
│   └── output.ts      # AI-agent output formatter — text + base64
├── dist/              # Compiled JavaScript
├── package.json
└── tsconfig.json
```

Browser automation uses **puppeteer-core** to connect to the browser via Chrome DevTools Protocol (CDP). No browser binary is bundled — it uses whatever is installed on your system.

---

## How It Uses the Gauntlet Loop

browser-cli was built using the **Gauntlet Loop** methodology — a multi-agent iterative improvement cycle:

1. **Goal** + **quality bar** (Playwright/Puppeteer capability)
2. **Decomposition** into independent work items
3. Each item: **builder** (implements) → **critic** (fresh context, blind A/B vs bar)
4. **Loop** until the bar is beaten
5. **Smoothing pass** for consistency

The Gauntlet Loop skill is available globally at `~/.config/opencode/skills/gauntlet-loop/SKILL.md` and can be loaded by any OpenCode agent via `skill("gauntlet-loop")`.

---

## Development

```bash
# Build
npm run build

# Dev with hot reload
npm run dev

# Type-check
npx tsc --noEmit

# Run
node dist/cli.js goto https://example.com --snapshot
```

---

## License

MIT
