---
name: json-feature-ledger
description: Use when planning multi-session work or multi-feature tasks (>5 acceptance criteria). Creates feature_list.json — Anthropic Labs canonical pattern where each criterion is {passes:false} until verifier flips it with cited evidence. Token-efficient durable contract between proof-loop agents (70-85% verifier→fixer handoff savings). Composes with services/test-results-mcp + task-spec-freezer agent.
---

# JSON Feature Ledger

A durable JSON ledger contract for multi-feature / multi-session work. Replaces ad-hoc markdown evidence files with a structured `feature_list.json` that agents can only mutate per defined rules.

## When to invoke

- Planning a task with >5 acceptance criteria
- Multi-session work where agents will pick up across context boundaries
- Proof-loop pipeline orchestration (composes with `task-spec-freezer.md`)
- When you'd otherwise write the evidence.md + verdict.json + problems.md trio
- Trigger phrases (EN): `feature list`, `json ledger`, `durable contract`, `feature_list.json`, `passes flag`
- Trigger phrases (RU): `json-реестр`, `feature_list`, `леджер фич`

## When NOT to invoke

- Single-AC tasks (overkill)
- Short-lived single-session work
- Documentation-only changes
- Throwaway prototypes

## Schema

```json
{
  "task_id": "kebab-case-task-id",
  "created_at": "2026-05-21T00:00:00.000Z",
  "schema_version": 1,
  "features": [
    {
      "id": "AC1",
      "description": "Acceptance criterion text",
      "evidence_required": ["test passes", "screenshot diff < 1%"],
      "passes": false,
      "passed_at": null,
      "evidence_ref": null,
      "last_attempt_error": null
    }
  ]
}
```

`evidence_required` is optional. All other fields required. The ledger is written to `<rootDir>/.agent/tasks/<task_id>/feature_list.json`.

## Mutation rules

Only `test-results-mcp.mark_pass(task_id, feature_id, evidence_ref)` may flip `passes: false → true`. This enforces:

- **Only verifier role** flips (test-results-mcp is designed to be called by `task-verifier.md` which has read-only `tools: Read, Grep, Glob, Bash`)
- **Every pass cites concrete evidence** (URL / file path / artifact ID)
- **Immutability lock**: re-marking a passed feature throws (caller bug — durable ledger means the value of `passes` is the single source of truth)

Other fields:

- `last_attempt_error`: may be set by fixer on failed attempts (direct file write, or future MCP `mark_failure` tool)
- `description` + `evidence_required` + `id`: immutable after init (use new `task_id` for criterion changes)

See codified rule: `the project rule (see your repo rules)`.

## Why Anthropic Labs canonical

Per "Effective harnesses for long-running agents" (Nov 2025):

> "The model is less likely to inappropriately change or overwrite JSON files compared to Markdown files."

Markdown evidence trails invite agents to "improve" them mid-loop. JSON with explicit schema + mutation rules is structurally harder to corrupt.

## Token economy

Instead of fixer re-reading 5-25 KB markdown each iteration, it calls:
- `list_failing(task_id)` → ~200-800 tokens (compact list of failing IDs)
- `get_feature(task_id, feature_id)` → ~500 tokens (single feature drill-down)

Estimated savings: **70-85% on verifier→fixer handoff** vs current markdown-based pattern.

## Migration from evidence.json

HWAI proof-loop currently uses `.agent/tasks/<TASK_ID>/evidence.json` (ad-hoc schema). Migration path:

1. **New tasks**: spec-freezer emits `feature_list.json` (per `the project rule (see your repo rules)`)
2. **Existing tasks**: `evidence.json` stays as legacy format until task completes
3. **Long-running multi-session tasks**: prefer `feature_list.json` from start (durability matters more)

## Composition

- `test-results-mcp (see mcp-token-savers repo)` — the MCP exposing 4 tools (`init_feature_list`, `mark_pass`, `list_failing`, `get_feature`) operating on this schema
- `task-spec-freezer.md` — emits `feature_list.json` alongside `spec.md`
- `task-implementer.md` — reads ledger via `get_feature`; never mutates
- `task-verifier.md` — flips passes with `mark_pass` (read-only tools enforce that this is the ONLY mutation path)
- `task-fixer.md` — reads `list_failing` + `get_feature` for drill-down

## Sample workflow

```
1. task-spec-freezer creates feature_list.json with N criteria, all passes:false
2. task-test-author writes failing tests, verifies red
3. task-implementer reads ledger via get_feature(AC1), implements, runs tests
4. task-verifier runs verification in fresh context, calls mark_pass(AC1, evidence_ref)
5. proof-loop checks if all features pass; if not, calls task-fixer
6. task-fixer calls list_failing → returns [{id: 'AC2', description: '...', last_attempt_error: null}]
7. task-fixer calls get_feature(AC2), applies smallest fix
8. task-verifier re-verifies; mark_pass(AC2) if proven
9. Loop until all features.passes === true OR 3 fix cycles exhausted
```

## Sources

- Anthropic Labs canonical: "Effective harnesses for long-running agents" (Nov 2025)
- HWAI research SSOT: `TDD research notes` § Diamond #4
- HWAI adoption plan: `TDD gap analysis notes` § Bucket 2.6
- Codified rule: `the project rule (see your repo rules)`
- Companion MCP: `test-results-mcp (see mcp-token-savers repo)` (PR #856 + public PR #45-#46)
