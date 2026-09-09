---
name: handoff
description: "Create or refresh a compact operational handoff for Claude Code, Codex, Cursor, Windsurf, or another fresh agent/session. Use when Greg says handoff, continue in another chat/session, prepare context for next session, передай задачу, resume later, compact this session, or when a long task crosses plan/execute/verify/ship boundaries. Composes with compaction-handoff-format, context-prep, retrieval, mcp-stack-moat-guard, and four-agent-surface-parity."
---

# HWAI Handoff

Use this as a thin wrapper over `the project rule (see your repo rules)`.
The handoff is operational state for the next agent, not a chat summary.

## Quick Decision

- Same thread and short status update: answer normally; do not create a handoff.
- New session, another agent, cross-device work, context approaching limits, or a major milestone: create a handoff.
- Long logs/specs/URLs are inputs to compact first with `context-prep`; reference the artifact instead of pasting the body.
- Broad repo uncertainty: use `retrieval` first, then cite exact paths read.

## Destination

Choose the narrowest durable target:

1. Temporary/private handoff by default: save outside the repo when the user only needs to paste into another session.
2. Repo handoff only when it is project state that future sessions should inherit.
3. Public-bound MCP/token-economy material: do not include private HWAI moat details. Apply `the project rule (see your repo rules)`.

For repo handoffs, prefer a focused path such as `notes/<topic>_handoff_<date>.md` or an existing task/methods directory. Do not create `HANDOFF.md` in the repo root unless Greg asks for that exact file.

## Format

Use the canonical `# Compaction Handoff` template from `the project rule (see your repo rules)`.
Always include these extra fields when useful:

- `First action`: the single next command/read/edit the fresh agent should do.
- `Suggested skills`: exact skills/rules to invoke, with paths.
- `Files in progress`: path plus state: `editing`, `needs_review`, `partially_done`, or `ready`.
- `Public/private boundary`: required when MCP stack, scraper, gateway, ContentOS, token-economy article, or public repo publishing is involved.

## Quality Bar

A fresh agent with no chat history should be able to make real progress within 5 minutes.

Rules:

- Distill, do not copy conversation noise.
- Reference existing PRDs, plans, ADRs, commits, diffs, artifacts, and issue URLs by path/URL.
- Preserve exact user constraints, approval state, IDs, numbers, paths, dates, and blockers.
- Record what failed or should not be retried.
- Redact secrets, credentials, tokens, raw email bodies, private customer data, and PII.
- If refreshing an existing same-topic handoff, read it first, then rewrite from scratch; do not append stale context.

## Evaluation

This skill is gated by `skills/handoff/_evals/`:

- `trigger_activation.json` checks the RU/EN handoff triggers and non-triggers.
- `output_quality.json` checks first action, suggested skills, files in progress, exact constraints, and public/private boundary.
- `terminal_bench.mjs` is the deterministic pre-score: good handoff artifacts must pass, summary-only or moat-leaking handoffs must fail.

Run:

```bash
node skill_eval.mjs --skill handoff --mock --no-trend-log
node skills/handoff/_evals/terminal_bench.mjs
```

Before promoting the skill for high-traffic use, run the real judge through the repo skill-eval gateway when available.

## Claude Code With Large Context

A larger context window reduces handoff frequency; it does not remove the need.
Create handoffs at clean boundaries and when prompt-cache stability, cross-session continuity, or multi-agent transfer matters.

For MCP token economy work, mention handoff as a cache-stability/context-discipline practice in articles, but keep tuned internal orchestration and measured moat details private unless Greg explicitly overrides the public boundary.
