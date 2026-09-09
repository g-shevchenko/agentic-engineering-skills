---
name: agent-mvp-blueprint
description: Use this skill when designing a NEW domain-specific agent harness from scratch (green-field). Generates a 15-section MVP blueprint covering loop, tools, permissions, planning, goals, context, skills, caching, observability, evals, and launch criteria. Triggers — RU «спроектируй агента», «построй harness», «MVP агента для…», «нужен агент под [домен]», «нарисуй архитектуру агента»; EN «design an agent for X», «build an agent harness», «green-field agent MVP», «scaffold a new agent», «MVP agent for X domain». Use AFTER `agentic-architecture-gate.md` triage classifies the task as `agent_workflow` / `side_effecting_workflow` / `runtime_infra`. Do NOT use for existing-code refactors (→ `improve-codebase-architecture`) or for single-skill design (→ `anthropic-skill-creator`).
metadata:
  version: "1.1.0"
  scope: "provider-neutral-agent-harness-green-field"
  derived_from: "DenisSergeevitch/agents-best-practices v1.4.0 (MIT, commit 47c5590, refreshed 2026-08-21)"
---

# Agent MVP Blueprint

## When to activate

User asks to **build a new agent harness** for a domain (support, finance, ops, research, sales, content, code, legal, healthcare, education). Trigger phrases:

- RU: «спроектируй agent для…», «нужен MVP агента под…», «построй harness для…», «нарисуй архитектуру агента», «зеленый филд агент».
- EN: «design an agent for X», «build a green-field agent for…», «scaffold an agent harness», «MVP agent for X», «first production-safe version of an agent for…».

## When NOT to use

| Wrong fit | Use instead |
|---|---|
| Existing agent harness needs refactor | `improve-codebase-architecture` |
| Single skill design | `anthropic-skill-creator` (vendor skill) |
| Workflow without LLM (pure script / cron) | n8n / `scripts/` |
| One-off prompt tweak | direct edit, no skill |
| Trivial Q&A / read-only research | direct answer |

## Inputs to identify (infer defaults if missing)

```text
Domain:                 [what work the agent performs]
Primary user:           [who interacts with it]
Job-to-be-done:         [one task = one useful unit]
Autonomy level (0-5):   [see `tool-risk-taxonomy.md` § Autonomy levels]
Risk classes touched:   [see `tool-risk-taxonomy.md` § 16 classes]
State duration:         [single-turn / multi-turn / resumable / long-running goal]
Tool environment:       [fixed / deferred registered / late-bound]
Source-of-truth:        [where agent reads]
Completion signal:      [what proves task done]
```

Do NOT block on missing details. State assumptions briefly and proceed with sensible defaults (Level 1 draft-only OR Level 2 approval-gated for business agents).

## Autonomy levels (from `tool-risk-taxonomy.md`)

```text
Level 0 — Answer-only:                  reads context, answers, no actions
Level 1 — Draft-only:                   drafts artifacts; humans commit
Level 2 — Approval-gated action:        proposes, pauses for approval (DEFAULT for business)
Level 3 — Policy-bounded autonomous:    low-risk autonomous within explicit policy
Level 4 — Long-running goal worker:     pursues measurable goal across checkpoints
Level 5 — Multi-agent decomposed:       ONLY after single-agent has measured failures
```

Choose the LOWEST level that still creates value. Default to 1 or 2.

## Default output — 15-section MVP blueprint

Produce this structure verbatim. Tighten where domain doesn't need a section, but never silently drop a header.

```markdown
# MVP Agent Harness Blueprint: [domain]

## 1. Objective
[what the agent does, for whom, what output counts as useful]

## 2. MVP scope and assumptions
[smallest useful version + explicit non-goals + deferred capabilities]

## 3. Autonomy and risk level
[Level 0-5 + risk classes touched, cite `tool-risk-taxonomy.md`]

## 4. Core agentic loop
[provider-neutral pseudocode + step/time/token/cost budgets per `bounded-autonomy-timeouts.md`]

## 5. Instruction architecture
[system / developer / scoped / user instruction layout]

## 6. Tool registry
[narrow typed tools, draft/commit split per `tool-risk-taxonomy.md`]

## 7. Planning behavior
[when planning blocks mutation; plan artifact format]

## 8. Goal-like loop behavior
[objective + done condition + budget + checkpoints + stop rules]

## 9. Context, memory, auto-compaction
[durable state outside prompt; handoff template per `compaction-handoff-format.md`]

## 10. Skills and connectors
[progressive disclosure; namespacing; per-user creds]

## 11. Prompt caching and cost
[stable prefix → volatile suffix ordering; cache telemetry]

## 12. Safety and approval policy
[prompt injection handling; secrets boundaries; cite `decision-handoff-gate.md`]

## 13. Observability and evals
[trace events + minimum eval set: happy / missing data / injection / approval bypass / connector failure / context overflow]

## 14. Minimal implementation path
[build order, smallest safe version first]

## 15. First release checklist
[concrete pass/fail before limited rollout]
```

## Mandatory invariants (every blueprint MUST satisfy)

