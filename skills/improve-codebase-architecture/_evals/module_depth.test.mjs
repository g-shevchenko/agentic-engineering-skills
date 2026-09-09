// TDD tests for the deterministic deep-module scorer (Ousterhout depth proxy).
// Run: node --test module_depth.test.mjs
//
// The scorer is the deterministic "expert toolset" half of the iSMELL pattern
// (LLM judgment + deterministic detector). It must independently corroborate
// the skill's blind LLM depth judgments: a small-interface/large-impl module
// scores DEEP; a thin forwarding wrapper scores SHALLOW; a wide-interface/
// thin-impl utils bag scores SHALLOW (the classic Ousterhout shallow module).
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreModule, compareDepth } from "./module_depth.mjs";

// --- fixtures (inline, language-tagged) ---

// Deep: small interface (1 public fn, 1 param) hiding a large cohesive impl.
const DEEP_PY = `import os
BASE = int(os.environ.get("BASE", "50"))

def score_application(app: dict) -> dict:
    score = BASE
    flags = []
    income = float(app.get("annual_income", 0) or 0)
    requested = float(app.get("loan_amount", 0) or 0)
    if income < 30000:
        score -= 20
        flags.append("low_income")
    ratio = (requested / income) if income else 999.0
    if ratio > 0.5:
        score -= 15
        flags.append("high_ltv")
    elif ratio < 0.15:
        score += 10
    history = int(app.get("credit_history_years", 0) or 0)
    score += min(history, 10) * 2
    delinq = int(app.get("delinquencies_24m", 0) or 0)
    if delinq:
        score -= delinq * 12
        flags.append("delinquency")
        if delinq >= 3 and "low_income" in flags:
            score -= 10
            flags.append("compounding_risk")
    if app.get("employment") == "full_time":
        score += 8
    elif app.get("employment") in ("unemployed", "gig"):
        score -= 10
        flags.append("unstable")
    score = max(0, min(100, score))
    band = "low" if score >= 70 else "medium" if score >= 45 else "high"
    return {"score": score, "band": band, "flags": flags}
`;

// Shallow: thin forwarding wrapper — interface ~= implementation.
const SHALLOW_WRAPPER_PY = `import requests

def post_scraper_core(payload: dict) -> dict:
    return requests.post("https://scraper-core/fetch", json=payload).json()
`;

// Shallow: wide interface, thin impl — the classic Ousterhout shallow module
// (many tiny public helpers, each near-trivial).
const SHALLOW_UTILS_PY = `def to_upper(s): return s.upper()
def to_lower(s): return s.lower()
def trim(s): return s.strip()
def first(xs): return xs[0]
def last(xs): return xs[-1]
def is_empty(xs): return len(xs) == 0
def head(xs, n): return xs[:n]
def tail(xs, n): return xs[-n:]
`;

// God function: one public fn well over the length threshold + deep nesting.
const GOD_FN_PY = `def handle(req):
    if req:
        for x in req:
            if x:
                while x.next:
                    if x.ok:
                        x.run()
    a = 1
${Array.from({ length: 30 }, (_, i) => `    a = a + ${i}`).join("\n")}
    return a
`;

const MANY_PARAMS_PY = `def configure(host, port, user, password, timeout, retries, verbose):
    return (host, port, user, password, timeout, retries, verbose)
`;

const DEEP_TS = `import { db } from "./db";

export async function settleInvoice(invoiceId: string): Promise<Result> {
  const inv = await db.invoices.get(invoiceId);
  if (!inv) throw new Error("not found");
  let total = 0;
  for (const line of inv.lines) {
    if (line.taxable) {
      total += line.amount * (1 + line.taxRate);
    } else {
      total += line.amount;
    }
    if (line.discount) {
      total -= line.discount;
    }
  }
  if (total < 0) total = 0;
  const status = total === 0 ? "void" : "settled";
  await db.invoices.update(invoiceId, { total, status });
  return { total, status };
}
`;

// --- tests ---

test("NB1 deep module (small interface, large cohesive impl) → band 'deep'", () => {
  const r = scoreModule(DEEP_PY, { lang: "python" });
  assert.equal(r.band, "deep");
  assert.equal(r.public_symbols, 1);
  assert.ok(r.depth_ratio > 8, `expected depth_ratio > 8, got ${r.depth_ratio}`);
});

test("NB2 thin forwarding wrapper → band 'shallow'", () => {
  const r = scoreModule(SHALLOW_WRAPPER_PY, { lang: "python" });
  assert.equal(r.band, "shallow");
  assert.ok(r.depth_ratio < 3, `expected depth_ratio < 3, got ${r.depth_ratio}`);
});

test("NB3 deep ratio strictly exceeds shallow ratio (relative invariant)", () => {
  const deep = scoreModule(DEEP_PY, { lang: "python" });
  const shallow = scoreModule(SHALLOW_WRAPPER_PY, { lang: "python" });
  assert.ok(
    deep.depth_ratio > shallow.depth_ratio,
    `deep ${deep.depth_ratio} should exceed shallow ${shallow.depth_ratio}`,
  );
});

test("NB4 wide-interface thin-impl utils bag → band 'shallow' (Ousterhout shallow)", () => {
  const r = scoreModule(SHALLOW_UTILS_PY, { lang: "python" });
  assert.ok(r.public_symbols >= 6, `expected many public symbols, got ${r.public_symbols}`);
  assert.equal(r.band, "shallow");
});

test("NB5 god-function factor flagged for an over-long function", () => {
  const r = scoreModule(GOD_FN_PY, { lang: "python" });
  assert.ok(
    r.factors.some((f) => f.startsWith("god_function")),
    `expected a god_function factor, got ${JSON.stringify(r.factors)}`,
  );
});

test("NB6 deep-nesting factor flagged when nesting exceeds threshold", () => {
  const r = scoreModule(GOD_FN_PY, { lang: "python" });
  assert.ok(
    r.factors.some((f) => f.startsWith("deep_nesting")),
    `expected a deep_nesting factor, got ${JSON.stringify(r.factors)}`,
  );
});

test("NB7 high-parameter-count factor flagged", () => {
  const r = scoreModule(MANY_PARAMS_PY, { lang: "python" });
  assert.ok(
    r.factors.some((f) => f.startsWith("many_params")),
    `expected a many_params factor, got ${JSON.stringify(r.factors)}`,
  );
});

test("NB8 TS/JS export detection drives the interface surface", () => {
  const r = scoreModule(DEEP_TS, { lang: "ts" });
  assert.equal(r.public_symbols, 1);
  assert.equal(r.band, "deep");
});

test("NB9 compareDepth reports 'deeper' when ratio rises", () => {
  const before = scoreModule(SHALLOW_WRAPPER_PY, { lang: "python" });
  const after = scoreModule(DEEP_PY, { lang: "python" });
  const cmp = compareDepth(before, after);
  assert.equal(cmp.direction, "deeper");
  assert.ok(cmp.depth_ratio_delta > 0, `expected positive delta, got ${cmp.depth_ratio_delta}`);
});

test("NB10 empty / comment-only source scores gracefully (no throw, no NaN)", () => {
  const r = scoreModule("# just a comment\n\n", { lang: "python" });
  assert.equal(r.public_symbols, 0);
  assert.ok(Number.isFinite(r.depth_ratio), `depth_ratio must be finite, got ${r.depth_ratio}`);
});
