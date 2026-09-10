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

## Open blocker

iOS AutoFill's **"Use Strong Password?"** sheet intercepts the password field on
sign-up, so the typed password never reaches it — the field reads `Automatic
Strong Password cover view text`. A real user sees this sheet too, so the flow
should dismiss it rather than the app being changed to suppress it.
