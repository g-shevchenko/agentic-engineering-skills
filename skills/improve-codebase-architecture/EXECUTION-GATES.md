# Execution gates — HWAI safety contract

Phase 4 modifies the codebase. Every refactor commit passes through **8 gates in order**. If any gate fails, the refactor is reverted and the skill emits a structured blocker report. **No gate is optional in v0.1.**

This is the HWAI-specific extension to Pocock's algorithm — Pocock stops at design conversation. We add an executable, measurable, reversible commit loop.

---

## Gate 1 — Branch isolation

Per the project branching rules (parallel workflow):

- Each refactor: dedicated branch `claude/improve/<scope>-<refactor-name>-<step-n>`
- Parent branch for the whole run: `claude/improve/<scope>-<ts>` if multi-refactor
- NEVER work on `main` directly
- NEVER reuse a branch from a previous run

**Verify before proceeding:**
```bash
test "$(git branch --show-current)" != "main" || { echo "GATE 1 FAIL"; exit 1; }
git status --porcelain | grep -v '^??' && { echo "GATE 1 FAIL: dirty"; exit 1; } || true
```

---

## Gate 2 — TDD red-checkpoint

Per `the project rule (see your repo rules)` (Iron Law: no production code without a failing test first).

**Two cases:**

### Case A — characterization tests (preserve behavior)

The refactor must NOT change observable behavior. Write tests that:
1. Capture current behavior at the module's interface
2. Pass on `main` (no refactor)
3. Continue to pass on `HEAD` (after refactor)

These tests are the **safety net**. They guard the contract.

```bash
# On a clean branch BEFORE any source edit:
# 1. Author tests using task-test-author agent
# 2. Run them — must PASS (current behavior is the spec)
# 3. Commit:  "test: characterization tests for <module>"
# 4. Now and only now, begin the refactor
```

### Case B — new behavior added by refactor

The refactor introduces capability not currently tested. Follow standard red-first:

1. `task-test-author` writes failing test
2. Runs it — must FAIL with the EXPECTED assertion (not import-error / syntax-error)
3. Pastes failing output verbatim into `.agent/tasks/<TASK_ID>/verify_red.md`
4. Only then `task-implementer` writes the implementation

The PreToolUse hook `hooks/tdd-edit-guard.sh` enforces this — edits to `src/**` / `services/**/src/**` are blocked when no newer-mtime failing test exists for the target stem.

**Exception (must be declared explicitly):**

```
Exception per the project rule (see your repo rules) § Exceptions — pure refactor (no behavior change, existing tests guard).
```

For pure-refactor (Case A), the characterization-test commit IS the verify-red proof.

---

## Gate 3 — Pre-refactor quality snapshot

Mandatory baseline. Aborts if snapshot fails.

```
mcp__repo_quality_gate__create_quality_snapshot({
  root: <refactor-scope>,
  label: "pre-<refactor-name>-<step-n>"
})
```

Snapshot captures: new-code budgets, complexity hotspots count, cycles count, dead-export count, file count.

If snapshot returns `scan_truncated: true`, **abort**. Truncated snapshots are useless for after-comparison. Narrow the scope and retry.

---

## Gate 4 — Apply refactor (the only edit step)

Tools allowed in Gate 4 (and ONLY in Gate 4):

- `Edit`, `Write` for direct file edits
- `Bash` for AST-mechanical transforms: `ts-morph`, `jscodeshift`, `ast-grep`, `comby`, `prettier --write`, `eslint --fix`
- `Bash` for `git mv` / `git rm` for moves/deletes
- **Never** edits to test files during this commit (immutability lock — Gates 4 and 2 are different commits)

After Gate 4 edits:

```bash
git status --porcelain | grep '\.test\.\|spec\.\|__tests__'
# If output non-empty → ABORT, undo, redo without touching tests
```

---

## Gate 5 — Static analysis (TSC + ESLint + Semgrep)

All must pass before continuing. Use `static-analysis-mcp`:

```
mcp__static_analysis__get_command_policy({ root: <scope>, preset: "ci-lite" })
mcp__static_analysis__run_tsc({ root: <scope> })           # must be clean
mcp__static_analysis__run_eslint({ root: <scope> })        # must be clean
mcp__static_analysis__run_semgrep_local({ root: <scope> }) # opt-in, but no NEW high-severity
```

If TSC introduces new errors compared to pre-refactor baseline → ABORT.
If ESLint introduces new errors → ABORT.
If Semgrep introduces new high-severity finding → ABORT.

---

## Gate 6 — Test execution (changed-tests-only)

```
mcp__static_analysis__run_tests_changed({ root: <scope>, base_ref: "main" })
```

- Pass rate must be ≥ pre-refactor pass rate
- For characterization tests: ALL must pass (they were green before — they must be green after)
- For new-behavior tests: the failing red test from Gate 2 must now pass; all others unaffected

