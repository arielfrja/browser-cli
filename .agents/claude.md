# Claude-specific instructions for browser-cli

This file configures how Claude Code interacts with the browser-cli project.

## Project Overview

browser-cli is a TypeScript CLI built with commander and puppeteer-core. It automates web browsers (Chromium/Firefox) via CDP. All code is in `src/`.

## Key files

| File | Purpose |
|------|---------|
| `src/cli.ts` | Main entry — all 30+ commander commands |
| `src/launcher.ts` | Browser launch logic (CDP, Termux paths) |
| `src/snapshot.ts` | DOM snapshot extraction |
| `src/output.ts` | AI-agent output formatter (base64 + markdown) |
| `src/webgl.ts` | 3D scene inspector (Three.js/Babylon.js/WebGL) |
| `package.json` | Build/test: `npm run build`, `npm start` |
| `.agents/skills/browser-cli/SKILL.md` | Skill file — how AI agents use browser-cli |
| `README.md` | Full documentation for users |

## Build & test

```bash
npm run build       # tsc compile
npm start           # run the CLI
node dist/cli.js    # direct invocation
```

## Architecture notes

- Each command normally launches a browser → acts → kills it (single-shot)
- `--keep` flag enables persistent mode: browser stays alive across commands until `quit`
- Console messages and network requests are auto-buffered during persistent sessions
- The `scene` command auto-detects Three.js, Babylon.js, or generic WebGL

## When you edit the skill

If you modify `.agents/skills/browser-cli/SKILL.md`:
1. Make sure all commands are documented
2. Keep the AI output format section accurate
3. Keep the examples up to date with real output

## Publishing

```bash
# Bump version
npm version patch   # or minor, major
# Build
npm run build
# Publish (requires npm login with 2FA token)
npm publish --access public
```
