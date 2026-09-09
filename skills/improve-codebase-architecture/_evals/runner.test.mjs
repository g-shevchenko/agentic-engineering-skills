#!/usr/bin/env node
/**
 * Tests for the improve-codebase-architecture eval runner.
 *
 * Run: node --test skills/improve-codebase-architecture/_evals/runner.test.mjs
 *
 * Two layers:
 *   1. CHARACTERIZATION — locks v0.1 behavior we are PRESERVING (file-only
 *      matching when no line ranges; Strong/Worth file-match = hard violation;
 *      fabrication; missed-Strong; blast radius; empty-expected).
 *   2. NEW BEHAVIOR (v0.2) — line_range overlap matching + strength-aware
 *      avoidance precision (Speculative overlap = soft "overflag", tolerated up
 *      to a budget). These FAIL against the v0.1 file-only runner (verify-red)
 *      and PASS once line-overlap + strength-aware grading lands.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gradeCase } from './runner.mjs';

// Real files in the repo (so the fabrication check doesn't false-positive).
const FILE_A = 'your-service/src/transcribe.py';
const FILE_B = 'your-service/src/index.ts';
const GHOST = 'your-service/ghost.ts';

const TH = {
  recall_min: 0.5,
  precision_avoidance_min: 0.8,
  blast_radius_accuracy_min: 0.5,
  fabricated_candidates_max: 0,
  missed_strong_recommendations_max: 0,
  speculative_overflags_max: 1,
};

const cand = (o) => ({
  id: o.id || 'c',
  files: o.files || [FILE_A],
  recommendation_strength: o.strength || 'Strong',
  blast_radius: o.blast == null ? 1 : o.blast,
  ...(o.lines ? { lines_approx: o.lines } : {}),
  ...(o.line_range ? { line_range: o.line_range } : {}),
});

const golden = (o) => ({
  id: o.id || 'g',
  scope: 's',
  description: 'd',
  files_in_scope: o.files_in_scope || [FILE_A],
  expected_candidates: o.expected || [],
  expected_avoidances: o.avoidances || [],
});

const expCand = (o) => ({
  id: o.id,
  files: o.files || [FILE_A],
  expected_recommendation_strength: o.strength || 'Strong',
  blast_radius_range: o.range || [1, 3],
  ...(o.line_range ? { line_range: o.line_range } : {}),
});

const avoid = (o) => ({
  id: o.id,
  files: o.files || [FILE_A],
  ...(o.line_range ? { line_range: o.line_range } : {}),
});

// ─────────────────────────────────────────────────────────────────────────
// CHARACTERIZATION — preserved v0.1 behavior (green on v0.1 AND v0.2)
// ─────────────────────────────────────────────────────────────────────────

test('char: empty expected + empty avoidances → recall 1.0, precision 1.0, pass', () => {
  const r = gradeCase(golden({}), [], TH);
  assert.equal(r.recall, 1.0);
  assert.equal(r.precision_avoidance, 1.0);
  assert.equal(r.verdict, 'pass');
});

test('char: candidate in expected file (no ranges) → recall 1.0', () => {
  const g = golden({ expected: [expCand({ id: 'e1' })] });
  const r = gradeCase(g, [cand({ id: 's1', blast: 2 })], TH);
  assert.equal(r.recall, 1.0);
  assert.equal(r.counts.matched, 1);
});

test('char: Strong candidate hitting an avoidance file (no ranges) → hard violation, precision 0, fail', () => {
  const g = golden({ avoidances: [avoid({ id: 'a1' })] });
  const r = gradeCase(g, [cand({ id: 's1', strength: 'Strong' })], TH);
  assert.equal(r.precision_avoidance, 0);
  assert.equal(r.verdict, 'fail');
});

test('char: fabricated candidate (nonexistent file) → fabricated counted, fail', () => {
  const g = golden({});
  const r = gradeCase(g, [cand({ id: 's1', files: [GHOST] })], TH);
  assert.equal(r.fabricated_candidates.length, 1);
  assert.equal(r.verdict, 'fail');
});

test('char: missed Strong expected → missed_strong, fail', () => {
  const g = golden({ expected: [expCand({ id: 'e1', strength: 'Strong' })] });
  const r = gradeCase(g, [], TH); // skill found nothing
  assert.equal(r.recall, 0);
  assert.deepEqual(r.missed_strong, ['e1']);
  assert.equal(r.verdict, 'fail');
});

test('char: blast radius out of range → blast_radius_accuracy < 1', () => {
  const g = golden({ expected: [expCand({ id: 'e1', range: [1, 3] })] });
  const r = gradeCase(g, [cand({ id: 's1', blast: 99 })], TH);
  assert.equal(r.blast_radius_accuracy, 0);
});

// ─────────────────────────────────────────────────────────────────────────
// NEW BEHAVIOR v0.2 — line_range overlap + strength-aware precision
// (these FAIL on the v0.1 file-only runner = verify-red proof)
// ─────────────────────────────────────────────────────────────────────────

test('NB1 line-overlap: candidate far from avoidance in SAME file → NO phantom violation', () => {
  // Avoidance at [71,125] (e.g. groq key-pool); candidate at [10,50]
  // (e.g. model lifecycle). v0.1 file-only flags a violation; v0.2 must not.
  const g = golden({ avoidances: [avoid({ id: 'a-far', line_range: [71, 125] })] });
  const r = gradeCase(g, [cand({ id: 's1', strength: 'Worth exploring', lines: [10, 50] })], TH);
  assert.equal(r.precision_avoidance, 1.0);
  assert.equal(r.verdict, 'pass');
});

test('NB2 line-overlap: candidate overlapping avoidance lines → genuine hard violation kept', () => {
  const g = golden({ avoidances: [avoid({ id: 'a-near', line_range: [60, 100] })] });
  const r = gradeCase(g, [cand({ id: 's1', strength: 'Worth exploring', lines: [80, 110] })], TH);
  assert.equal(r.precision_avoidance, 0);
  assert.equal(r.verdict, 'fail');
});

test('NB3 strength-aware: Speculative overlap is SOFT (precision 1.0), within budget → pass', () => {
  const g = golden({ avoidances: [avoid({ id: 'a', line_range: [60, 100] })] });
  const r = gradeCase(g, [cand({ id: 'spec', strength: 'Speculative', lines: [70, 90] })], TH);
  assert.equal(r.precision_avoidance, 1.0);
  assert.equal(r.speculative_overflags, 1);
  assert.equal(r.verdict, 'pass');
});

test('NB4 strength-aware: Speculative overflags OVER budget → fail', () => {
  const g = golden({
    avoidances: [
      avoid({ id: 'a1', line_range: [10, 20] }),
      avoid({ id: 'a2', line_range: [30, 40] }),
    ],
  });
  const r = gradeCase(
    g,
    [
      cand({ id: 's1', strength: 'Speculative', lines: [12, 18] }),
      cand({ id: 's2', strength: 'Speculative', lines: [32, 38] }),
    ],
    TH,
  );
  assert.equal(r.speculative_overflags, 2);
  assert.equal(r.precision_avoidance, 1.0); // soft, not hard
  assert.equal(r.verdict, 'fail'); // 2 > budget 1
});

test('NB5 strength-aware: Strong overlap is ALWAYS a hard violation', () => {
  const g = golden({ avoidances: [avoid({ id: 'a', line_range: [60, 100] })] });
  const r = gradeCase(g, [cand({ id: 'strong', strength: 'Strong', lines: [70, 90] })], TH);
  assert.equal(r.precision_avoidance, 0);
  assert.equal(r.verdict, 'fail');
});

test('NB6 recall via line-overlap: candidate in WRONG region of right file does NOT match expected', () => {
  // Expected lifecycle at [10,50]; skill candidate at [71,125] (groq region).
  // v0.1 file-only spuriously counts recall=1; v0.2 must report recall=0 + missed Strong.
  const g = golden({ expected: [expCand({ id: 'exp', strength: 'Strong', line_range: [10, 50] })] });
  const r = gradeCase(g, [cand({ id: 's1', strength: 'Worth exploring', lines: [71, 125] })], TH);
  assert.equal(r.recall, 0);
  assert.deepEqual(r.missed_strong, ['exp']);
  assert.equal(r.verdict, 'fail');
});

test('NB7 backward-compat: avoidance WITHOUT line_range → file-only fallback (Strong → hard violation)', () => {
  const g = golden({ avoidances: [avoid({ id: 'a-norange' })] }); // no line_range
  const r = gradeCase(g, [cand({ id: 's1', strength: 'Strong', lines: [10, 20] })], TH);
  assert.equal(r.precision_avoidance, 0); // file-only fallback still violates
  assert.equal(r.verdict, 'fail');
});

test('NB8 candidate line_range field (not lines_approx) is honored for overlap', () => {
  const g = golden({ avoidances: [avoid({ id: 'a-far', line_range: [71, 125] })] });
  const r = gradeCase(g, [cand({ id: 's1', strength: 'Strong', line_range: [10, 50] })], TH);
  assert.equal(r.precision_avoidance, 1.0); // [10,50] no overlap [71,125]
  assert.equal(r.verdict, 'pass');
});
