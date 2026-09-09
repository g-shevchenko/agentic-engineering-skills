---
name: close-task
description: Close a completed repo task end-to-end with FULL CLOSURE gates: merge all task PRs, deploy every touched server surface, live smoke on prod, close hygiene (prune gone locals + remove finished task/zombie worktrees), clean branches + handoff in ALL touched repos, update memory (resolved archive), and report proof per gate. Triggers on "закрой задачу", "close the task", "ship and close", "git ship", "merge to main", "archive chat", "archive a chat", "закрой полностью".
---

# Close Task — full closure (5 hard gates)

Use this skill when Greg says `закрой задачу`, `закрывай`, `close the task`,
`ship and close`, **`git ship`**, **`merge to main`**, **`archive chat`**,
**`archive a chat`**, `закрой полностью`, or asks whether
commit/PR/push/merge/deploy were done.

> Greg directive 2026-07-16: «git ship» / «merge to main» / «archive chat» =
> the FULL closure below, not just the PR-merge cycle. `scripts/git-ship.sh`
> remains the mechanical merge helper for THIS repo (and calls
> `scripts/git-close-hygiene.sh`); the gates below are the contract the agent
> drives around it (team repos, deploys, smoke, handoff, memory).

## Why remote zombies + dead worktrees appear (read once)

They are not GitHub being slow. Agents create them and forget to tear them down:

| Source | What accumulates |
|---|---|
| Isolation worktree (canon: `git worktree add ~/_wt/…`) | Directory + local branch left after merge |
| Legacy worktree in `/tmp` or `.claude/worktrees/` | Same, plus it is in a **forbidden** location — `git worktree move` it to `_wt/` if it holds uncommitted work, remove it if clean (`the project rule (see your repo rules)`) |
| Ship from disposable worktree | Merge deletes remote, but **current** worktree still holds the local branch → `: gone]` + held |
| Deploy snapshot worktrees | Extra checkouts for `deploy-*.sh` never removed |
| Shared primary dirty | Next session creates yet another worktree instead of cleaning |
| Missing hygiene on cleanup-only ship | Already-merged path used to skip `git-close-hygiene.sh` |
| Repo without auto-delete-on-merge | Remote branch survives merge until explicit `git push --delete` |

**Prevention rule:** every `git ship` / close MUST end with Gate 1b hygiene that
(1) proves task remote = 0 refs, (2) removes the worktrees of **this task**, and
(3) proves closure — `work_on_origin_main=1` (preferred; touches nothing) or THIS
worktree on the single local `main` at `origin/main` tip — or names the exact
blocker. Other sessions' worktrees are **not** swept unless explicitly asked
(`--sweep-foreign`): tearing down your own tails must never tear down theirs.

## Contract

Closing a task is not just saying "done". It means the work is shipped, merged,
**deployed where it must run, proven live**, and leaves ZERO tails — or the
agent clearly reports the exact blocker per gate. "Done" without proof is
forbidden.

### Gate 0 — Branch ownership (BEFORE any ship/merge/delete of a named branch)

> Greg directive 2026-08-19: agent proposed `git ship` on a **foreign** GEO
> deliverables branch (`cursor/geo-finboo-vireo-reports-*`) it had not authored —
> «ты выбил бы из-под ног фактически всю задачу у работающей ветки». The skill
> scoped correctly to *this* task's branch, but had no gate against scoping to
> a *neighbour's* branch. This gate is that missing floor.

`git ship <branch>` / `merge <branch>` / `delete <branch>` — and even
**suggesting** them for a branch — is allowed ONLY when the branch is provably
**owned by this session's task**. Shipping or deleting a branch you did not
create destroys the working session that owns it (ship merges the PR, deletes
the remote ref, and hygiene removes the worktree out from under it).

Before any ship/merge/delete suggestion or command on a branch, prove ownership.
A branch is **yours** only if ALL true:

1. **You created it or this session committed to it** — the branch tip's commits
   are this session's work (`git log origin/main..<branch>` shows only commits
   you made), OR Greg explicitly named this exact branch as the close target.
2. **No other live session holds it** — it has no attached worktree with an
   active agent session (`node scripts/worktree_session_liveness.mjs <wt>`),
   and no open PR owned by another task.

