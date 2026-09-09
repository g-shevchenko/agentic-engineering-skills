# Algorithm — 6-phase contract

Each phase has explicit inputs, primitives called, outputs, and a Greg-checkpoint marker. **Phases 1-3 are read-only and safe to run autonomously. Phases 4-6 modify the codebase and require gate clearance.**

---

## Phase 1 — Explore (read-only, subagent-isolated)

### Inputs
- Target scope (single module subtree by default, repo root only when Greg explicitly asks)
- project conventions file
- `CONTEXT.md` if exists — domain glossary
- `docs/adr/*.md` if exists — existing architectural decisions (**do not re-litigate**)
- `README.md`, top-level `package.json` / `pyproject.toml`

### Primitives called (parallel where safe)

```
mcp__language_graph__index_repo({ root: <scope> })
mcp__language_graph__get_graph_status()    # confirm fresh
mcp__repo_hygiene__scan_complexity_hotspots({ root: <scope>, top_n: 30 })
mcp__repo_hygiene__scan_duplicate_code({ root: <scope> })
mcp__repo_hygiene__scan_dependency_cycles({ root: <scope> })
mcp__repo_hygiene__scan_unused_code({ root: <scope> })
mcp__repo_quality_gate__create_quality_snapshot({ root: <scope>, label: "improve-baseline-<ts>" })
```

### Subagent dispatch (separate context)

```
Agent({
  subagent_type: "Explore",
  description: "Improve-arch Phase 1 walk",
  prompt: """
    You are walking <scope> for architectural friction. Your job is to
    find suspect shallow modules and complecting hotspots — NOT to
    propose refactors.

    Read CONTEXT.md and docs/adr/*.md first. Use the project's exact
    vocabulary.

    For each suspect, apply the deletion test from LANGUAGE.md:
    "If this module were deleted, does complexity vanish (= shallow)
    or reappear across N callers (= keeper)?"

    Look specifically for:
    1. Shallow modules — interface and implementation nearly the same size
    2. Complecting — config+logic, IO+computation, validation+persistence
    3. Pure functions extracted only for testability (often shallow)
    4. Tightly-coupled leakage — modules that "know about each other"
    5. Untested / hard-to-test through current interface
    6. Modules that appear in N callers' import lists but contribute < 1 line of logic per caller

    Return JSON list of friction points:
    [{
      "files": ["a.ts", "b.ts"],
      "kind": "shallow" | "complecting" | "leakage" | "untested" | "passthrough",
      "deletion_test": "vanishes" | "reappears_in_N_callers" | "ambiguous",
      "callers_count": int,
      "blast_radius_estimate": int,
      "notes": "<vocab-correct one-paragraph explanation>"
    }]

    DO NOT propose refactors. DO NOT write any files. Read-only walk.
  """
})
```

### Output

`.agent/improve-runs/<ts>/phase1-friction.json` — structured candidate list.

### Greg checkpoint

None. Phase 1 is autonomous research.

---

## Phase 2 — Present candidates (LLM judgment + HTML report)

### Inputs

- `.agent/improve-runs/<ts>/phase1-friction.json`
- Per-candidate `get_blast_radius` calls to firm up the estimate

### Reasoning

In main session (NOT subagent — this is the load-bearing taste judgment), for each candidate:

1. Verify deletion test interpretation matches what the data actually shows.
2. **DRY-vs-deepening gate** (precision) — for every duplication / "consolidate" / "extract helper" friction item, apply the *DRY is not deepening* test in [LANGUAGE.md](LANGUAGE.md): imagine the helper you'd extract; if it would itself be **shallow** (interface ≈ implementation, ≤ ~10 lines of mechanical plumbing — e.g. a `fetch` wrapper, a lazy-init, a header builder), it is DRY-only — **drop it or mark it `Speculative` at most, NEVER `Strong`/`Worth exploring`**. Deepening requires the extracted module to be *deep*. (This guard exists because the 2026-05-21 unbiased reader-mcp smoke over-flagged a thin `postScraperCore` wrapper as Worth-exploring; see ADR-0003.)
3. **Config-at-edge gate** (precision) — module-top env/config reads (`X = os.environ.get(...)` before any business logic) are config-at-edge = CORRECT. **Drop** any "this leaks hidden inputs / move config to call-time params" item — that's a design-philosophy swap, not deepening. Only keep config items where the read is *interleaved with business logic* (mid-computation / re-read per call). (From the 2026-05-21 exporter recall run; see ADR-0005 + [LANGUAGE.md](LANGUAGE.md) § Config-at-edge.)
4. Promote, demote, or merge the surviving friction items into **deepening opportunities**.
5. For each opportunity, write the card content per [REPORT-FORMAT.md](REPORT-FORMAT.md):
   - Files involved
   - Approx line range — REQUIRED in `phase2-candidates.json` as `lines_approx: [start, end]` so the eval harness matches candidate↔expected/avoidance by file **and line**, not file-path only (v0.2 runner)
   - Problem (in domain vocabulary from CONTEXT.md)
   - Solution (plain English; usually "functional core + imperative shell", "extract adapter at seam", "consolidate N shallow modules into 1 deep module", "introduce parameter object", "move complecting to edge")
   - Benefits (stated in **locality** and **leverage** terms)
   - Before/After Mermaid diagram
   - Recommendation strength: `Strong` / `Worth exploring` / `Speculative`
   - Blast radius (from `get_blast_radius`)
   - Estimated effort: small / medium / large
   - Risk (cite test coverage of affected modules)

