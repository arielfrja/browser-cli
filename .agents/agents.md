# agents.md — AI Agent Instructions for browser-cli

This file tells AI agents how to work with the browser-cli project. It explains what the tool does, how to use it, and how to maintain it.

## What is browser-cli?

browser-cli is a CLI tool that AI agents can call to automate web browsers. It launches Chromium or Firefox, executes commands (goto, click, type, screenshot, etc.), and returns clean text + base64 output that both text-only and multimodal AI models can parse.

Key facts:
- Published on npm as `@arielfrja/browser-cli`
- Source: `github.com/arielfrja/browser-cli`
- 26+ commands covering navigation, interaction, extraction, storage, JavaScript eval, and 3D debugging
- Termux-optimized (Android), works on any Linux

## How agents should use browser-cli

When the user asks you to:
- **Browse a website** → `browser-cli goto <url> --snapshot`
- **Scrape data** → `browser-cli extract <selector>`
- **Take a screenshot** → `browser-cli screenshot`
- **Fill a form** → `browser-cli goto` + `type` + `click`
- **Debug a web page** → `browser-cli --keep` + `console` + `network`
- **Check a 3D scene** → `browser-cli --keep scene`
- **Run custom JS** → `browser-cli eval <code>`

Use `--keep` for multi-step workflows (keeps the browser alive between calls).
Always end with `browser-cli quit` to kill the browser.

## How agents should maintain browser-cli

### Adding a new command
1. Edit `src/cli.ts` — add a new `.command(...)` block following existing patterns
2. Export any new logic in a dedicated module under `src/`
3. Update the skill in `.agents/skills/browser-cli/SKILL.md` — add the new command
4. Update `README.md` with the new command
5. Run `npm run build` to verify it compiles
6. Test with `node dist/cli.js <command> <args>`

### Modifying an existing command
1. Find the command in `src/cli.ts`
2. Make your change
3. Update `SKILL.md` if options or behavior changed
4. Update `README.md` if needed
5. Build and test

### Publishing a new version
1. `npm version patch|minor|major`
2. `npm run build`
3. `npm publish --access public`

### Regenerating the skill
If you add or change commands significantly, regenerate `.agents/skills/browser-cli/SKILL.md` to keep it in sync. The skill is the primary way AI agents learn to use browser-cli — keeping it accurate ensures other agents can use the tool effectively.

## Skill location

The browser-cli skill lives at `.agents/skills/browser-cli/SKILL.md` in this repo. It is loaded automatically by OpenCode and compatible AI coding tools.

If you ever need to update it, edit SKILL.md and the command reference at `.agents/skills/browser-cli/references/commands.md`.
