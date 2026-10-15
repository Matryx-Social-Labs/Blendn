#!/usr/bin/env bash
# Fails fast when the Satoshi fonts are not in this checkout.
#
# Satoshi is gitignored (ITF licence; this repo is public), so a checkout from
# GitHub — an EAS workflow build, a fresh clone, a new worktree — has none, and
# without them Metro fails deep inside the build. This says so in the first
# minute instead. Run by EAS before npm install (`eas-build-pre-install` in
# package.json) and by scripts/ship-local.sh before it builds anything.
#
# The file names are read from lib/fonts.ts, which requires them, so the two
# cannot disagree. Development-client builds embed no JS bundle and are let
# through: Metro on the developer's machine needs the fonts, not the build.
set -euo pipefail

case "${EAS_BUILD_PROFILE:-}" in development*) exit 0 ;; esac

root=$(cd "$(dirname "$0")/.." && pwd)
names=$(grep -o 'assets/fonts/satoshi/[A-Za-z-]*\.otf' "$root/lib/fonts.ts" | sort -u)
[ -n "$names" ] || { echo "check-satoshi: lib/fonts.ts requires no Satoshi file; nothing to check." >&2; exit 0; }

missing=()
for rel in $names; do
  [ -f "$root/$rel" ] || missing+=("$rel")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Satoshi fonts missing — see docs/RELEASING.md, \"Satoshi\". Not found: ${missing[*]}" >&2
  echo "They are never committed (ITF Free Font License, public repo); copy the four unmodified OTFs in from the design export before building." >&2
  exit 1
fi
echo "check-satoshi: $(echo "$names" | wc -l | tr -d ' ') Satoshi files present."