6. Rank candidates. Identify Top Recommendation (the one to tackle first).

### Output

`$TMPDIR/architecture-review-<ts>.html` — self-contained, Tailwind CDN + Mermaid CDN, opens in browser. See [REPORT-FORMAT.md](REPORT-FORMAT.md) for scaffold.

Plus `.agent/improve-runs/<ts>/phase2-candidates.json` — machine-readable for Phase 3+.

### Greg checkpoint ⚠️ DECISION-HANDOFF-GATE

Per `the project rule (see your repo rules)`: this is a one-way-door choice. **Do NOT auto-pick.** End the phase with exactly:

```
Architecture review ready: <html path>

Top recommendation: <name> (Strong)
Alternatives: <name2> (Worth exploring), <name3> (Worth exploring)

Which to explore next? Reply with the candidate name, or "none" to stop.
```

Wait for Greg's reply before Phase 3.

---

## Phase 3 — Design It Twice (3 parallel subagents)

### Inputs

- Chosen candidate from Phase 2
- Phase 1 data for that candidate (files, blast radius, callers)

### Frame the problem (main session, 1 page)

Write `.agent/improve-runs/<ts>/phase3-brief.md`:

- Problem in 2-3 sentences
- Constraints (what cannot change: public API, on-disk format, perf SLA)
- Dependencies (modules this one calls; modules that call this)
- Illustrative current-shape code sketch (3-10 LOC)
- Success criteria (what does "deep" look like for this case?)

### Dispatch 3 parallel design subagents

Per `skills/dispatching-parallel-agents/SKILL.md`. Send all three in the same message.

```
Agent A — Minimalist:
  "Propose the interface with 1-3 entry points. Optimize for the
   common case. Reject configuration parameters that aren't load-bearing."

Agent B — Maximally flexible:
  "Propose an interface that supports the current callers AND 2 plausible
   future callers. Use ports & adapters. Make the seam real."

Agent C — Common-caller-optimized:
  "Look at the call sites. Propose the interface that makes the most
   common call site smallest. Accept asymmetry for uncommon callers."
```

Each agent returns:
```json
{
  "name": "minimalist" | "flexible" | "caller-optimized",
  "interface_spec": "...",     // types + methods + ordering
  "example_usage": "...",      // 2-3 callers
  "implementation_sketch": "...",
  "dependency_strategy": "...",
  "depth_estimate": int,       // qualitative 1-5
  "locality_estimate": int,
  "tradeoffs": ["..."]
}
```

### Compare + recommend (main session)

Score each by:
- Depth (interface leverage)
- Locality (change concentration)
- Seam placement (is the seam real or hypothetical?)
- Test surface clarity

**Give one opinionated recommendation + one alternative.** Per Pocock's INTERFACE-DESIGN.md: "a strong read, not a menu."

### Output

`.agent/improve-runs/<ts>/phase3-design.md` — final interface spec for chosen design, plus rationale.

### Greg checkpoint ⚠️ DECISION-HANDOFF-GATE

End phase with:

```
Three designs explored: <path>

Recommended: <name> — <one-sentence reason>
Alternative: <name> — <one-sentence reason>
Why not <rejected name>: <one-sentence reason>

Proceed with <recommended>? (yes / use alternative / refine / stop)
```

Wait for Greg.

---

## Phase 4 — Execute (atomic refactorings, gated)

**See [EXECUTION-GATES.md](EXECUTION-GATES.md) for full safety contract.**

### Inputs

- `.agent/improve-runs/<ts>/phase3-design.md`
- Greg's go-ahead

### Per-refactor loop (one atomic Fowler refactoring per iteration)

For each step in the design sequence:

1. **Branch**: `git checkout -b claude/improve/<scope>-<refactor-name>-<n>` (or sub-branch off the parent improve branch)
2. **TDD red-checkpoint** per `the project rule (see your repo rules)`:
   - For **characterization tests** (preserve existing behavior): write tests that pass on `main` and on `HEAD`. These guard the contract.
   - For **new behavior** added by the refactor: failing test first, capture `verify_red.md`, then implement.
3. **Pre-snapshot**: `mcp__repo_quality_gate__create_quality_snapshot({ label: "pre-<refactor-name>" })`
4. **Apply refactor**: Edit/Write. For mechanical transforms (rename, move, extract function), prefer `ts-morph` / `jscodeshift` / `ast-grep` via Bash over manual editing.
5. **Verify** (all must pass):
   ```
   mcp__static_analysis__run_tsc({ ... })
   mcp__static_analysis__run_eslint({ ... })
   mcp__static_analysis__run_tests_changed({ ... })
   mcp__repo_quality_gate__compare_quality_snapshot({ before: "pre-...", after: "post-..." })
   ```
   - All static checks green
   - Test pass rate unchanged or better
   - Snapshot diff shows: interface complexity ↓ OR implementation complexity stable AND caller dependencies on internals ↓
