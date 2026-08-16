#!/usr/bin/env bash
#
# Drive the booted iOS simulator: tap, type, screenshot.
#
# ## Why this exists
#
# `xcrun simctl` can install, launch, deep-link and screenshot — and it cannot
# tap or type. That gap is why every UI change in this repo has been verified
# through a `__preview` harness: anything behind a login, a form or a button was
# unreachable from a script, and "simulator text entry is unavailable" sat on
# the roadmap as a blocker on verifying the real screens.
#
# macOS can do both, through Accessibility. `System Events` clicks at a screen
# coordinate and types into whatever holds focus, and the Simulator window is an
# ordinary window — so the only real work is mapping a **device** point to a
# **screen** point.
#
# ## The mapping, derived rather than hardcoded
#
# The window frame is bigger than the device screen: a title bar on top, a thin
# border either side. Both come from the window's own geometry measured against
# the device's point size, because they differ by Xcode version and by whether
# the window has been zoomed. `SIM_W`/`SIM_H` default to an iPhone 17 Pro Max
# (440 × 956); set them for another device.
#
# ## Requirements
#
# Whatever runs this needs **Accessibility** permission (System Settings →
# Privacy & Security → Accessibility). Without it `osascript` fails *silently*,
# which is what `check` is for — and which is exactly how a script like this
# ends up "passing" while doing nothing.
#
# ## Usage
#
#   scripts/sim.sh check                    # permission + window geometry
#   scripts/sim.sh tap 219 813              # device point
#   scripts/sim.sh paste "you@example.com"  # via the device pasteboard
#   scripts/sim.sh type "you@example.com"   # see the warning below
#   scripts/sim.sh key return               # return | tab | escape | delete
#   scripts/sim.sh shot /tmp/x.png
#
# A screenshot is in pixels; device points are pixels ÷ the scale factor. A
# 1320px-wide capture of a 440pt screen is @3x, so a feature at 660px is 220pt.
#
# ## What is proven, and what is not
#
# **`tap` and `shot` work.** Verified repeatedly: tapping "Continue with email"
# on the sign-in landing navigates to the email form. That alone lifts the part
# of the blocker that mattered most — real screens can now be *reached* from a
# script instead of only through a `__preview` harness.
#
# **`type` reloads a dev build.** Sending plain letters to a simulator running
# an **Expo dev client** reloads the app: the dev client binds single letters as
# shortcuts (`r` reload, `m` menu, `j` debugger) and they win over the focused
# field. "tester@blendn.app" contains an `r`, so every attempt bounced the app
# to its intro animation — which looked at first like the *tap* having failed
# rather than the typing having worked too well. Connecting the hardware
# keyboard (I/O → Keyboard, confirmed by the menu's checkmark) does not change
# it. Against a **release** build there is no dev client to intercept anything,
# so `type` should be fine there — untested.
#
# **`paste` does not reload, and does not land text either.** ⌘V is a modified
# keystroke the dev client does not claim, and the app survives it — but the
# field stays on its placeholder. A synthetic `click at` opens a *button*
# reliably and does not appear to give a React Native `TextInput` keyboard
# focus, so there is nothing for the paste to go into.
#
# So: **text entry is still open.** What is left to try is a real touch-event
# API (`idb ui tap`/`idb ui text` from Facebook's idb) rather than Accessibility
# clicks, or driving a release build. Recorded here so the next person starts
# from the evidence instead of from scratch.

set -euo pipefail

SIM_W="${SIM_W:-440}"
SIM_H="${SIM_H:-956}"

die() { echo "sim: $*" >&2; exit 1; }

geom() {
  osascript -e 'tell application "System Events" to tell process "Simulator" to get {position, size} of window 1' 2>/dev/null \
    || die "cannot read the Simulator window — is it running, and is Accessibility granted?"
}

# Device (x, y) -> screen (x, y), on stdout, space separated.
map() {
  local wx wy ww wh
  IFS=', ' read -r wx wy ww wh <<< "$(geom)"
  # Half the horizontal slack is the side border; the vertical slack beyond
  # that border is the title bar.
  local border=$(( (ww - SIM_W) / 2 ))
  local title=$(( wh - SIM_H - border ))
  echo "$(( wx + border + $1 )) $(( wy + title + $2 ))"
}

focus() { osascript -e 'tell application "Simulator" to activate' >/dev/null; /bin/sleep 0.4; }

case "${1:-}" in
  check)
    echo "window : $(geom)"
    echo "device : ${SIM_W}x${SIM_H}pt"
    read -r sx sy <<< "$(map 0 0)"
    echo "origin : screen ($sx, $sy) == device (0, 0)"
    osascript -e 'tell application "System Events" to get name of first process' >/dev/null 2>&1 \
      && echo "a11y   : granted" \
      || { echo "a11y   : DENIED — System Settings > Privacy & Security > Accessibility"; exit 1; }
    ;;

  tap)
    [ $# -ge 3 ] || die "usage: sim.sh tap <x> <y>"
    read -r sx sy <<< "$(map "$2" "$3")"
    focus
    osascript -e "tell application \"System Events\" to click at {$sx, $sy}" >/dev/null
    /bin/sleep 0.7
    ;;

  type)
    [ $# -ge 2 ] || die "usage: sim.sh type <text>"
    focus
    # `keystroke` with a literal string, not `key code`: this has to carry @, .
    # and mixed case, which key codes would turn into a modifier puzzle.
    osascript -e "tell application \"System Events\" to keystroke \"${2//\"/\\\"}\"" >/dev/null
    /bin/sleep 0.5
    ;;

  key)
    [ $# -ge 2 ] || die "usage: sim.sh key <return|tab|escape|delete>"
    case "$2" in
      return) code=36 ;; tab) code=48 ;; escape) code=53 ;; delete) code=51 ;;
      *) die "unknown key: $2" ;;
    esac
    focus
    osascript -e "tell application \"System Events\" to key code $code" >/dev/null
    /bin/sleep 0.5
    ;;

  paste)
    [ $# -ge 2 ] || die "usage: sim.sh paste <text>"
    # The device pasteboard, then ⌘V — see the note above on why not `type`.
    printf '%s' "$2" | xcrun simctl pbcopy booted || die "pbcopy failed"
    focus
    osascript -e 'tell application "System Events" to keystroke "v" using command down' >/dev/null
    /bin/sleep 0.6
    ;;

  shot)
    out="${2:-/tmp/sim.png}"
    xcrun simctl io booted screenshot "$out" >/dev/null 2>&1 || die "screenshot failed"
    echo "$out"
    ;;

  *)
    sed -n '3,45p' "$0" | sed 's|^# \{0,1\}||'
    exit 1
    ;;
esac
