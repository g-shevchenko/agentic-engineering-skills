# improve-codebase-architecture — golden eval (v0.1)

## What this is

A measurement harness for the [`improve-codebase-architecture`](../SKILL.md) skill. Each golden case captures:

- the codebase scope to run the skill on
- the deepening candidates the skill **should** find (recall target)
- the false-positive candidates the skill **should not** flag (precision target)
- expected blast radius ranges

The runner compares a skill-output JSON against goldens and emits pass/fail per the [acceptance criteria](acceptance.json).

## Why this format (not the standard marketing-skills runner)

The standard HWAI marketing-skills runner uses LLM-judge rubric scoring (`{check: "rubric", criterion: "..."}`). That fits prompt-in → response-out skills. The `improve-codebase-architecture` skill is structurally different — it produces a **deterministic candidate list** from analyzing code. Recall + precision against a hand-curated truth set is the right shape.

## v0.3 cases (2 HWAI-native + 3 synthetic: 2 precision + 1 recall + 1 long-cohesive)

| ID | Target | Expected candidates | Purpose |
|---|---|---|---|
| `hwai-reader-mcp` | `your-service/` | 0 Strong (clean baseline) | False-positive guard — skill should NOT over-flag a clean single-file MCP |
| `synthetic-clean-baseline-notifier` | `_evals/fixtures/clean_baseline_notifier/` | 0 Strong/Worth (clean baseline) | n=2 precision fixture (Fowler-pattern): a fresh well-factored module with a tempting thin-DRY trap — tests that the DRY-is-not-deepening guard GENERALIZES (not reader-mcp-overfit) |
| `hwai-youtube-transcribe-api` | `your-service/src/` | 1 Strong, 1 Worth exploring | Realistic Python multi-file MCP with a known sibling-adapter seam (`summarize.py`) and complecting (`transcribe.py` model lifecycle) |
| `synthetic-recall-seam-exporter` | `_evals/fixtures/recall_seam_exporter/` | 1 Strong (a real 3-adapter seam) | First **recall** fixture: skill must FIND a genuine unnamed multi-adapter seam (csv/json/parquet exporter). Doubles as a guard-balance test (DRY guard must NOT suppress real seams). Surfaced + fixed the config-at-edge precision gap (ADR-0005). |
| `synthetic-cohesive-long-fn-scorer` | `_evals/fixtures/cohesive_risk_scorer/` | 0 Strong/Worth (clean baseline) | Precision fixture for the **long-cohesive-function** over-flag mode: a ~50-line state-threaded scorer (small interface, large impl = already deep). Skill must NOT over-decompose it into shallow stages. Passed blind with NO new guard (existing deep-vs-shallow + DRY guidance generalized). |

## Deferred to v0.2

