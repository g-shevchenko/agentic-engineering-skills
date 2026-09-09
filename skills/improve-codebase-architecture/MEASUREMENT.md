# MEASUREMENT — the deterministic deep-module scorer (Phase 6 instrument)

## Why this exists

The skill's value is **LLM judgment** (deletion test, recognizing complecting,
designing interfaces). But two things need a deterministic instrument:

1. **Phase 6 honesty.** The trend metrics (`depth_ratio_delta`, …) were
   hand-typed into `trend.jsonl`. A hand-typed delta is an assertion, not
   evidence. The scorer makes them tool-computed.
2. **An independent cross-check on the LLM's depth calls.** This is the
   [iSMELL](https://dl.acm.org/doi/10.1145/3691620.3695508) pattern — LLM
   judgment + a deterministic "expert toolset." A deterministic code-health
   aggregate is empirically credible: CodeScene's peer-reviewed *Code Red*
   study ([arxiv 2203.04374](https://arxiv.org/abs/2203.04374), 39 codebases)
   found healthy vs unhealthy code = **15× fewer defects, 2× dev speed, 9×
   lower completion-time uncertainty**, and an independent benchmark
   ([Ghost Echoes, arxiv 2408.10754](https://arxiv.org/html/2408.10754)) found
   such an aggregate **matches SotA ML and beats the average human expert** at
   predicting maintainability.

## The metric (Ousterhout depth proxy)

A **deep** module has a **small interface** hiding a **large implementation**.

```
interface_surface = public_symbols·2 + public_params·0.5
impl_complexity   = impl_lines·1 + functions·2 + branches·1 + max(0, maxNesting−1)·3
depth_ratio       = impl_complexity / max(interface_surface, 1)
```

| Band | depth_ratio | Meaning |
|---|---|---|
| `shallow` | `< 3` | thin wrapper, or a wide-interface utils bag — a **deepening candidate** |
| `balanced` | `3 – 8` | reasonable; not a priority |
| `deep` | `≥ 8` | small interface, large impl — **already deep; do NOT over-decompose** |

**Advisory factors** (informational, do not change the band):
`god_function:<name>:<bodyLen>` (body > 25 lines), `deep_nesting:<level>`
(nesting > 3), `many_params:<name>:<n>` (public params > 4).

Weights/thresholds are **v0.1 heuristics**, validated to separate the eval
fixtures (n small). They live as named constants at the top of
[`_evals/module_depth.mjs`](_evals/module_depth.mjs).

## How to run

**Preferred (when `repo-hygiene-mcp` is available):** call the MCP tool
`score_module_depth({ path, compare_to?, lang?, repo_root? })` — `path` is the
"after" file, `compare_to` the "before". It returns the score (+ `compare`
with `depth_ratio_delta` and `direction`), with a repo-root path guard and
log-safe (paths hashed, never raw) per the repo-hygiene data policy.

**Fallback (always works, no MCP registration needed):** the `_evals` CLI —

```bash
# score one or more files
node skills/improve-codebase-architecture/_evals/module_depth.mjs path/to/module.py

# Phase-6 before/after — computes depth_ratio_delta + direction tool-side
node skills/improve-codebase-architecture/_evals/module_depth.mjs \
  --compare before.py after.py
```

> The pure logic is shared: `repo-hygiene-mcp/src/module-depth.ts` is a verbatim
> TS port of `_evals/module_depth.mjs` (the `_evals` copy stays as the offline
> eval-harness path + the source of truth for the unit tests). **Registration
> caveat:** `repo-hygiene-mcp` is a local-stdio utility MCP currently NOT wired
> into the IDE MCP configs (0/4 — verified via `check_agent_surface_parity.mjs`),
> so the MCP-tool path requires `scripts/local-stdio.sh` or a future IDE
> registration; until then the CLI fallback is the working path in-session.

`scoreModule(source, {lang})` and `compareDepth(before, after)` are pure
exports (10 unit tests in `_evals/module_depth.test.mjs`). Supports Python and
TS/JS via heuristics — no AST, no install.

## What it is NOT (honest scope limits)

Measured 2026-05-21 against the 5 eval fixtures + 4 real refactored modules
([evidence](_evals/sample-outputs/module-depth-validation-2026-05-21.json)):

- **Precision cases agreed with the blind LLM**: `cohesive_risk_scorer/scorer.py`
  → `deep` (ratio 28) corroborates "already deep, don't decompose";
  `clean_baseline_notifier/notifier.py` → `balanced` with no false factor flags
  corroborates "well-factored, don't flag." The cohesive scorer carries a
  `god_function` factor **and** band `deep` — the right nuance: *a long
  function can be a deep module; the band, not the length, decides.*
- **It does NOT detect missing-seam opportunities.** `recall_seam_exporter/
  exporter.py` scores `deep` (ratio 17) yet has the real 3-adapter seam the LLM
  correctly found. The depth-ratio measures interface÷impl, **not** "hidden
  missing abstraction" — that is a duplication signal
  (`repo-hygiene-mcp.scan_duplicate_code`). **The scorer guards against
  shallow modules + over-decomposition and computes Phase-6 deltas; it is one
  instrument in the ensemble, not a complete opportunity-finder.** LLM judgment
  + `repo-hygiene-mcp` duplicate/cycle scans remain essential.
- **Nesting is indentation-based** and over-counts on continuation lines /
  multi-line literals (e.g. `deep_nesting:10` on `summarize.py` is partly
  artifact). The band is ratio-driven and unaffected; treat the nesting factor
  as coarse. v0.2 (in the MCP) should use brace/AST-based nesting.

## Roadmap

- **DONE — promoted into `repo-hygiene-mcp`** as the `score_module_depth` tool
  (`src/module-depth.ts`, verbatim TS port; benchmark 22/22, stdio handshake +
  path-traversal guard proven). The keystone PR proved the metric first
  (measure-before-deploy) before this promotion to the prod MCP surface.
- **Open follow-up — register `repo-hygiene-mcp` into the IDE MCP configs.**
  It is currently 0/4 (a local-stdio utility MCP), so the new tool — and the
  skill's other `mcp__repo_*`/`mcp__language_graph__*` Phase-1/6 calls — only
  resolve via `scripts/local-stdio.sh` today. Wiring the utility MCPs into all
  4 IDE configs is a separate, machine-local, Greg-gated decision (which
  utility MCPs should be always-on).
- **v0.2 metric**: add an absolute interface-width penalty (a wide *and* large
  module should not read `deep` on ratio alone), AST-based nesting, and more
  CodeScene-aligned factors (low-cohesion proxy, copy-paste — already in
  repo-hygiene's duplicate scan).
- **Outcome tier (T3)**: connect a deepening to change-time / defect-rate over
  time — the metric CodeScene proves has business impact. Requires longitudinal
  data; deferred until the autopilot direction is chosen.
