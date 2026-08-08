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

Nothing in flight.

---

## Next

Ordered by what is broken for a real user today, not by what is interesting.

### 1. Interests must reach `user_interests` — this blocks matchmaking entirely

**The single highest-value item in either repo.**

`app/onboarding/interests.tsx:52` writes the picked interests to
`profiles.interests` via `updateProfile` — a **free-text string array**, from a
hardcoded emoji list (`'🎵 Music'`).

Matching ranks on the **structured** `user_interests → categories` graph.
Nothing writes to it. The three client methods that would —
`getProfileInterests`, `addProfileInterest`, `removeProfileInterest`
(`lib/apiClient.ts:1270`, `:1275`, `:1287`) — have **zero call sites**.

So every match card comes back with **no shared interests, for everyone**. The
ranking, the IDF rarity weighting and the "you both picked Techno and Board
games" card are all correct, all tested, and all fed by an empty table.

**Do:**
- `GET /api/mobile/categories` for the real list — stop shipping the emoji array
- `POST /api/mobile/profiles/:userId/interests` with `{ categoryIds: string[] }`
- **Fix `removeProfileInterest` first — it calls a route that does not exist.**
  It builds `DELETE /profiles/:userId/interests/:categoryId`
  (`lib/apiClient.ts:1287`). The server has no such path. The real shape is
  `DELETE /profiles/:userId/interests` with a body `{ categoryIds: string[] }`.
  It has no call sites, so it 404s the day someone wires it up.

Free text and the graph can coexist — `profiles.interests` for display, the
graph for ranking — but nothing will match until the graph is populated.

### 2. Presence pings — a shipped feature producing a wrong number on someone else's screen

`POST /api/mobile/events/:eventId/presence` has been live since **v0.42.0**.
There is no `presence` method in `lib/apiClient.ts` at all — not unused,
**absent**.

Nobody is ever checked out. Occupancy is therefore **cumulative**: it climbs all
night and never falls, on the organiser's live operations screen. Someone is
looking at that number to decide whether to open a second bar or hold the door.

**Do:** while checked in, ping `{ lat, lng, accuracy }` every 5 minutes.
The server judges whether that is still inside — **do not reimplement the
geofence client-side.** A sweeper checks out anyone who stops pinging.

Read `CHECKIN.md` before starting.

### 3. The match surface — three endpoints, zero client methods

Shipped 0.49.0–0.50.0. `lib/apiClient.ts` contains **no** `matches`, `likes` or
`preferences` method.

| Endpoint | Purpose |
|---|---|
| `GET /events/:eventId/matches` | The ranked room. `403` unless you checked in |
| `POST /events/:eventId/matches/likes` | Like someone. Mutual → a conversation opens |
| `PUT /events/:eventId/matches/preferences` | Your intent and reveal flag, per event |

**And stop calling the wrong endpoint.** `components/screens/MatchScreen.tsx:457`
and `:535` call `getEventCheckins`. That endpoint stopped returning `image` and
the real `name` in **v0.46.0** when it stopped handing out attendee identities
(`app/api/mobile/events/[eventId]/checkins/route.ts:117` — the omission is
deliberate and commented). The screen renders **blank avatars on production
today**, and its card links to `/user/[id]`, which still shows the real profile —
so the anonymity is one tap deep.

`matches` returns `displayName` (pseudonym unless revealed), `photo` (null unless
revealed) and `sharedInterests` **as names, ready to render**.

There is no match score and there will not be a raw one. A coarse band —
**Strong / Good / Some** — was agreed instead; the design's `Match Percentage` is
not being built. See `DESIGN_HANDOFF.md`.

### 4. Settings: twelve keys, four columns, no overlap

The columns landed in **0.55.0**. The toggles still persist nothing, now for a
different reason: **the two sides agree on no key at all.**

`app/settings.tsx:138` sends twelve variants —
`preferences.{pushEnabled, push_enabled, showOnlineStatus, show_online_status,
shareReadReceipts, share_read_receipts, locationSharing, location_sharing}` plus
four camelCase at top level.

`PUT /profiles/:userId` reads exactly four, **top-level, snake_case**:

```
push_enabled   show_online   read_receipts   share_location
```

Not one of the twelve matches. And hydration reads
`profile.shareReadReceipts ?? profile.share_read_receipts`
(`app/settings.tsx:79`) — the server returns `profile.read_receipts`. No match,
so it falls back to `true`.

**Every toggle reads ON regardless of what the user chose.** A switch that lies
is worse than no switch.

**Do:** send the four real keys at top level; read them back from
`profile.push_enabled` etc. Then delete the shotgun. Confirm against
`/api-docs` — the spec is generated from the routes and is the honest source.

### 5. The proximity gate compares metres against kilometres

`app/(tabs)/events.tsx:45` — `const R = 6371 // Earth's radius in km`, so
`distance` is **kilometres**.

Line 877 populates `check_in_radius` from `checkInRadius`, which the API returns
in **metres** (defaulting to `100`). Line 1048 then evaluates
`distance <= checkInRadius`.

So `distance <= 100` — true anywhere within **100 kilometres**. Line 1045's
`|| 0.5 // default 500m` shows the confusion in one file: the same field is
written as metres and read as kilometres.

`components/screens/EventDetailScreen.tsx:505` has the same comparison.

The server refuses correctly, so nothing false gets in — but the user is shown
"Check In", taps it, and is rejected. Pick metres, convert once at the boundary.

### 6. Waitlist — RSVP can return a state the app has never heard of

`POST /events/:eventId/rsvp` on a full event now returns **`waitlisted`** instead
of `going`, and promotes whoever waited longest when a seat frees (0.51.0).

`waitlisted` appears **zero times** in this repo. The app handles `going`,
`not_going`, `maybe`, `interested`.

Needs the state, the copy, and the promotion notification. It is not a door
policy — check-in still refuses nobody.

### 7. Peer rating after the event

`GET` / `POST /events/:eventId/peer-ratings` shipped in 0.55.0 and has no client
method.

After the event ends, for **people you actually connected with** (a mutual like —
not everyone who shared a room), one screen per person: a 1–5, an optional
"something went wrong", an optional note.

**The rating is never visible to the person rated, and there must be no screen
where it could be.** No badge, no star average on a profile, no "verified" tick
derived from it. The person most likely to rate someone badly is the person who
felt least safe with them; show it and you have told him that the woman who met
him rated him down, at an event where he knows who she is.

`blendn-admin/__tests__/trust-not-exposed.test.ts` fails the build if any mobile
route so much as imports the trust module. Keep that true on this side too.

### 8. Smaller, confirmed

| | Where | |
|---|---|---|
| **Group-chat report is a stub** | `app/chat/[id].tsx:655` | Shows a tray, fires a haptic, calls nothing. `POST /messages/:messageId/report` exists and the DM path already uses it |
| **Ratings can be seen, never given** | — | `stats.averageRating` renders on the event card; `rateEvent` has zero call sites. `POST /events/:eventId/rating` is live |
| **Onboarding throws away two screens** | `onboarding/goals.tsx:39`, `onboarding/preferences.tsx:31` | Both say "stored locally for now" and never sync, though `PUT /profiles/:userId` has always accepted `goals` and `looking_for` |
| **Location is stored as a coordinate string** | `onboarding/location.tsx` | Writes `"12.97,77.59"`; the events tab renders `location.split(',')[0]`, so it displays **"12.97"** |
| **`/events/search` is never called** | — | The endpoint exists. Search may be entirely app-side work |

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

Nothing yet under this ledger — it starts today, 2026-08-08. Shipped work before
this date is in the git history.
