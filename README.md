# Agentic Engineering Skills

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Skills](https://img.shields.io/badge/Skills-10-brightgreen?style=for-the-badge)](#skills)
[![Agents](https://img.shields.io/badge/Works%20with-Claude%20Code%20·%20Codex%20·%20Cursor%20·%20Windsurf%20·%20Devin-blue?style=for-the-badge)](#compatibility)
[![Last Update](https://img.shields.io/github/last-commit/g-shevchenko/agentic-engineering-skills?label=Last%20update&style=for-the-badge)](https://github.com/g-shevchenko/agentic-engineering-skills/commits)

Generic agentic engineering skills for AI coding agents: agent MVP blueprint,
session handoffs, overnight task queues, restricted-tool subagents, feature
ledgers, task closure, architecture refactoring, and MCP companion skills.

Created from production operating patterns, rewritten as a self-contained
public package. No Workspace dependencies, no internal infrastructure — works
in any repo with any agent.

> **Deep-dive write-up:** *Agentic Engineering Skills — open-source patterns
> for AI agents* — the research article behind this repo, with the operating
> patterns, skill categories, and how they compose with the MCP token-saver
> stack.
> [Read it on gregshevchenko.com](https://gregshevchenko.com/research/agentic-engineering-skills/).

## Table of Contents

- [Quick Start](#quick-start)
- [Skills](#skills)
- [Compatibility](#compatibility)
- [Composes With](#composes-with)
- [Install](#install)
- [Verify Before Install](#verify-before-install)
- [Repository Structure](#repository-structure)
- [Contributing](#contributing)
- [License](#license)

## Quick Start

```bash
git clone https://github.com/g-shevchenko/agentic-engineering-skills.git
cd agentic-engineering-skills
bash scripts/install.sh
```

Then in your agent chat:

```text
use agentic engineering stack
```

That's it. The skills are now available to your agent.

## Skills

| Skill | Purpose | Trigger phrase |
|---|---|---|
| `agent-mvp-blueprint` | Design agent harness from scratch — 15-section blueprint (loop, tools, permissions, planning, goals, context, skills, caching, observability, evals, launch criteria) | `use agent mvp blueprint` |
| `handoff` | Operational handoff between sessions/IDEs (Claude Code, Codex, Cursor, Windsurf, Devin) | `use handoff` |
| `overnight-task-queue` | Safe local task queue for long unattended work — checkpoints, proof, git commits, stop conditions, morning report | `use overnight task queue` |
| `restricted-tool-subagent` | Capability separation for subagents — prevents "subagent silently amends its own findings" | `use restricted tool subagent` |
| `json-feature-ledger` | feature_list.json contract — 70-85% token savings on verifier→fixer handoff | `use json feature ledger` |
| `close-task` | Full closure gates — merge+deploy+smoke+cleanup+handoff in all touched repos | `use close task` |
| `improve-codebase-architecture` | 6-phase refactor loop: Explore→Report→Design→Execute→Document→Measure | `use improve codebase architecture` |
| `context-prep` | Companion skill for context-prep-mcp — long logs, CI output, pasted specs compaction | `use context prep` |
| `retrieval` | Companion skill for retrieval-mcp — local-first codebase context retrieval | `use retrieval` |
| `router-lite-mcp` | Companion skill for router-lite-mcp — deterministic trigger/skip classifier for MCP selection | `use router lite` |

### Skill categories

**Engineering patterns (7):** agent-mvp-blueprint, handoff, overnight-task-queue, restricted-tool-subagent, json-feature-ledger, close-task, improve-codebase-architecture

**MCP companions (3):** context-prep, retrieval, router-lite-mcp — companion skills for the MCPs in [mcp-token-savers](https://github.com/g-shevchenko/mcp-token-savers). Useful for agents that use skills (Devin, Codex) rather than direct MCP integration.

## Compatibility

| Agent | Support | Install path |
|---|---|---|
| Claude Code | ✅ | `$HOME/.claude/skills` |
| OpenAI Codex | ✅ | `$HOME/.codex/skills` (default) |
| Cursor | ✅ | `$HOME/.cursor/skills` |
| Windsurf | ✅ | `$HOME/.codeium/windsurf/skills` |
| Devin | ✅ | via skill invocation |
| Gemini CLI | ✅ | via skill invocation |
| Antigravity | ✅ | via skill invocation |

Skills follow the [Anthropic Skills open standard](https://github.com/anthropics/skills) (December 2025): each skill is a folder with `SKILL.md` (YAML frontmatter + Markdown instructions), optionally bundled with scripts, references, and assets.

## Composes With

- [agentic-quality-skills](https://github.com/g-shevchenko/agentic-quality-skills) — TDD, quality gates, golden benchmarks, test immutability, PBT
- [mcp-token-savers](https://github.com/g-shevchenko/mcp-token-savers) — 21 local MCP servers (retrieval, context-prep, repo-hygiene, static-analysis, pbt-runner, test-results, and more)
- [utility-skills](https://github.com/g-shevchenko/utility-skills) — Figma, SEO, PDF, YouTube, Zoom, remote Mac, talk decks, n8n

The `improve-codebase-architecture` skill composes with MCPs in mcp-token-savers: `language-graph-mcp`, `repo-hygiene-mcp`, `static-analysis-mcp`, `repo-quality-gate-mcp`, `retrieval-mcp`.

The `json-feature-ledger` skill composes with `test-results-mcp` in mcp-token-savers.

## Install

```bash
# Default (Codex)
bash scripts/install.sh

# Claude Code
bash scripts/install.sh --target "$HOME/.claude/skills"

# Cursor
bash scripts/install.sh --target "$HOME/.cursor/skills"

# Windsurf
bash scripts/install.sh --target "$HOME/.codeium/windsurf/skills"

# Dry run (preview without writing)
bash scripts/install.sh --dry-run
```

The installer:
- Copies skills to the target directory (default: `$HOME/.codex/skills`)
- Optionally writes a managed block to `AGENTS.md` in the current workspace
- Refuses unsafe targets (`/`, `$HOME`, `.`)
- Creates a backup before replacing an existing skill

## Verify Before Install

Clone and inspect first:

```bash
git clone https://github.com/g-shevchenko/agentic-engineering-skills.git
cd agentic-engineering-skills
bash scripts/doctor.sh
bash scripts/audit-public-surface.sh
```

- `doctor.sh` — verifies all skills have required files and frontmatter
- `audit-public-surface.sh` — scans for secrets, private paths, and placeholder markers

See [VERIFY_BEFORE_INSTALL.md](VERIFY_BEFORE_INSTALL.md) and [SECURITY.md](SECURITY.md) for details.

## Repository Structure

```
agentic-engineering-skills/
├── skills/
│   ├── agent-mvp-blueprint/       # 15-section agent harness design
│   ├── handoff/                   # Session/IDE handoff
│   ├── overnight-task-queue/      # Unattended work with checkpoints
│   ├── restricted-tool-subagent/  # Capability separation for subagents
│   ├── json-feature-ledger/       # feature_list.json contract
│   ├── close-task/                # Full closure gates
│   ├── improve-codebase-architecture/  # 6-phase refactor loop
│   ├── context-prep/              # Companion for context-prep-mcp
│   ├── retrieval/                 # Companion for retrieval-mcp
│   └── router-lite-mcp/           # Companion for router-lite-mcp
├── scripts/
│   ├── install.sh                 # Copy skills to target directory
│   ├── doctor.sh                  # Verify repo structure
│   └── audit-public-surface.sh    # Scan for secrets/private markers
├── agent-docs/
│   └── AGENTS.managed-block.md    # Managed block for AGENTS.md
├── LICENSE
├── SECURITY.md
├── VERIFY_BEFORE_INSTALL.md
└── README.md
```

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-skill`)
3. Add your skill under `skills/` with a `SKILL.md` (YAML frontmatter + Markdown)
4. Run `bash scripts/doctor.sh` and `bash scripts/audit-public-surface.sh`
5. Open a pull request

### Skill format

Each skill is a directory with at minimum:

```yaml
---
name: your-skill-name
description: Use when [trigger condition]. [What the skill does].
---
```

Followed by Markdown instructions. Optionally bundled with scripts, references, and eval fixtures.

## License

MIT — see [LICENSE](LICENSE).
