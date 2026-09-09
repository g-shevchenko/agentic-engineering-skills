#!/usr/bin/env node
// Deterministic handoff pre-score / terminal bench.
//
// This does not grade model prose. It checks representative handoff artifacts
// for the operational invariants the handoff skill is supposed to enforce.

import assert from "node:assert/strict";

const REQUIRED = [
  "Compaction Handoff",
  "Objective",
  "Current state",
  "First action",
  "Suggested skills",
  "Files in progress",
  "Constraints",
];

const PUBLIC_BOUNDARY_REQUIRED_WHEN = ["MCP token economy", "public repo", "publication"];
const AGENTS = ["Claude Code", "Codex", "Cursor", "Windsurf"];
const BANNED = [
  "PRIVATE_API_KEY",
  "private-cdn.example",
  "203.0.113.10",
  "private.gateway",
  "private-capture-helper",
  "PASSWORD=",
  "BEGIN PRIVATE KEY",
];

const fixtures = [
  {
    id: "good-cross-agent",
    expectPass: true,
    text: `# Compaction Handoff

## Objective
Continue the Pantheon Quality & Evals implementation without rediscovery.

## Current state
API contract passes; UI e2e is pending. Do not touch unrelated .claude/scheduled_tasks.lock.

## First action
Run: cd services/pantheon-ui && npx playwright test e2e/evals.spec.cjs --config=playwright.local.config.cjs

## Suggested skills
Claude Code, Codex, Cursor, Windsurf: use handoff, hwai-stack-mode, context-prep.

## Files in progress
- your-api/src/providers/evals.js: ready
- your-ui/app.js: needs_review

## Constraints
No destructive git commands. Preserve user changes.
`,
  },
  {
    id: "good-public-boundary",
    expectPass: true,
    text: `# Compaction Handoff

## Objective
Prepare MCP token economy publication wrapper.

## Current state
Public article draft targets gregshevchenko.com, GitHub, dev.to, LinkedIn, Reddit.

## First action
Run: node validators/no_moat_leak.mjs the research articlemethods_v3/README.md

## Suggested skills
Claude Code, Codex, Cursor, Windsurf: use handoff and mcp-stack-moat-guard.

## Files in progress
- the research articlemethods_v3/README.md: ready

## Constraints
Public/private boundary: public-safe generic methods only; private tuned orchestration stays out.
`,
  },
  {
    id: "bad-summary-only",
    expectPass: false,
    text: `We talked about many things. Everything is basically done. Continue however you like.`,
  },
  {
    id: "bad-moat-leak",
    expectPass: false,
    text: `# Compaction Handoff

## Objective
MCP token economy publication.

## Current state
Use PRIVATE_API_KEY and private.gateway details.

## First action
Publish now.

## Suggested skills
Claude Code, Codex, Cursor, Windsurf.

## Files in progress
- article.md: editing

## Constraints
Public/private boundary: none.
`,
  },
];

function score(text) {
  const missing = REQUIRED.filter((token) => !text.includes(token));
  const banned = BANNED.filter((token) => text.includes(token));
  const needsBoundary = PUBLIC_BOUNDARY_REQUIRED_WHEN.some((token) => text.includes(token));
  const hasBoundary = text.includes("Public/private boundary");
  const missingAgents = AGENTS.filter((token) => !text.includes(token));
  const firstActionCommandish = /First action[\s\S]{0,160}(Run:|read |open |inspect |cd |node |npx |curl |rg )/i.test(text);

  const failures = [];
  if (missing.length) failures.push(`missing required sections: ${missing.join(", ")}`);
  if (banned.length) failures.push(`banned markers present: ${banned.join(", ")}`);
  if (needsBoundary && !hasBoundary) failures.push("public/private boundary missing for public-bound MCP work");
  if (missingAgents.length) failures.push(`missing agent surface mentions: ${missingAgents.join(", ")}`);
  if (!firstActionCommandish) failures.push("first action is not command/read/edit specific");

  return {
    pass: failures.length === 0,
    failures,
    score: Math.max(0, 100 - failures.length * 18 - missing.length * 4 - banned.length * 25),
  };
}

const results = fixtures.map((fixture) => {
  const result = score(fixture.text);
  return { id: fixture.id, expected: fixture.expectPass, ...result };
});

for (const result of results) {
  assert.equal(
    result.pass,
    result.expected,
    `${result.id}: expected pass=${result.expected}, got ${result.pass}; ${result.failures.join("; ")}`,
  );
}

const passingGood = results.filter((r) => r.expected && r.pass).length;
const totalGood = results.filter((r) => r.expected).length;
const rejectingBad = results.filter((r) => !r.expected && !r.pass).length;
const totalBad = results.filter((r) => !r.expected).length;
const averageScore = Math.round(
  results.filter((r) => r.expected).reduce((sum, r) => sum + r.score, 0) / Math.max(1, totalGood),
);

console.log(JSON.stringify({
  ok: true,
  average_score: averageScore,
  pass_good: `${passingGood}/${totalGood}`,
  reject_bad: `${rejectingBad}/${totalBad}`,
  results,
}, null, 2));
