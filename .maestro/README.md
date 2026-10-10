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
| `c01-c02-sign-up-and-onboard` | SCRUM-221, 222 | `NEW_NAME NEW_EMAIL NEW_PASSWORD AGE DOB_DD DOB_MM DOB_YYYY` (AGE 18 or over — the app is 18+, SCRUM-330) |
| `c03-sign-in-and-out` | SCRUM-223 | `EMAIL PASSWORD` |
| `c03-staff-refused` | SCRUM-223, SCRUM-198 | `STAFF_EMAIL PASSWORD` |
| `c08-room-post` | SCRUM-228 | `EMAIL PASSWORD ROOM MESSAGE` (needs a live event) |
| `c19-board-ask-accept` | SCRUM-126 (BD-M01, BD-D01) | `EMAIL PASSWORD EVENT EVENT_ID POST_TEXT API ASKER_TOKEN` — a build with `EXPO_PUBLIC_BOARD_ENABLED=true`; both people going, profiles complete |
| `c19-board-safety` | SCRUM-126, SCRUM-322 | `EMAIL PASSWORD EVENT AUTHOR THEIR_POST` — after an API setup (their ask on your post, their own post); **blocks them**, undo after |
| `c19-board-refusals` | SCRUM-126 (BD-M02) | `EMAIL PASSWORD EVENT REASON` (+ `SEARCH` for an account with no Going row, `TRY_POST`) — once per refused account |
| `c15-home-map-drawer` | SCRUM-540 (HM-M01, HM-D01) | `EMAIL PASSWORD PLACE` (+ `EVENT HIDDEN_VENUE` for the hiding check: an event within an hour of its start at a venue with a confirmed link; + `PIN_POINT PIN_OPENS` for the pin tap: put the device's location on the pin, `PIN_POINT=50%,25%`, `PIN_OPENS` a regex for what opens). `MAESTRO_PASSWORD` instead of `-e PASSWORD` keeps the secret off the command line |
| `c16-c17-go-live` | TQ-C16 SCRUM-558, TQ-C17 SCRUM-559 | `MAESTRO_EMAIL MAESTRO_PASSWORD` (env) + `PLACE_A LAT_A LNG_A PLACE_B_ID LAT_B LNG_B MESSAGE` — two fenced places; real windows, about an hour (two windows at A: the second must not prompt); needs Blendn-Admin #641 on the API for the Banter title and "Go live again" from the Banter; the read-back is in the file |
| `c17-bucket` + `c17-bucket-after` | TQ-C17 SCRUM-559 (PL-M04, as built) | `PLACE LAT LNG` — an unclaimed fenced place with nobody live; between the halves five lane attendees go live there through the API (log the lanes); signed in already |
| `c16-handoff` | TQ-C16 SCRUM-558 (PL-M03) | `VENUE_ID EVENT` — a place a public event has now (opened by link: Places leaves it out); signed in already; writes nothing |
| `c20-crew-create-chat` | TQ-C19 (CR-M01, CR-CU01) | `EMAIL CREW_NAME FRIEND API MESSAGE` + `MAESTRO_PASSWORD`, `MAESTRO_FRIEND_TOKEN` as environment variables — friends, both 18+; the phone checked in at a live event, the friend not |
| `c21-blend-room` | TQ-C20 (CR-M02, CR-I11, CR-I14) | `EMAIL MY_CREW THEIR_CREW EVENT_ID API REVEALED_NAME ANON_NAME MESSAGE` + `MAESTRO_PASSWORD`, `MAESTRO_THEIR_TOKEN` — two crews here (two of each checked in), one of theirs keeping themselves anonymous |
| `c21-blend-push` | TQ-C20 (review H2) | none — signed in, in an open Blend; notifications granted once via `blendn://onboarding/notifications`; fire `xcrun simctl push` with the payload in the file while it waits |
| `c12-delete-account` | SCRUM-232 | `EMAIL PASSWORD` — **a person you created, never a lane attendee** |

`smoke/launch.yaml` is not a journey: it is the release smoke test that
`npm run ship:local` runs on every build before submitting it (launch from
clean, see the signed-out screen). It sits outside `journeys/` so
`maestro test .maestro` skips it. See `docs/RELEASING.md`.

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
