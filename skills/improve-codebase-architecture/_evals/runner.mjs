#!/usr/bin/env node
/**
 * improve-codebase-architecture — golden eval runner (v0.2)
 *
 * Loads a golden case (per services/skills/.../golden/<case-id>.json) and
 * compares against a skill-output JSON. Computes recall, precision-avoidance,
 * blast-radius accuracy, fabricated-candidates count, missed-Strong count.
 * Emits verdict per acceptance.json thresholds.
 *
 * v0.2: candidate↔expected and candidate↔avoidance matching is file + LINE
 * OVERLAP aware (not file-path-only) when BOTH sides carry a line range, and
 * avoidance violations are STRENGTH-AWARE — a Strong/Worth-exploring candidate
 * overlapping an avoidance is a HARD precision miss; a Speculative-only overlap
 * is a SOFT "overflag" tolerated up to `speculative_overflags_max`. When either
 * side omits a line range, matching falls back to file-only (v0.1 behavior).
 *
 * Usage:
 *   # Validate all golden schemas (no skill output needed)
 *   node runner.mjs --validate
 *
 *   # List available cases
 *   node runner.mjs --list
 *
 *   # Grade a skill run against a specific case
 *   node runner.mjs --case <case-id> --skill-output <path-to-phase2-candidates.json> [--out <report.json>]
 *
 *   # Grade ALL cases against a directory of skill outputs (one per case)
 *   node runner.mjs --batch --skill-output-dir <dir>
 *
 * Skill-output JSON shape (what Phase 2 of the skill emits):
 *   [
 *     {
 *       "id": "<skill-assigned>",
 *       "files": ["path/to/file.ts"],
 *       "lines_approx": [<start>, <end>],   // v0.2: SHOULD be provided for line-precise matching
 *       "kind": "shallow|complecting|leakage|untested|passthrough|extract_adapter|consolidate|...",
 *       "deepening_target": "<plain English>",
 *       "recommendation_strength": "Strong" | "Worth exploring" | "Speculative",
 *       "blast_radius": <int>,
 *       "deletion_test_result": "vanishes" | "reappears_in_N_callers" | "ambiguous" | "<kind-specific>",
 *       "rationale": "<vocab-correct one-paragraph>"
 *     }
 *   ]
 *
 * Exit codes:
 *   0 — all cases passed acceptance
 *   1 — at least one case failed
 *   2 — usage error / golden schema invalid
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = resolve(__dir, 'golden');
const ACCEPTANCE_PATH = resolve(__dir, 'acceptance.json');
const REPO_ROOT = resolve(__dir, '../../../..');

// ── Load + validate golden schema ─────────────────────────────────────────
export function loadGoldens(goldenDir = GOLDEN_DIR) {
  if (!existsSync(goldenDir)) {
    console.error(`Golden dir not found: ${goldenDir}`);
    process.exit(2);
  }
  const out = {};
  for (const f of readdirSync(goldenDir).filter((x) => x.endsWith('.json'))) {
    const path = join(goldenDir, f);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      console.error(`Golden ${f}: invalid JSON — ${e.message}`);
      process.exit(2);
    }
    const errors = validateGoldenSchema(parsed, f);
    if (errors.length) {
      console.error(`Golden ${f} schema errors:\n  - ${errors.join('\n  - ')}`);
      process.exit(2);
    }
    out[parsed.id] = parsed;
  }
  return out;
}

// Optional [start, end] line range (inclusive). Valid = 2 finite numbers, start<=end.
function validateLineRange(lr, label, errs) {
  if (lr === undefined) return; // optional
  if (!Array.isArray(lr) || lr.length !== 2 || !lr.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    errs.push(`${label} has invalid line_range (want [start,end] numbers): ${JSON.stringify(lr)}`);
    return;
  }
  if (lr[0] > lr[1]) errs.push(`${label} line_range start > end: ${JSON.stringify(lr)}`);
}

export function validateGoldenSchema(g, filename) {
  const errs = [];
  for (const key of ['id', 'scope', 'description', 'files_in_scope', 'expected_candidates', 'expected_avoidances']) {
    if (!(key in g)) errs.push(`missing required key: ${key}`);
  }
  if (g.id && g.id !== basename(filename, '.json')) {
    errs.push(`id "${g.id}" does not match filename "${filename}"`);
  }
  for (const c of g.expected_candidates || []) {
    if (!c.id) errs.push(`candidate missing id`);
    if (!Array.isArray(c.files) || c.files.length === 0) errs.push(`candidate ${c.id || '?'} missing files[]`);
    if (!c.expected_recommendation_strength) errs.push(`candidate ${c.id || '?'} missing expected_recommendation_strength`);
    if (!['Strong', 'Worth exploring', 'Speculative'].includes(c.expected_recommendation_strength)) {
      errs.push(`candidate ${c.id || '?'} bad strength "${c.expected_recommendation_strength}"`);
    }
    if (!Array.isArray(c.blast_radius_range) || c.blast_radius_range.length !== 2) {
      errs.push(`candidate ${c.id || '?'} missing blast_radius_range [min, max]`);
    }
    validateLineRange(c.line_range, `candidate ${c.id || '?'}`, errs);
  }
  for (const av of g.expected_avoidances || []) {
    validateLineRange(av.line_range, `avoidance ${av.id || '?'}`, errs);
  }
  // Verify scope files actually exist in repo
  if (g.files_in_scope) {
    for (const f of g.files_in_scope) {
      const abs = resolve(REPO_ROOT, f);
      if (!existsSync(abs)) errs.push(`files_in_scope: "${f}" does not exist at ${abs}`);
    }
  }
  return errs;
}

export function loadAcceptance(acceptancePath = ACCEPTANCE_PATH) {
  if (!existsSync(acceptancePath)) {
    console.error(`Acceptance file not found: ${acceptancePath}`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(acceptancePath, 'utf8'));
}

// ── Match skill candidate to golden expected ──────────────────────────────
export function matchByFiles(skillCand, expectedList) {
  const sf = new Set(skillCand.files || []);
  for (const exp of expectedList) {
    const ef = new Set(exp.files || []);
    for (const file of sf) if (ef.has(file)) return exp;
  }
  return null;
}

export function fileExists(repoRelPath) {
  try {
    return statSync(resolve(REPO_ROOT, repoRelPath)).isFile();
  } catch {
    return false;
  }
}

// ── Match skill candidate ↔ golden item (file + optional line overlap) ──────
//
// A skill candidate matches a golden item (expected_candidate OR
// expected_avoidance) iff they share a file AND — when BOTH carry a line range
// — those ranges overlap. If either side omits a line range, fall back to
// file-only matching (preserves v0.1 behavior). The candidate's range lives on
// `line_range` or `lines_approx`; the golden item's on `line_range`.
function candidateRange(cand) {
  return cand.line_range || cand.lines_approx || null;
}

function rangesOverlap(a, b) {
  return a[0] <= b[1] && b[0] <= a[1];
}

export function candidateMatchesItem(cand, item) {
  const cf = new Set(cand.files || []);
  const sharedFile = (item.files || []).some((f) => cf.has(f));
  if (!sharedFile) return false;
  const cr = candidateRange(cand);
  const ir = item.line_range || null;
  if (cr && ir) return rangesOverlap(cr, ir);
  return true; // file-only fallback when either side lacks a line range
}

const STRENGTH_RANK = { Strong: 3, 'Worth exploring': 2, Speculative: 1 };
// Strong/Worth-exploring overlap of an avoidance = HARD precision miss.
// Speculative overlap = SOFT "overflag" (the skill honestly hedged) — tolerated
// up to a budget rather than tanking precision.
function isHardStrength(strength) {
  return (STRENGTH_RANK[strength] || 0) >= 2;
}

// ── Grade a single case ───────────────────────────────────────────────────
export function gradeCase(golden, skillOutput, thresholds) {
  const expected = golden.expected_candidates || [];
  const avoidances = golden.expected_avoidances || [];
  const found = Array.isArray(skillOutput) ? skillOutput : [];

  // 1. Recall — for each expected, did skill find it? (auto-pass if expected is empty)
  const matchedExpected = [];
  const missedExpected = [];
  for (const exp of expected) {
    const skillMatch = found.find((s) => candidateMatchesItem(s, exp));
    if (skillMatch) matchedExpected.push({ expected: exp, skill: skillMatch });
    else missedExpected.push(exp);
  }
  const recall = expected.length === 0 ? 1.0 : matchedExpected.length / expected.length;

  // 2. Precision_avoidance — strength-aware. A Strong/Worth-exploring candidate
  //    overlapping an avoidance is a HARD violation (reduces precision). An
  //    avoidance overlapped ONLY by Speculative candidate(s) is a SOFT overflag
  //    (the skill hedged) — tolerated up to `speculative_overflags_max`.
  const hardViolations = [];
  const softViolations = [];
  for (const av of avoidances) {
    const overlapping = found.filter((s) => candidateMatchesItem(s, av));
    if (overlapping.length === 0) continue;
    const hard = overlapping.find((s) => isHardStrength(s.recommendation_strength));
    if (hard) hardViolations.push({ avoidance: av, skill_flagged: hard, strength: hard.recommendation_strength });
    else softViolations.push({ avoidance: av, skill_flagged: overlapping[0], strength: overlapping[0].recommendation_strength });
  }
  const precision_avoidance =
    avoidances.length === 0 ? 1.0 : (avoidances.length - hardViolations.length) / avoidances.length;
  const speculative_overflags = softViolations.length;

  // 3. Blast radius accuracy — for matched candidates, is skill's blast_radius within range?
  let blastInRange = 0;
  let blastChecked = 0;
  for (const { expected: exp, skill: s } of matchedExpected) {
    const [lo, hi] = exp.blast_radius_range || [0, 1e9];
    if (typeof s.blast_radius === 'number') {
      blastChecked += 1;
      if (s.blast_radius >= lo && s.blast_radius <= hi) blastInRange += 1;
    }
  }
  const blast_radius_accuracy = blastChecked === 0 ? 1.0 : blastInRange / blastChecked;

  // 4. Fabricated — skill candidates referencing files that don't exist
  const fabricated = found.filter((s) =>
    (s.files || []).some((f) => !fileExists(f))
  );

  // 5. Missed Strong recommendations
  const missedStrong = missedExpected.filter((e) => e.expected_recommendation_strength === 'Strong');

  // ── Verdict ────────────────────────────────────────────────────────────
  const specMax = typeof thresholds.speculative_overflags_max === 'number'
    ? thresholds.speculative_overflags_max
    : Infinity;
  const failures = [];
  if (recall < thresholds.recall_min) failures.push(`recall ${recall.toFixed(2)} < ${thresholds.recall_min}`);
  if (precision_avoidance < thresholds.precision_avoidance_min)
    failures.push(`precision_avoidance ${precision_avoidance.toFixed(2)} < ${thresholds.precision_avoidance_min}`);
  if (blast_radius_accuracy < thresholds.blast_radius_accuracy_min)
    failures.push(`blast_radius_accuracy ${blast_radius_accuracy.toFixed(2)} < ${thresholds.blast_radius_accuracy_min}`);
  if (fabricated.length > thresholds.fabricated_candidates_max)
    failures.push(`fabricated_candidates ${fabricated.length} > ${thresholds.fabricated_candidates_max}`);
  if (missedStrong.length > thresholds.missed_strong_recommendations_max)
    failures.push(`missed_strong ${missedStrong.length} > ${thresholds.missed_strong_recommendations_max}`);
  if (speculative_overflags > specMax)
    failures.push(`speculative_overflags ${speculative_overflags} > ${specMax}`);

  return {
    case_id: golden.id,
    verdict: failures.length === 0 ? 'pass' : 'fail',
    recall,
    precision_avoidance,
    speculative_overflags,
    blast_radius_accuracy,
    fabricated_candidates: fabricated.map((s) => ({ files: s.files, id: s.id })),
    missed_candidates: missedExpected.map((e) => ({ id: e.id, strength: e.expected_recommendation_strength })),
    missed_strong: missedStrong.map((e) => e.id),
    violated_avoidances: hardViolations.map((v) => ({ avoidance_id: v.avoidance.id, skill_flagged_id: v.skill_flagged.id, strength: v.strength })),
    speculative_overflag_avoidances: softViolations.map((v) => ({ avoidance_id: v.avoidance.id, skill_flagged_id: v.skill_flagged.id })),
    failures,
    counts: {
      expected: expected.length,
      avoidances: avoidances.length,
      found: found.length,
      matched: matchedExpected.length,
    },
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function runCli(argv) {
  const args = argv;
  const flag = (name) => args.includes(name);
  const arg = (name, def = null) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };

  if (args.length === 0 || flag('--help') || flag('-h')) {
    console.log(`improve-codebase-architecture eval runner v0.2

Usage:
  node runner.mjs --validate                                    # validate all golden schemas
  node runner.mjs --list                                        # list cases
  node runner.mjs --case <id> --skill-output <path> [--out <p>] # grade one case
  node runner.mjs --batch --skill-output-dir <dir> [--out <p>]  # grade all

See README.md for full docs.`);
    process.exit(args.length === 0 ? 2 : 0);
  }

  const goldens = loadGoldens();
  const acceptance = loadAcceptance();
  const thresholds = acceptance.thresholds;

  if (flag('--list')) {
    console.log('Available cases:');
    for (const id of Object.keys(goldens)) {
      const g = goldens[id];
      console.log(`  ${id.padEnd(40)} — ${g.scope} (${(g.expected_candidates || []).length} expected, ${(g.expected_avoidances || []).length} avoidances)`);
    }
    process.exit(0);
  }

  if (flag('--validate')) {
    // loadGoldens() already validated. Print summary.
    console.log(`✓ ${Object.keys(goldens).length} golden case(s) valid`);
    for (const id of Object.keys(goldens)) {
      const g = goldens[id];
      console.log(`  ${id}: ${g.files_in_scope.length} files in scope, ${(g.expected_candidates || []).length} expected, ${(g.expected_avoidances || []).length} avoidances`);
    }
    console.log(`✓ acceptance.json v${acceptance.version}: recall_min=${thresholds.recall_min}, precision_avoidance_min=${thresholds.precision_avoidance_min}, fabricated_max=${thresholds.fabricated_candidates_max}`);
    process.exit(0);
  }

  const caseId = arg('--case');
  const skillOutputPath = arg('--skill-output');
  const skillOutputDir = arg('--skill-output-dir');
  const batch = flag('--batch');
  const outPath = arg('--out');

  let report;

  if (batch && skillOutputDir) {
    const results = {};
    let anyFail = false;
    for (const id of Object.keys(goldens)) {
      const candidatePath = join(skillOutputDir, `${id}.json`);
      if (!existsSync(candidatePath)) {
        results[id] = { case_id: id, verdict: 'skip', reason: `no skill output at ${candidatePath}` };
        continue;
      }
      const skillOut = JSON.parse(readFileSync(candidatePath, 'utf8'));
      results[id] = gradeCase(goldens[id], skillOut, thresholds);
      if (results[id].verdict === 'fail') anyFail = true;
    }
    report = { mode: 'batch', acceptance_version: acceptance.version, results };
    console.log(`Batch eval: ${Object.values(results).filter((r) => r.verdict === 'pass').length}/${Object.values(results).filter((r) => r.verdict !== 'skip').length} passed`);
    for (const id of Object.keys(results)) {
      const r = results[id];
      console.log(`  ${r.verdict.toUpperCase().padEnd(5)} ${id}${r.failures && r.failures.length ? ' — ' + r.failures.join('; ') : ''}`);
    }
    if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(anyFail ? 1 : 0);
  }

  if (caseId && skillOutputPath) {
    if (!goldens[caseId]) {
      console.error(`Unknown case "${caseId}". Available: ${Object.keys(goldens).join(', ')}`);
      process.exit(2);
    }
    if (!existsSync(skillOutputPath)) {
      console.error(`Skill output not found: ${skillOutputPath}`);
      process.exit(2);
    }
    const skillOut = JSON.parse(readFileSync(skillOutputPath, 'utf8'));
    report = gradeCase(goldens[caseId], skillOut, thresholds);
    console.log(`${report.verdict.toUpperCase()} ${caseId}`);
    console.log(`  recall=${report.recall.toFixed(2)} precision_avoidance=${report.precision_avoidance.toFixed(2)} blast_accuracy=${report.blast_radius_accuracy.toFixed(2)} spec_overflags=${report.speculative_overflags}`);
    console.log(`  expected=${report.counts.expected} matched=${report.counts.matched} found=${report.counts.found} fabricated=${report.fabricated_candidates.length}`);
    if (report.failures.length) console.log(`  failures: ${report.failures.join('; ')}`);
    if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(report.verdict === 'pass' ? 0 : 1);
  }

  console.error('Missing arguments. Run with --help.');
  process.exit(2);
}

// Only run the CLI when invoked directly (so tests can import the pure funcs).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2));
}
