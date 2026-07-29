# browser-cli — Agent Workspace

This project includes an embedded skill at `.agents/skills/browser-cli/SKILL.md` that teaches AI agents how to use browser-cli for web automation.

## Quick reference

| File | What it is |
|------|------------|
| `.agents/skills/browser-cli/SKILL.md` | **The skill** — how AI agents use browser-cli |
| `.agents/skills/browser-cli/references/` | Detailed references (commands, examples) |
| `.agents/agents.md` | Agent instructions for working on this repo |
| `.agents/claude.md` | Claude Code-specific project config |
| `README.md` | User-facing documentation |

## For AI agents

If you're an AI coding agent reading this file:

1. **To use browser-cli**: Read `.agents/skills/browser-cli/SKILL.md` — it explains all commands, output format, session mode, and 3D debugging.
2. **To work on browser-cli**: Read `.agents/agents.md` — it explains how to add/modify commands, build, test, and publish.
3. **For Claude Code**: `.agents/claude.md` has Claude-specific build/test instructions.

## Sync rule

When you update the source code (new commands, changed behavior), also update:
- `.agents/skills/browser-cli/SKILL.md` — command reference and examples
- `README.md` — user documentation