| Priority | Item | Source | Why deferred |
|---|---|---|---|
| ~~**P0**~~ ✅ DONE | **`line_range` matching in runner.mjs** | smoke-test 2026-05-20 found this gap | **Shipped v0.2.0 (2026-05-21).** `runner.mjs::candidateMatchesItem` now matches candidate↔expected/avoidance by file **and line-overlap** (when both carry a range; file-only fallback otherwise). Restored the 2 file-conflict avoidances (`ytt-avoid-002`, `ytt-avoid-004`) with `line_range`. Also added **strength-aware avoidance precision** (Speculative overlap = soft "overflag" budget). 14/14 runner unit tests. See ADR-0003. |
| P1 | 3 Fowler-pattern synthetic fixtures (Extract Module, Combine Functions into Class, Move Function) | hand-written `fixtures/` | Need fixture authoring; v0.1 ships with real HWAI cases first |
| P1 | 5 RefactorBench tasks (Django/Salt/Flask) | [microsoft/RefactorBench (ICLR 2025)](https://github.com/microsoft/RefactorBench) | RefactorBench tests "can the agent execute a known refactor" — needs translation to our "can the agent identify the opportunity" shape |
| P2 | Live-MCP runner integration | n/a | Currently runner expects pre-computed Phase 2 candidates JSON via `--skill-output`. v0.3 should invoke the skill end-to-end via the MCP stack. |
| P2 | Expand `hwai-youtube-transcribe-api` golden with `worker.py` duplication candidate | 2026-05-20 smoke found this as a legitimate bonus finding | Add `run_job`/`run_upload_job` consolidate-duplicated-pipeline as a 3rd expected_candidate (Worth-exploring). |

## How to run (v0.1)

The runner expects you to **run the skill manually** first (since the skill calls live MCPs that aren't part of the eval harness yet), save its output JSON to a file, then point the runner at it.

```bash
# 1. Run the skill against a target (manual step, real session)
#    e.g. say to Claude Code: "/improve architecture your-service/"
#    Skill writes its Phase 1 candidates JSON to .agent/improve-runs/<ts>/phase1-friction.json
#    (and Phase 2 candidates to phase2-candidates.json)

# 2. Run the eval against that output
node skills/improve-codebase-architecture/_evals/runner.mjs \
  --case hwai-youtube-transcribe-api \
  --skill-output .agent/improve-runs/<ts>/phase2-candidates.json \
  --out /tmp/improve-eval-result.json
```

## Output shape

```json
{
  "case_id": "hwai-youtube-transcribe-api",
  "verdict": "pass" | "fail" | "partial",
  "recall": 0.5,            // fraction of expected_candidates flagged
  "precision_avoidance": 1.0, // fraction of expected_avoidances NOT flagged
  "blast_radius_accuracy": 0.8, // fraction within range
  "fabricated_candidates": [],  // candidates flagged but referencing non-existent files
  "missed_candidates": ["..."], // expected but not flagged
  "false_positives": ["..."],   // avoided in golden but flagged by skill
  "details": [...]
}
```

## Acceptance (v0.3.0 — tightened)

See [`acceptance.json`](acceptance.json). **Every case must individually meet ALL thresholds** (no averaging — one fail blocks acceptance):

- recall ≥ 0.50 (still lenient — only 1 unbiased recall fixture exists; bumps to 0.80 after ≥2 more)
- precision_avoidance ≥ 0.90 (**tightened from 0.80** in v0.3 — 5 blind cases all graded 1.0)
- blast_radius_accuracy ≥ 0.70 (**tightened from 0.50** in v0.3 — same basis)
- fabricated_candidates: 0 (strict — never fabricate)
- missed_strong_recommendations: 0 (strict — never miss a Strong)
- speculative_overflags ≤ 1 (a soft, honestly-hedged Speculative on an avoidance is tolerated; a Strong/Worth overlap is a hard fail)

The tightening is justified by 5 blind golden cases all grading at precision 1.0 / blast 1.0 (no case sits between the old and new bars) AND two precision gaps found-and-fixed via blind runs (DRY ADR-0003, config-at-edge ADR-0005). recall stays lenient per [`measure-before-deploy`](../../../rules/measure-before-deploy-prod-changes.md) — thin data on unbiased recall.

## Future work

- v0.2: 5 RefactorBench-derived cases + 3 Fowler-pattern synthetic fixtures
- v0.3: live-MCP integration — runner invokes the skill end-to-end via the MCP stack instead of expecting pre-computed output
- v0.3: held-out test set + trend tracking via `.agent/improve-runs/trend.jsonl`

## Smoke run history

| Date | Case | Phase 2 candidates output | Report | Verdict | Notes |
|---|---|---|---|---|---|
| 2026-05-20 | `hwai-youtube-transcribe-api` | [sample-outputs/youtube-transcribe-api-2026-05-20.json](sample-outputs/youtube-transcribe-api-2026-05-20.json) | [sample-outputs/youtube-transcribe-api-2026-05-20-report.json](sample-outputs/youtube-transcribe-api-2026-05-20-report.json) | **PASS** (after v0.1 golden fix) | First in-session smoke. Found all expected candidates (recall=1.0) + 1 legitimate bonus (worker.py duplication). **Caveat**: in-session, same agent that wrote the golden → bias risk non-zero. |
| 2026-05-21 | `hwai-reader-mcp` (smoke #1, **unbiased**) | `.agent/improve-runs/2026-05-21-reader-mcp-unbiased/phase2-candidates.json` | — | **FAIL** (precision 0.67) | First **fresh-context** run — subagent blind to the golden, prior session, and main conversation. Over-flagged a thin `postScraperCore()` fetch wrapper as Worth-exploring (DRY ≠ deepening). Graded by v0.2 runner: 1 genuine hard violation (`avoid-002`), 2 phantom violations eliminated by line-overlap. Real precision finding → SKILL.md guard. |
| 2026-05-21 | `hwai-reader-mcp` (smoke #2, **unbiased**, post-guard) | `.agent/improve-runs/2026-05-21-reader-mcp-unbiased-v2/phase2-candidates.json` | — | **PASS** (precision 1.0) | Re-run with the DRY-is-not-deepening guard (SKILL.md #11 + LANGUAGE.md + ALGORITHM.md). Fresh subagent (blind) returned `[]` — the correct clean-baseline result, explicitly citing the guard. Validates the fix on an unbiased run. youtube case still PASS (no regression). See ADR-0003. |
| 2026-05-21 | `synthetic-clean-baseline-notifier` (**unbiased**, n=2) | `.agent/improve-runs/2026-05-21-notifier-blind/phase2-candidates.json` | — | **PASS** (precision 1.0) | **Dogfoods `the project rule (see your repo rules)`.** Fresh subagent (blind to golden + prior runs + conversation) on a brand-new well-factored module: 0 Strong/Worth; capped the shared `requests.post` plumbing at **Speculative** (soft overflag, within budget), did NOT over-flag config-at-edge or the send_* leafs → the DRY-is-not-deepening guard **generalizes** beyond reader-mcp. Scope caveat: same-pattern-family (thin HTTP/init wrapper); a future case should exercise a different over-flag mode (long-cohesive-function split / recall fixture). |
| 2026-05-21 | `synthetic-recall-seam-exporter` (**unbiased**, n=3, **recall** #1) | `.agent/improve-runs/2026-05-21-exporter-blind/phase2-candidates.json` | — | **FAIL** (precision 0.0) | First blind RECALL test. **Found** the real 3-adapter seam (Worth, recognized as a real seam — DRY guard did NOT over-suppress ✓). But **also over-flagged config-at-edge** (module-init env reads) as Worth-exploring complecting → a NEW precision gap distinct from thin-DRY. Real finding → config-at-edge guard. |
| 2026-05-21 | `synthetic-recall-seam-exporter` (**unbiased**, post-guard) | `.agent/improve-runs/2026-05-21-exporter-blind-v2/phase2-candidates.json` | — | **PASS** (precision 1.0) | Re-run with the config-at-edge guard (SKILL.md #12 + LANGUAGE.md § + ALGORITHM.md gate, ADR-0005). Fresh subagent: found the seam (recall 1.0) AND omitted config-at-edge (explicitly cited Rule 12). Precision gap closed; recall validated blind for the first time. Batch 4/4. |
| 2026-05-21 | `synthetic-cohesive-long-fn-scorer` (**unbiased**, n=4 precision, **new over-flag mode**) | `.agent/improve-runs/2026-05-21-scorer-blind/phase2-candidates.json` | [grade.json](../../../../.agent/improve-runs/2026-05-21-scorer-blind/grade.json) | **PASS** (precision 1.0, blast 1.0) | First test of the **long-but-cohesive-function** over-flag mode (the "this is 50 lines, decompose it into stages" reflex). Fresh subagent returned `[]` — recognized a small-interface/large-cohesive-impl `score_application()` as **already a deep module**, did NOT over-decompose it into `_income`/`_credit`/`_employment` stages (which would thread `score`+`flags` through wide param lists = SHALLOWER), did NOT re-flag config-at-edge (cited Rule 12). **NO new guard needed** — existing deep-vs-shallow + DRY (#11) + config-at-edge (#12) guidance generalized. Batch 5/5 → tightened acceptance to v0.3.0 (precision 0.8→0.9, blast 0.5→0.7); re-ran batch at the new bar, still 5/5. |

## Conventions

- Per TDD discipline: this eval is **NOT a substitute** for test-driven development of the skill itself. It measures the skill's analytical accuracy, not its safety. Phase 4 execution gates (see [EXECUTION-GATES.md](../EXECUTION-GATES.md)) remain mandatory in real runs.
- Golden cases reference files at specific paths in `your-repo` repo. When the underlying code drifts, golden cases must be refreshed. v0.2 will add a `last_verified_commit` field to detect drift.
