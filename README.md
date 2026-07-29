# browser-cli

Browser automation CLI for AI agents. Optimized for Termux (Android).

## Quality Bar
Matches Playwright/Puppeteer's core capabilities for navigation, interaction, extraction, and screenshots. Designed to be called by AI agents (Claude Code, OpenCode) in both text-only and multimodal contexts.

## Commands (planned)
- `browser-cli goto <url>` — Navigate and return page state
- `browser-cli click <selector>` — Click an element
- `browser-cli type <selector> <text>` — Type into an input
- `browser-cli screenshot [path]` — Capture screenshot
- `browser-cli html [selector]` — Get inner HTML
- `browser-cli text [selector]` — Get text content
- `browser-cli snapshot` — Full page state as JSON
