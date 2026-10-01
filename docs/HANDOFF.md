# Handoff — picking up the Blendn app screens

Written at the end of a session that finished onboarding. Everything below is
either settled or explicitly open; nothing here needs re-deriving.

**Repos.** App: `/Users/sagarkishore/conductor/workspaces/blendn/ashgabat`.
API: `/Users/sagarkishore/conductor/workspaces/blendn-admin/seville`.
Work in the **workspace** paths, not `conductor/repos/*` — those are stale
clones and one of them is 104 commits behind on `prod`.

**State.** App `dev` green, 239 tests. API `dev` and `staging` current, 1192
tests. Onboarding complete: eight screens, design fidelity done.

**Figma.** File key `HO0UnAEV5djzo0h4q7Y2vi` (a copy in the user's own team —
the original `Zi2KcUzhEcLRdqyit22LdQ` is on a friend's account and rate-limits).
Canvas **🕓 Updates**. The Prototype canvas is an older purple design; ignore it.

**Shipping `stage` (since 2026-09-28).** A `stage` push no longer reaches
TestFlight or Play by itself. The Expo free plan's builds for the month are
spent, so CI's `ship` job is off and `stage` ships from a Mac:

```bash
git fetch origin && git switch --detach origin/stage && npm ci
npm run ship:local -- --dry-run     # the checks and the commands, nothing built
npm run ship:local                  # both platforms; or `-- ios`, `-- android`
```

It needs **the Xcode that `eas.json`'s image names (27.0)**, CocoaPods,
fastlane, the Android SDK with an NDK (`ANDROID_HOME`), JDK 17 or 21,
bundletool, Maestro, an emulator or the `Blendn_A34` AVD, `gh` logged in, and eas-cli
logged in to the org. It refuses anything but a clean `origin/stage` whose
`typecheck + test + lint` check passed. The `.ipa`, the `.aab`, R8's
`mapping.txt`, the smoke-test screenshots and the run's log land in `dist/`
(gitignored). To put the cloud route back, set the repository variable
`EAS_CLOUD_SHIP` to `true`. The rest, including why Sentry uploads are off
unless `SENTRY_AUTH_TOKEN` is in the shell, is in
[`RELEASING.md`](RELEASING.md#shipping-stage-from-a-mac).

**Build 118 on TestFlight crashes at launch on iOS 27.** The first
local run built it with the Mac's only Xcode, 27.0: `eas build --local` ignores
`image`, so it linked the iOS 27 SDK, which requires the UIScene lifecycle that
our AppDelegate-window app had not adopted (`EXC_BREAKPOINT` in
`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`). Nobody launched
it before it was submitted. #309 has since adopted UIScene, and `eas.json` pins
Xcode 27.0. Since then the script:

- **builds iOS only with the Xcode in `eas.json`'s image**, found by version
  and exported as `DEVELOPER_DIR`, and refuses iOS if it is not installed
  (`xcodes install 27.0`). `--allow-xcode <v>` overrides it, only after the
  smoke test passes on a device on the newest iOS;
- **launches every build before submitting it**: a universal APK on the
  emulator, and a Release simulator build of the same commit with the same Xcode
  and EAS environment, each opened by the Maestro flow
  `.maestro/smoke/launch.yaml` to the signed-out screen. Then up 30 seconds more
  with no crash, or no submit.
  `--skip-smoke` needs `--i-launched-it-myself` too. Keep the newest iOS
  simulator runtime installed: on iOS 27.0 the smoke test reproduces build
  118's crash for an Xcode 27 build, and on iOS 26 it could not.

**Follow-up, not done:** adopt the UIScene lifecycle before Apple requires the
iOS 27 SDK for App Store Connect uploads. Until then Xcode 27 cannot build
this app for release. See
[Build 118, and the Xcode rule](RELEASING.md#build-118-and-the-xcode-rule).

---

## The work, in order

~~1. Orientation multi-select~~ — **done**, API #227 and app #129. Verified
against staging end to end, including the three rejections.

### 1. The Pulse — `1141:4643`

Unblocked. Structure is in `docs/HOMEPAGE_AUDIT.md`. Cut the "Explore the Grid"
card (that is the venues map being deferred). Centre nav button is the Blendn
logo opening a sheet that shows *your* QR **and** a scan action — one button,
both directions.

### 2. The Scene — `1141:4853`

Swipe-to-join with the logo replacing "Join the Experience". **No price** — there
is no price anywhere in the schema and the user has said so twice. No amenity
chips. Attendee stack per **SCRUM-25**.

### 3. The Grid — `1141:4951`

Unblocked as of the decision below. Reveal-gated: real name and face only for
people who revealed in *this* room, pseudonym for everyone else.

**This is where two finished things finally get mounted.** Both are built,
tested, and render nowhere today:

- `components/RoomVisibilityBanner.tsx` — the always-on anonymity banner
- `lib/presence.ts` — the geofence policy; it needs the sampling loop wired
  (sample on a timer while checked in and foregrounded, feed `presenceAction`,
  `'ask'` shows `PRESENCE_COPY.ask`, `'checkOut'` calls check-out and says so)

### 4. The Banter, DM, match notification, anonymous chatroom

`1141:5247`, `5430`, `5389`, `5498`. Mostly a re-skin of working features — see
"What is genuinely already built" in the audit. The anonymous chatroom frame
draws real names and faces; it gets the same reveal-gating as The Grid,
including the system lines ("Cosmic Panda pinned a location").

### 5. The splash → sign-up logo transition — **built, measured, closed**

Shipped in #161. The numbers below are what it actually does on a 440pt screen,
so a frame that disagrees with them is a change request rather than a bug.

| Beat | What is on screen |
|---|---|
| Native splash | Monogram alone, **96 × 114pt**, centre y **478pt**, on `EMBER.bg` |
| **Black hold, 180ms** | Nothing. The splash fades out over 200ms first, so the gap reads longer than the number |
| Animation, 1848ms | The monogram **draws itself from nothing**, slides left, and the wordmark writes on |
| Landing | Lockup **196 × 56pt**, centre y **333pt** — exactly where sign-in draws its own |

Three things worth knowing before redrawing any of it:

**The black hold is load-bearing.** The splash shows a completed monogram and
the animation opens by drawing one from nothing. Without a cut between them the
logo appears to dissolve and redraw itself, which reads as a fault. The hold is
what buys the draw-on, and it is also what *unlocked* the splash mark being
resized independently — before it, the two had to be the same size.

**The mark barely changes size across the whole sequence.** It ends at 196pt
against sign-in's 196pt. An earlier build grew it to 304pt and snapped back;
that was a measurement error, not a design intent, and it should not be
reintroduced as one.

**Do not size the launch mark against the tagline.** "Same place. Same vibe.
Instant connections." is 304pt wide — half again the lockup above it. The two
are not meant to align, and treating them as a single block is exactly the
mistake that produced the zoom.

If the lockup moves or resizes on sign-in, `TRAVEL_SCALE` and `TRAVEL_Y` in
`components/IntroAnimation.tsx` follow, and `__tests__/introTiming.test.ts`
guards the ratio staying near 1.

---

## Decisions already made — do not re-litigate

- **Friendship does not reveal identity *in a room*.** Revised by the owner on
  2026-09-27 when the friend graph was built: the friends list and a friend's
  profile show real names — both people said yes, by request and accept — but
  in a room a friend is a pseudonym like anyone else, unless *they* turn on
  "Friends can see who I am in rooms" (off by default). Friendship is still not
  a branch of `maySeeIdentity` without that switch, and a DM opened between
  friends is marked so it does not become one either. No search, ever: you add
  someone through their link or from a match/conversation.
- **Orientation is multi-select**, capped at 3, "Prefer not to say" exclusive,
  union for `interested_in`.
- **Anonymity defaults on.** Guarded by `anonymousByDefault` with five tests and
  a mutation check. It is the product, not a setting.
- **Sign in with Apple stays iOS-only.** Already gated at `app/index.tsx:273`.
  No Android implementation exists, and Apple guideline 4.8 requires it on iOS
  because Google sign-in is offered.
- **Friends are excluded from the match pool** (built, 2026-09-27) and shown as
  "people you know are here", visible only if they checked in publicly —
  including the *count*, since "1 person you know is here" identifies them when
  they are your only friend attending. The "people you know are here" half is
  not built.
- **No background location.** Foreground only. iOS `always` is an App Review
  liability and buys least where a false eviction is least recoverable.
- **Cut, for now:** voice/video calling, voice messages, PRO membership tier,
  the `@handle`, the second "Appreciate" button. The PRO tier cut is superseded
  by the owner's ruling of 2026-10-01 — see *Blendn+ — superseding the PRO tier
  cut* in [`ROADMAP.md`](../ROADMAP.md).

## Still open — the user needs to answer

- **SCRUM-23's five**: Travel/Open not reaching matching; "Other" stored as
  "prefer not to say"; employment type and class year; MP4 upload; which
  progress scheme.
- **Which bottom nav**, and what **Create** does. Three different navs across
  the frames. Recommendation in the audit: the Banter's five-item shape, renamed
  to Pulse · Explore · [Blendn] · Circles · Me.
- **What "Appreciate" is**, if it comes back.

---

## Things that cost this session hours

**Check what the device is running before believing a bug report.** Several
rounds went into re-fixing correct code. Twice the cause was environmental: once
a stale checkout, once **no Metro bound to 8081 at all**, so the device was
serving a frozen bundle. If a report is *"nothing changed"* rather than *"this
looks wrong"*, check `lsof -nP -iTCP:8081 -sTCP:LISTEN` first.

**If a view's children are all absolutely positioned, give it a size in
numbers.** Three separate layout bugs came from a measured box differing from
the drawn one: `{w, h}` spread into a style (silently dropped), `aspectRatio` on
a parent with no in-flow content, and a `Pressable` wrapper measuring wider than
the pill inside it.

**`transform: scale` is visual only** — the scaled thing still occupies its
unscaled size in layout.

**If selection adds a border, the unselected state carries a transparent one**,
or every selection changes the width and re-wraps the row.

**Estimating text width does not work.** Two rounds of tuning a per-character
average proved the approach wrong, not the coefficient. Chips measure themselves
with `onLayout` now.

**Accepted is not written.** `show_orientation` had a column, a validator, both
read gates and a switch on screen, and no line writing it — so the toggle
returned 200 and did nothing for as long as it existed. It failed in the *safe*
direction, so nothing went red. `__tests__/age-routes.test.ts` now loops over
`updateProfileSchema` asserting every accepted field reaches the upsert; when
you add a field to that route, that loop is what catches you forgetting it.

**Ask staging for the response instead of re-reading the diff.** Three of the
eight `date_of_birth` leaks were found that way and none by inspection — a
helper being correct is not the same as every caller using it, and neither a
typechecker nor a unit test on the helper can tell the difference.

**Run `npm run lint` before every PR in blendn-admin.** Its CI fails on unused
imports that `tsc` and `jest` both pass.

---

## Where the rest is written down

- `docs/HOMEPAGE_AUDIT.md` — frame-by-frame audit of all nine screens, every gap
  named, what is backed by real tables and what is not
- `docs/ONBOARDING.md` — the eight screens, how resume and per-step saving work,
  and every place the build departs from the frames with the reason
- `docs/DESIGN_SYSTEM.md` — the tokens every screen uses, and the rules the check enforces
- `ROADMAP.md` (app) and `docs/ROADMAP.md` (API) — the ledgers, including the
  deferred bio/contact-details hole
