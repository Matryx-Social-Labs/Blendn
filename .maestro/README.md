# Maestro flows

The journeys the testing programme drives. The programme itself — the Jira
queue, claims, attendee lanes, the world log — is
`blendn-admin/docs/agents/TEST-PLAN.md`. Start there.

These used to live in `/tmp/mflows`, which macOS purges; they live here now.

## Run

```bash
PW="$(railway variables --environment staging --service Blendn-Admin --json | jq -r .SEED_PASSWORD)"
maestro --device <id> test .maestro/journeys/c03-sign-in-and-out.yaml \
  -e EMAIL=ananya.b@blendn.app -e PASSWORD="$PW"
unset PW
```

**No credential is ever written in a flow.** Everything comes in with `-e`.
The seeded people share `SEED_PASSWORD` (Railway staging, `Blendn-Admin`);
people your session creates get a passphrase you choose.

| Journey | Queue unit | Env |
|---|---|---|
| `c01-c02-sign-up-and-onboard` | SCRUM-221, 222 | `NEW_NAME NEW_EMAIL NEW_PASSWORD AGE DOB_DD DOB_MM DOB_YYYY` (AGE < 18 for the minor path) |
| `c03-sign-in-and-out` | SCRUM-223 | `EMAIL PASSWORD` |
| `c03-staff-refused` | SCRUM-223, SCRUM-198 | `STAFF_EMAIL PASSWORD` |
| `c08-room-post` | SCRUM-228 | `EMAIL PASSWORD ROOM MESSAGE` (needs a live event) |
| `c12-delete-account` | SCRUM-232 | `EMAIL PASSWORD` — **a person you created, never a lane attendee** |

Subflows: `sign-in`, `sign-out`, `dismiss-tip` (the Pulse tip and RN's LogBox
eat taps), `keyboard-done` (the keyboard's bottom-right key after every typed
field, per platform — Maestro's `hideKeyboard` sends BACK on Android when no
keyboard is up, and leaves the app).

## Facts that have each cost a run

- Bundle id `com.matryxsociallabs.blendn`. Text selectors are full-string
  regex: `"Check in"` does not match "Check in now".
- iOS then Android, never both at once — the host can't feed both, and the
  guest ANRs. Lock the device: `npm run -s qa lock <device> <tag>` (blendn-admin).
- Android: reap a zombie driver before a run —
  `adb shell am force-stop dev.mobile.maestro`. If `inputText` dies mid-run,
  type with `adb shell input text` one character at a time; bulk input drops
  keys against a controlled RN field.
- A flow passing proves the screen. The row it wrote is proved by
  `npm run -s qa sq "SELECT …"` — each journey names its read-back.

## Adding a journey

Name it after its unit (`c07-…`), tag it (`tq-c07`, plus `needs-live-event` /
`destructive` when true), take credentials only from `-e`, end with the
read-back in a comment, and add a row above.