If ANY check fails → the branch is **foreign**. Do NOT ship / merge / delete /
propose shipping it. Name it as "foreign, owned by another session/task" and
leave it untouched (same discipline as `--sweep-foreign` being opt-in).

**Anti-patterns this gate blocks:**
- ❌ After finishing YOUR branch, scanning `git branch` and offering to ship the
  remaining ones "to be helpful" — those are other tasks' working branches.
- ❌ Treating "branch is not on main / has unmerged commits" as a reason to ship
  it. Unmerged = someone is still working, not "trash to clean".
- ❌ Ship on a branch merely because it is clean and idle — a clean idle
  deliverables branch still belongs to the session that produced it.

**Separate the two axes — never merge them into one verdict** (Greg directive
2026-08-19, codex/multitenant incident):

| Axis | Command | Meaning |
|---|---|---|
| **Work committed?** | `git -C <wt> status --short` | empty = clean tree, nothing left to commit |
| **Merged to main?** | `git rev-list --count origin/main..<branch>` | N>0 = N commits not yet in main |

A branch can be **clean AND unmerged**: all work is committed (nothing to
commit), but those commits are not in `main`. NEVER report this as "2 unmerged
commits" in a way that reads as "work not committed / branch dirty" — that is
factually wrong and makes Greg re-check a clean branch. Correct phrasing:
"work is committed (clean tree); N commits not yet in main; merge will hit
add/add conflicts in <files>". "Unmerged vs main" and "uncommitted" are
different axes; conflating them is a bug.

## The 5 hard gates (all must pass, each with proof)

