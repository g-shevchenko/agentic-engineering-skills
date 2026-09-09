# Agentic Engineering Skills

Generic agentic engineering skills for AI coding agents: agent MVP blueprint,
session handoffs, overnight task queues, restricted-tool subagents, feature
ledgers, task closure, and architecture refactoring.

Created from production operating patterns, rewritten as a self-contained
public package. No Workspace dependencies, no internal infrastructure — works
in any repo with any agent (Claude Code, Codex, Cursor, Windsurf, Devin).

## Verify Before Install

Clone and inspect first:

```bash
git clone https://github.com/g-shevchenko/agentic-engineering-skills.git
cd agentic-engineering-skills
bash scripts/doctor.sh
bash scripts/audit-public-surface.sh
```

Then install locally:

```bash
bash scripts/install.sh
```

The installer prints the commands to use after installation, including:

```text
use agentic engineering stack
```

Fast path after inspection:

```bash
bash scripts/install.sh --target "$HOME/.codex/skills"
```

## What Gets Installed

| Skill | Purpose | Trigger phrase |
|---|---|---|
| `agent-mvp-blueprint` | Design agent harness from scratch — 15-section blueprint (loop, tools, permissions, planning, goals, context, skills, caching, observability, evals, launch criteria) | `use agent mvp blueprint` |
| `handoff` | Operational handoff between sessions/IDEs (Claude Code, Codex, Cursor, Windsurf, Devin) | `use handoff` |
| `overnight-task-queue` | Safe local task queue for long unattended work — checkpoints, proof, git commits, stop conditions, morning report | `use overnight task queue` |
| `restricted-tool-subagent` | Capability separation for subagents — prevents "subagent silently amends its own findings" | `use restricted tool subagent` |
| `json-feature-ledger` | feature_list.json contract — 70-85% token savings on verifier→fixer handoff | `use json feature ledger` |
| `close-task` | Full closure gates — merge+deploy+smoke+cleanup+handoff in all touched repos | `use close task` |
| `improve-codebase-architecture` | 6-phase refactor loop: Explore→Report→Design→Execute→Document→Measure | `use improve codebase architecture` |

## Composes With

- [agentic-quality-skills](https://github.com/g-shevchenko/agentic-quality-skills) — TDD, quality gates, golden benchmarks
- [mcp-token-savers](https://github.com/g-shevchenko/mcp-token-savers) — 21 local MCP servers (retrieval, context-prep, repo-hygiene, static-analysis)

The `improve-codebase-architecture` skill composes with MCPs in mcp-token-savers:
`language-graph-mcp`, `repo-hygiene-mcp`, `static-analysis-mcp`, `repo-quality-gate-mcp`,
`retrieval-mcp`.

The `json-feature-ledger` skill composes with `test-results-mcp` in mcp-token-savers.

## Install Targets

Default: `$HOME/.codex/skills`

Other agents:
```bash
# Claude Code
bash scripts/install.sh --target "$HOME/.claude/skills"

# Cursor
bash scripts/install.sh --target "$HOME/.cursor/skills"

# Windsurf
bash scripts/install.sh --target "$HOME/.codeium/windsurf/skills"
```

## License

MIT — see [LICENSE](LICENSE).
