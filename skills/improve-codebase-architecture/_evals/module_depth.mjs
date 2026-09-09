// Deterministic deep-module scorer — an Ousterhout depth proxy.
//
// Why this exists: the improve-codebase-architecture skill's value is LLM
// judgment (deletion test, recognizing complecting, designing interfaces),
// but per the iSMELL pattern (LLM + deterministic expert toolset) and
// CodeScene's "Code Red" research (a deterministic code-health aggregate
// matches SotA ML at predicting maintainability), the skill needs a
// deterministic instrument to (a) make its Phase-6 before/after deltas
// tool-computed instead of hand-typed, and (b) independently corroborate the
// LLM's depth judgments.
//
// The metric is Ousterhout's: a DEEP module has a SMALL interface hiding a
// LARGE implementation. depth_ratio = implementation_complexity /
// interface_surface. High ratio = deep (good). Low ratio = shallow (a thin
// wrapper, or a wide-interface utils bag) = a deepening candidate.
//
// v0.1, deliberately lightweight + language-agnostic (heuristic, like
// repo-hygiene-mcp's scan_complexity_hotspots). Thresholds are tunable and
// validated to separate the eval fixtures; n is small — see MEASUREMENT.md.
// Pure functions only — liftable verbatim into repo-hygiene-mcp.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const GOD_FUNCTION_LINES = 25; // a single function body longer than this
const DEEP_NESTING_LEVEL = 3; // nesting deeper than this
const MANY_PARAMS = 4; // more public params than this
const SHALLOW_BELOW = 3; // depth_ratio < this → shallow
const DEEP_AT_OR_ABOVE = 8; // depth_ratio ≥ this → deep

const W_PUBLIC_SYMBOL = 2;
const W_PUBLIC_PARAM = 0.5;
const W_IMPL_LINE = 1;
const W_FUNCTION = 2;
const W_BRANCH = 1;
const W_EXCESS_NESTING = 3;

function langFromExt(filename = "") {
  if (/\.(py|pyi)$/.test(filename)) return "python";
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filename)) return "ts";
  return "python";
}

function isComment(line, lang) {
  const t = line.trim();
  if (!t) return false;
  if (lang === "python") return t.startsWith("#");
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function leadingSpaces(line) {
  const expanded = line.replace(/\t/g, "    ");
  const m = expanded.match(/^( *)/);
  return m ? m[1].length : 0;
}

function countParams(sig) {
  // sig is the text inside the first (...) of a def/function declaration
  const inner = sig.trim();
  if (!inner) return 0;
  return inner
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p !== "self" && p !== "cls" && p !== "*" && p !== "/").length;
}

