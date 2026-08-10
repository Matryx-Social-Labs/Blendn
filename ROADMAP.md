# Roadmap — the Expo app

The working ledger for this repo. Four sections: **Now**, **Next**,
**Validated — not doing**, and **Done**.

**The rule.** Every item lands in `Now` or `Next` before work starts, and moves
to `Done` in the same PR that finishes it. Nothing ships without this file
moving.

## Where the other half lives

The API and the organiser dashboard are in **`blendn-admin`**. The documents that
form the contract are **mirrored into [`docs/api/`](docs/api/)** so you can read
them without a second checkout — start at [`docs/api/README.md`](docs/api/README.md).

They are copies. Edits belong upstream, and
`./scripts/sync-api-docs.sh ../blendn-admin` refreshes them; the resulting
`git diff docs/api/` is how you see what changed on the server side.

This file deliberately does not restate them:

| | |
|---|---|
| `docs/USER_JOURNEY.md` | What a user does, in order, as **designed → built → served**. The contract between all three repos |
| `docs/API.md` | Every endpoint, with payloads. **The reference** — do not copy shapes into this file, they drift |
| `docs/SOCKET_EVENTS.md` | The realtime catalogue |
| `docs/CHECKIN.md` | Capacity vs occupancy vs attendance, and why check-in never refuses |
| `docs/DESIGN_HANDOFF.md` | What the designer is being asked to change, and why |

**Live Swagger UI** — the fastest way to see a real payload:

- Production — <https://api.blendn.app/api-docs> (UI) · <https://api.blendn.app/api/docs> (raw OpenAPI JSON)
- Staging — <https://blendn-admin-staging.up.railway.app/api-docs>

Mobile routes are served at `/api/mobile/v1/*`; middleware strips the version and
rewrites to `/api/mobile/*`. Either works. Auth is a bearer JWT from
`lib/mobile-auth.ts` — **not** the dashboard's NextAuth session.

`SECURITY_RELIABILITY_BACKLOG.md` is a separate ledger for auth/session
robustness. Items there are not duplicated here.

---

## The audit this file came from — 2026-08-08

Done first-hand against the API at `dev`. The numbers:

- **53 mobile routes** are served. The app references **44** of them.
- **10 are served and never called.** Six of those are the whole matchmaking,
  presence and peer-rating surface — shipped 0.42.0 → 0.55.0 and unreachable.
- **Sockets are fully aligned.** All 27 event names the client uses exist on the
  server. No drift. This is the one clean interface between the repos.
- **One call has no route at all** — `DELETE /profiles/:userId/interests/:categoryId`.

The three worst findings are not missing features. They are things that look
finished and are not: interests are written where nothing reads them, the
settings toggles agree with the server on nothing, and the proximity gate
compares metres to kilometres.

---

## Now

