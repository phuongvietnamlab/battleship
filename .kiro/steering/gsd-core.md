---
inclusion: always
---

# GSD Core — Git. Ship. Done.

GSD Core is a context-engineering and spec-driven development framework installed in this project.
It drives development through a disciplined phase loop: Discuss → Plan → Execute → Verify → Ship.

## GSD Directory Structure

- `gsd-core/workflows/` — All GSD workflow definitions (markdown instructions)
- `gsd-core/references/` — Reference documentation for agents and patterns
- `gsd-core/templates/` — Templates for project artifacts
- `gsd-core/contexts/` — Context profiles (dev, research, review)
- `gsd-core/bin/gsd-tools.cjs` — CLI tool for GSD operations (run with `node`)
- `agents/` — GSD agent definitions (subagent prompts)
- `.planning/` — Planning artifacts (PROJECT.md, ROADMAP.md, STATE.md, config.json, phases/)

## How to Use GSD Commands

When the user types any `/gsd-*` command (or `gsd <command>`), load and follow the matching
workflow from `gsd-core/workflows/`. The command mapping is:

| User Command | Workflow File |
|---|---|
| `/gsd-new-project` | `gsd-core/workflows/new-project.md` |
| `/gsd-progress` | `gsd-core/workflows/progress.md` |
| `/gsd-autonomous` | `gsd-core/workflows/autonomous.md` |
| `/gsd-discuss-phase` | `gsd-core/workflows/discuss-phase.md` |
| `/gsd-plan-phase` | `gsd-core/workflows/plan-phase.md` |
| `/gsd-execute-phase` | `gsd-core/workflows/execute-phase.md` |
| `/gsd-verify-phase` | `gsd-core/workflows/verify-phase.md` |
| `/gsd-ship` | `gsd-core/workflows/ship.md` |
| `/gsd-help` | `gsd-core/workflows/help.md` |
| `/gsd-debug` | `gsd-core/workflows/debug.md` |
| `/gsd-fast` | `gsd-core/workflows/fast.md` |
| `/gsd-quick` | `gsd-core/workflows/quick.md` |
| `/gsd-do` | `gsd-core/workflows/do.md` |
| `/gsd-next` | `gsd-core/workflows/next.md` |
| `/gsd-review` | `gsd-core/workflows/review.md` |
| `/gsd-code-review` | `gsd-core/workflows/code-review.md` |
| `/gsd-map-codebase` | `gsd-core/workflows/map-codebase.md` |
| `/gsd-new-milestone` | `gsd-core/workflows/new-milestone.md` |
| `/gsd-sketch` | `gsd-core/workflows/sketch.md` |
| `/gsd-spike` | `gsd-core/workflows/spike.md` |
| `/gsd-update` | `gsd-core/workflows/update.md` |
| `/gsd-settings` | `gsd-core/workflows/settings.md` |
| `/gsd-health` | `gsd-core/workflows/health.md` |
| `/gsd-stats` | `gsd-core/workflows/stats.md` |
| `/gsd-explore` | `gsd-core/workflows/explore.md` |
| `/gsd-resume-project` | `gsd-core/workflows/resume-project.md` |
| `/gsd-add-phase` | `gsd-core/workflows/add-phase.md` |
| `/gsd-edit-phase` | `gsd-core/workflows/edit-phase.md` |
| `/gsd-remove-phase` | `gsd-core/workflows/remove-phase.md` |
| `/gsd-transition` | `gsd-core/workflows/transition.md` |
| `/gsd-cleanup` | `gsd-core/workflows/cleanup.md` |

For any `/gsd-*` command not listed above, check if a matching `.md` file exists
in `gsd-core/workflows/` (strip the `/gsd-` prefix, use remaining as filename).

## GSD Tools (CLI)

Run GSD tools via:
```bash
node gsd-core/bin/gsd-tools.cjs <command> [args]
```

Key commands:
- `query init.new-project` — Get project initialization context
- `query init.milestone-op` — Get milestone operation context
- `query init.progress` — Get progress context
- `query roadmap.analyze` — Analyze roadmap phases
- `query state-snapshot` — Get current state
- `query config-get <key>` — Read config value
- `query config-set <key> <value>` — Write config value
- `query commit "<message>" --files <paths>` — Create commit with message

## Runtime Adaptations for Kiro

Since Kiro does not have `AskUserQuestion` tool or slash-command registration:
- When a workflow calls `AskUserQuestion`, present the options as a numbered list in chat
  and ask the user to pick by number or description.
- When a workflow references spawning a named subagent (e.g., `gsd-executor`),
  read the matching agent file from `agents/` and use `invoke_sub_agent` with
  the agent's instructions as the prompt context.
- When a workflow says to run bash/shell commands, use `execute_pwsh` tool.
- Planning artifacts go in `.planning/` directory.

## Key Principles

1. **Fresh context**: Heavy work (research, planning, execution) should run in sub-agents
   to keep the main conversation lean.
2. **Structured artifacts**: STATE.md, CONTEXT.md, ROADMAP.md survive session boundaries.
3. **Verify before shipping**: Always verify work satisfies requirements before declaring done.
4. **Do not apply GSD workflows unless the user explicitly asks** (via `/gsd-*` command or
   mentioning GSD by name).

## Playwright Auto-Verification

After execute-phase completes, the system automatically runs Playwright browser testing
on features just built (controlled by `workflow.auto_verify_work` and `workflow.playwright_verify`
in config.json).

**Flow:** Execute → Verify-phase (includes Playwright) → Verify-work (Playwright + manual UAT)

**How it works:**
1. Reads SUMMARY.md to identify what UI features were built
2. Derives test flows (navigation, interactions, form submissions)
3. Uses Playwright MCP tools to simulate real user actions
4. Auto-passes verified flows, flags failures for manual review
5. Only presents items needing human judgment in manual UAT

**Config keys:**
- `workflow.auto_verify_work: true` — Auto-run verify-work after execute-phase (default: true)
- `workflow.playwright_verify: true` — Enable Playwright in verification (default: true)
- `workflow.app_url: "http://localhost:4000"` — App URL for Playwright to navigate to