function extractSignatureParams(line) {
  const open = line.indexOf("(");
  if (open === -1) return 0;
  let depth = 0;
  let end = -1;
  for (let i = open; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return 0; // multi-line signature — params on later lines (rare); count what we see
  return countParams(line.slice(open + 1, end));
}

function detectIndentUnit(lines) {
  let unit = Infinity;
  for (const raw of lines) {
    const line = raw.replace(/\t/g, "    ");
    if (!line.trim()) continue;
    const ind = leadingSpaces(line);
    if (ind > 0 && ind < unit) unit = ind;
  }
  return Number.isFinite(unit) ? unit : 4;
}

function functionMatches(line, lang) {
  if (lang === "python") {
    const m = line.match(/^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (m) return { indent: m[1].length, name: m[2], kind: "def" };
    const c = line.match(/^(\s*)class\s+([A-Za-z_]\w*)/);
    if (c) return { indent: c[1].length, name: c[2], kind: "class" };
    return null;
  }
  // ts/js
  const fn = line.match(/^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (fn) return { indent: fn[1].length, name: fn[2], kind: "function" };
  const cls = line.match(/^(\s*)(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/);
  if (cls) return { indent: cls[1].length, name: cls[2], kind: "class" };
  const arrow = line.match(/^(\s*)(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^)]*\)?\s*=>/);
  if (arrow) return { indent: arrow[1].length, name: arrow[2], kind: "arrow" };
  return null;
}

function isPublicTopLevel(name, indent, lang) {
  if (indent !== 0) return false;
  if (lang === "python") return !name.startsWith("_");
  return true; // TS: only `export`ed forms reach here (regex requires export at top level)
}

function tsTopLevelIsExported(line) {
  return /^\s*export\b/.test(line) || /^\s*export\s+default\b/.test(line);
}

export function scoreModule(source, opts = {}) {
  const lang = opts.lang || langFromExt(opts.filename || "");
  const rawLines = String(source).split("\n");
  const unit = detectIndentUnit(rawLines);

  let implLines = 0;
  let branches = 0;
  let maxNesting = 0;
  let functions = 0;
  let publicSymbols = 0;
  let publicParams = 0;
  const factors = [];

  // First pass: per-line metrics + collect function declarations.
  const funcDecls = [];
  rawLines.forEach((raw, idx) => {
    const line = raw.replace(/\t/g, "    ");
    if (!line.trim() || isComment(line, lang)) return;
    const indent = leadingSpaces(line);
    const level = Math.round(indent / unit);
    if (level > maxNesting) maxNesting = level;
    if (indent > 0) implLines += 1;
    const branchMatches = line.match(/\b(if|elif|else|for|while|except|case|catch|and|or)\b/g) || [];
    branches += branchMatches.length;
    const decl = functionMatches(line, lang);
    if (decl) {
      const params = decl.kind === "class" ? 0 : extractSignatureParams(line);
      const isPublic =
        lang === "python"
          ? isPublicTopLevel(decl.name, decl.indent, lang)
          : decl.indent === 0 && tsTopLevelIsExported(line);
      funcDecls.push({ ...decl, params, startIdx: idx, isPublic });
      if (decl.kind !== "class") functions += 1;
      if (isPublic) {
        publicSymbols += 1;
        publicParams += params;
        if (params > MANY_PARAMS) factors.push(`many_params:${decl.name}:${params}`);
      }
    }
  });

  // Second pass: per-function body length (god-function detection).
  for (const fn of funcDecls) {
    if (fn.kind === "class") continue;
    let bodyLen = 0;
    for (let j = fn.startIdx + 1; j < rawLines.length; j++) {
      const line = rawLines[j].replace(/\t/g, "    ");
      if (!line.trim() || isComment(line, lang)) continue;
      if (leadingSpaces(line) <= fn.indent) break; // dedent → function ended
      bodyLen += 1;
    }
    if (bodyLen > GOD_FUNCTION_LINES) factors.push(`god_function:${fn.name}:${bodyLen}`);
  }

  if (maxNesting > DEEP_NESTING_LEVEL) factors.push(`deep_nesting:${maxNesting}`);

  const excessNesting = Math.max(0, maxNesting - 1);
  const impl_complexity =
    implLines * W_IMPL_LINE +
    functions * W_FUNCTION +
    branches * W_BRANCH +
    excessNesting * W_EXCESS_NESTING;
  const interface_surface = publicSymbols * W_PUBLIC_SYMBOL + publicParams * W_PUBLIC_PARAM;
  const depth_ratio = Number((impl_complexity / Math.max(interface_surface, 1)).toFixed(2));

  let band;
  if (depth_ratio < SHALLOW_BELOW) band = "shallow";
  else if (depth_ratio >= DEEP_AT_OR_ABOVE) band = "deep";
  else band = "balanced";

  return {
    interface_surface: Number(interface_surface.toFixed(2)),
    impl_complexity,
    depth_ratio,
    band,
    public_symbols: publicSymbols,
    loc: implLines,
    factors,
  };
}

export function compareDepth(before, after) {
  const depth_ratio_delta = Number((after.depth_ratio - before.depth_ratio).toFixed(2));
  let direction = "flat";
  if (depth_ratio_delta > 0.5) direction = "deeper";
  else if (depth_ratio_delta < -0.5) direction = "shallower";
  return {
    direction,
    depth_ratio_delta,
    band_before: before.band,
    band_after: after.band,
    interface_surface_delta: Number((after.interface_surface - before.interface_surface).toFixed(2)),
    impl_complexity_delta: after.impl_complexity - before.impl_complexity,
  };
}

// --- CLI: `node module_depth.mjs <file> [...more]` or `--compare <before> <after>` ---
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === "--compare" && args.length === 3) {
    const before = scoreModule(readFileSync(args[1], "utf8"), { filename: args[1] });
    const after = scoreModule(readFileSync(args[2], "utf8"), { filename: args[2] });
    console.log(JSON.stringify({ before, after, compare: compareDepth(before, after) }, null, 2));
  } else if (args.length) {
    const out = args.map((f) => ({ file: f, ...scoreModule(readFileSync(f, "utf8"), { filename: f }) }));
    console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
  } else {
    console.error("usage: node module_depth.mjs <file> [...] | --compare <before> <after>");
    process.exit(2);
  }
}
