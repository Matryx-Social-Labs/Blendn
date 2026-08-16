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

**The homepage nobody could see.** A device build in Germany showed a
full-screen *"No events nearby"* with a Refresh button that did nothing. Every
section of the home screen was already built and wired; all of them were
`useMemo`s over **one** query filtered to a 10 km box around device GPS, so one
empty result blanked the page, both heroes included. The server half is
blendn-admin #212/#213. Plan: `~/.claude/plans/sprightly-questing-aho.md`.

| # | What | State |
|---|---|---|
| — | `city` scopes the fetch; no `radius` is sent, and the server no longer supplies one | **Done** |
| — | `lib/city.ts` — which city to browse, and when to offer a switch. Pure, 16 tests | **Done** |
| — | Header city picker, selection persisted in `AsyncStorage` | **Done** |
| — | Empty state names the city and offers the picker, instead of blaming location | **Done** |
| — | Interested fetched by user, not filtered out of the browse list | **Done** |
| — | Socket banner off the home screen; offline banner stays | **Done** |
| — | Distance labels on cards, shown only while browsing the city you are in | **Done** |
| — | Nightlife by the taxonomy, not by substring; both heroes named for what they select | **Done** |
| — | `happeningNowItems` deleted; `nearby-events.tsx` on the shared `getDistanceKm` | **Done** |

**"Best Parties" was two wrongs compounding.** It substring-matched
`party|night|club|music` against the category name, so Classical and Carnatic —
sitting under Music — was a Best Party. And when nothing matched it fell back to
*every* event sorted by interest, so the section still rendered under a parties
heading showing whatever had a cover image. A book club presented as the best
party in town. It groups on the parent slug now (blendn-admin #214 puts it on
the payload) and has no fallback: no nightlife, no section.

**The top hero was never editorial.** `inviteHeroEvent` walked three lists and
took the first item with a cover image — an image-availability check wearing a
curator's hat. It is `soonestWithImage` now, which is what it does. Real
curation stays a separate feature rather than something the naming implies
already exists.

**"View all" was answering a different question than the section it expands.**
`nearby-events.tsx` sent `radius: 50` — the same hard cut that blanked the home
screen, at a bigger number. It reads the same stored city now.

**`profile.location` no longer decides anything.** It was reverse-geocoded once
at signup, so it was stale for anyone who had travelled — and it was being shown
as the header above a query filtered to wherever the device actually was. Two
notions of "where you are" in one screen, which is the bug in one sentence.

**Interested was about to become a second version of the same bug.** It was
`events.filter(is_favorited)`, harmless while `events` was everything and wrong
the moment `events` is one city: favourite something in Munich, browse
Bengaluru, and it vanishes from the section whose whole promise is "things you
said you wanted". It is fetched by user now, like the checked-in strip already
was.

**The fix had its own trap, found on a device rather than by reading code.**
Three guards — fall back to the busiest city, stay quiet about a city with no
events, list only cities that have events — put a user in Germany into
Bengaluru with **no way to say where they were**. Their city was absent from the
list, absent from the banner, and the selection that had never been theirs could
not be undone.

| # | What | State |
|---|---|---|
| — | Storage records **how** a city was set: `chosen` vs `inferred` | **Done** |
| — | A guess may be replaced when you travel; a choice never is | **Done** |
| — | Re-check location on foreground — reopening did nothing before | **Done** |
| — | *"Use my current location"* in the picker, **not** gated on having events there | **Done** |
| — | *"Coming soon to {city}"* vs *"Nothing on in {city}"* — two different empties | **Done** |
| — | *"You're in {city} — nothing here yet"* when there is nowhere to switch to | **Done** |

**Device testing in Saarbrücken found the next layer of the same hole.** With
Bengaluru selected, backgrounding and reopening correctly did nothing — a chosen
city is never moved, and Saarbrücken has no events to move to. But the app knew
exactly where the user was and **never said so**: the switch banner only speaks
when the device's city has events, so the people we have not launched near got
no acknowledgement at all. `awayNotice` is the other half, mutually exclusive
with the switch offer by construction and pinned across every combination.

**No time-based expiry, deliberately.** A home city does not go stale after
thirty days and any threshold would be arbitrary. "My trip ended" is already
covered: you are back in a city that has events, so the switch is offered.

**Old installs read as `chosen`.** They stored a bare string with no source, and
the conservative reading means the worst case is being *asked* to switch. Being
*moved* without warning is the harm.

