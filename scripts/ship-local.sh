#!/usr/bin/env bash
# Build `stage` on this Mac and submit it: TestFlight and Play internal.
#
#   npm run ship:local                    # both platforms
#   npm run ship:local -- ios             # or android
#   npm run ship:local -- --dry-run       # the checks, and the commands it would run
#
# The cloud route, the `ship` job in .github/workflows/ci.yml starting
# .eas/workflows/stage-testflight.yml, is off while the Expo free plan's builds
# are spent. This is the same release made on local hardware: the same
# `staging` profile in eas.json, the same signing credentials and version
# counter held by EAS, the same `eas submit`. `eas build --local` spends no EAS
# build credit. docs/RELEASING.md, "Shipping stage from a Mac", has the rest.
#
# It ships exactly what CI tested, or nothing. It refuses unless HEAD is
# origin/stage, the working tree is clean, and GitHub's `verify` check passed on
# that SHA.
#
# The platforms are independent, as in the cloud workflow: an iOS failure does
# not stop Android. They run one after the other, because two native release
# builds at once do not fit in 16 GB.
set -uo pipefail

# The version ci.yml pins.
eas=(npx --yes eas-cli@24.8.0)
profile=staging

dry_run=false
platforms=()
for arg in "$@"; do
  case "$arg" in
    ios | android) platforms+=("$arg") ;;
    --dry-run) dry_run=true ;;
    *)
      echo "usage: ship-local.sh [ios|android] [--dry-run]" >&2
      exit 2
      ;;
  esac
done
[ ${#platforms[@]} -gt 0 ] || platforms=(ios android)

cd "$(dirname "$0")/.." || exit 1
sha=$(git rev-parse HEAD) || exit 1
short=${sha:0:7}
mkdir -p dist
log=dist/ship-$short.log

refuse() {
  echo "ship-local: refusing. $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null || refuse "$1 is not installed. docs/RELEASING.md lists what a local build needs."
}

# Prints the command, and runs it unless this is a dry run.
run() {
  echo "+ $*"
  $dry_run || "$@"
}

guards() {
  git fetch --quiet origin stage || refuse "git fetch origin stage failed."
  local stage
  stage=$(git rev-parse origin/stage)
  [ "$sha" = "$stage" ] ||
    refuse "HEAD is $short and origin/stage is ${stage:0:7}. Ship from a checkout of it: git switch --detach origin/stage"
  [ -z "$(git status --porcelain)" ] ||
    refuse "the working tree has changes, and a local build would ship them. git status says what."

  # The check's name is read from the file, so a rename there cannot leave this
  # looking for a check that no longer exists.
  local check result
  check=$(awk '/^  verify:/ { v = 1 } v && /^    name:/ { sub(/^    name: */, ""); print; exit }' .github/workflows/ci.yml)
  [ -n "$check" ] || refuse "could not read the verify job's name from .github/workflows/ci.yml."
  result=$(gh api "repos/{owner}/{repo}/commits/$sha/check-runs?per_page=100" \
    --jq "[.check_runs[] | select(.name == \"$check\")][0] | .conclusion // .status // \"missing\"") ||
    refuse "could not read $short's checks from GitHub. Is gh logged in?"
  [ "$result" = success ] ||
    refuse "CI check \"$check\" on $short is ${result:-missing}, not success. Ship only what CI passed."

  local p account
  for p in "${platforms[@]}"; do
    case "$p" in
      ios) need xcodebuild; need pod; need fastlane ;;
      android)
        need java
        export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
        [ -d "$ANDROID_HOME/ndk" ] || refuse "no Android SDK with an NDK at $ANDROID_HOME. Set ANDROID_HOME."
        ;;
    esac
  done

  account=$("${eas[@]}" whoami 2>/dev/null | head -1) && [ -n "$account" ] ||
    refuse "eas-cli is not logged in: npx eas-cli login"
  echo "Expo account: $account"
}

