#!/usr/bin/env bash
# Build `stage` on this Mac, launch it, and submit it: TestFlight and Play internal.
#
#   npm run ship:local                    # both platforms
#   npm run ship:local -- ios             # or android
#   npm run ship:local -- --dry-run       # the checks, and the commands it would run
#   npm run ship:local -- --smoke-only android dist/blendn-<sha>-staging-android.aab
#   npm run ship:local -- --smoke-only ios          # builds HEAD for the simulator
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
# Per platform: toolchain → build → launch (the smoke test) → submit. Nothing is
# submitted that has not launched. Build 118 went to TestFlight unlaunched,
# built by the wrong Xcode, and crashed at launch on every iPhone on iOS 27.
#
# The platforms are independent, as in the cloud workflow: an iOS failure does
# not stop Android. They run one after the other, because two native release
# builds at once do not fit in 16 GB.

# The per-platform steps are called by name: "${p}_toolchain", "smoke_$p".
# shellcheck disable=SC2329
set -uo pipefail

# The version ci.yml pins.
eas=(npx --yes eas-cli@24.8.0)
profile=staging
# The emulator the Android smoke test boots when none is running.
avd=${SMOKE_AVD:-Blendn_A34}
# The smoke test's launch, and how long the app must then stay up to pass.
smoke_flow=.maestro/smoke/launch.yaml
smoke_seconds=30

usage() {
  cat >&2 <<'EOF'
usage: ship-local.sh [ios|android] [--dry-run] [--allow-xcode <version>]
                     [--skip-smoke --i-launched-it-myself]
       ship-local.sh --smoke-only android <file.aab>
       ship-local.sh --smoke-only ios [--allow-xcode <version>]
EOF
  exit 2
}

dry_run=false smoke_only=false skip_smoke=false launched_by_hand=false
allow_xcode="" aab=""
platforms=()
while [ $# -gt 0 ]; do
  case "$1" in
    ios | android) platforms+=("$1") ;;
    --dry-run) dry_run=true ;;
    --allow-xcode)
      [ $# -ge 2 ] || usage
      allow_xcode=$2
      shift
      ;;
    --skip-smoke) skip_smoke=true ;;
    --i-launched-it-myself) launched_by_hand=true ;;
    --smoke-only) smoke_only=true ;;
    *.aab) aab=$(realpath "$1") || usage ;;
    *) usage ;;
  esac
  shift