**After signup: retire onboarding, ask once, gate at the point of use.** The app
half of a fifteen-PR plan reviewed by `/plan-eng-review` and Codex; the server
half is `blendn-admin/docs/ROADMAP.md` and is **already deployed to staging**
(API #183–#191), so these can be built against a server that already answers.

| PR | What | State |
|---|---|---|
| 10 | A test runner, and the pure logic the rest depends on | **Done** (#62) |
| 11 | Delete `app/onboarding/` — atomic with the routing gate | Next |
| 12 | Signup takes an age; one `about-you` screen replaces eight | After 11 |
| 13 | The card renders what it already knows | After 12 |
| 14 | Anonymity in the room: the suggestion prompt and the status chip | After 13 |

**PR 11 must be atomic.** `_layout.tsx` still targets `/onboarding/welcome` for
any `onboarded: false` account; deleting the screens without the gate sends every
such user to expo-router's Unmatched Route with no way out.

---

## Next

Ordered by what is broken for a real user today, not by what is interesting.

### 1. Three `Event` interfaces, structurally compared

Surfaced while adding CI. `Event` is declared three times, independently:
`app/(tabs)/events.tsx:55`, `app/nearby-events.tsx:25`, `components/EventCard.tsx:11`.

They are passed to each other, so TypeScript compares them structurally and they
have already drifted. Widening `city` in one of them by a single `| null` -- to
match what the API actually returns -- immediately produced
`Type 'Event' is not assignable to type 'Event'. Two different types with the
same name`, and broke a call site three files away.

That is the root cause of 3 of the 6 remaining baseline type errors. The fix is
one shared type, and it is a real refactor rather than a patch, so it is its own
item rather than something to sneak into an unrelated change.

Worth doing before the group work, because group matching will add more shapes
that flow through the same components.

### 2. Smaller, confirmed

| | Where | |
|---|---|---|
| **Ratings can be seen, never given** | — | `stats.averageRating` renders on the event card; `rateEvent` has zero call sites. `POST /events/:eventId/rating` is live |
| **Onboarding throws away two screens** | `onboarding/goals.tsx:39`, `onboarding/preferences.tsx:31` | Both say "stored locally for now" and never sync, though `PUT /profiles/:userId` has always accepted `goals` and `looking_for` |
| ~~**Location is stored as a coordinate string**~~ | — | **Wrong when written, corrected 2026-08-10.** The app does send `"12.97,77.59"`, but `PUT /profiles/:userId` runs it through `normalizeLocationToCity` (`route.ts:152`) and stores the reverse-geocoded city. A live account holds `"Paris"`, not `"48.86"`. Nothing to fix |
| **`/events/search` is never called** | — | The endpoint exists. Search may be entirely app-side work |
| **Socket transport config is untested** | `lib/socketClient.ts` | `engine.io-client`'s `tryAllTransports` defaults falsy, so listing a second transport alone changes nothing. Pinnable now that a runner exists (#62) — it needs the client mocked, which the three current suites do not |

### 9. Onboarding becomes one screen — decided

**Decided: minimal.** Nothing between installing and browsing. Sign in → browse →
check in.

At **first check-in**, one screen with two chip-pickers: *why are you here
tonight* (intent, multi-select, "just the event" a first-class answer) and *what
are you into* (interests, from `GET /categories`). Both are things matching needs
anyway. Photo and bio are prompted only when someone chooses to reveal — the
first moment a photo means anything.

Today onboarding is eight screens, hard-gated (`gestureEnabled: false`, Android
back swallowed, no skip), and two of them produce nothing. So the real comparison
is **six working screens against one**.

Intent goes to `PUT /events/:eventId/matches/preferences`.

### 10. Designed, built nowhere, now in scope

Map · Notifications centre · Search and filters · Profile strength.

All four are in `Blendn.fig` and in neither repo. Search is closest — the
endpoint exists and nothing calls it. Map needs a bounding-box query on the API
side (a map pans; it does not search a radius). Notifications is the largest —
it needs a table and endpoints that do not exist yet.

### 11. Brand and design tokens — deferred by decision, recorded so it is not rediscovered

Not oversight. Written down because the evidence took a while to gather and
whoever picks this up should start from it:

- **No Satoshi.** `assets/fonts/` holds one file — the Expo starter's SpaceMono,
  unused. `useFonts` appears zero times. The app renders in San Francisco and
  Roboto
- **None of the brand colours.** Zero occurrences of `#F05423`, `#8F49AA`,
  `#BE5C71`, `#0D0C0C`. `lib/theme.ts` is the **Apple iOS system palette**
  (`#0A84FF` is systemBlue, `#EBEBF599` is secondaryLabel)
- **`#FF6B6B` is the de facto primary**, hardcoded on every onboarding CTA and in
  no token file
- **397 hardcoded hex literals** and 210 raw `rgba()` across four competing accent
  systems
- **Contrast failures, one at token level**: `textTertiary` `#EBEBF54D` resolves
  to ~2.2:1 and is used for every placeholder in `edit-profile`. White on
  `#FF6B6B` is 2.79:1

Two constraints for whoever does it: **Satoshi has no 600 weight**
(300/400/500/700/900), and `'600'` is currently the most-used weight in this repo
(76 uses). And **ink on orange, never white** — white on `#F05423` is 3.4:1 and
fails AA.

`blendn-admin/docs/DESIGN_SYSTEM.md` is the reference. The highest-value handoff
is **tokens, not screens** — a palette and type ramp an engineer can paste into
`lib/theme.ts` and delete 397 literals against.

---

## Validated — not doing

**A match percentage.** In the Figma as `Match Percentage`. A number implies a
precision the data cannot support and invites gaming. A coarse band —
Strong / Good / Some — was agreed instead. It cannot be thresholds on the raw
score: that score is IDF-weighted, so its scale depends on how rare the room's
interests are, and a fixed cut would mean different things at a techno night and
a conference.

**A second profile for dating vs networking.** Doubles the onboarding friction
the minimal-onboarding decision exists to remove, and splitting a new app's pool
empties both halves. Intent is a tag and a ranking signal, never a partition.

**Real names in the room.** The design shows them throughout (p13, p18, p28).
Decided the other way: pseudonymous by default, opt in to reveal, per event.
It is the product's actual differentiator — a competitor can copy an events list
in a fortnight and cannot copy a room people trust. The **design** changes here,
not the build. See `DESIGN_HANDOFF.md`.

**Client-side geofencing.** The server judges. Reimplementing it here produces
two answers to one question, and the client's is the one an attacker controls.

---

## Done

### 2026-08-10 — a test runner

- **The app can be tested at all** (#62). There was no runner: no `test` script,
  no jest, no test directory. Eleven PRs shipped in a week verified by a
  typecheck and a simulator — and the typecheck cannot tell you a function
  returns the wrong answer.

  `jest-expo`, a gate in CI from its first run, and 26 tests over the three
  modules the next four PRs depend on. `flattenToLeaves` and the distance
  helper moved to `lib/` to be testable, which also removed a **second copy** of
  the Haversine formula living privately inside `EventDetailScreen`.

### 2026-08-10 — first open and auth

Shipped as six PRs, server first so the app could never mint accounts the API
would later refuse. API #181–#182, app #55–#58.

- **The auth entry point** (#56, #57). "Get Started" was a Google button with no
  Google branding — a branding violation and deceptive UI. The Apple button was
  `BLACK` on black, invisible. Every sign-in error was `Logger.error` and nothing
  else, which is why a half-configured Google client id went unnoticed in
  production. Email sign-in, sign-up and password reset now exist as screens;
  the plumbing had been in `lib/useAuth.ts` for months with zero callers.

  `app/_layout.tsx` bounced any signed-out user off any route but `/`, so a
  second signed-out screen was unreachable — it would mount and be replaced on
  the next tick, with nothing in the logs. Now an allow-list.

- **One background from cold start** (#55). White system splash → `#480D37`
  maroon → pastel sign-in → black app, four backgrounds before the first tap.
  `expo-splash-screen` was installed and never called, so the handoff could not
  be coordinated. Now black throughout, held until assets decode and never until
  auth resolves.

  The supplied logos had **no alpha channel** and two were blank — white
  knockouts flattened onto white. `scripts/extract-logo-alpha.py` recovers all
  three, exactly, by inverting the compositing. The Android launcher, adaptive
  and notification icons were the **Expo starter placeholder**.

- **Startup animation** (#58). The 8.575s ProRes master is an editing codec no
  phone decodes; `scripts/build-intro-animation.sh` cuts it to 1.08s of animated
  WebP. Two non-obvious calls, both documented in the script: it starts
  mid-motion so it continues the native splash instead of redrawing the logo
  from nothing, and the wordmark is recoloured to white because the master was
  authored for a light background and measured 3/255 luminance on black.

- **Password reset reaches phones** (API #181). `forgot-password` skipped
  `role === "attendee"` — every mobile user — while still returning `ok`, so the
  app would have shown "check your email" for mail never sent. Signup was also
  non-atomic and accepted 8-character passwords the reset route would refuse
  forever.

- **App Store review account** (API #182). `npm run seed:review`, idempotent, in
  `DEPLOYMENT.md` beside `db:migrate` so a prod wipe cannot silently remove it.

- **Realtime survives a blocked websocket** (#51). `socketClient` connected with
  `transports: ["websocket"]` and nothing else, so a single failed upgrade meant
  no realtime at all, permanently — the wrong trade for a product used on
  conference and club wifi, where WebSocket is blocked or mangled far more often
  than plain HTTP.

  Now `["websocket", "polling"]` with `tryAllTransports: true`. The flag is not
  optional: engine.io-client leaves it undefined and gates its fallback on it
  (`socket.js:512`), so listing a second transport alone changes nothing. Verified
  against staging that websocket is still preferred when it works and that
  polling reaches auth on its own.

  Also widened the `connect_error` log, which is what made this expensive to
  diagnose: `error.message` alone said "websocket error" and nothing about the
  transport, the underlying cause or even which host was being dialled.

- **Placeholder screens, logic complete** (#50). Peer rating
  (`app/rate/[eventId].tsx`), intent and reveal
  (`app/event-preferences/[eventId].tsx`), and the Strong/Good/Some band
  (`lib/matchBand.ts`). Every rule is implemented and every layout is
  provisional, each carrying a visible PLACEHOLDER banner so nothing gets
  mistaken for finished in a demo.

  `docs/PLACEHOLDER_SCREENS.md` is the designer handover: what each screen does,
  the rules a redesign must not break and why, the screens that do not exist at
  all, and the honest state of the design system.

- **The app knows what `waitlisted` means** (#49). A full event returns
  `waitlisted` rather than `going` and promotes whoever waited longest when a
  seat frees, and the app had never heard of it: the state was typed as
  going/maybe/not_going and three reads *cast* the response to fit, so someone
  on the waitlist saw a green "Going" tick and would have turned up to an event
  they had no place at. Now amber with an hourglass, an explicit message, and
  tapping leaves the list rather than sending a second RSVP.

- **Peer rating is callable** (#49). `getRatablePeers` and `ratePeer` added. The
  screen is deliberately still unbuilt — see Next.

- **Settings persist, and read back** (#48). The screen sent twelve key
  spellings and the route accepts four, with no overlap, so nothing was ever
  saved and every toggle read back its default of `true`. A switch that lies is
  worse than no switch. The client's `updateProfile` type was also wrong, which
  is *why* the shotgun existed: nobody could see the right names from the
  signature. The names are asymmetric on purpose -- "show online status" is
  `show_online`, "share read receipts" is `read_receipts`, "location sharing"
  is `share_location` -- and guessing is what produced twelve wrong keys.

- **The proximity gate compares metres to metres** (#48). `getDistanceKm`
  returned kilometres and was compared against `check_in_radius`, which the API
  gives in metres, so "Check In" appeared anywhere within a hundred kilometres.
  The server refused correctly, so the user simply tapped and was rejected.
  Renamed to `getDistanceMetres` and converted at the boundary rather than at
  each call site, since two call sites disagreeing about the unit was the bug.

  **Correction to the audit:** it claimed `EventDetailScreen` had the same bug.
  It does not -- that screen already used `6371e3` metres against a metres
  radius and was correct.

- **The match screen uses the match endpoint** (#47). It called
  `getEventCheckins`, which stopped returning `image` and the real `name` in API
  v0.46.0 when it stopped handing out attendee identities -- so it rendered
  blank avatars in production and its card linked to `/user/[id]`, which still
  showed the real profile. Anonymity one tap deep.

  Added `getEventMatches`, `likeAtEvent` and `setMatchPreferences`; the match
  surface is reachable from the app for the first time since it shipped in
  0.49-0.50. Dropped the client-side sort by `last_seen`, which would have
  thrown away the server's IDF-weighted ranking in favour of arrival order --
  the exact thing the old endpoint did wrong.

- **Presence pings** (#46). The endpoint had been live since API v0.42.0 and
  nothing had ever called it, so nobody was ever checked out: occupancy climbed
  all night and never fell, on the screen an organiser uses to decide whether to
  open a second bar. `lib/usePresence.ts` pings while checked in, lets the
  server judge inside/outside rather than reimplementing the geofence, stops on
  a terminal status, and pauses in the background so a stale fix never asserts
  presence at a place and time that have both passed.

- **Interests actually reach the structured graph** (#52). #43 below wired the
  write path and it was correct, but nobody could ever reach it: the screen
  filtered `GET /categories` for rows with a non-null `parent_id`, which is
  exactly the set that endpoint never returns, so it discarded 100% of every
  response and rendered no selectable chips. Continue was gated on a selection,
  so onboarding could not be completed at all.

  **First real rows, 2026-08-10**: 10 interests on a live account, from the
  simulator, end to end. `user_interests` had been empty across every user on
  both databases since the feature was built — the emptiness was this screen,
  not the API.

- **Interests reach the structured graph** (#43). Onboarding loaded 28 hardcoded
  emoji strings into `profiles.interests`, free text, while matching ranked on
  the `user_interests → categories` graph that nothing wrote to. Every match card
  said "no shared interests" for everyone, for weeks. Now loads `GET /categories`
  and writes real category ids. Leaf categories only — a parent everyone holds
  says nothing.

  Both client methods for this were broken and neither had a call site, so
  nothing failed in production: `addProfileInterest` sent `{ categoryId }` where
  the route validates `{ categoryIds: string[] }` with `.min(1)`, and
  `removeProfileInterest` built a path that does not exist. Renamed to plural.

  The API side gained a health signal that reports interest coverage
  (Blendn-Admin#176), so the next time this silently empties, something says so.

- **The group-chat report button reports** (#44). It showed a tray, fired a
  *success* haptic, and called nothing — so the room where abuse is most likely
  had a button that silently failed while telling the user it had worked.
  `showMessageReportOptions` in `lib/safetyUtils.ts` already did this correctly
  and `private-chat` already used it; the group screen had never imported it.

  Two bugs, not one: the handler cleared `selectedMessage` before showing the
  tray, so capturing the id first was required or it would have reported
  `undefined` and still looked fine.

- **CI exists** (#45). This repo had no CI and no tests. Typecheck now runs on
  every PR against a recorded baseline: the 6 known errors do not block, any new
  one does. Verified by injecting an error and watching it fail.
