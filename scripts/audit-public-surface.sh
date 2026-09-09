#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

failures=0

check() {
  local name="$1"
  local pattern="$2"
  if grep -RInE "$pattern" . \
    --exclude-dir=.git \
    --exclude='audit-public-surface.sh' \
    --exclude='*.trust.json'; then
    echo "audit: FAIL: $name" >&2
    failures=$((failures + 1))
  fi
}

check "common secret token" '(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9_]{20,}|hf_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})'
check "private monorepo reference" 'greg-personal-claude|CREDENTIALS\.md|/Users/(greg|user)/|r2d2|hwai-ops|contentos\.hwai|humanswith-ai/greg-personal-claude'
check "placeholder markers" 'TODO|FIXME|TBD|your-org/your-repo|<your-|xxx-xxx'

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

echo "audit: OK"