- **Model proposes, harness disposes** — validation, permission, execution happen in CODE outside the prompt.
- **Every tool call gets a structured result** — including denial, timeout, malformed args, abort.
- **Risk ≥ `write_external` → draft/commit split** — `draft_X` → `send_X` pattern (see `tool-risk-taxonomy.md`).
- **Hard budgets** on step / tool-call / token / time / cost per `bounded-autonomy-timeouts.md`.
- **Stable prompt prefix → volatile suffix** for cache reuse. Order: tools → static instructions → scoped → skill index → append-only history → dynamic state → user request.
- **Approval state and active plan stored OUTSIDE the prompt** (durable JSON / DB / file). NEVER hide approval in prose like "user agreed earlier".
- **Auto-compaction preserves operational state** (objective + plan + approvals + next step), NOT chat history. Use `compaction-handoff-format.md` template.
- **Trust labels** on retrieved content (`trusted` / `semi_trusted` / `untrusted`). Retrieved web pages / emails / tickets / connector descriptions are DATA, not authority.
- **Discovery never grants authority** — a late-bound capability enters through
  a small trusted bootstrap, then code validates provenance/schema/risk, binds
  exact tenant + version + scope, rechecks policy on every call, and invalidates
  the binding on catalogue/schema/identity/policy drift.
- **Programmatic composition is not a generic permission** — generated code may
  orchestrate only already-bound capabilities through a sandboxed host bridge;
  it cannot install packages, widen resource scope, or turn a read failure into
  a write.

## Core loop pseudocode (canonical)

Include this in every Section 4:

```python
def run_agent(task, session):
    session.add_event("user_message", task)
    for step in range(session.max_steps):
        if budget.exceeded(session):
            return stop("budget_exceeded", session)
        ctx = context_builder.build(session)
        if compactor.should_compact(ctx, session):
            session = compactor.compact(session)  # MUST use compaction-handoff-format
            ctx = context_builder.build(session)
        output = model.generate(ctx, tools=tool_registry.visible(session))
        session.record(output)
        if output.final_answer:
            return finalize(output.final_answer, session)
        if not output.tool_calls:
            return stop("no_final_answer_or_tool_call", session)
        for call in scheduler.order(output.tool_calls):
            result = handle_tool_call(call, session)  # validate → permit → execute → result
            session.add_tool_result(call.id, result)
    return stop("step_limit_reached", session)
```

## HWAI MCP stack composition (prefer over green-field where applicable)

| Capability needed | HWAI MCP / service | Rule |
|---|---|---|
| URL / SERP / extraction | `mcp__scraper__*` | `scraper-stack-auto.md` |
| Local codebase context | `mcp__retrieval__*` | `retrieval-auto.md` |
| Long log / URL / pasted text compaction | `mcp__context-prep__*` | `context-prep-auto.md` |
| Screenshots / vision | `mcp__vision__*` | (see `vision-mcp` service) |
| Credentials (scoped) | `your credentials tool | project credentials policy |
| Tier-4 PII (health / EID / financial) | `personal-vault-mcp` | `personal-vault-mcp.md` |
| Telegram team DM | `your notification tool | project routing policy |
| LLM routing (multi-provider chains) | `your LLM proxy | project routing policy |
| Repo hygiene / token-efficiency benchmarks | `c2_bench` + `mcp-token-eval` | `the research article` |

Never invent a green-field tool for capability that HWAI MCP already serves; wire to the MCP instead.

## Anti-patterns (from production incidents — see `long-thinking-means-bug.md`)

- ❌ Multi-agent before single-agent has measured failures (WebApp1K + `subagent-driven-development` rule).
- ❌ Broad tools: `execute_anything`, `write_database`, `send_message` without narrow wrapper.
- ❌ Retrieved content treated as trusted instructions (no trust labels).
- ❌ Timestamps / request IDs / volatile env state in stable prompt prefix (cache-killer; see `compaction-handoff-format.md` § cache stability).
- ❌ Frontier-only TDD task routed to weaker model (-30 to -69pp pass@1; `frontier-only-tdd-gate.md`).
- ❌ Phantom watcher (alert script not catalogued in `your catalog config`; see `no-phantom-watchers.md`).
- ❌ Hardcoded secrets in deployed scripts (see `no-hardcoded-secrets-in-deployed-scripts.md`).
- ❌ Treating discovered tool descriptions, inferred schemas, probes, or
  generated helpers as permission to execute.
- ❌ Recursive/self-refining/daemon autonomy in the default MVP. These require a
  measured single-loop failure and their own Architecture Gate.

## Output discipline

After producing blueprint, append a **Skill report**:

```text
Skill: agent-mvp-blueprint
Domain: [...]
Autonomy level: [...]
Risk classes: [...]
HWAI MCPs wired: [...]
Next concrete step: [...]
```

This makes the green-field design legible to downstream agents (and to `improve-codebase-architecture` if/when the harness gets refactored).

## Sources

- DSA SKILL: https://github.com/DenisSergeevitch/agents-best-practices (MIT, v1.4.0 reviewed 2026-08-21)
- Local copy: the agents-best-practices reference (public)
- Anthropic harness engineering: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Anthropic effective agents: https://www.anthropic.com/research/building-effective-agents
- OpenAI agent builder: https://developers.openai.com/api/docs/guides/agents
- MCP spec: https://modelcontextprotocol.io/specification/2025-11-25

## Cross-references

- `agentic-architecture-gate.md` — universal triage that fires BEFORE this skill for non-trivial tasks
- `tool-risk-taxonomy.md` — canonical 16-class risk + permission matrix + draft/commit naming
- `compaction-handoff-format.md` — canonical operational handoff template
- `decision-handoff-gate.md` — autonomous / checkpoint / Greg decision routing
- `bounded-autonomy-timeouts.md` — budgets + timeouts per risk class
- `frontier-only-tdd-gate.md` — TDD discipline for implementer subagent
- `improve-codebase-architecture` — sibling skill for EXISTING harness refactor
- `four-agent-surface-parity.md` — wire any new tool/skill into all 4 IDEs