**Choosing a city with no events is allowed, and useful.** It gets an honest
"we're not live here yet" instead of a blank page, and it is the clearest signal
we have about where to launch next — **and it is now recorded**, via
`POST /events/demand` (blendn-admin #215). One row per person per city, not per
open: "forty people in Saarbrücken" has to mean forty people, and a log of opens
would let one enthusiast outrank a crowd. No coordinates are stored.

The dashboard view of it, and the rest of the investor-facing metrics — MAU,
WAU, DAU, stickiness, retention curves, activation — are written up in
`blendn-admin/docs/ROADMAP.md` section 8b and are **not built**. They share one
dependency, an activity table, and retention is the one metric that cannot be
backfilled: a D30 curve needs that cohort's day 30 to have been written down at
the time.

**Still placeholder:** the picker sheet and the header trigger. The trigger is
styled as a caption and is the primary control for the whole screen; the sheet
has no search and does not scale past a handful of cities. See
`docs/PLACEHOLDER_SCREENS.md` section 5.

---

**Stage 1 — the six bugs device testing found.** Reviewed by `/plan-eng-review`
and Codex. Everything here is app-side and ships as one PR, independent of the
identity work in `Next`.

| # | What | State |
|---|---|---|
| T5 | Per-attempt `AbortController` on every fetch site — no timeout existed anywhere | **Done** (#70) |
| T6 | Extract `pickActiveRoom`; one bad check-in must not abandon the rest | **Done** (#70) |
| T1 | Socket auth callback that **refreshes**, not just re-reads | **Done** (#70) |
| — | Honest cold-start states: auth-loading ≠ signed-out ≠ empty ≠ failed | **Done** (#70) |
| T9 | `about-you` requires gender + orientation when dating is ticked | **Done** (#70) |
| T12 | Sweep the #67 debris — `myName`, `attendeesTotalCount` | **Done** (#70) |
| T2b | The DM keeps the room's pseudonym; one reveal control | **Done** (#71) |
| T21 | The leaving sheet — unmatch / block, report bundled in | **Done** (#71) |
| T4b | "Make main" on any photo | **Done** (#71) |
| T4c | The 40px blur derivative, client half | **Done** (#71) |
| T8 | The checked-in strip is wired, and stops hiding events | **Done** (#71) |
| T13 | `PHOTO_MANAGEMENT_IMPLEMENTATION.md` rewritten off Supabase | **Done** (#71) |

Tests 56 → 98. **Still owed a device pass:** idle 20 minutes foregrounded and
confirm realtime returns with no Retry, and that the reconnect handshake carries
a *new* token — the fix is invisible otherwise.

**T1 is the one that looks done and isn't.** Making socket.io's `auth`
function-valued is the obvious fix and changes nothing on its own:
`TokenStorage.getAccessToken()` is a bare SecureStore read with no expiry
awareness, so the callback re-serves the same expired token. It has to call
`apiClient.refreshSession()` first.

**T6 before the `continue` fix.** The suite is `jest-expo` with no
`@testing-library/react-native`, so the loop cannot be tested while it lives
inside `MatchScreen.tsx` — same reason `lib/reveal.ts` and `lib/geo.ts` were
extracted in #62/#67.

**Stage 3 — the five stranded fields get a way back.**

| What | State |
|---|---|
| `intent_default`, `work_field`, `gender`, `orientation`, `interested_in` editable after signup | **Done** 2026-08-12 |

`about-you` already loaded the profile, prefilled all five, validated the
conditional rules and saved them. The only signup-specific lines were the last
two, so it takes an `?edit=1` param instead of getting a twin: same screen,
different wording, `router.back()` instead of onward.

**A second screen was the obvious option and the wrong one.** Every rule here is
conditional — dating needs gender *and* orientation, `interested_in` is asked
only when the pair is ambiguous, `just_here` excludes the rest — and a copy of
that is a copy that drifts. It also makes the subtitle true: it has always said
"You can change any of it later", and until now there was no path.

**Stage 2 — the taxonomy the database already had.**

| What | State |
|---|---|
| Parent-aware matching: membership expands, scoring collapses | **Done** — `blendn-admin` #210 |
| The interest cap, enforced server-side for the first time | **Done** — `blendn-admin` #210 |
| `toPickerTree` + the grouped picker | **Done** 2026-08-12 |

Parents are **headings, not options**. Making them selectable would have needed
a tri-state control, an explicit-vs-implied distinction in the data model, and a
save path diffing two levels — to express "I like music broadly", which nobody
asked for. Ranking gets the parent anyway: the server expands a stored leaf
upward, so two people into different genres meet at Music.

Still open: **Stage 4**, the match card naming shared interests with the
overlapping ones highlighted.

**Stage 7 — builds that ship themselves.** `stage` → TestFlight and Play
internal against staging; `prod` → both stores against production, waiting for a
human. Runbook: [`docs/RELEASING.md`](docs/RELEASING.md).

| What | State |
|---|---|
| `eas.json` profiles, two workflow YAMLs, `deploy-ios.yml` deleted | **Done** (#72) |
| `Info.plist` Google client id made literal — `$(VAR)` resolves to nothing on EAS | **Done** (#72) |
| `.env.example` — 8 vars, rebuilt by grepping source | **Done** (#72) |
| App Store Connect API key uploaded to EAS | **Done** 2026-08-11 |
| All 8 env vars set in `preview` + `production`, verified | **Done** 2026-08-11 |
| GitHub ↔ EAS connected (so no `EXPO_TOKEN` anywhere) | **Done** 2026-08-11 |
| Play service account: key, API enabled, invited, uploaded to EAS | **Done** 2026-08-12 |
| Android upload keystore — generated, on EAS | **Done** 2026-08-12 |
| **Upload key reset** — the old key is lost, Google must swap it | **Submitted** 2026-08-12, pending (48–72h) |
| Google Sign-In on Play builds — OAuth client had only the *debug* SHA-1 | **Fixed** 2026-08-12 |
| iOS distribution certificate + provisioning profile | **Done** 2026-08-12 (expire 12 Aug 2027) |
| Apple Push Notifications key | **Done** 2026-08-12 |
| Sentry DSN + org/project/auth token in both environments | **Done** 2026-08-12 |
| `build:version:set` — iOS at 100, Android at 10 | **Done** 2026-08-12 |
| Demo organiser + org + membership row in `seed:room` | **Done** — `blendn-admin` #206 |
| **First iOS build on `staging`** | **Done** 2026-08-12 — build 102, after 101 failed on a capability mismatch |
| **First build on TestFlight** | **Done** 2026-08-12 — build 103, Xcode 26, no 90725 |
| **Merge to `stage`, build starts unattended** | **Done** 2026-08-12 — iOS + Android both started by the GitHub App, 1s after the push |
| Internal + external testers, iOS | **Done** 2026-08-12 — public join link issued |
| Internal testers, Android | **Blocked** on the upload key reset |
| `docs/TESTER_GUIDE.md` for non-technical testers | **Done** 2026-08-12 |
| Play account type — personal (12 testers × 14 days) or organisation (exempt) | **Open** — decides whether a two-week wall exists before production |
| Device pass against `docs/TESTING_CHECKLIST.md` | **In progress** — A3, the realtime reconnect, verified on device 2026-08-12 |
| **Xcode 26 image pin** | **Done** #79 — SDK 53 / RN 0.79.6 compiles under Xcode 26.0, confirmed |
| App icon rebuilt — opaque, centred, on the brand gradient, both platforms | **Done** 2026-08-12 |
| Maps API key — created, restricted to Maps Static API, set in EAS | **Done** 2026-08-12 |
| Maps key — app restriction (two keys + request headers) | **Open** — see RELEASING.md; no quota cap exists, so this is the only real ceiling |
| Maps proxy through `blendn-admin` | **Open** — Google's own recommendation, and worth more now |
| ~~Sign in with Apple~~ | **Already built** — see correction below |

**Nothing left here is code.** The repo half shipped in #72–#74.

**`build:version:set` is the one that will bite.** A new EAS project starts its
build-number counter at zero while both stores remember everything the old
project uploaded, so the first automated build is rejected *at submit* — after
paying the full queue wait and build time. Play is at versionCode 3; ASC has six
months of TestFlight builds.

**Correction: Sign in with Apple is built.** Earlier entries in this file called
it "not started" and a Guideline 4.8 risk. That was read off the plan document
and was already stale — commit `113bd24` shipped it. `expo-apple-authentication`
is a dependency, `app/index.tsx` has the button and calls `signInAsync`,
`app.json` sets `usesAppleSignIn: true`, and the entitlement is in
`ios/blendn/blendn.entitlements`. The server half was always there
(`blendn-admin/app/api/mobile/auth/apple/route.ts`). **4.8 is not a live risk.**

**It is, however, what broke build 101.** `eas credentials` had been run from
`~/conductor/repos/blendn`, which sits on `prod` — 61 commits behind, with no
`usesAppleSignIn` and no entitlement. EAS therefore **disabled** the capability
on the App ID (shared Apple state, all branches), minted a profile without the
entitlement, and fastlane refused to sign a native project that requires it. Not
a code fault: credentials configured from the wrong branch. Written up in
RELEASING.md, because the same command will do the same thing again.

**Xcode 26 is a hard deadline on the App Store path.** Since 28 April 2026 Apple
refuses submissions built with older Xcode, and EAS's `image: auto` picks by SDK
version — SDK 53 resolves to Xcode 16.4, so every build so far carries *"can no
longer be submitted to the App Store"*. Upgrading the SDK is not the fix (54 was
tried and rolled back — see `SECURITY_RELIABILITY_BACKLOG.md`); pinning
`macos-sequoia-15.6-xcode-26.0` in `eas.json` is. Deliberately the **lowest**
Xcode 26 image, since the further from SDK 53, the likelier a native module
fails to compile.

**Google Sign-In was broken on every Play build** until 2026-08-12 — the only
Android OAuth client carried the *debug* SHA-1, so it worked on every machine
anyone would debug it on and failed on everything installed from the store. Two
clients now, one per certificate. See RELEASING.md.

### The Grid card, the profession filter, and the strip that became a ring — **Done** (#201)

Three things, and the third is the one worth remembering.

**The card says something true, once.** Frame `1141:4951`: name, occupation
under it, one labelled box. The pair it replaced said the same thing twice —
*"You both picked Techno and Board games"* directly above chips reading *Techno,
Board games*. `gridCardBox` returns `SHARED INTERESTS` → `SAME FIELD` →
`ATTENDING LIVE` → `null`, in that order. A box with nothing true in it is worse
than no box.

**Profession filters, interests do not.** The roster is already *ranked* by
compatibility with shared interests in the score, so filtering on them narrows a
list already sorted by them. Client-side, and that is not a preference:
`workField` is null below `MIN_ROOM_FOR_WORK_FIELD` (8), so a `?workField=`
parameter would filter on the **real column** while the response suppresses it —
narrowing to one result would tell you a suppressed attribute by elimination.

**The checked-in strip became a ring on the Blend'n button.** A section header, a
carousel of full-width cards and a Check out pill — about a third of the first
screen, permanently, for one bit of information, pushing the feed the screen
exists for below the fold.

The requirement that fell out of moving it: `roomButtonPulses` is true for both
`live` and `checkin`, so a glow that is *only* a breath looks identical whether
you are in a room or standing outside one. Survivable while the strip named the
event; not survivable once the button is the only signal. So `roomButtonGlow`
splits them — a breath for the invitation, a **steady ring** for the state.

The ring is static on purpose, and this is the general rule: **motion cannot
carry a state.** It is invisible in a screenshot, with Reduce Motion on, and to
anybody not looking at the instant it swells.

**Check out moved rather than vanished.** The strip held the only one-tap check
out — `handleCheckOut` had gone caller-less once before, which cost three taps
through the event detail screen and is why the strip was built. Two callers now:
the Pulse's long-press tray (which offered a way in and no way out) and the room
screen's top bar, which is where the ringed button goes.

**A test was passing for the wrong reason.** `pulseCardGeometry` asserted
`position: 'absolute'` against `events.tsx` to check the *tab bar* floats over
the feed — and was matching the carousel's gradient and status pill. Deleting the
carousel broke a test about the tab bar, which is the tell. It reads `_layout.tsx`
now, which is the file that positions the bar.

### The card's age and shared-field were declared but never mapped — **Done** (#203)

Server half `blendn-admin#255`, on staging.

`AttendeeProfile` declared `age` and `sharedWorkField`. `GridPerson` declared
them. `gridCardBox` branched on one and the card title rendered the other —
`person.age ? `${name}, ${age}` : name`. And the map from the API response set
**neither**, so the title could never say "Priya, 29" and the SAME FIELD box
could never fire, on any card, ever.

Nothing caught it. Both are optional, so the compiler was satisfied; both degrade
to a card that merely says *less*, so no test failed and no screen looked broken.
**A field is not wired because a type says it exists.** The root was one level
up: `MatchCard` in `lib/apiClient.ts` never learned the fields, so there was
nothing to map from.

**The load-more path was worse.** It mapped five of nine fields, and
`setAttendees` *replaces* the list rather than appending — so tapping "Load more"
stripped the occupation line, the shared-field box and the age off every card
that already had them, and emptied the profession filter with them
(`availableWorkFields` reads `workField`). The room got visibly worse for asking
to see more of it.

The tests were **mutation-checked rather than assumed**, which mattered: the
obvious version — assert each field appears in the file — passed when the first
map's lines were deleted, because a field present in *either* map satisfied it.
They now assert per-field occurrences across both paths, plus a guard that there
are still exactly two maps, since a third would quietly turn ">= 2" back into
"somewhere".

### Next — the Pulse's two remaining render costs

Found by the render audit that produced the Featured carousel fix. Both are real
and neither was done, because each is a bigger change than it looks:

**`renderEventItem` re-renders the whole main list on any check-in change.** Its
`useCallback` closes over `checkinStatuses`, `proximityData` and
`interestStatuses` — three maps that change whenever anybody checks in, moves, or
taps a heart. Every change gives `renderItem` a new identity, so `FlatList`
re-renders every mounted row. The fix is to pass each row only its own slice, or
to move the lookup inside a memoised row component, which means changing
`EventCard`'s contract.

**`UpcomingCard` is memoised and the memo cannot bite.** It is rendered from a
plain `.map()` with inline `onPress` and `onToggleFavorite` closures, so the
shallow compare fails every render. Same fix as the Featured carousel —
precompute the props in a `useMemo` — but the callbacks take an event *and* a
toggle, so the binding is less trivial.

Only three cards, so the second matters less than it reads.

### Next — CORE EXPERTISE, decided and not yet built

The frame's card carries two specialism tags under the occupation ("Spatial Web",
"LLM Architecture", "UX Psychology"). Nothing in the product backs them, so the
card ships without the row. Decided:

| | Decision |
|---|---|
| **D25** | **Curated, scoped to the work field.** Pick your field, then 2–3 specialisms from that field's list. Free text is where somebody types their employer — precisely what `work_field`'s coarse bucket exists to prevent, since *"works in design is an attribute; Principal Designer at Swiggy is an address"* — and it is unnormalisable and unfilterable besides. |
| **D26** | **On the basics step, right after work field.** Same question one level deeper, the picker scopes off the answer above it, and basics is the step that cannot be skipped. A skippable step is an empty field for most people, and an empty row puts the card back where it started. |
| **D27** | **Hide the row until there is data.** Every existing profile has none. Falling back to the work field as a tag would repeat the line directly above it — the redundancy just removed. |

Owed: the specialism vocabulary (~19 fields × 8–12 each), `profiles.expertise`,
the roster field, the basics step, and the card's tag row. The vocabulary is the
bulk of it and is a product-judgement job more than an engineering one.

Also still owed from the same frame: `sharedWorkField` is computed in
`lib/matching.ts` for ranking and never returned, so the card's SAME FIELD box
has no server field behind it yet.

### Previously in Now — done

**After signup: retire onboarding, ask once, gate at the point of use.** The
server half is `blendn-admin/docs/ROADMAP.md`, deployed to staging (API
#183–#195).

| PR | What | State |
|---|---|---|
| 10 | A test runner, and the pure logic the rest depends on | **Done** (#62) |
| 11 | Delete `app/onboarding/` — atomic with the routing gate | **Done** (#63) |
| 12 | Signup takes an age; one `about-you` screen replaces eight | **Done** (#64) |
| 13 | The card renders what it already knows | **Done** (#66) |
| 14 | Anonymity in the room: the suggestion prompt and the status chip | **Done** (#67) |

### The event screen stops showing faces — **Done** (#135)

The client half of blendn-admin #229. `interestedPreview` was real photographs
of everyone who had favourited an event, served ungated to any authenticated
caller, and this screen rendered them as an avatar row — seeded from a nav
param, so they travelled across the transition too.

Removed end to end: the request, the field on `eventFromApi`, the nav param, the
state, the interaction-manager gate that revealed them, and the row itself.

What replaces it is three grey discs and the count. The composition needs a mass
beside the number, and three anonymous circles say "several people" without
saying which — which is the honest version, because favouriting has no check-in,
no pseudonym and no reveal for anybody to have passed through.

Also fixes the singular: "1 people are interested".


### The like button, which never existed — **Done** (#131)

`likeAtEvent` shipped in `lib/apiClient.ts` with a request queue and three
retries, and **had zero callers**. The room read `youLiked` back from the server
and rendered it, so the app could show you that you had liked somebody while
giving you no way to do it.

What it offered instead, on `user/[id]`, was `createMessageRequest`: send a
request, wait, be accepted or ignored. That is the rejection risk the mutual gate
exists to remove — from this file's own opening: *"Mutual like opens the
conversation. You never approach someone who has not already said yes."*

- A heart on every Grid card, bottom-right, deliberately far from the safety
  control top-right. One of those two means "I would like to meet this person"
  and the other means "report or block them".
- `lib/likes.ts` holds the rules, tested: local state wins over the server so a
  refetch cannot downgrade `matched` back to `liked`; failure clears this
  session's opinion rather than asserting not-liked, because a request can fail
  after the write landed; and no state ever speaks for the other person, because
  the roster carries `youLiked` and deliberately has no field for the reverse.
- Mutual opens the conversation server-side for both at once, so the matched
  card becomes a tap through to it.

**Still needs a two-account device test.** The mutual branch cannot be exercised
from one phone.

### Navigation settled — `Pulse · Going · [Blend'n] · Banter · Me`

Full reasoning in `docs/NAVIGATION.md`. The short version: the app has two
mutually exclusive modes, and the built bar spent a whole tab on the one that is
almost never active — `MatchScreen` is the room roster and rendered "Not Checked
In Yet" ~99% of the time.

So the centre control is the **mode switch**, not an action, and it opens The
Room (`Grid | Chat`, as frame `1141:4951` draws it). The Match tab is deleted.
Explore is deferred on catalogue grounds and Going takes the slot, rehoming
`interested.tsx` and the orphaned `rate/[eventId]`.

**Built** (#132). `MatchScreen` moved out of the deleted Match tab and into
`/room`, presented as a sheet with the frame's `Grid | Join Chat` toggle.
`app/interested.tsx` became the Going tab. `lib/roomButton.ts` holds the centre
button's four states with tests.

Two of those four states are still inert, and deliberately: `checkin` needs the
presence monitor mounted and `today` needs the saved-events list threaded in.
`roomButtonTarget` already accepts both inputs and orders them correctly, so
that is wiring rather than design.

Also mounted for the first time: `RoomVisibilityBanner`, with its reveal toggle
wired to `setMatchPreferences` — optimistic, rolled back on failure, and
deliberately without `rememberReveal`, because one tap at one event should not
change how somebody enters every future one.

### The presence monitor runs — **Done** (#133)

`lib/presence.ts` held the geofence eviction policy, with tests, since it was
written, and **nothing ran it**. The fence was enforced once at check-in; after
that somebody who went home stayed on the roster and in the match pool all
night.

`components/PresenceMonitor.tsx` mounts at the root — leaving a venue should be
noticed whether or not the room is the screen you have open — and renders
nothing until it has something to ask.

- **Foreground only.** No background location: it needs iOS's *always*
  permission, and it buys least exactly where a false eviction is least
  recoverable, because nobody is looking at the phone to say "no, I'm still
  here". The app-closed case is already covered by the chat lifecycle sweeper
  closing the room when the event ends.
- **A failed fix is a `null` sample, not a skipped one.** `presenceAction`
  breaks a run of outside readings on a null rather than extending it, so losing
  signal *stops* the clock. Skipping the sample would leave the previous outside
  readings adjacent to the next one and let a basement look like a walk home.
- **The prompt is not dismissible.** Tapping the backdrop would read as "I'm
  still here" while recording nothing, so the reprieve would never start and the
  same prompt would return two minutes later.
- `SAMPLE_INTERVAL_MS` (2 min) and `SAMPLE_WINDOW_MS` (30 min) are tested
  against the decision window, including that the interval can never grow past
  the point where an eviction could not fire at all.

Two calls to resolve the fence, because `/checkins/active` returns the event's
title and cover but not its coordinates or radius.

### All four centre-button states are live — **Done** (#134)

`checkin` and `today` were inert because nothing fed `insideEventId` or
`todayEventIds`. Both now come from `lib/roomSignal.ts`, published by The Pulse
out of a fetch it was already making — that screen asks for events with a
location and gets `distance` back on every one. Same module-level
cache-with-subscribers shape as `lib/unread.ts`.

- `pickInsideEvent` only counts events **running right now**. Standing outside a
  venue at noon for a thing at nine is not a check-in opportunity, and offering
  one would put somebody on a roster hours before the doors open.
- It converts km to metres, with a test. That exact mismatch has already shipped
  once here — the proximity gate compared metres to kilometres.
- Overlapping fences resolve to the **nearer centre**: two venues on one street
  is real, and the nearer centre is the better guess at which building somebody
  is in.
- `pickTodayEvents` counts **saved events only**. Every event in the city is not
  yours, and a button pointing at whatever is on tonight is a recommendation
  wearing the clothes of a reminder.
- No margin on the offer, deliberately. `lib/presence.ts` widens the fence in the
  other direction because a false *eviction* is harmful; a false *offer* is not,
  because the server re-validates the GPS on the real check-in and refuses.

`clearRoomSignal` runs in `clearAuthState`, not in `signOut` — a failed
background refresh reaches that path without going through sign-out, and without
it the next account on the device inherits the previous one's plans for tonight.


### The Pulse — **Done** (#130), minus two sections

Frame `1141:4643`, applied to `app/(tabs)/events.tsx`. A restyle, not a new
screen: that file already had a featured carousel, Upcoming, Nearby, Nightlife,
Interested, the checked-in strip, the city picker, empty states and skeletons —
more than the frame draws. Nothing was removed. Notes in `docs/PULSE.md`.

- **Search is the first caller `GET /events?search=` has ever had.** The
  parameter existed in the endpoint and in `EventsParams`; no screen sent one.
  Typing hides the curated sections and shows a flat list, and a search that
  finds nothing gets its own empty — otherwise a typo answers "Coming soon to
  Bengaluru" and tells somebody we have not launched in the city they are
  standing in.
- **`fetchMore` was dropping the city filter.** Page one sends `city`, page two
  never did, so scrolling past the fold appended events from everywhere into a
  city-scoped list. Found because `search` would have inherited it exactly.
- Featured and Upcoming split from one sorted list; featured requires a cover
  image, because that card is a photograph with words on it.
- The interest heart was added back to the Upcoming card — the frame has no
  place for it, and the card it replaced had one.

**Not built, on purpose:** the "Explore the Grid" card (the deferred venues map,
and a name collision with the room screen), and the large Nearby card as drawn
(**Reserve Table** and *"+12 Friends are here"* need reservations and a social
graph). Nearby still renders the existing list.

**Still open: the bottom navigation's *item set*.** The frame's bar is
`Feed · Explore · [centre] · Circles · Me`, which is the same five-item shape The
Banter uses — so those two frames agree, and the "three navs" conflict is
narrower than recorded. But that bar has no slot for **Chat** or **Match**, both
built and working, and "Circles" is the social graph, which does not exist. The
four-tab bar stays until this is decided.

The **centre button** is a separate question and it is settled (#172): seated in
the bar rather than raised above it, mark at 34pt in the brand ink. That is
geometry, and it holds whichever four words end up either side of it.


### Orientation is a set, not a choice — **Done** (API #227, app #129)

People hold more than one label — "queer" and "bisexual" together, "asexual"
alongside a romantic orientation — and a single-choice control made somebody
pick which part of themselves to leave out, on the screen that asks them to be
authentic. `profiles.orientations String[]`, capped at three.

- **"Prefer not to say" is exclusive**, the same rule `intentsAreCoherent`
  applies to `just_here`. A refusal is not a fourth thing you are.
- **`interested_in` derives from the union, never the intersection.** Adding a
  label must not narrow the pool. A biromantic asexual person settles it —
  `asexual` alone derives `[]`, so intersecting would delete a real combination
  down to nobody.
- **One unreadable label makes the whole derivation `null`.** Otherwise a woman
  who picked "straight" and "queer" derives from "straight" alone and is pinned
  to `["man"]`, narrowed on the strength of the label she just qualified.

The caption is back to the frame's "Select all that apply to you". Chips past
the cap are dimmed rather than removed: the unreachable ones are what tell
somebody the limit exists.

Both writers changed — onboarding step four *and* the Settings editor
(`about-you`). One screen enforcing the cap while the other does not is a 400
from the second, so `toggleOrientation`/`orientationDisabled` live in
`lib/dating.ts` and both screens call them.

The singular `orientation` stays accepted on the API, deprecated. Removing it
fails silently: an installed build keeps sending it, zod drops the unknown key,
the save returns 200 and stores nothing.

---

## Next

### The Banter's two loose ends

- **Search is drawn and does nothing.** The field is built to the frame and is
  not wired. Needs a decision first: conversation titles only (client-side,
  today), or message bodies too — which is a server endpoint that does not
  exist.
- **Pinning, if it is ever wanted, has no rail left.** The frame's Pinned rail
  is now "Live now". A pinned rail and a live rail are two rails, and the screen
  would have to say which is which. See [`docs/BANTER.md`](docs/BANTER.md).

### Deferred features, and the UI that is waiting on each

**Read this before building any of the features named below.** Each has a piece
of drawn design that cannot ship until it exists, and the point of this section
is that the UI goes in *with* the logic, in one pass, rather than being
retrofitted months later by someone who has to rediscover which frame it came
from.

The failure mode this prevents is the one already in this repo: a control gets
built to match a frame, has nothing behind it, and either ships dead or gets
quietly dropped and forgotten. `renderFeaturedRow` had no caller for a release;
`likeAtEvent` had none at all.

| Feature | Drawn, and waiting | Interim |
|---|---|---|
| **Friend graph** | The Nearby card's social-proof row — frame `1141:4788`, a 40×40 avatar stack with "+12" and the label "Friends are here" at x=56 | Ships as a check-in count, "12 people here now", from `event_check_ins` |

**Friend graph — what to change when it lands.** This app has matches and
conversations; it has no concept of a friend. `intent_default` mentions
`friendship` as an *intent*, which is a different thing entirely. So the avatar
stack has no source, and a stack of match avatars would be worse than none —
those are private connections, and putting their faces on a venue card next to
"are here" would leak both who you matched with and where they are, which is the
same class as the roster and interested-list leaks.

When the graph is built: restore the avatar stack on the Nearby venue card, and
sweep for anywhere else social proof is shown as a count that would read better
as faces. Gate it on the same identity rules as everything else — a face is
identity, and being somewhere is location.

### The interest count on an event card is always `undefined`

Found by `expo lint` while deleting the Pulse's orphans, not by looking at a
device — the number simply never draws, so nothing looks broken.

`renderEventItem` passes `interestCount={interestCounts[event.id]}`, and
`interestCounts` has no writer: `loadInterestCounts` and `loadInterestData` are
both defined and never called, and have been since before the Pulse rebuild
started. Deliberately left out of that rewrite, which touches presentation only.

Deciding whether the count comes back at all is the first half of the job — the
Pulse frames do not draw one, and `EventCard` is used by more screens than this.

### `about-you` does not prefill what you already answered

Found while making orientation multi-select (#129), not fixed there.

Reached from Settings as **"You and matching"**, the screen loads the profile
and hydrates only `name` and `age`. Intents, work field, gender, orientations
and interested-in all render empty, whatever is stored — so opening it to change
one answer means re-entering all of them, and `validate()` refuses to save until
you do.

It is not silent data loss today, because the refusal is visible and the fields
are re-asked rather than blanked. It is still the wrong screen: an editor that
shows nothing it is editing.

`GET /profiles/:userId` returns every one of these to their owner, so the fix is
hydration in the existing `load()`, not a new endpoint. Sized small; left out of
#129 to keep that change to one field.

### Decided: friendship does not reveal identity

A friend sees what a match sees. Revealing stays an act taken in a room.

The alternative makes the friend graph a second path around `maySeeIdentity`,
and a back door in an anonymity model is not a feature of it. Anything that
wants to show a friend's real name has to go through the same gate everything
else does.

This unblocks The Grid.


### Wire the presence monitor into the room

`lib/presence.ts` holds the policy and 15 tests hold it to it. Nothing calls it
yet — the sampling loop belongs in the room screen, which is The Grid, and that
screen does not exist. The same is true of `RoomVisibilityBanner`.

Both land with The Grid rather than being bolted onto the events tab first,
because the room is where a checked-in person actually sits.

What is left to wire, and only this:

- sample location on a timer while checked in and in the foreground
- feed the samples to `presenceAction`
- `'ask'` shows `PRESENCE_COPY.ask`; a "stay" answer stamps `saidStillHereAt`
- `'checkOut'` calls the existing check-out endpoint and shows
  `PRESENCE_COPY.autoCheckedOut` — never silently

The check-in-time permission gate was **already built**: `events.tsx:478` blocks
check-in without a location and `getCurrentLocationQuietly` requests permission
and offers Settings when it is refused. Nothing to add there.


Ordered by what is broken for a real user today, not by what is interesting.

### 1. Smaller, confirmed

| | Where | |
|---|---|---|
| **Ratings can be seen, never given** | — | `stats.averageRating` renders on the event card; `rateEvent` has zero call sites. `POST /events/:eventId/rating` is live |
| ~~**Location is stored as a coordinate string**~~ | — | **Wrong when written, corrected 2026-08-10.** The app does send `"12.97,77.59"`, but `PUT /profiles/:userId` runs it through `normalizeLocationToCity` (`route.ts:152`) and stores the reverse-geocoded city. A live account holds `"Paris"`, not `"48.86"`. Nothing to fix |
| **`/events/search` is never called** | — | The endpoint exists. Search may be entirely app-side work |
| **Socket transport config is untested** | `lib/socketClient.ts` | `engine.io-client`'s `tryAllTransports` defaults falsy, so listing a second transport alone changes nothing. Pinnable now that a runner exists (#62) — it needs the client mocked, which the three current suites do not |



### 9. Designed, built nowhere, now in scope

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

- **The Banter, rebuilt from scratch against frame `1141:5247`.** The old screen
  was deleted rather than adapted — 1465 lines of `personal` / `group` tabbed
  presentation replaced by `components/banter/BanterSections.tsx` and a screen
  that keeps only the data layer. Designer notes: [`docs/BANTER.md`](docs/BANTER.md).

  **One inbox, not two tabs.** The old screen fetched only the visible half, so
  the other half was always as stale as the last time you looked at it, and
  "did anyone message me" needed two places checked. Merged and sorted by last
  message, with never-used rooms at the bottom. A person is a photograph; a room
  is a `#211F1F` disc with a glyph, which is the frame's whole distinction.

  **The rail says "Live now", not "Pinned".** Nothing in the product can pin a
  conversation — no column, no endpoint, no gesture — so the frame's rail could
  not be built as drawn, and filling it from "most recent" would have duplicated
  the list beneath it under a label that lies. What *is* pinned by circumstance
  is the event room you are checked into: temporary, anonymous, useful only
  while you are there. Those rooms are lifted out of Recent into the frame's own
  rail component. `isCheckedIn` is a new server field (blendn-admin #248) —
  `checked_in` with no `check_out_time` — because the client cannot derive it:
  "the event is underway" is not "I am there".

  **Message requests kept a card the frame does not have.** A request is the one
  row that cannot be opened, since tapping it has to mean accept or decline.
  Matching the frame exactly would have left the endpoint with nothing calling
  it. Built from the frame's own parts; decline left, accept right.

  **The compose FAB removed** by decision — a DM starts from a person and every
  route to one already goes through a profile.

  **The unread dot was measured wrong twice over.** Frame `1141:5296` rings it
  with `shadow: 0 0 0 2px #0F0E0E` — *outset*. RN's `borderWidth` grows inwards,
  so the obvious transcription left an 8pt accent core in a 12pt footprint. The
  dot sits at the **bounding box's** corner and the avatar is a circle, so from
  the 56pt avatar's centre the dot's centre is `√(22²+22²) = 31.1` against a
  radius of 28 — it is centred outside the photograph and only its inner edge
  reaches back in. An 8pt core reaches 27.1 and grazes the rim; the frame's 12pt
  core reaches 25.1 and bites in. That one number is the difference between a
  dot that looks attached and one that looks like it fell off. Rebuilt as a 16pt
  `#0F0E0E` ring holding a 12pt accent circle at `-2, -2`.

  Not a copy-paste fix: the pinned rail's presence dot (`1141:5265`) *is* a
  single 16pt "Background+Border", so `borderWidth: 2` is right there and wrong
  three lines away. Both pinned by tests.

  Also: `PulseTopBar` takes a `title`, so the bar reads **The Banter** rather
  than claiming to be the home screen; and pinned names size to content, which
  stops "Gala Night" rendering as "Gala Nig…". 20 tests in
  `__tests__/banterInbox.test.ts`.

- **Every image in a virtualised list gets a recycling key** (#184, #185).
  `expo-image` reuses native views inside a `FlatList`, and without a key it
  cannot know the view it just handed you was showing something else — so a row
  scrolling into place paints the **previous** row's picture for a frame or two
  and then dissolves into its own.

  It reads as a flicker, it is worst on the fast scroll a feed invites, and **a
  still capture never shows it**. That is how nine shipped unkeyed across eight
  files.

  Systemic rather than careless: `SceneHeroMedia` has had one from the start,
  with a comment explaining exactly this, because it uses `expo-image`
  directly. `OptimizedImage` — which everything else renders through — **did
  not expose the prop at all**, so no card, avatar or chat row could pass one
  even in principle. Fixing the component was the fix; the call sites were
  mechanical afterwards. Forwarding matters as much as accepting: it renders up
  to four `<Image>`s and a key on some of them leaves the rest free to flash.

  Also `initialNumToRender` 10 → 4 on the Pulse. It renders synchronously
  before first paint, a row is ~437pt, and two fit on a 956pt screen — so ten
  was five screens and ten image decodes to show two cards. `windowSize` left
  alone: it governs what stays mounted rather than what blocks the frame, and
  that trade wants a measurement.

  **The video half needed nothing.** `FeedVideo` already *is* the
  single-active-player policy — the caller mounts it for the one card on screen
  rather than pausing nine others, so a feed of ten costs one decoder. Checked
  rather than assumed.

- **The bell, and five push kinds that went nowhere** (#178). `PulseTopBar`
  drew only the wordmark because "a notifications centre is designed and not
  built, and a bell that opens nothing is a dead control in the most-tapped
  corner of the screen". `GET /notifications` exists now (blendn-admin #242),
  so the frame's right glyph goes in.

  Opening the sheet marks everything read rather than each row as you pass it:
  the badge answers "is there something I have not seen", and looking at the
  list is the act that answers it. No polling — a poll costs a request every
  few seconds on the busiest screen for a number that changes a few times a
  day.

  **The real find was in the push handler.** Routing the bell through the
  *existing* `navigateFromNotificationData`, rather than writing a second
  switch, showed that five of the eleven kinds fell straight through it:
  `message_request`, `message_request_response`, `waitlist_promoted`,
  `reveal_request`, `reveal`. Every one is emitted by `sendPushNotification`,
  so tapping any of those **pushes** opened the app and left you where you
  were. Fixed at the switch, so pushes benefit too.

  Neither new destination is a profile. A request from somebody you have not
  accepted, and a reveal, must not deep-link past the gate the server enforces.

  I overwrote `lib/notifications.ts` on the first pass — it already existed,
  with that switch in it — and restored from git. The claim I had written on
  the strength of the overwrite, that no push-tap handler existed, was wrong;
  correcting it is what surfaced the five-kind bug.

- **The simulator can be tapped from a script** (#179). Partial fix for the
  standing blocker below.

  `xcrun simctl` cannot tap or type, which is why every UI change here has been
  verified through a `__preview` harness. `scripts/sim.sh` maps a device point
  to a screen point — insets derived from the window's geometry, not hardcoded
  — and clicks through Accessibility. **Taps and screenshots work**, verified
  against the sign-in flow, so real screens can be reached from a script now.

  **Text entry is still open**, and the script records why. `type` reloads a
  dev build: the Expo dev client binds single letters as shortcuts (`r`
  reload), and "tester@blendn.app" contains an `r` — every attempt bounced the
  app to its intro, which looked like the tap failing rather than the typing
  working too well. `paste` (pbcopy + ⌘V) survives, but the text does not land:
  a synthetic click opens a *button* reliably and does not appear to give a
  `TextInput` keyboard focus. Next thing to try is idb's real touch API, or a
  release build with no dev client.

- **The bottom of the screen stops fighting itself** (#171, #172, #173). Three
  floating things — the tab bar's centre button, the Scene's CTA and the event
  screen's action row — each designed as if it were the only one there.

  **The CTA was not docked.** It sat at `insets.bottom + TAB_BAR_CLEARANCE`, and
  the tab navigator already ends its children's viewport above the bar, so the
  clearance counted twice and lifted the pill ~130pt into the middle of the
  page, straight across the gallery rail. It had been "verified" before by
  diffing rows across a scroll, which proved it was pinned and never checked
  what it occluded.

  **The centre button left the bar.** The frames draw it at `y=-16`; on a real
  screen it overlapped whatever the other two put there, halo and all. Seated
  with `alignSelf: 'center'`.

  **The mark was the lightest thing in the row.** `monogram-white.png` has
  strokes at 5.0% of its width, so at 28pt it drew a 1.18pt line against ~2pt
  for every other glyph — measured off the PNG, not guessed. 34pt, tinted
  `#1B1931`, the ink sampled from the logo artwork; it had been
  `EMBER.onGradient`, which is the token for *text* on a gradient and rendered a
  6.07:1 maroon smudge.

  **The CTA became glass and lost 24pt.** 74 → 58, because the frame's height
  came from a 40pt icon that set the box on its own; full-bleed → content width,
  because a full-bleed pill is a bar and a bar is chrome. The gradient border
  could not come along: `LinearGradient` + `padding: 1` + opaque child is the
  standard fake gradient border and works *only* while the child is opaque —
  made glass, the whole gradient rectangle showed through and the pill went
  brown-purple. RN has no gradient `borderColor`. Hairline of white instead,
  warmth moved into the tint.

  **The tint is warm because neutral glass rendered near-black.** The pill docks
  over the bottom of a dark map on `#0F0E0E` — nothing luminous to refract — and
  read as a *disabled* control in the primary position. `#4B2F26` is
  `gradientFrom` at 25% over the page.

  **Two docks were double-glazed.** The Scene's dock had a full-bleed blur and
  scrim behind a glass pill; `EventDetailScreen`'s `tabBar` was a translucent
  tray with its own hairline holding two buttons that each already had one. A
  second sheet of glass is a toolbar, not depth.

  **The shipping button said the brand, not the action** — "Blend'n" on a
  control whose job is to check you in, while the other two stages of its own
  morph were verbs. "Blend in" now, both surfaces, pinned by
  `__tests__/sceneCta.test.ts`.

  `EventDetailScreen` was **not** wired to `SceneCTA`, despite a note in #172
  saying it would be. Reading it rather than grepping it showed why: it is a
  three-stage morph with loading states and a secondary check-out/RSVP button,
  and `SceneCTA` is the simpler control. The test now guards against a later
  "simplification" that swaps it in and quietly drops all three.

  **Not screenshot-verified:** the shipping event screen. It is behind auth and
  simulator text entry does not work (see the open item below), which is the
  whole reason `__preview-scene` exists. Everything else in this entry was
  looked at on a device, and the neutral-glass and gradient-bleed failures were
  both found that way rather than by reading the diff.

  **Open, for the designer:** a *filled* variant of the monogram for small
  sizes — 34pt is as far as scaling an outline mark goes before it crowds its
  disc. And a ruling on which gradient is canonical: the mark runs
  `#F04C16` → `#8F55A6` (orange → purple), `EMBER_GRADIENT` runs
  `#FF906D` → `#FF6D8D` (coral → pink) and never reaches purple. Both are in
  use; nothing was changed on the strength of it.

- **The Scene, built from its frame** (#162, #163). New components in
  `components/scene/`, a flat `#0F0E0E` page in place of a per-event hue wash
  generated from a hash of the event id, and a full-bleed hero whose height is
  an aspect rather than a number.

  Several things the frame states could not be copied literally. Its title
  leading is 43.2 on a 48pt font — legal CSS, where glyphs overflow the line
  box, and **clipping** in React Native. Its `text-shadow` bloom renders as a
  flat brown rectangle through RN's `textShadow`. Its "LIMITED ACCESS" pill had
  nothing behind it, and `lib/scarcity.ts` replaces it with "8 SPOTS LEFT"
  computed from real remaining capacity. Its avatar stack is the identity leak
  removed in blendn-admin #229, so the discs are generated marks.

  The glyphs are the frame's own — Material, and in the frame's colours
  (`#FF906D` for date and time, `#F79EFF` and `#FF6D8D` for the amenity pair),
  which was read off the exported SVGs' `fill` after twice getting it wrong
  from the paths alone.

  The hero is a pager that auto-advances until the first manual swipe and then
  never again, `clipFirst` puts the video first, and both it and the gallery
  rail open `SceneLightbox`. Two transition flashes were real and both fixed:
  `transition={200}` cross-fading a poster on top of the pager's own slide, and
  the player unmounting at the *start* of a 300ms slide so its poster showed
  through the whole thing.

  **Verified by frame-diffing, not by looking.** The clip was silently not
  playing — 0.0% of hero pixels changing over four seconds — through three
  successive remote samples: gtv-videos-bucket 403s, samplelib 301-redirects to
  HTML, and two others carry `moov` at the end of the file. The fixture is now
  the clip `seed-qa.ts` actually seeds.

- **The launch plays the logo's own animation, and stops inflating it** (#161).
  The intro asset was cut to start at 1.55s of the master so its first frame
  matched the completed monogram the splash already showed. Seamless, and it
  meant the first ~800ms of every launch was a *static* logo — the draw-on never
  played once. It plays from frame 0 now, with a 180ms black hold between the
  splash and the first drawn frame: a cut reads as a cut, where a logo
  dissolving to nothing reads as a bug.

  Two defects surfaced while measuring it. `TRAVEL_SCALE` was `304 / 203` and
  **304pt is the width of sign-in's tagline, not its lockup** — the original
  pass measured a band containing the mark *and* the body copy under it, so the
  travel grew the mark to the width of a sentence and the fade revealed the real
  lockup at two thirds the size. It survived one verification pass because that
  pass re-measured the same contaminated band. And the intro mounted on the
  first render, before the splash was dismissed, so its timers ran behind it —
  invisible while the opening frames were a static monogram, not once they are
  the logo drawing itself.

  Measured per row on a 440pt screen: intro 200.0pt at cy 478.5, sign-in lockup
  196.3pt at cy 333.2, tagline 304.3pt at cy 398.5. The final intro frame now
  lands 196.0pt at cy 333.3. Splash mark down from 119pt of ink to 96pt, its
  background from `#000000` to `EMBER.bg`. The black hold is what freed it: the
  splash no longer has to match the animation's first frame.

  **The lesson, since it has now cost two regressions:** a bounding box drawn
  around a rectangle that *contains* the thing you are measuring is not a
  measurement of that thing. Isolate the row band.

- **Filters on the Pulse, in the search row rather than floating.** Category,
  when, and how far — every one of them a parameter `GET /events` has always
  accepted, so this is a way to *say* what the API could already answer.

  The frame draws a floating button (`1141:4815`, 56pt at x=310, 8pt above the
  nav). It reads well on an artboard and badly on a device: it sits on top of
  the card artwork it is meant to help you search, and it has to negotiate
  z-order with a nav that is itself an overlay. Three attempts at its position
  were wrong in three different ways before the measurement was even taken.

  It is a **FILTER** action beside the search field instead, styled as
  `EMBER_TYPE.link` — the same accent-uppercase treatment as "VIEW ALL" directly
  beneath it. Search and filter are the same job, so they sit together, and the
  header block stays exactly 133pt because the action shares the field's 56.

  The cost is stated rather than hidden: it scrolls away, so somebody deep in
  the feed must scroll up to change a filter. Accepted, because the count badge
  means an active filter is always *visible* — and a filter you cannot see is
  the failure that actually matters, since the symptom is "the app has no
  events" rather than "I asked for board games within 2km".

  A filtered feed is a flat list, not a magazine — the same reasoning as a
  search. Somebody who asked for one thing should not scroll past Featured and
  Upcoming to reach it, and "Featured" over a filtered set is not what the word
  means.

  `lib/eventFilters.ts` holds the only part with a wrong answer: turning "this
  weekend" into two instants. Local days, not UTC — a UTC boundary puts "Today"
  in Bengaluru at 05:30 and drops every late-night event into the wrong bucket,
  which is least forgivable in exactly the category that matters. And asked *on*
  a Saturday the weekend is today and tomorrow, not eight days away.


### The Pulse, rebuilt from scratch — **Done** (#144, #145, #146, #147, #148)

Seven restyle PRs did not converge, because the file carried three designs'
worth of sediment: **107 style keys**, **12 render functions** from two previous
layouts, three type systems, no spacing scale. Every fix landed next to
something older that contradicted it. Plan:
`~/.claude/plans/pulse-from-scratch.md`.

The measurement that set the scope: `app/(tabs)/events.tsx` was 3527 lines,
**2298 of behaviour and 1229 of presentation**, cleanly separated at the
`return`. Only the 1250 is rewritten. State, effects and handlers are not
touched — a diff above the `return` is a mistake, and moving the device-tested
half buys the design goal nothing.

| # | What | State |
|---|---|---|
| — | The nav, rebuilt from frame `1141:4827` (#144) | **Done** |
| — | The feed renders the frame's three sections and only those (#145) | **Done** |
| — | `PulseTopBar` — the overlay header, frame `1141:4819` | **Done** |
| — | Delete the orphaned render functions, hero interpolations and dead memos | **Done** |
| — | Rewrite the 107-key `StyleSheet` from the frame | **Done** |

**The overlay header is not the bar that was deleted in #141.** That one
reserved 64pt above a bordered panel. This one floats: `top: 0`, no layout,
`rgba(15,14,14,0.8)` behind a 12pt blur, and the feed scrolls under it. The
frame's 64 gets `insets.top` **added** to it rather than absorbed — the artboard
is 390pt with no notch, and reading its height literally is what put "The Pulse"
under the status bar on a device.

**Neither of the frame's two glyphs is rendered.** The hamburger has no drawer
to open; the bell has no endpoint — nothing in the API returns a notification.
A draft put a **Pulse / Hotspots** switch where the hamburger is, on the reading
that Hotspots is a venue list. `blendn-admin/docs/HOTSPOTS.md` is explicit that
it is not: it is a presence surface behind a time-boxed, reciprocal *Go Live*,
and that gate does not exist. Shipping the switch would have been a third dead
control and would have encoded the misreading. Notes in `docs/PULSE.md`.

**291 lines of previous designs deleted, and one of them was doing network I/O.**
Five orphaned render functions (`renderInterestedCarousel`,
`renderCarouselWithTitle`, `renderCarouselFancy`, `renderInviteHero`,
`renderFeaturedHero`), the two hero scroll interpolations, and four memos with
no reader (`interestedItems`, `cityTopItems`, `bestPartiesItems`,
`soonestWithImage`). Two more fell out behind them: `NIGHTLIFE_GROUPS`, and the
`favoriteEvents` state whose effect fired `getUserFavorites` **on every events
refetch** into something nothing rendered. `expo lint` names an orphan, so it is
what verified the sweep and what confirmed no new one was created.

Interested comes back as a section — with its fetch — the day it has a frame.
Keeping a request alive against a design that does not exist is not "the data
stays"; it is a call nobody reads.

**The stylesheet: 107 keys down to 46, and every one of them has a caller.**
Rewritten from the frame rather than corrected — 58 of the 107 belonged to two
previous layouts (an invite hero, a glass-panelled Nearby card, a `#007AFF`
check-in button, a `#e8f5e8` status badge), and dead keys are what each restyle
landed beside and contradicted. `Main`'s four numbers are named once and used by
both the sheet and the render site: `paddingHorizontal 12`, `paddingBottom 128`,
`gap 48`, and `96` at the top, written as `TOP_BAR_HEIGHT + 32` because the 32 is
the part that means anything. The gutter is applied **once**, on the scroll
content, so a section can no longer disagree with the one above it.

**The one bug the rewrite fixed rather than restyled: `fontWeight` did nothing
on Android.** Custom fonts ignore it outright and silently render regular, so
`fontWeight: '700'` on Manrope was bold on iOS and regular on Android from
identical code — in **thirty** places, plus one nested `<Text>` in the render.
Weight comes from the family now; every text style spreads an `EMBER_TYPE`
entry, so the three coexisting type systems (local `TYPE_*` constants, raw
numbers, `APP_COLORS`) are one. No simulator screenshot would ever have shown
this, which is why the test greps for it.

`APP_COLORS` is gone from the file entirely, and so are the four hexes of the
old blue palette. Seven new greps in `__tests__/pulseNav.test.ts`, two of them
verified by breaking the file and watching them fail.

**Still dead, and older than this work:** `loadUserProfile`, `loadInterestData`
and `loadInterestCounts` were already uncalled before the rebuild started. They
are behaviour-half data loaders with no design driver, so they are out of this
rewrite's scope — but `interestCounts` is therefore never populated, which means
the count on every event card is permanently `undefined`. Its own item.

**The five undesigned rows moved into the list header.** The checked-in strip,
the offline banner, the switch-city offer, the away notice and the location and
network errors were a sibling of the list, statically laid out where the overlay
now sits — and they cost a 10pt spacer on every render where none of them had
anything to say.

**The file: 3527 lines to 2983.** No surviving handler, effect or piece of state
was edited. The 544 are the render, the stylesheet, and the dead code that sat
between them — the four orphaned memos and the favourites fetch are above the
`return`, and the plan's "do not touch the behaviour half" is about not *moving*
tested code, not about keeping code nothing calls.

---

- **The bar, rebuilt from the frame it was supposed to come from.** Frame
  `1141:4827`, measured with `get_metadata` rather than eyeballed from a render.

  Four things were wrong, and each had survived a round of "fixed":

  - **The bar clipped its own centre button.** The button sits at `y=-16`, above
    the bar's top edge, and the surface needs `overflow: 'hidden'` to clip its
    48pt corners. Both lived on one view, so the surface clipped the button too.
    Now the outer view lays out and does not clip; `barSurface` is an absolute
    child that holds the fill, the radius and the blur.
  - **The items were equal-width.** The frame's five slots are 40.08 / 56.23 /
    56 / 52.03 / 22.98 with a uniform 26.66 gap — `space-between` over
    content-sized children. `flex: 1` gave every label the widest one's box,
    which is what made the row read as cramped. This was the "absolutely
    positioned items" note in the plan: the positions only *look* irregular
    because the labels are different lengths.
  - **The active state was a colour swap.** The frame's active item is the same
    item at 110% — icon 24.2 against 22, label box 26.4 against 24, both exactly
    ×1.1. One transform, so there is no second set of sizes to keep in step.
  - **The centre was a glyph with a word under it.** It is the Blend'n monogram
    now, no label, gradient in every state. It was gradient-only-when-live on
    the reasoning that a permanent glow stops being seen — right for a status
    light, wrong for a brand mark. The status it carried is in the badge, the
    slow breath, and where the button goes.

  `monogram-white.png` tinted to `onGradient`, not `monogram-gradient.png`,
  which would be orange on orange; it is the asset the splash already ships, so
  no second copy of the logo entered the bundle. Rendered at 24 rather than the
  frame's 17.5 — a `+` is one stroke and reads at any size, a two-counter line
  mark at 31% of a 56pt circle is a smudge. Deviation recorded for the designer.

  `__tests__/pulseNav.test.ts` pins all four, verified by breaking two and
  watching them fail. They are source greps because none of this is visible to
  a typecheck — every one is a valid style object that draws the wrong thing —
  and `react-test-renderer` 19 returns `null` for a bare `<View>` in this setup,
  so there is no tree to assert against.

- **How you enter a room is a setting, with two safeguards** — the onboarding
  question, a first-time warning, and a banner that runs for as long as you are
  in the room. `lib/roomVisibility.ts` + `components/RoomVisibilityBanner.tsx`.

  `reveal_by_default` was deliberately unwritable, on the reasoning that being
  named has to be an act in the room rather than a setting flipped once. The
  reasoning held; the enforcement was in the wrong place — it made someone
  happy to be seen re-answer at every door, and told someone who wanted to stay
  anonymous nothing about which state they were in.

  It now lives in three places instead: the server still creates every check-in
  `revealed: false` so being named is always a tap; the first public check-in
  explains what becomes visible and to whom; and the banner states the current
  answer continuously, which is what makes "flipped it once and forgot"
  impossible rather than merely discouraged.

  The warning fires on three conditions and all of them matter — one that fires
  on the safe path teaches people to dismiss dialogs, and one that fires when
  there is no name and no photo warns about an exposure that cannot happen.


- **Orientation can be shown, to people who already know who you are** — the
  switch the Figma frame asks for, built with the exposure narrower than the
  label implies. Two gates on the server: `show_orientation` (defaults false,
  GDPR Article 9 means silence is not consent) and `maySeeIdentity` (matches,
  open conversations, rooms you revealed yourself in).

  A single public switch would put orientation in front of any caller holding a
  token, which is a wider audience than the person's own name and photograph
  get. Doing nothing was not the safe option either: orientation was already
  collected and already fed `deriveInterestedIn`, shown to nobody, so the
  algorithm knew and no human could.

  The switch appears only once an orientation is chosen, and clearing the
  orientation clears the consent — `orientationConsent`, tested, because a
  stored `true` would outlive the thing it was consent for.


- **Onboarding, eight screens** — `app/onboarding/*` against the Figma
  *🕓 Updates* canvas, on the Ember tokens. Per-step save, resume on quit, and
  the first writer `profiles.onboarded` has ever had.

  Phone and OTP were not built: there is no phone auth on the server, so those
  two frames would collect a number nothing can verify.

  State lives in AsyncStorage keyed per user id rather than in a provider —
  expo-router gives each step its own mount, so there is no React parent that
  survives navigation, and storage is what carries an answer from step three to
  step seven *and* across a force-quit. Routing reads it with no network call:
  a record exists only while a flow is unfinished, so an established account
  costs one local miss.

  Two saves per step and they differ on purpose: the whole draft locally, only
  that step's fields to the server. Sending everything each time would mean
  going back to fix a typo in your name re-sends an empty `bio`, and the API
  reads a present key as "set this" — a correction on step one wiping an answer
  from step six.

  Eight places the frames ask for something the product does not have — the
  orientation "show on profile" toggle, Travel/Open as intents, "Other" versus
  `prefer_not_to_say`, employment type, class year, invented interest labels,
  MP4 upload, and four contradictory progress schemes — are each mapped
  honestly or left out, and every one is written down in `docs/ONBOARDING.md`
  with the decision it needs.


- **The Liquid Ember token layer** — `EMBER`, `EMBER_TYPE`, `EMBER_GRADIENT`,
  `EMBER_GLOW`, `EMBER_ATMOSPHERE`, `EMBER_RADIUS` in `lib/theme.ts`, plus
  Plus Jakarta Sans and Manrope loaded through `lib/fonts.ts`. Measured off the
  Figma *🕓 Updates* onboarding frames; documented in `docs/DESIGN_TOKENS.md`
  for the designer side.

  Additive. `APP_COLORS` still renders twenty-six files and is untouched —
  repointing its background from `#000` to `#0F0E0E` would restyle the whole
  app in one commit with nobody having looked at any of it, and the palettes
  differ in more than shade (Ember's primary action is a gradient with *dark*
  text on it). Screens migrate one at a time; `APP_COLORS` goes when the last
  one has.

  `__tests__/fonts.test.ts` pins that every family the type scale names is one
  the app loads — the silent failure, since an unloaded family renders in the
  system font without throwing or warning.


- **One `Event` type, derived from the API mapping** — `Event` was declared
  three times and hand-built twice more, so TypeScript compared five shapes
  structurally and they had drifted. `lib/api.ts` now exports `eventFromApi`
  and `BlendnEvent`, and every consumer takes them.

  Two of the hand-built copies constructed the *same* `checkedInEvents` list
  from the active check-ins payload with different fidelity — one carried the
  coordinates through, the other wrote `latitude: 0, longitude: 0`, which is a
  real point in the Gulf of Guinea rather than a missing one. Both called
  `setCheckedInEvents`, so a checked-in card's distance depended on which had
  run last. Absent coordinates are now `null`, which the `if (!event.latitude)`
  guards downstream already handle.

  **The typechecker is green for the first time** — 6 baseline errors to 0. The
  other three were an over-typed `getItemLayout` shared by three lists with
  identical geometry, and an `Animated.event` listener with an inferred
  `unknown` parameter.


### 2026-08-10 — anonymity you can see

- **The suggestion prompt** (#67). Check-in used to *apply* `reveal_by_default`,
  so walking into a room could name you. The server now always creates
  `revealed: false` and returns `revealSuggestion`; the app asks, and a tap
  applies it. Dismissing writes nothing, and so does killing the app — which is
  the right way for this to fail.

- **A status chip** (#67) — "You're anonymous here" / "You're visible as Sagar",
  tapping through to the per-event screen. Your own state only; showing who else
  revealed would turn a personal choice into a count.

- **The reveal gate** (#67): with no name and no photo the switch is disabled
  and says which is missing. Revealing shows exactly those two things, so
  without them it changes nothing visible and reads as broken.

- **`remember` split** (#67) into `rememberIntent` / `rememberReveal`. One flag
  wrote both defaults from a switch labelled as reveal only.

- **Opening the screen no longer wipes your intent.** There is no GET for
  per-event preferences, so the chips open empty — and saving sent that empty
  array. Intent is now only sent once touched.

### 2026-08-10 — the card says what it knows

- **The overlap is named, not counted** (#66). `sharedInterestSentence()` had
  zero callers since it was written; the card rendered "3 shared interests"
  where the server had already sent "Techno, Board games, Hiking". Shared intent
  and field of work now render too.

- **The client-side re-sort is gone** (#66), and one of its terms was actively
  harmful: `+8 for having a photo` is `+8 for not being anonymous`, because a
  photo only reaches the client when `revealed` is true. It promoted people who
  had revealed themselves, on the one screen whose premise is that staying
  anonymous costs nothing.

  The other terms were dead or wrong: `last_seen` scored zero for everyone
  because the card has never carried it, and the shared count recomputed an
  overlap the server had already computed.

- **`'Popular nearby'` deleted** (#66) — a fabricated label that fired on every
  card with no overlap, claiming a popularity the app does not measure.

### 2026-08-10 — one screen instead of eight

- **`app/about-you.tsx`** (#64) — intent, age when missing, field of work and
  interests, asked once after signup. Gender and orientation appear **only** if
  dating is ticked, and unticking it clears them rather than hiding them.

  Reached by an explicit push from the signup success path and from both OAuth
  paths using `isNewUser`, which those routes have returned all along and the
  app only ever logged. That matters most for OAuth: Google and Apple create a
  profile with **no age**, so without this the 18+ rule could never be satisfied
  and the dating chip would silently do nothing for them forever.

  Interests save before the profile fields on purpose — that call is idempotent
  and re-runnable from edit-profile, while the profile fields cannot be
  re-asked, so if one of the two has to fail it must be the recoverable one.

  Skip writes nothing at all. Someone who skips is in exactly the state of
  someone who never saw the screen, and the Match tab's interest gate asks at
  the moment the feature is reached for.

- **Signup takes an optional age** (#64), optional because the server accepts a
  signup without one — which is what let the API ship first.

### 2026-08-10 — onboarding retired

- **Eight screens deleted, and the gate that pointed at them, in one commit**
  (#63). Two of them threw away everything typed into them, one was unfinishable
  until two days ago, and the whole flow was hard-gated with no skip and no
  back. Deleting the screens without the gate would have sent every
  `onboarded: false` account to expo-router's Unmatched Route with no way out,
  which is why it is one commit and not two.

  The gate also cost a `getProfile` round trip on every cold start with an empty
  cache — to make a routing decision nothing makes any more.

- **`components/InterestPicker.tsx`** (#63), extracted before the screen was
  deleted because three places need it, and **`edit-profile` now writes the
  structured graph** instead of free text into `profiles.interests` — the column
  `interest-coverage.ts` exists to warn nobody reads. `addProfileInterests` and
  `removeProfileInterests` had been correct in `apiClient.ts` with zero callers.

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
  phone decodes; `scripts/build-intro-animation.sh` cuts it to animated WebP.
  The wordmark is recoloured to white because the master was authored for a
  light background and measured 3/255 luminance on black.

  It also started mid-motion, to continue the native splash rather than redraw
  the logo from nothing. **That call was reversed in #161** — it was buying a
  seamless handoff at the price of never playing the logo's animation at all.
  The head is no longer trimmed and a black hold separates the two instead.

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
