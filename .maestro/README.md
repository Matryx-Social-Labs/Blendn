# UI end-to-end flows

Driven against the **staging** backend on a booted iOS simulator. See the
testing standard: a path that can be driven through the real UI must be, and
each screen is paired with a database assertion, so a screen that advances
without writing is caught.

## Running

```bash
./.maestro/run.sh          # cold start, leaves the app on the entry screen
~/.maestro/bin/maestro test .maestro/10-signup.yaml \
  -e NAME="Ember Test" -e EMAIL="e2e-ui-$(date +%m%d%H%M)@blendn.test" \
  -e PASSWORD='Blendn-E2E-2026!'
```

`JAVA_HOME` must be set (`/opt/homebrew/opt/openjdk`). Metro must be running
(`npx expo start --dev-client --port 8081`).

## Four things that cost a cycle each — read before editing a flow

1. **Maestro anchors a text selector to the whole string.** `tapOn: "PLACEHOLDER
   DESIGN"` does not match `PLACEHOLDER DESIGN — logic is final, layout is not`.
   Use a full string or an explicit `.*…*.` regex.
2. **The app's scheme is `exp+blendn`, not `blendn`.** `app.json` declares
   `blendn` and it is inert: `ios/` is committed, so EAS never runs prebuild and
   never writes it into `Info.plist`. A `blendn://` deep link fails with -10814.
3. **`clearState: true` also wipes the dev client's saved Metro URL**, so the
   app comes up on the launcher and dies. `run.sh` re-opens the bundle by deep
   link straight after.
4. **`hideKeyboard` is unsupported by these inputs.** The form is a ScrollView
   with `keyboardShouldPersistTaps="handled"`, so tapping the static banner
   dismisses the keyboard. This matters because the password field sits below
   the keyboard — tap it while the keyboard is up and the tap lands on a key,
   and the password is appended to whichever field still has focus.

5. **A tap can land on something you cannot see.** Maestro reports an element
   as visible when it is anywhere in the hierarchy — *including behind the
   sticky header or the CTA band* — and the tap then hits whatever is drawn on
   top. That silently pressed "Complete Profile" instead of an interest chip,
   and produced a false `work_field: null` earlier. **Always
   `scrollUntilVisible` with `centerElement: true` before tapping a chip in a
   list.** Only the database assertion caught either one.
6. **iOS AutoFill's "Use Strong Password?" sheet** opens over the password field
   the moment typing starts, swallows the input, and is a native overlay
   Maestro cannot traverse — so it cannot be waited for and has to be dismissed
   by coordinate. The flow types the password twice: once to summon the sheet,
   once for real.
7. **Do not mix the Maestro MCP and the Maestro CLI in one session.** Each
   spawns its own `simulator-server`, and the second steals the first's device
   session — after which every MCP call returns `Device became unreachable
   during deviceInfo` while `list_devices` still cheerfully reports
   `connected: true`. Rebooting the simulator does the same thing. Pick one
   driver and stay on it.

## Why the database assertion is not optional

Three separate times in one run, a screen advanced and looked correct while
writing nothing: `work_field` null after tapping a chip, zero interests after
tapping two, and `push_enabled` unchanged after declining. Every one was
invisible on screen. The screenshots are evidence that a value *rendered*; only
the row is evidence that it was *stored*.