If any test that was passing on `main` is now failing → ABORT, the refactor changed behavior unexpectedly.

---

## Gate 7 — Post-refactor snapshot + delta check

```
mcp__repo_quality_gate__create_quality_snapshot({
  root: <scope>,
  label: "post-<refactor-name>-<step-n>"
})
mcp__repo_quality_gate__compare_quality_snapshot({
  before: "pre-<refactor-name>-<step-n>",
  after: "post-<refactor-name>-<step-n>"
})
```

The delta must show at least ONE of:

- Interface lines-of-code ↓ (proper deepening)
- Caller imports of internals ↓ (encapsulation improved)
- Cycle count ↓ (decomplecting worked)
- Dead-export count ↓ (consolidation)
- Cyclomatic complexity of interface ↓

AND NONE of:

- Test-coverage of public interface ↓
- New-code budget ↑ by more than expected refactor size
- Blast radius (`mcp__language_graph__get_blast_radius`) ↑

If both directions violated, this refactor is the WRONG one. Revert.

If signal is genuinely flat (no Δ either way), the refactor was theater. Revert.

Per `the project rule (see your repo rules)`: "if metric is flat or degrades → DO NOT DEPLOY. Iterate or roll back."

---

## Gate 8 — Critic pass (independent review)

Before commit, dispatch a critic. Two options:

### Option A — codex review (preferred — independent model)

```
skills/codex/SKILL.md → codex review mode
```

Run on the diff. Codex returns pass/fail with specific findings.

### Option B — requesting-code-review

```
skills/requesting-code-review/SKILL.md
```

Dispatched to a fresh subagent ("code-reviewer") that sees ONLY the diff + interface, not the prior conversation. Looks for: edge cases, race conditions, consistency with codebase patterns, security issues, missing error handling, hidden complecting that the refactor moved instead of removing.

**Block on P0 / P1 findings.** Address them, redo Gates 4-7, then retry Gate 8.

P2 / P3 findings: note in PR description, do not block.

---

## Gate 9 — Commit + PR (no auto-merge in v0.1)

```bash
git add <specific files>   # NEVER -A or .
git commit -m "$(cat <<'EOF'
refactor: <descriptive>

<2-3 sentence description of the deepening>

Before: <interface shape>
After: <interface shape>
Snapshot Δ: <key numbers>

Phase 4 step <n>/<total> of improve-architecture run <ts>.
EOF
)"
git push --set-upstream origin <branch>
gh pr create --title "..." --body "..." --label needs-greg-review
```

PR body MUST include:

- Refactor name + which improve-run it belongs to (`.agent/improve-runs/<ts>/`)
- Before/After interface
- Snapshot delta table
- Critic findings (resolved + remaining)
- Test evidence (pass count before/after)
- Affected callers list (from `get_blast_radius`)
- Link to the design spec (`.agent/improve-runs/<ts>/phase3-design.md`)

**No auto-merge.** Greg reviews + merges.

---

## Abort handling

If any gate fails:

1. **Restore working tree** to pre-Gate-4 state:
   ```bash
   git restore --source=HEAD~1 -- <files-touched-in-gate-4>
   # OR if not yet committed:
   git restore -- <files-touched>
   ```
2. **Append the failure** to `.agent/improve-runs/<ts>/phase4-aborts.json`:
   ```json
   {"refactor_name": "...", "gate": <n>, "reason": "...", "evidence_path": "..."}
   ```
3. **Skip remaining refactors in this design** — do NOT proceed to next step.
   The whole design sequence is suspect if one step failed.
4. **Report to Greg** with the abort reason and ask: (a) revise the design, (b) skip this refactor and continue, (c) stop the run.

Per `the project rule (see your repo rules)`: this is a Greg decision (the failure changes the design's risk profile).

---

## Telemetry

Every gate logs to `.agent/improve-runs/<ts>/gates.jsonl`:

```jsonl
{"ts":"...","refactor":"...","step":<n>,"gate":<n>,"status":"pass"|"fail"|"skip","duration_ms":<n>,"evidence":"..."}
```

This is the audit trail. Greg can replay any run.

---

## What's deliberately NOT in v0.1

These are **future versions**, not v0.1 omissions:

- **Auto-merge mode** (v0.2 — after 4 weeks of dogfood data showing critic catch rate is high enough)
- **Cross-refactor coordination** (multi-step PRs that depend on each other — for v0.2)
- **Generated migration scripts** for breaking-change refactors (v0.2)
- **Risk-weighted blast radius prediction** (needs ML, defer to v0.3)
- **Self-improvement** — skill rewriting its own SKILL.md per Self-Improving Coding Agent paper (v0.3+)

v0.1 ships the **safe, conservative, gate-heavy** version. Tighten only after measurement justifies it.