### Gate 1 — Merge (ALL touched repos)
- **Before merging any PR**, it is READY — `node validators/pr_merge_readiness.mjs <pr> [--repo …]`
  (exit 0 ready · 1 blocked · 2 NOT MEASURED; an empty checks list is NOT green).
  Green checks are necessary, not sufficient: the gate also refuses a PR whose
  BASE has moved (`blocked_stale_base`), because a green check describes the tree
  it ran on and a squash merge re-runs nothing. Seeing "but the checks are green"
  next to that verdict is the expected shape, not a false positive — rebase, let
  CI run again, re-check.
  `scripts/gh_merge_verify.mjs` runs this itself and refuses a red merge, so
  merging through it satisfies the gate — true for base freshness only since
  2026-08-19 (#4703); before that this sentence overstated the canonical path. There is no server-side branch
  protection on this plan, so this local check is the only thing standing
  between a red PR and `main`. SSOT: `the project rule (see your repo rules)`.
- Every PR belonging to the task is MERGED (monorepo AND team repos:
  hwai-workspace-platform, contentos-api, etc.).
- Remote task branches deleted: `git ls-remote origin refs/heads/<branch>` → 0
  refs, in every touched repo. Local task branches deleted where not held by a
  session worktree.
- Local `main` fast-forwarded ONLY with non-destructive commands (`--ff-only`;
  if `main` is checked out in another worktree, ff-pull THERE after proving it
  is clean). Never `git reset --hard`.
- Monorepo helper: `bash scripts/git-ship.sh` (already runs close hygiene
  best-effort after merge **and** on cleanup-only).

#### Gate 1 — Manual merge fallback (when `git-ship.sh` cannot checkout the feature branch)

If `git-ship.sh` cannot run because the feature branch is checked out in another
worktree, fall back to a manual `gh pr merge` — but drive the SAME gates. See
`the project rule (see your repo rules)` (rule 154) for the full
contract. Summary:

1. **Do NOT pass `--delete-branch`** to `gh pr merge` in a multi-worktree repo
   — `gh`'s internal branch-delete runs its own `git checkout <default>` →
   collides when `main` is held elsewhere → exits non-zero AFTER the merge
   succeeded (rule 120). The PR is MERGED but neither branch is deleted.
2. `gh pr merge <PR> --squash` (no `--delete-branch`).
3. Verify state at the source of truth: `gh pr view <PR> --json state` →
   `MERGED`; `git ls-remote --heads origin <branch>` → if still present,
   `git push origin --delete <branch>`.
4. Run Gate 1b hygiene with `--require-remote-gone` (see below).
5. Run Gate 1b′ conversation retarget (see below).
6. Emit Gate 5 proof table.

Origin: 2026-08-17 PR #4501 — `gh pr merge --delete-branch` from a disposable
worktree reported EXIT=0, but the remote branch survived, the primary stayed on
the feature branch with dirty `finance.json`, hygiene was never run, and Greg
had to come back to close the chat a second time.

### Gate 1a — Carve, when the branch is shared with another session

If the task branch carries commits from MORE than this session, do **not** ship the whole
branch — carve this session's work onto its own branch off `origin/main` and PR that:

```bash
node scripts/git_carve_session.mjs --session="$HWAI_SESSION_ID" --execute   # or --commits= / --domain=
```

`verdict=no_carve_needed` → ship the branch directly. `not_measured` (exit 2) → nothing is
attributable; never carve on a guess. The source branch is never rewritten, force-pushed or
deleted by the carve — the other session's commits stay on it.

A file BOTH sessions committed to is split by commit history, not blocked. If the work is
still uncommitted, add `--uncommitted`: it splits the file using the verified edit journal
and leaves the working tree untouched. `contested_paths` now means only the genuinely
unsplittable case — attribution by `--domain`, where paths carry no authorship.

### Gate 1b — Close hygiene (REQUIRED before archive chat)

Run in **every touched repo** after Gate 1. Prefer the monorepo script even
from a team clone (cwd = that clone):

```bash
# FEATURE = the branch you just shipped; SHA = its tip, captured BEFORE deletion
# (git-ship.sh passes this automatically); WT = disposable worktree path if any
bash  \
  --task-branch="$FEATURE" \
  --task-sha="$SHA" \
  --task-worktree="${WT:-}" \
  --require-remote-gone
```

**Session-scoped closure (2026-08-10).** The gate passes on **`work_on_origin_main=1`
OR `on_main_tip=1`**. `work_on_origin_main` = your shipped SHA is an ancestor of
`origin/main`, measurable from any checkout without mutating anything — so a session
in a disposable worktree closes **without commandeering the shared primary clone**,
which is another agent's workspace. `-1` means NOT MEASURED (no `--task-sha`) and is
never a pass; `0` is expected after a squash/rebase merge and falls back to
`on_main_tip`. The foreign-worktree sweep (`--sweep-foreign`) is **opt-in** — do not
pass it unless Greg asked to clear other sessions' tails.

**Devin/Windsurf codename worktree cleanup (2026-08-17).** Devin CLI and Windsurf
create worktrees with random codename branches (`brass-shannon`, `cobalt-governor`)
that have **no upstream, no remote ref, no PR** — they're invisible to the `[gone]`
and PR-merged hygiene checks, so they pile up in `~/.windsurf/worktrees/`. After
Gate 1b from the primary clone, also run:

```bash
bash  \
  --sweep-orphans
```

This catches codename session orphans (no upstream + no remote + no PR + clean +
idle + tip is a Cascade snapshot or branch merged to main) and removes them.
Safe: only touches clean, idle (lsof cwd) worktrees, never the current or primary.
**Run this from the primary clone, not from inside a codename worktree** — a
worktree cannot remove itself.

If you are still **inside** the disposable task worktree after ship:

```bash
# 1) leave it
cd    # or team primary
# If another clean worktree holds main, remove it first. If it is dirty/active,
# move its work to a feature branch; do not mint a main alias.
git fetch origin
git switch main
git merge --ff-only origin/main
# 2) remove the finished task worktree
git worktree remove --force "$WT"
# 3) re-run hygiene with --require-remote-gone
```

Proof required in the Gate 5 table (parse the `HYGIENE_SUMMARY=` line):
- `task_remote_gone=1` (or named blocker);
- `task_worktree_removed=1` OR `current_is_task_worktree=0` after you left + removed;
- **`work_on_origin_main=1` OR `on_main_tip=1`** — either the shipped SHA is proven on
  `origin/main`, or THIS checkout is the single local `main` at `origin/main`;
  `legacy_main_alias_present=0`. `work_on_origin_main=-1` is NOT MEASURED, not a pass;
- `held_gone_remaining` explained if > 0 (other agents' dirty worktrees — named, not force-wiped);
- dirty porcelain: **clean**, or leftovers **named** in the proof table.
  Do **not** stash unrelated WIP into the shared primary clone at close
  (`tmp-unrelated-close-session` anti-pattern).

### Gate 1b′ — Conversation retarget (REQUIRED before archive chat)

Incident 2026-07-28: ship ran from a disposable worktree; hygiene printed
`ok=1` + `current_is_task_worktree=0` while the Cursor primary stayed on an
**unrelated** feature branch. Task remote was gone, but the chat was not on
`main` → false "archive OK".

After Gate 1 / 1b, before declaring archive allowed:

1. Leave any disposable task worktree; remove it from primary.
2. **Preferred (2026-08-10): prove closure instead of retargeting.** If hygiene reports
   `work_on_origin_main=1` with `--task-sha`, the work is provably on `origin/main` and
   this step is satisfied — do NOT move the shared primary clone, which another agent is
   very likely using. Steps 2–3 below are the fallback for `work_on_origin_main` = `0`
   (squash/rebase merge) or `-1` (not measured), and for a session that IS the primary.
   In the **conversation primary clone** (not a random WT):
   ```bash
   git fetch origin
   # Exactly one integration branch is allowed. If another worktree holds main:
   # - clean/finished holder → git worktree remove <path>
   # - dirty/active holder → switch that holder to its named feature branch
   # Never create macbook/main or another tracking alias.
   git switch main
   git merge --ff-only origin/main
   test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
   ```
   If the primary has unrelated dirty work that blocks this switch, name the
   blocker and stop; do not stash, reset, or hide it in a second `main`.
3. Cursor metadata: `SetActiveBranch` → `main`. Preflight
   the **recorded migrated feature branch** (the tip Cursor will fetch), not
   `main`:
   ```bash
   node scripts/agent-root-move-preflight.mjs --branch=<recorded-feature-branch> --json
   ```
   - `exists=true` → `move_agent_to_root` to the primary clone path is safe.
   - `exists=false` (common after merge + branch delete) → **do not** call
     `move_agent_to_root`. Stay on the canonical root already on
     `main`. If `stale_local_tracking_ref=true`, run
     `git fetch origin --prune`.
   - ❌ Preflight `--branch=main` always passes and does **not** prove move is
     safe — Cursor still fetches the deleted feature tip (SCR-20260728-wsc).
4. Re-run hygiene with `--require-remote-gone` and confirm
   `HYGIENE_SUMMARY … work_on_origin_main=1 (or on_main_tip=1) … ok=1`.

`current_is_task_worktree=0` alone is **not** proof the conversation is on
main. Other agents' open feature branches (e.g. `claude/prefix-diet-*` with
an open PR) must stay untouched — do not delete them to "clean archive".
Local-only work must live on a named feature/WIP branch, never on `main`.
Preserve it under that branch before retargeting; never silently discard it.

`archive chat` / `archive a chat` is **blocked** until Gate 1b + 1b′ proof is
in the final report (or an explicit blocker is stated). Soft-report-only
`--from-ship` without `--require-remote-gone` is **not** enough for archive.

### Gate 2 — Deploy + live smoke (every touched server surface)
- If the task touched a deployable surface, the CANONICAL deploy path must have
  run with exit 0 in this session:
  - hwai-workspace-platform → `bash scripts/deploy-workspace.sh` (covers all tenants);
  - contentos-api → `bash scripts/contentos_deploy.sh` (Mini; release gates must pass);
  - Pantheon UI/API / static landings / site → per the project deploy rules.
- Prefer deploy **from `origin/main` tip** (or a clean worktree at that tip), not
  from a dirty shared primary — see `deploy-shared-artifacts-from-main`.
- **Live smoke proves the NEW behavior on prod** — `/health` alone is NEVER
  sufficient (consumer-runtime-proof gate): call the real endpoint/page with a
  real payload and assert the change-specific marker.
- No safe deploy path (no SSH/keys, destructive step)? Say so explicitly with
  exact commands for Greg — do not pretend prod is updated.

### Gate 3 — Handoff / SSOT sweep
- The task's SSOT note has NO open "Follow-up" without a CLOSED status or an
  explicit named owner + tracked task.
- No stale handoff doc still promises undone work from this task
  (`git grep` the task's key terms across `notes/` on main).
- Docs updated per KNOWLEDGE_MANAGEMENT_PROTOCOL (rules/skills/blueprints the
  task materially changed).

### Gate 4 — Memory (resolved archive)
- The resolved-archive memory (`project_resolved_archive_2026h1.md` or current)
  carries the task entry: FULLY CLOSED + shipped, PR/deploy refs, «don't
  re-investigate» — or an explicit list of intentionally-open tails.
- `node scripts/check_memory_index.mjs` → OK.

### Gate 5 — Proof report (the final message)
A table with one row per gate: PRs + merge SHAs; Gate 1b `HYGIENE_SUMMARY=…`
including **`work_on_origin_main=1` or `on_main_tip=1`**; conversation checkout branch +
`HEAD==origin/main`; deploy exits + release gates; live-smoke command +
observed marker; branch refs = 0; SSOT/handoff status; memory line. Unrelated
dirty files / other agents' branches: named and left untouched (never stashed
into shared primary). Any gate that could not pass: the exact blocker + next
command.

## Workflow (mechanics inside the gates)

1. Restate the intended close target in one sentence.
2. `git status --short --branch` in every touched repo; identify unrelated
   dirty files and OTHER agents' work — never stage or delete it.
3. Confirm proof is current: narrow tests for touched code; run
   `node projects/hwai-astro-migration/scripts/session_guard.mjs --allow-dirty`
   before commit/PR/deploy in the monorepo.
4. Doc sweep for material behavior/process changes.
5. Stage only files belonging to the task; patch-stage mixed files or stop with
   a decision-ready explanation.
6. Commit (conventional message) → push → PR with proof in the body.
7. Merge when CI is green (bounded waits — `scripts/gh_wait_pr_checks.mjs` or a
   capped poll; never an unbounded `until gh pr checks` loop).
   Prefer `bash scripts/git-ship.sh` in the monorepo.
8. Run Gate 2 deploys + smoke, Gate 3 sweep, Gate 4 memory.
9. **Gate 1b** with `--task-branch` + `--task-sha` +
   `--require-remote-gone`. If still inside the task worktree: leave it, remove
   it from primary, re-run hygiene.
10. **Gate 1b′ Conversation retarget:** primary checkout + Cursor active branch
    on the single local `main` at `origin/main` tip; re-run hygiene until
    `work_on_origin_main=1` (or `on_main_tip=1`) and `legacy_main_alias_present=0`.
11. Emit the Gate 5 proof report — only then treat **archive chat** as allowed.

## Anti-patterns (will recreate the pile)

- ❌ Ship and leave the disposable worktree around "for later"
- ❌ `archive chat` after `git-ship.sh` without reading `HYGIENE_SUMMARY=`
- ❌ Treat `current_is_task_worktree=0` as "on main" while primary is still on
  another feature branch while closure is UNPROVEN (`work_on_origin_main` or `on_main_tip` must be 1)
- ❌ Leave Cursor `SetActiveBranch` / migrated root on the shipped feature tip
- ❌ Preflight `move_agent_to_root` with `--branch=main` after deleting the
  feature tip — toast: `couldn't find remote ref` (SCR-20260728-wsc)
- ❌ Stash foreign WIP in shared primary to "get onto main"
- ❌ Move the shared primary onto `main` when `work_on_origin_main=1` already proves closure
- ❌ Pass `--sweep-foreign` by reflex — it removes OTHER sessions' worktrees, and their
  gitignored contents (`.agent/tasks/`, local logs) die with them
- ❌ Delete another agent's open feature branch/PR to force a clean archive
- ❌ Offer or run `git ship` / `merge` / `delete` on a branch you did not author —
  unmerged ≠ trash; a foreign branch is another session's live work (Gate 0)
- ❌ Deploy from a dirty shared clone instead of `origin/main` tip
- ❌ Open a second worktree because primary is dirty — clean or isolate first
  (`check_task_occupancy` / worktree-path-discipline)
- ❌ `gh pr merge --delete-branch` from a non-primary worktree, then treat
  EXIT=0 as "branch deleted" without reading `git ls-remote` and `gh pr view
  --json state` — leaves remote branch alive, primary on the feature branch,
  hygiene never run (rule 154: manual-merge-fallback-needs-hygiene)

## Reporting

Final response must include per-gate proof (commit hashes, branches, PR URLs,
merge results, deploy exits, smoke outputs, **`HYGIENE_SUMMARY=` line**,
memory/index status) and any unrelated dirty files left untouched (named, not
stashed). If CI or branch protection blocks a merge, report the blocker and
leave the PR URL.