build() {
  local p=$1 artifact=$2
  if [ "$p" = ios ]; then
    run "${eas[@]}" build --local --platform ios --profile "$profile" --non-interactive --output "$artifact"
    return
  fi
  # Not --output on Android. The profile's buildArtifactPaths (R8's mapping.txt)
  # is written to the --output path as well, after the .aab, and replaces it:
  # eas-cli-local-build-plugin 24.8.0, artifacts.js. A directory keeps both.
  local out=$PWD/dist/android-$short
  run rm -rf "$out" && run mkdir -p "$out" &&
    run env EAS_LOCAL_BUILD_ARTIFACTS_DIR="$out" \
      "${eas[@]}" build --local --platform android --profile "$profile" --non-interactive &&
    run mv "$out"/build-*.aab "$artifact" || return 1
  run mv "$out"/build-*.txt "${artifact%.aab}-mapping.txt" ||
    echo "warning: no R8 mapping.txt came out of this build, so Java crashes in it cannot be retraced."
}

# Up to three tries. The upload is ~90 MB from a home connection, and a dropped
# socket (`write EPIPE` at 20%, the first Android run) fails a build that is
# fine. Repeating is safe: a store refuses a build number it already has, so a
# retry after an upload that did land cannot ship twice.
submit() {
  local p=$1 artifact=$2 attempt
  for attempt in 1 2 3; do
    run "${eas[@]}" submit --platform "$p" --profile "$profile" --path "$artifact" --non-interactive && return 0
    [ "$attempt" -lt 3 ] && echo "submit failed (attempt $attempt of 3); trying again in 30s" && sleep 30
  done
  return 1
}

main() {
  echo "== $(date '+%Y-%m-%d %H:%M:%S') ship-local $short ${platforms[*]}$($dry_run && echo ' (dry run)')"
  guards

  # The EAS environment on the profile (`preview`) decides the API URL and the
  # rest of EXPO_PUBLIC_*. eas-cli lets this shell override it, so a sourced
  # .env would ship a staging build pointed at localhost.
  # shellcheck disable=SC2046
  unset $(compgen -e EXPO_PUBLIC_)

  # A release build uploads source maps (Android) and source maps plus dSYMs
  # (iOS) to Sentry, and fails if it cannot. SENTRY_AUTH_TOKEN is a secret EAS
  # variable, which a local build is not given.
  local sentry_note=""
  if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
    export SENTRY_DISABLE_AUTO_UPLOAD=true
    sentry_note="SENTRY_AUTH_TOKEN is not set: this build uploads nothing to Sentry, so its stack traces there stay minified and unsymbolicated."
    echo "warning: $sentry_note"
  fi

  local rows=() failed=0 p ext artifact built submitted
  for p in "${platforms[@]}"; do
    [ "$p" = ios ] && ext=ipa || ext=aab
    artifact=dist/blendn-$short-$profile-$p.$ext
    built=fail submitted=skipped
    echo
    echo "== $(date '+%H:%M:%S') $p: build"
    if build "$p" "$artifact"; then
      built=ok
      echo "== $(date '+%H:%M:%S') $p: submit"
      if submit "$p" "$artifact"; then
        submitted=ok
      else
        submitted=fail
      fi
    fi
    [ "$built/$submitted" = ok/ok ] || failed=1
    rows+=("$p $built $submitted $artifact")
  done

  if $dry_run; then
    echo
    echo "Dry run: the checks passed and nothing was built."
    return 0
  fi

  echo
  printf '%-9s %-6s %-8s %s\n' platform build submit artifact
  for row in "${rows[@]}"; do
    # shellcheck disable=SC2086
    printf '%-9s %-6s %-8s %s\n' $row
  done
  [ -z "$sentry_note" ] || echo "warning: $sentry_note"
  echo "Log: $log"
  return "$failed"
}

main 2>&1 | tee -a "$log"
exit "${PIPESTATUS[0]}"
