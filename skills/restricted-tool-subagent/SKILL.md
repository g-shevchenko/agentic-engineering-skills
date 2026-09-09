---
name: restricted-tool-subagent
description: Use when dispatching a verifier, reviewer, test-author, or any role-specialized subagent. Set tools frontmatter to enforce CAPABILITY separation (not just contextual separation). Closes the "subagent could silently amend its own findings" gap documented by Copilot TDD-red pattern, Anthropic Sub-agents docs, AgentCoder, TDFlow.
---

# Restricted-Tool Subagent

When a subagent's role is to AUDIT, VERIFY, or AUTHOR-TESTS (not implement), capability separation MUST be enforced at the SDK level via `tools:` frontmatter — not just instruction text.

## Why this matters

Research convergence (Diamond #2 — unanimous across all 5 streams):

- **Anthropic Sub-agents docs**: built-in **Explore** subagent is Haiku-backed + read-only by design
- **GitHub Copilot TDD-red.agent.md** (official VS Code guide): `tools: [read, edit, search]` — no `execute`
- **AgentCoder** (arxiv:2312.13010, ACL 2025): test-designer separation prevents programmer from gaming own tests (+6-13pp pass@1 at half tokens)
- **TDFlow** (arxiv:2510.23761, EACL 2026): 4 sub-agents, each with focused scope, achieves 94.3% pass@1 on SWE-Bench Verified
- **Revisit Self-Debug** (arxiv:2501.12793): one-agent self-debug loops produce "bias introduced by self-generated tests"

Instruction text alone ("do not modify code") is NOT a deterministic guarantee. A future Claude session may rationalize a violation. SDK-level tool restriction IS deterministic.

## Tool-restriction matrix

| Subagent role | `tools:` frontmatter | What's omitted | Rationale |
|---|---|---|---|
| **verifier** | `Read, Grep, Glob, Bash` | Write, Edit | Audits only; emits verdict.json via Bash heredoc |
| **reviewer** | `Read, Grep, Glob, Bash` | Write, Edit | Finds issues; cannot silently fix what it found |
| **test-author** | `Read, Grep, Glob, Bash, Write` | Edit | Writes new test files; cannot modify production code (Edit could touch src/**) |
| **implementer** | `Read, Grep, Glob, Bash, Write, Edit` | (none, but body forbids test paths) | Writes impl; body rule blocks test files (immutability lock) |
| **explorer** | `Read, Grep, Glob` | Bash, Write, Edit | Pure code-map, no side effects (like Anthropic's built-in Explore) |
| **researcher** | `Read, Grep, Glob, Bash, WebFetch` | Write, Edit | Information gathering; no commit authority |
| **orchestrator** | `Read, Bash, Task` | Write, Edit | Spawns subagents; doesn't write files itself |

## Pattern

In `.claude/agents/<name>.md` frontmatter:

```yaml
---
name: your-verifier
description: Read-only audit subagent
tools: Read, Grep, Glob, Bash
maxTurns: 100
---
```

Omit `Write` and `Edit` entirely from the `tools:` line for read-only roles. This is the durable enforcement.

For roles that need restricted write (test-author can write tests but not src), use `tools:` to grant + body text to constrain paths. When the Anthropic SDK supports glob-restricted `disallowedTools`, prefer that.

## Anti-pattern (what HWAI looked like BEFORE 2026-05-20)

```yaml
---
name: bad-verifier
tools: Read, Grep, Glob, Bash, Write, Edit  # ← verifier can write anywhere
---
You are the verifier. Do not modify production code.  # ← instruction only, not enforced
```

The instruction is correct; the tooling permits violation. A confused or malicious future session could trivially modify source thinking it's "the fix".

## HWAI proof-loop reference

After the 2026-05-20 SPLIT (PR shipping this skill):

- `.claude/agents/task-verifier.md` — `tools: Read, Grep, Glob, Bash` (Write/Edit removed)
- `.claude/agents/task-test-author.md` — `tools: Read, Grep, Glob, Bash, Write` (Edit absent)
- `.claude/agents/task-implementer.md` — `tools: Read, Grep, Glob, Bash, Write, Edit` (body forbids test paths)
- `.claude/agents/task-fixer.md` — `tools: <full>` (body forbids test paths)
- `.claude/agents/proof-loop.md` — `tools: Read, Bash, Task` (orchestrator can't write)

## Sources

- Anthropic Sub-agents docs (Explore = read-only Haiku by design)
- GitHub Copilot VS Code TDD guide (TDD-red.agent.md restricted tools)
- AgentCoder, TDFlow, Revisit Self-Debug papers
- HWAI research SSOT: `TDD research notes` § Diamond #2

## Composes with

- `task-verifier`, `task-test-author`, `task-implementer`, `task-fixer`, `proof-loop` agents (this skill IS their tool-frontmatter source-of-truth)
- `verify-red-checkpoint` skill (test-author role requires this)
- `tdd-verify-red` rule (deterministic enforcement layer)
- Anthropic SDK glob-restricted `disallowedTools` (when supported, prefer over body-text constraints)