6. **Critic pass** — dispatch `codex` review skill (or `requesting-code-review` agent) on the diff. Block on issues flagged P0/P1.
7. **Commit + push** with descriptive message. NEVER `git add -A`.
8. **Open PR** (per `git-ship.sh` / `gh pr create`).
9. **DO NOT AUTO-MERGE in v0.1.** Tag the PR with `needs-greg-review` label.

### Output

PRs opened, evidence at `.agent/improve-runs/<ts>/phase4-prs.json`:
```json
[{
  "refactor_name": "...",
  "pr_url": "...",
  "diff_stats": {...},
  "tests_passed": true,
  "tsc_passed": true,
  "snapshot_delta": {...},
  "critic_findings": []
}]
```

### Greg checkpoint

PR review (out-of-band). Skill stops here; Greg merges manually.

---

## Phase 5 — Document (after PR merges)

When Greg confirms PR merged (or skill detects it via `gh pr view --json state`):

### Side effects

1. **CONTEXT.md update** — if the deepening introduced new domain vocabulary (a "Refresh Window", a "Quiescence Period"), add the term + 1-sentence definition. Lazy file creation: write `CONTEXT.md` if it doesn't exist yet.
2. **ADR write** — `docs/adr/NNNN-<slug>.md` per Nygard format. Captures the decision + alternatives rejected + consequences. Lazy creation of `docs/adr/` if it doesn't exist.
3. **Module README refresh** — the deepened module's own README/docstring describes the (now-deep) interface in callers' terms.

### Output

Commits to main: CONTEXT.md, docs/adr/, module README.

---

## Phase 6 — Measure (closes the loop)

### After-snapshot

```
mcp__repo_quality_gate__create_quality_snapshot({ label: "improve-after-<ts>" })
mcp__repo_quality_gate__compare_quality_snapshot({
  before: "improve-baseline-<ts>",
  after: "improve-after-<ts>"
})
```

### Deterministic depth delta (per touched module)

Do NOT hand-type `depth_ratio_delta`. Compute it with the deep-module scorer
(see [MEASUREMENT.md](MEASUREMENT.md)) on the pre- and post-refactor source of
each module the refactor touched.

**Preferred** (when `repo-hygiene-mcp` is available):

```
mcp__repo_hygiene__score_module_depth({ path: "<module-after>", compare_to: "<module-before>", repo_root: "<root>" })
```

**Fallback** (always works — `repo-hygiene-mcp` is a local-stdio utility MCP not
yet IDE-registered, so this is the in-session path today):

```
node skills/improve-codebase-architecture/_evals/module_depth.mjs \
  --compare <module-before> <module-after>
```

Use the returned `compare.depth_ratio_delta` + `compare.direction`
(`deeper`/`shallower`/`flat`) for the trend row, and surface any new
`factors` (god_function / deep_nesting / many_params) in the report. The
scorer is one instrument in the ensemble — it guards against over-decomposing
already-`deep` modules and flags `shallow` ones, but it does NOT detect
missing-seam opportunities (use `repo-hygiene-mcp.scan_duplicate_code` for
those). See MEASUREMENT.md § "What it is NOT".

### Compute trend metrics

```json
{
  "ts": "<iso>",
  "scope": "<path>",
  "refactors_landed": int,
  "interface_loc_delta": int,
  "interface_loc_delta_pct": float,
  "implementation_loc_delta": int,
  "caller_count_delta": int,
  "blast_radius_delta": int,
  "test_coverage_of_interface_delta": float,
  "cyclomatic_of_interface_delta": float,
  "cycles_count_delta": int,
  "dead_exports_delta": int,
  "depth_ratio_delta": float
}
```

Append to `.agent/improve-runs/trend.jsonl`.

### Rule per `the project rule (see your repo rules)`

If aggregate Δ goes the WRONG way (interface complexity ↑, blast radius ↑, test coverage ↓), the run **FAILS**. The skill MUST emit a "wrong direction" warning to Greg and offer revert. Do not silently ship a worse codebase.

### Output

`.agent/improve-runs/<ts>/phase6-trend.json` — the metric row plus pass/fail.

Final assistant-message report:

```
Improve: phase=6, candidates=<n>, picked=<name>, refactors_landed=<n>,
snapshot_delta=<i_loc/pct, impl_loc, callers, depth_ratio>,
trend_file=.agent/improve-runs/trend.jsonl
```

---

## Re-entry / partial runs

The skill is safe to re-enter at any phase boundary. State lives in `.agent/improve-runs/<ts>/`. If Greg interrupts at Phase 2 and comes back next session:

```
Resume improve-architecture run <ts>?
  Phase 1 ✓ (47 candidates found)
  Phase 2 ✓ (HTML written 2 hours ago)
  Phase 3 — waiting for candidate choice
```

The skill picks up from the first non-completed phase.
