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

---

## The work, in order

### 1. Orientation becomes multi-select

Fully specified in `ROADMAP.md` under "Orientation becomes multi-select". API
first — steps 1–4 are safe alone because the column accepts more while nothing
sends more yet. Capped at three, "Prefer not to say" exclusive, `interested_in`
from the **union**.

### 2. The Pulse — `1141:4643`

Unblocked. Structure is in `docs/HOMEPAGE_AUDIT.md`. Cut the "Explore the Grid"
card (that is the venues map being deferred). Centre nav button is the Blendn
logo opening a sheet that shows *your* QR **and** a scan action — one button,
both directions.

### 3. The Scene — `1141:4853`

Swipe-to-join with the logo replacing "Join the Experience". **No price** — there
is no price anywhere in the schema and the user has said so twice. No amenity
chips. Attendee stack per **SCRUM-25**.

### 4. The Grid — `1141:4951`

Unblocked as of the decision below. Reveal-gated: real name and face only for
people who revealed in *this* room, pseudonym for everyone else.

**This is where two finished things finally get mounted.** Both are built,
tested, and render nowhere today:

- `components/RoomVisibilityBanner.tsx` — the always-on anonymity banner
- `lib/presence.ts` — the geofence policy; it needs the sampling loop wired
  (sample on a timer while checked in and foregrounded, feed `presenceAction`,
  `'ask'` shows `PRESENCE_COPY.ask`, `'checkOut'` calls check-out and says so)

### 5. The Banter, DM, match notification, anonymous chatroom

`1141:5247`, `5430`, `5389`, `5498`. Mostly a re-skin of working features — see
"What is genuinely already built" in the audit. The anonymous chatroom frame
draws real names and faces; it gets the same reveal-gating as The Grid,
including the system lines ("Cosmic Panda pinned a location").

### 6. The splash → sign-up logo transition

Measure `components/IntroAnimation.tsx`'s end state; match position and size in
`app/index.tsx` so the video ends and the logo simply stays. Needs a device.

---

## Decisions already made — do not re-litigate

- **Friendship does not reveal identity.** A friend sees what a match sees.
  Otherwise the friend graph is a back door around `maySeeIdentity`.
- **Orientation is multi-select**, capped at 3, "Prefer not to say" exclusive,
  union for `interested_in`.
- **Anonymity defaults on.** Guarded by `anonymousByDefault` with five tests and
  a mutation check. It is the product, not a setting.
- **Sign in with Apple stays iOS-only.** Already gated at `app/index.tsx:273`.
  No Android implementation exists, and Apple guideline 4.8 requires it on iOS
  because Google sign-in is offered.
- **Friends are excluded from the match pool** and shown as "people you know are
  here", visible only if they checked in publicly — including the *count*, since
  "1 person you know is here" identifies them when they are your only friend
  attending.
- **No background location.** Foreground only. iOS `always` is an App Review
  liability and buys least where a false eviction is least recoverable.
- **Cut, for now:** voice/video calling, voice messages, PRO membership tier,
  the `@handle`, the second "Appreciate" button.

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
- `docs/DESIGN_TOKENS.md` — Liquid Ember, and why `APP_COLORS` still exists
- `ROADMAP.md` (app) and `docs/ROADMAP.md` (API) — the ledgers, including the
  deferred bio/contact-details hole
