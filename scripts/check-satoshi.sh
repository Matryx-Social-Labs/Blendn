#!/usr/bin/env bash
# Puts the Satoshi fonts in place for a build, or stops it early, by name.
#
# Satoshi is gitignored (ITF licence; this repo is public), so a checkout from
# GitHub — an EAS workflow build, a fresh clone, a new worktree — has none.
# Runs as EAS's `eas-build-pre-install` hook (package.json) and in
# scripts/ship-local.sh's guards.
#
# 1. Files already here (a local machine; `eas build --local` and CLI uploads,
#    which carry them through .easignore): nothing to do.
# 2. Missing, and SATOSHI_FONTS_PART_1 is set: the EAS file secrets. A secret
#    file may be at most 32 KiB, so the gzipped tar of the four unmodified
#    OTFs is split in order across SATOSHI_FONTS_PART_1, _2, … (EAS hands the
#    build each part's path). The parts are joined and the four named files
#    extracted, nothing else.
# 3. Still missing: fail, unless this is a development-client build, which
#    embeds no bundle (Metro on the developer's machine needs the fonts).
#
# The file names are read from lib/fonts.ts, which requires them, so the two
# cannot disagree. Never prints the secret's contents.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
dir=$root/assets/fonts/satoshi
names=$(grep -o 'assets/fonts/satoshi/[A-Za-z-]*\.otf' "$root/lib/fonts.ts" | sed 's#.*/##' | sort -u)
[ -n "$names" ] || { echo "check-satoshi: lib/fonts.ts requires no Satoshi file; nothing to check." >&2; exit 0; }

missing() {
  local name
  for name in $names; do [ -f "$dir/$name" ] || echo "$name"; done
}

if [ -n "$(missing)" ] && [ -n "${SATOSHI_FONTS_PART_1:-}" ]; then
  archive=$(mktemp)
  trap 'rm -f "$archive"' EXIT
  i=1
  while part_var="SATOSHI_FONTS_PART_$i" && [ -n "${!part_var:-}" ]; do
    [ -f "${!part_var}" ] || { echo "check-satoshi: $part_var is set but is not a file." >&2; exit 1; }
    cat "${!part_var}" >>"$archive"
    i=$((i + 1))
  done
  # A part missing or out of date leaves a truncated archive, which would
  # unpack a cut-off font that still "exists". gzip's checksum refuses it.
  gzip -t "$archive" 2>/dev/null || {
    echo "check-satoshi: the SATOSHI_FONTS_PART secrets do not join into a whole archive (a part is missing or stale). docs/RELEASING.md, \"Satoshi\", says how to set them." >&2
    exit 1
  }
  mkdir -p "$dir"
  # shellcheck disable=SC2086 # one member name per word
  tar -xzf "$archive" -C "$dir" $names
  echo "check-satoshi: restored the Satoshi files from $((i - 1)) SATOSHI_FONTS_PART secrets."
fi

gone=$(missing | tr '\n' ' ' | sed 's/ $//')
if [ -n "$gone" ]; then
  case "${EAS_BUILD_PROFILE:-}" in
    development*)
      echo "check-satoshi: Satoshi missing ($gone) — fine for a development client, which embeds no bundle." >&2
      exit 0
      ;;
  esac
  echo "Satoshi fonts missing — see docs/RELEASING.md, \"Satoshi\". Not found in assets/fonts/satoshi/: $gone" >&2
  echo "They are never committed (ITF Free Font License, public repo): copy them in from the design export, or give the build the SATOSHI_FONTS_PART_* EAS secrets." >&2
  exit 1
fi
echo "check-satoshi: $(echo "$names" | wc -l | tr -d ' ') Satoshi files present."