done
[ ${#platforms[@]} -gt 0 ] || platforms=(ios android)
if $skip_smoke && ! $launched_by_hand; then
  echo "ship-local: refusing. --skip-smoke submits a build nobody launched, which is how build 118 reached TestFlight. Launch it yourself first, then add --i-launched-it-myself." >&2
  exit 2
fi
if $smoke_only && [[ " ${platforms[*]} " == *" android "* ]] && [ -z "$aab" ]; then
  echo "ship-local: --smoke-only android needs the .aab to launch." >&2
  usage
fi

cd "$(dirname "$0")/.." || exit 1
sha=$(git rev-parse HEAD) || exit 1
short=${sha:0:7}
# A smoke test of an .aab made elsewhere is filed under that build's commit.
if $smoke_only && [[ ${aab##*/} =~ ^blendn-([0-9a-f]{7})- ]]; then
  short=${BASH_REMATCH[1]}
fi
mkdir -p dist
log=dist/ship-$short.log

refuse() {
  echo "ship-local: refusing. $*" >&2
  exit 1
}

# Refuses one platform. The other still ships.
decline() {
  local p=$1
  shift
  echo "ship-local: refusing $p. $*" >&2
  return 1
}

need() {
  local p=$1 tool
  shift
  for tool in "$@"; do
    command -v "$tool" >/dev/null ||
      decline "$p" "$tool is not installed. docs/RELEASING.md lists what a local build needs." || return 1
  done
}

# Prints the command, and runs it unless this is a dry run.
run() {
  echo "+ $*"
  $dry_run || "$@"
}

# A value from this profile in eas.json, e.g. `ios.image`.
eas_json() {
  node -p "require('./eas.json').build['$profile'].$1"
}

# 26.6.1 → 26.6, 27 → 27.0
major_minor() {
  awk -F. '{ print $1 "." ($2 == "" ? 0 : $2) }' <<<"$1"
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

  local account
  account=$("${eas[@]}" whoami 2>/dev/null | head -1) && [ -n "$account" ] ||
    refuse "eas-cli is not logged in: npx eas-cli login"
  echo "Expo account: $account"
}

# A local build ignores `image` in eas.json and uses whatever Xcode this Mac
# has. That is how build 118 was built by Xcode 27, linked the iOS 27 SDK, and
# crashed at launch on iOS 27 (docs/RELEASING.md). So find the Xcode the image
# names (macos-tahoe-26.6-xcode-27.0 → 27.0) and make it the one in use.
ios_toolchain() {
  need ios xcodebuild pod fastlane maestro || return 1
  local image required want app v installed=""
  image=$(eas_json ios.image) || return 1
  [[ $image == *-xcode-* ]] || decline ios "eas.json's $profile profile has no ios.image naming an Xcode." || return 1
  required=${image##*-xcode-}
  want=${allow_xcode:-$required}
  for app in "${DEVELOPER_DIR:+${DEVELOPER_DIR%/Contents/Developer}}" /Applications/Xcode*.app; do
    [ -f "$app/Contents/Info.plist" ] || continue
    v=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist" 2>/dev/null) || continue
    installed+=" $v ($app)"
    [ "$(major_minor "$v")" = "$(major_minor "$want")" ] || continue

    export DEVELOPER_DIR=$app/Contents/Developer
    echo "Xcode: $(xcodebuild -version | paste -sd' ' -), $DEVELOPER_DIR"
    if [ -n "$allow_xcode" ] && [ "$(major_minor "$want")" != "$(major_minor "$required")" ]; then
      cat <<EOF
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!! --allow-xcode $allow_xcode: iOS is built with Xcode $v, NOT the Xcode $required
!! that eas.json's image ($image) names and every cloud build uses.
!! A newer Xcode links a newer iOS SDK, and the SDK changes what iOS demands
!! of the app at launch. Build 118 (Xcode 27) passed everything here and
!! crashed at launch on every iPhone on iOS 27.
!! Only after the smoke test passes on a device running the newest iOS.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
EOF
    fi
    return 0
  done

  [ -z "$allow_xcode" ] || decline ios "--allow-xcode $allow_xcode, and this Mac has no Xcode $allow_xcode:${installed:- none}." || return 1
  decline ios "eas.json's $profile profile builds on $image, so iOS is built with Xcode $want, and this Mac has${installed:- no Xcode}." \
    "A different Xcode links a different iOS SDK: build 118 came from Xcode 27 and crashed at launch on iOS 27.
Install Xcode $want alongside the one you have:
  brew install xcodesorg/made/xcodes && xcodes install $want     # asks for an Apple ID
or download Xcode_$want.xip from https://developer.apple.com/download/all/, open it, and move the app to /Applications/Xcode-$want.app.
Then run this again. It finds /Applications/Xcode*.app by version (or set DEVELOPER_DIR), and xcode-select stays as it is."
}

android_toolchain() {
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  need android java bundletool maestro || return 1
  $smoke_only || [ -d "$ANDROID_HOME/ndk" ] ||
    decline android "no Android SDK with an NDK at $ANDROID_HOME. Set ANDROID_HOME." || return 1
  [ -x "$ANDROID_HOME/platform-tools/adb" ] && [ -x "$ANDROID_HOME/emulator/emulator" ] ||
    decline android "the smoke test needs adb and the emulator from $ANDROID_HOME." || return 1
  [ -f "$HOME/.android/debug.keystore" ] ||
    decline android "the smoke test signs its APK with ~/.android/debug.keystore, and there is none. Any debug build makes it." || return 1
  "$ANDROID_HOME/emulator/emulator" -list-avds 2>/dev/null | grep -qx "$avd" || [ -n "$(adb_serial)" ] ||
    decline android "the smoke test needs a running emulator or the AVD $avd (SMOKE_AVD), and there is neither."
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

# Launch it to its first screen, wait, and see that it is still up and nothing
# crashed. A green build proves it compiles, not that it opens.
smoke() {
  local p=$1 artifact=$2
  if $dry_run; then
    echo "+ smoke_$p $artifact"
    echo "+   maestro --device <$p device> test $smoke_flow   # then ${smoke_seconds}s, still running, no crash; dist/smoke-$short-$p.png"
    return 0
  fi
  "smoke_$p" "$artifact"
}

# The launch: the flow opens the app from clean and waits for the signed-out
# screen. One retry, because Maestro's iOS driver times out under host load. A
# crash on the first try is still caught: the crash checks after this cover both.
run_smoke_flow() {
  local device=$1 out=$2 try
  for try in 1 2; do
    echo "+ maestro --device $device test $smoke_flow (try $try of 2)"
    rm -rf "$out"
    MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 maestro --device "$device" test \
      --test-output-dir "$out" "$smoke_flow" && return 0
  done
  return 1
}

adb_serial() {
  "$ANDROID_HOME/platform-tools/adb" devices | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1; exit }'
}

# The .aab as a universal APK on the emulator. A subshell, so the trap cleans up.
smoke_android() (
  bundle=$1 shot=dist/smoke-$short-android.png
  tmp=$(mktemp -d) || exit 1
  # An emulator this step booted is shut down again, pass or fail: the Mac has
  # 16 GB and a left-running AVD is gigabytes nobody asked for. One that was
  # already running is left as it was.
  started=""
  trap 'rm -rf "$tmp"; [ -z "$started" ] || a emu kill >/dev/null 2>&1' EXIT
  a() { "$ANDROID_HOME/platform-tools/adb" -s "$serial" "$@"; }

  pkg=$(bundletool dump manifest --bundle="$bundle" --xpath=/manifest/@package) || return 1
  echo "+ bundletool build-apks --mode=universal ($pkg, debug-signed)"
  bundletool build-apks --bundle="$bundle" --output="$tmp/app.apks" --mode=universal \
    --ks="$HOME/.android/debug.keystore" --ks-pass=pass:android \
    --ks-key-alias=androiddebugkey --key-pass=pass:android &&
    unzip -q -d "$tmp" "$tmp/app.apks" universal.apk || return 1

  serial=$(adb_serial)
  if [ -z "$serial" ]; then
    echo "+ emulator -avd $avd -gpu host -no-snapshot-save -no-boot-anim"
    nohup "$ANDROID_HOME/emulator/emulator" -avd "$avd" -gpu host -no-snapshot-save -no-boot-anim \
      </dev/null >"$tmp/emulator.log" 2>&1 &
    started=1
  fi
  local booted=""
  for _ in $(seq 60); do
    serial=$(adb_serial)
    [ -n "$serial" ] && booted=$(a shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    [ "$booted" = 1 ] && break
    sleep 5
  done
  if [ "$booted" != 1 ]; then
    echo "smoke android: FAIL. The emulator did not boot in 5 minutes."
    tail -20 "$tmp/emulator.log" 2>/dev/null
    return 1
  fi
  echo "emulator: $serial, Android $(a shell getprop ro.build.version.release | tr -d '\r')"

  a uninstall "$pkg" >/dev/null 2>&1 # a copy signed another way refuses the install
  a install "$tmp/universal.apk" || return 1
  # Launching straight after an install on a fresh boot threw a
  # NullPointerException in handleBindApplication for a good build: the
  # package-install broadcast was still going round. Let it settle.
  for _ in $(seq 30); do
    a shell pm path "$pkg" 2>/dev/null | grep -q '^package:' && break
    sleep 1
  done
  sleep 10

  a logcat -b crash -c
  a shell am force-stop dev.mobile.maestro >/dev/null 2>&1 # a driver left over from another run
  flow=fail
  run_smoke_flow "$serial" "${shot%.png}-maestro" && flow=ok
  sleep "$smoke_seconds"
  pid=$(a shell pidof "$pkg" | tr -d '\r')
  crashes=$(a logcat -b crash -d | grep -F "$pkg")
  a exec-out screencap -p >"$shot"
  a uninstall "$pkg" >/dev/null

  if [ "$flow" != ok ] || [ -z "$pid" ] || [ -n "$crashes" ]; then
    echo "smoke android: FAIL. Flow: $flow. ${smoke_seconds}s later: ${pid:+running as $pid}${pid:-not running}. Screenshot: $shot, Maestro's output: ${shot%.png}-maestro"
    a logcat -b crash -d
    return 1
  fi
  echo "smoke android: pass. The flow reached the sign-in screen, and ${smoke_seconds}s later $pkg is still running (pid $pid), no crash. Screenshot: $shot"
)

# The store-signed .ipa runs on neither a simulator nor an unregistered device,
# so build this commit again for the simulator: same Xcode, same EAS
# environment, Release. It is done in a copy of the commit because `pod install`
# rewrites the committed Podfile.lock and project.pbxproj.
smoke_ios() (
  ipa=$1 shot=dist/smoke-$short-ios.png
  tmp=$(mktemp -d) || exit 1
  src=$tmp/src udid=""
  trap '[ -z "$udid" ] || { xcrun simctl shutdown "$udid"; xcrun simctl delete "$udid"; } >/dev/null 2>&1
    git worktree remove --force "$src" >/dev/null 2>&1; rm -rf "$tmp"' EXIT

  want=$(xcodebuild -version | awk 'NR == 1 { print $2 }')
  if [ -n "$ipa" ]; then
    # DTXcode is 2660 for 26.6, 2700 for 27.0.
    dt=$(unzip -p "$ipa" 'Payload/*.app/Info.plist' | plutil -extract DTXcode raw -o - -) || return 1
    [ $((dt / 10)) = "$(major_minor "$want" | awk -F. '{ print $1 * 10 + $2 }')" ] || {
      echo "smoke ios: FAIL. $ipa was built by Xcode $dt (DTXcode), not Xcode $want."
      return 1
    }
    echo "$ipa: built by Xcode $want (DTXcode $dt)"
  fi

  echo "+ git worktree add --detach $src $short"
  git worktree add --quiet --detach "$src" "$sha" && cp -cR node_modules "$src/" || return 1
  # A Release build that segfaults in Hermes at launch picked up Debug Hermes,
  # which a stale .last_build_configuration causes. Sentry uploads stay off: this
  # binary is never released.
  env_name=$(eas_json environment) || return 1
  cmd="cd ios && pod install && rm -f Pods/.last_build_configuration Pods/React-Core-prebuilt/.last_build_configuration && cd .."
  cmd+=" && SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace ios/blendn.xcworkspace -scheme blendn"
  cmd+=" -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator'"
  cmd+=" ARCHS=$(uname -m) -derivedDataPath '$tmp/dd' -quiet build"
  echo "+ eas env:exec $env_name \"$cmd\""
  (cd "$src" && "${eas[@]}" env:exec "$env_name" "$cmd" --non-interactive) || return 1
  app=$tmp/dd/Build/Products/Release-iphonesimulator/blendn.app
  bundle_id=$(plutil -extract CFBundleIdentifier raw "$app/Info.plist") &&
    exe=$(plutil -extract CFBundleExecutable raw "$app/Info.plist") || return 1

  # A new simulator on the newest iOS runtime there is, so nothing on it is
  # left over from a dev build.
  # shellcheck disable=SC2016
  read -r runtime devtype runtime_name < <(xcrun simctl list runtimes available -j | node -e '
    const rs = JSON.parse(require("fs").readFileSync(0, "utf8")).runtimes.filter((r) => r.platform === "iOS");
    rs.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
    const r = rs.pop();
    const t = r && r.supportedDeviceTypes.find((d) => d.productFamily === "iPhone");
    if (t) console.log(r.identifier, t.identifier, `${t.name}, iOS ${r.version}`.replace(/ /g, "_"));')
  [ -n "${devtype:-}" ] || { echo "smoke ios: no iOS simulator runtime is installed: xcodebuild -downloadPlatform iOS" && return 1; }
  udid=$(xcrun simctl create "blendn-smoke-$short" "$devtype" "$runtime") &&
    xcrun simctl bootstatus "$udid" -b >/dev/null &&
    xcrun simctl install "$udid" "$app" || return 1
  echo "simulator: ${runtime_name//_/ }"

  touch "$tmp/launched"
  flow=fail
  run_smoke_flow "$udid" "${shot%.png}-maestro" && flow=ok
  sleep "$smoke_seconds"
  # launchctl's PID column is "-" once the app has gone.
  pid=$(xcrun simctl spawn "$udid" launchctl list |
    awk -v label="UIKitApplication:$bundle_id" 'index($3, label) == 1 && $1 != "-" { print $1; exit }')
  alive=false
  [ -n "$pid" ] && alive=true
  xcrun simctl io "$udid" screenshot "$shot" >/dev/null 2>&1
  crash_reports() { find ~/Library/Logs/DiagnosticReports -newer "$tmp/launched" -name "${exe}[-_.]*" 2>/dev/null; }
  crashes=$(crash_reports)
  # On a busy Mac the report can land most of a minute after the crash.
  for _ in $(seq 60); do
    $alive || [ -n "$crashes" ] && break
    sleep 1
    crashes=$(crash_reports)
  done

  if [ "$flow" != ok ] || ! $alive || [ -n "$crashes" ]; then
    echo "smoke ios: FAIL. Flow: $flow. ${smoke_seconds}s later it is $($alive && echo running || echo 'not running'). Screenshot: $shot, Maestro's output: ${shot%.png}-maestro"
    for report in $crashes; do
      echo "crash report: $report"
      grep -o '"exception" : {[^}]*}' "$report"
    done
    return 1
  fi
  echo "smoke ios: pass. The flow reached the sign-in screen, and ${smoke_seconds}s later $bundle_id is still running (pid $pid), no crash report. Screenshot: $shot"
)

# iOS uploads straight to App Store Connect with Apple's altool when the App
# Store Connect API key is on this Mac: the free plan's EAS Submit queue held
# build 120 for 40 minutes, altool took 2.5. It is the key EAS holds for
# submissions (same ID and issuer; the issuer is not a secret). The .p8 lives
# only in ~/.appstoreconnect/private_keys (altool's own lookup path), never
# in the repo. Without it, iOS falls back to `eas submit`. Android always uses
# `eas submit`: its Play service-account key exists only on EAS.
asc_key_id=${ASC_KEY_ID:-F234C2B22X}
asc_issuer=${ASC_ISSUER_ID:-45a73825-a8a9-4741-9b94-6ad6aa2bc726}
asc_key_dir=$HOME/.appstoreconnect/private_keys

# Up to three tries. The upload is ~90 MB from a home connection, and a dropped
# socket (`write EPIPE` at 20%, the first Android run) fails a build that is
# fine. Repeating is safe: a store refuses a build number it already has, so a
# retry after an upload that did land cannot ship twice.
submit() {
  local p=$1 artifact=$2 attempt
  for attempt in 1 2 3; do
    if [ "$p" = ios ] && [ -f "$asc_key_dir/AuthKey_$asc_key_id.p8" ]; then
      run xcrun altool --upload-app -f "$artifact" -t ios \
        --apiKey "$asc_key_id" --apiIssuer "$asc_issuer" && return 0
    else
      run "${eas[@]}" submit --platform "$p" --profile "$profile" --path "$artifact" --non-interactive && return 0
    fi
    [ "$attempt" -lt 3 ] && echo "submit failed (attempt $attempt of 3); trying again in 30s" && sleep 30
  done
  return 1
}

main() {
  echo "== $(date '+%Y-%m-%d %H:%M:%S') ship-local $short ${platforms[*]}$($dry_run && echo ' (dry run)')$($smoke_only && echo ' (smoke only)')"
  $smoke_only || guards

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
  if $skip_smoke; then
    echo "warning: --skip-smoke --i-launched-it-myself: this run launches nothing before submitting. Whoever ran it says they launched this commit's builds themselves."
  fi

  # Every platform's toolchain before anything is built, so a missing one
  # refuses that platform before its version counter moves.
  local ready=" " p
  for p in "${platforms[@]}"; do
    "${p}_toolchain" && ready+="$p "
  done

  local rows=() failed=0 ext artifact built smoked submitted
  for p in "${platforms[@]}"; do
    [ "$p" = ios ] && ext=ipa || ext=aab
    artifact=dist/blendn-$short-$profile-$p.$ext
    if $smoke_only; then
      [ "$p" = ios ] && artifact="" || artifact=$aab
    fi
    built=fail smoked=- submitted=-
    if [[ $ready != *" $p "* ]]; then
      built=refused
    elif $smoke_only; then
      built=- smoked=fail
      echo
      echo "== $(date '+%H:%M:%S') $p: smoke"
      smoke "$p" "$artifact" && smoked=ok
    else
      echo
      echo "== $(date '+%H:%M:%S') $p: build"
      if build "$p" "$artifact"; then
        built=ok smoked=fail
        if $skip_smoke; then
          smoked=by-hand
        else
          echo "== $(date '+%H:%M:%S') $p: smoke"
          smoke "$p" "$artifact" && smoked=ok
        fi
        if [ "$smoked" != fail ]; then
          echo "== $(date '+%H:%M:%S') $p: submit"
          submitted=fail
          submit "$p" "$artifact" && submitted=ok
        fi
      fi
    fi
    if $smoke_only; then
      [ "$smoked" = ok ] || failed=1
    else
      [ "$submitted" = ok ] || failed=1
    fi
    rows+=("$p $built $smoked $submitted ${artifact:-HEAD}")
  done

  if $dry_run; then
    echo
    [ "$failed" = 0 ] && echo "Dry run: the checks passed and nothing was built." ||
      echo "Dry run: nothing was built, and a platform above was refused."
    return "$failed"
  fi

  echo
  printf '%-9s %-8s %-8s %-8s %s\n' platform build smoke submit artifact
  for row in "${rows[@]}"; do
    # shellcheck disable=SC2086
    printf '%-9s %-8s %-8s %-8s %s\n' $row
  done
  [ -z "$sentry_note" ] || echo "warning: $sentry_note"
  echo "Log: $log"
  return "$failed"
}

main 2>&1 | tee -a "$log"
exit "${PIPESTATUS[0]}"
