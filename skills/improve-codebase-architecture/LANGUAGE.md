# Vocabulary

> Use these terms exactly when reasoning about candidates and presenting the report. Drift in vocabulary = drift in algorithm.

## Module

Anything with an **interface** and an **implementation**: a function, a class, a package, a service, a vertical slice of features. Granularity is contextual — the same code can be a module at one level (the whole package) and contain modules at another (each exported function).

## Interface

Everything a caller **must know** to use the module:

- Types (signatures, return shape)
- Invariants (what must hold before / during / after)
- Error modes (what can fail, what propagates, what's swallowed)
- Ordering / lifecycle (must be called before X, must be torn down)
- Config / environment (env vars, files, side effects)
- Performance contract (cheap call vs heavy I/O)

The interface is the **test surface**. If the test mocks something not in the interface, the interface is wrong.

## Implementation

The code inside. **Callers must not depend on it.** When implementation can be freely rewritten without breaking callers, the interface is clean.

## Depth

The **leverage** at the interface: how much behavior the caller gets per unit of interface complexity.

- **Deep module** = small interface, large implementation. The caller writes one line; the module does work. Examples: `JSON.parse`, `fetch`, `git commit`.
- **Shallow module** = interface complexity ≈ implementation complexity. The caller pays the cost of understanding the interface but gets little leverage. Often a pass-through, a thin wrapper, a "structure for structure's sake" class.

The unit of measure (informal v0.1, may become an MCP later):

```
interface_complexity =
    types_in_signature
    + invariants_documented
    + error_modes
    + ordering_constraints
    + config_inputs

implementation_complexity =
    LOC_inside
    + cyclomatic
    + dependencies_called
    + side_effects

depth = implementation_complexity / interface_complexity
```

Deepening = raising depth without changing observable behavior.

## Shallow module — signs

- Interface name and implementation name nearly match (`UserService.getUser(id)` → `db.users.find({id})` and nothing more)
- One caller, one implementation, no test seam
- The "interface" is a pure data passthrough with no validation/transformation
- Removing the module compresses two files into one with no information loss → it's shallow

## Seam

> Feathers (2004): "a place where you can alter behavior without editing in place"

A seam is **where an interface lives**: an `interface` declaration in TS, an abstract base class, a `Protocol` in Python, a configuration of plugins. Seams enable testing, swapping, and isolating change.

A **real seam** has ≥ 2 adapters. A seam with 1 adapter is a **hypothetical seam** — it's speculative architecture and earns nothing yet.

## Adapter

A concrete implementation satisfying an interface at a seam. `LocalFileStore` and `S3FileStore` are two adapters at the `FileStore` seam.

## Leverage

What **callers** get from depth. The reason callers should prefer the deep module over rolling their own.

## Locality

What **maintainers** get from depth: change concentrated in one place, bug surface concentrated in one place, knowledge concentrated in one place. The maintenance argument for deepening.

## Complecting (Hickey)

To **braid together** things that should be separate. Common complectings to watch for:

- Config + logic — env/config reads **interleaved with or buried inside business logic** (an env read in the middle of a calculation, a function that re-reads config on every call)
- IO + computation (HTTP call interleaved with calculation)
- Validation + persistence (DB write does validation as a side effect)
- Auth + authorization + business rules
- Time/clock + scheduling logic (hard to test)
- Error handling + happy path (try/catch around every line)

**Decomplecting** = separating them at a seam. Usually: extract a pure function from an impure one; move config to the edge; isolate IO behind an adapter.

### Config-at-edge is NOT complecting (precision guard)

> The fix for "config + logic" complecting IS config-at-edge — so config-at-edge is the *target*, not a smell.

Reading env/config **once at module init (the edge)**, before any request/business logic — module-top `X = os.environ.get(...)` / `const X = process.env...` constants — is the **correct** configuration-at-edge pattern (Bernhardt imperative shell). **Do NOT flag it** as complecting, and **do NOT** propose "move config to call-time parameters" as a deepening — that's a design-philosophy swap, not a depth gain, and it pushes config back *into* the call path. Only flag config reads that are *interleaved with business logic* (read in the middle of a computation, or re-read per call). Module-top config constants → leave them. (Born from the 2026-05-21 exporter recall run — a blind agent over-flagged module-init env reads as complecting; see ADR-0005.)

## Deletion test

> Pocock (paraphrased): "Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep."

Use this to validate candidates. Apply mentally before recommending. If the result is ambiguous, that's information — note it in the report.

## Deep vs shallow — examples

| Deep | Shallow |
|---|---|
| `JSON.parse(s)` — 1-line interface, full grammar parser inside | `class UserDTO { constructor(u) { this.u = u } toString() { return this.u.name } }` |
| `git commit -m msg` — one verb, repository invariants, atomic ref update | `function getUserName(user) { return user.name }` (vs just `user.name`) |
| `fetch(url, opts)` — one call, redirect handling, encoding, body parsing | `class UserService { getUser(id) { return db.users.find({id}) } }` — pure passthrough |
| HWAI `language-graph-mcp.get_blast_radius(file)` — one call, deterministic local graph traversal | A "manager" class with one method that calls one repository method |

## DRY is not deepening (precision guard)

> Removing duplication and *deepening* are different refactors. This skill finds **deepening** opportunities. Do not flag a duplication just because it is duplicated.

A duplication is a **deepening** opportunity only when the module you would extract is itself **deep** — the duplicated block is *substantial logic* whose extraction concentrates real complexity behind a small interface (locality + leverage). Extracting a **thin wrapper** (a few lines of I/O plumbing, a lazy-init, a header builder, a status-check) to remove duplication produces a **shallow** helper (interface ≈ implementation): that is DRY, not deepening, and earns nothing in depth.

**The test (apply before flagging any "consolidate"/"extract helper" candidate):**

> *Imagine the helper you'd extract. Does it ITSELF pass the deep-module test — small interface, large implementation, callers get real leverage? Or is its interface as wide as its body (≤ ~10 lines of mechanical plumbing)?*

- Helper would be **deep** → legitimate deepening candidate (rank by leverage).
- Helper would be **shallow** → DRY-only. Do **not** present it as a deepening opportunity. At most a single **Speculative** "minor DRY" note — never `Strong`/`Worth exploring`.

**Worked contrast:**

| Duplication | Extracted helper | Verdict |
|---|---|---|
| `worker.py` ~30-line block: `oom_guard → local_transcribe → groq fallback → optional diarize`, duplicated across two callers | `_transcribe_with_fallback(audio, lang, allow_cloud, with_diarization)` — a small interface hiding the whole **fallback policy** (substantial branching logic). Callers get the policy for free. | **Deep** → legitimately Worth-exploring (this is `smoke-003`, landed in PR #887). |
| `reader-mcp` two fetch branches each doing `fetch(BASE+path, {headers, body}) → if !ok throw → .json()` | `postScraperCore(path, body, traceId)` — ~6 lines wrapping `fetch`; interface (path+body) ≈ implementation. | **Shallow** → DRY-only, omit (the deepening payoff is zero — `fetch` is already the deep module). |
| `cache.py` `client()` / `rq_client()` identical lazy-init, differ only by `decode_responses` | `_make_client(decode)` — 4 lines; a boolean-flagged factory that reads *worse* at call sites than two named accessors. | **Shallow** → DRY-only, Speculative at most. |

Duplication of substantial logic is real friction; duplication of thin plumbing usually is not. When in doubt, run the deletion test on the *would-be helper*, not on the duplication.

## Functional core, imperative shell (Bernhardt)

The most useful target shape for deepening. Decompose into:

- **Functional core** — pure functions, no I/O, exhaustively unit-testable, hold all the logic.
- **Imperative shell** — thin orchestration, does I/O, calls the core, integration-tested at happy path only.

Most "deepen this module" recommendations end up at this shape.

## CONTEXT.md (domain glossary)

Project-specific vocabulary. The skill reads this first to use the project's terms. When a deepening introduces a new domain concept (e.g. "Refresh Window"), it gets added here.

Format: `**Term** — one-sentence definition tied to how it's used in this codebase.`

## ADR (architectural decision record)

When the user rejects a candidate **with a load-bearing reason** (not just "later"), capture it as an ADR. Format per Michael Nygard:

```
# ADR-NNNN: <title>
Status: Proposed | Accepted | Superseded by ADR-MMM
Date: YYYY-MM-DD
## Context
What's the situation, what forces are at play?
## Decision
What did we decide?
## Consequences
What becomes easier? What becomes harder? What new risks?
## Alternatives considered
Brief mention of options A, B with why-not.
```

Stored at `docs/adr/NNNN-<slug>.md`.
