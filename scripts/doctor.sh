#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "doctor: FAIL: $*" >&2
  exit 1
}

need_file() {
  [[ -f "$1" ]] || fail "missing $1"
}

need_dir() {
  [[ -d "$1" ]] || fail "missing $1"
}

need_file README.md
need_file VERIFY_BEFORE_INSTALL.md
need_file SECURITY.md
need_file LICENSE
need_file scripts/install.sh
need_file scripts/audit-public-surface.sh

for skill in agent-mvp-blueprint handoff overnight-task-queue restricted-tool-subagent json-feature-ledger close-task improve-codebase-architecture; do
  need_dir "skills/$skill"
  need_file "skills/$skill/SKILL.md"
  grep -q "^name:" "skills/$skill/SKILL.md" || fail "missing name in skills/$skill/SKILL.md"
  grep -q "^description:" "skills/$skill/SKILL.md" || fail "missing description in skills/$skill/SKILL.md"
done

echo "doctor: OK"
