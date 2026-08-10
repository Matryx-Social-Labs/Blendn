#!/usr/bin/env bash
#
# Typecheck against a recorded baseline.
#
# ## Why not just `tsc --noEmit`
#
# This repo has 6 pre-existing type errors. A gate that fails on all of them
# would be red from the first run, and a CI check that is always red is a CI
# check everyone learns to ignore -- which is worse than not having one.
#
# So: fail when a NEW error appears, pass when the set is unchanged, and nag
# when errors are FIXED so the baseline gets tightened rather than drifting
# permissive.
#
# ## Why line numbers are stripped
#
# Comparing raw `tsc` output would fail on any edit that shifts a line, which is
# every edit. The baseline records file + error code + message, which is stable
# under reformatting and still specific enough that a genuinely new error is a
# new line.
#
# ## Refresh the baseline after fixing something
#
#   ./scripts/typecheck.sh --update
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BASELINE=".typecheck-baseline.txt"
TSC="./node_modules/.bin/tsc"

if [ ! -x "$TSC" ]; then
  echo "typescript not installed. Run: npm ci" >&2
  exit 1
fi

current="$(mktemp)"
trap 'rm -f "$current"' EXIT

# `tsc` exits non-zero when there are errors, which is the normal case here.
"$TSC" --noEmit -p tsconfig.json 2>&1 \
  | grep -E '^\S+\.tsx?\([0-9]+,[0-9]+\): error' \
  | sed -E 's/\(([0-9]+),([0-9]+)\)//' \
  | sort > "$current" || true

if [ "${1:-}" = "--update" ]; then
  cp "$current" "$BASELINE"
  echo "Baseline updated: $(wc -l < "$BASELINE" | tr -d ' ') errors recorded."
  exit 0
fi

if [ ! -f "$BASELINE" ]; then
  echo "No baseline. Create one with: ./scripts/typecheck.sh --update" >&2
  exit 1
fi

# Anything in current that is not in the baseline is new, and blocks.
new="$(comm -23 "$current" "$BASELINE" || true)"
# Anything in the baseline no longer present has been fixed. Not a failure --
# but the baseline should shrink to lock the improvement in.
fixed="$(comm -13 "$current" "$BASELINE" || true)"

if [ -n "$fixed" ]; then
  echo "Fixed since the baseline was recorded:"
  echo "$fixed" | sed 's/^/  /'
  echo "Lock it in:  ./scripts/typecheck.sh --update"
  echo
fi

if [ -n "$new" ]; then
  echo "NEW type errors introduced by this change:" >&2
  echo "$new" | sed 's/^/  /' >&2
  echo >&2
  echo "Fix them, or if one is genuinely pre-existing and the baseline is stale," >&2
  echo "run ./scripts/typecheck.sh --update and explain why in the PR." >&2
  exit 1
fi

echo "Typecheck OK: $(wc -l < "$current" | tr -d ' ') known errors, none new."
