# Placeholder screens

**For the UI/UX designer, and for whoever audits this later.**

These screens are **functionally complete and visually provisional**. The logic,
the copy meaning, the API calls and the rules are decided. The layout, type,
colour, spacing and motion are not, and are meant to be replaced wholesale.

Each carries a red `PLACEHOLDER DESIGN` banner on screen so nobody mistakes one
for finished work in a demo — except `app/sign-in.tsx` (sign in / create
account), whose banner was removed on 2026-09-21 at the product owner's
request; the screen is still provisional in layout, the label just no longer
says so to testers. `app/forgot-password.tsx` is no longer a placeholder: it
was designed to match sign-in on 2026-09-28, with a "Check your inbox" state
(Open mail app, Resend with a 30-second cooldown). `app/rate/[eventId].tsx` and
`app/event-preferences/[eventId].tsx` are no longer placeholders either (both
2026-09-28); their sections below say what was decided.

**Read `blendn-admin/docs/DESIGN_HANDOFF.md` first.** It explains the product's
five non-negotiable rules and why they exist. This file is the per-screen
detail.

---

## What "logic is final" means

Every rule written into these screens is enforced **server-side as well**. You
cannot break the product by redesigning them — but you can break the *intent*,
and the notes under each screen say how.

---

## 0. The auth entry point — `app/index.tsx`, `app/sign-in.tsx`, `app/forgot-password.tsx`

**The first thing anyone sees, and the only screen every user meets.** Three
files, one flow.

`app/index.tsx` is **not** a placeholder — it was rebuilt to fix real defects
(an invisible Apple button, a Google button labelled "Get Started" with no
Google branding, and errors that were logged and never shown). It is plain
rather than designed, and is yours to restyle, but the *behaviour* in it is
load-bearing. The two email screens are placeholders in the usual sense.

### The flow

```
index.tsx                     sign-in.tsx                    forgot-password.tsx
┌────────────────────┐        ┌──────────────────────┐       ┌───────────────────┐
│ monogram + lockup  │        │ [Sign in|Create acct]│       │ email             │
│ tagline            │        │ name (signup only)   │       │ [Send reset link] │
│ ── error region ── │        │ email                │       │        ↓          │
│ Continue w/ Google │───┐    │ password  👁          │       │ "Check your email"│
│ Sign in with Apple │   │    │ ── error region ──   │       └───────────────────┘
│ ──── or ────       │   │    │ [Sign in]            │                 ▲
│ Continue with email│───┼───▶│ Forgot your password?│─────────────────┘
│ Terms & Privacy    │   │    └──────────────────────┘
└────────────────────┘   │
                         └──▶ root layout routes to onboarding or events
```

### Rules the design must not break

| Rule | Why |
|---|---|
| **Errors are visible and persistent** | Every failure used to be `Logger.error` only — the spinner stopped and nothing changed. This is why a broken Google client id sat unnoticed in production. Use an inline region, not a toast: toasts auto-dismiss and are missed by anyone mid-gesture |
| **Cancelling is not an error** | Backing out of the Google or Apple sheet shows nothing at all. "Something went wrong" for a deliberate choice is both wrong and irritating |
| **The Apple button is Apple's** | Their component, their styling. It must be the `WHITE` variant — `BLACK` is invisible on our background, which is a bug that already shipped once |
| **The Google button is Google's** | Their mark, their approved wording, on approved chrome. "Get Started" wired to Google is a branding violation *and* deceptive |
| **Email is the third option, visually** | Outlined, not filled. Three equally-weighted buttons make the screen three shouts |
| **Never say whether an address has an account** | `forgot-password` answers identically either way, deliberately. A "no account with that email" message would hand back the exact answer the server refused to give |
| **Never render the wordmark as text** | `lockup-white.png` *contains* it. The old screen drew "Blend'n" twice, the second time in a font that is not the brand's |

### Data each screen needs

| Screen | Reads | Writes |
|---|---|---|
| `index.tsx` | `useAuth().user`, `.loading` | `signInWithGoogle`, `signInWithApple` |
| `sign-in.tsx` | nothing | `signUp` / `signInWithEmail` → `/auth/signup`, `/auth/signin` |
| `forgot-password.tsx` | `email` param from sign-in | `apiClient.forgotPassword` → `/api/auth/forgot-password` |

**No screen navigates on success.** The root layout's routing effect watches
auth state and moves the user. Navigating from a screen as well races it — this
is why the Google and Apple handlers have no `router` call either.

### Still missing — decisions and work, not styling

| | |
|---|---|
| **Email verification** | Cut from this scope by decision. Nothing sends a verification mail, and `signin` does not gate on `emailVerified` |
| **Reset happens in a browser** | The emailed link opens the web page. Deep-linking it into the app needs associated domains, DNS and a native rebuild |
| **The Google mark is a monochrome glyph** | `AntDesign`, chosen to avoid a new dependency. Google's guidelines ask for their supplied multicolour asset — swap before store submission |
| **No social proof, no illustration, no motion** | The old screen had six emoji bubbles at hardcoded pixel offsets. They are gone because they broke on every screen size. If the Figma wants imagery here, it needs to be responsive |

### The launch sequence, and what is decided in it

Cold start is now one black background end to end. Four things happen, and only
the last is a screen:

1. **Native splash** — black, completed monogram, 180pt. Configured in
   `app.json`; changing it needs `npx expo prebuild`, not just a reload.
2. **Handoff** — held until assets are decoded, never until auth resolves. Auth
   is a network round trip and gating on it means a frozen splash for the length
   of a request.
3. **Intro animation** (`components/IntroAnimation.tsx`, 1.29s) — the monogram
   slides left and the wordmark writes on. An **overlay, not a gate**: routing
   and auth resolve underneath.
4. Whatever the router settled on, revealed by a 260ms fade.

| Decided | Why |
|---|---|
| **The animation starts mid-motion** | The native splash already shows the completed monogram. The master opens by drawing it from nothing, so playing from the start would erase the logo on screen and redraw it. The asset is cut to begin exactly where the native splash ends |
| **The wordmark is white, not brand ink** | The master was authored for a light background; the ink measured 3/255 luminance on black — invisible. Recoloured by saturation, which leaves the gradient monogram untouched |
| **It never blocks startup** | An animation that gates the app is a tax paid on every launch, including by a signed-in user who just wants their events |
| **Timing is a timeout, not a callback** | `expo-image` exposes no reliable end-of-animation event. Do not architect around one |

**To change the animation**, edit `scripts/build-intro-animation.sh` and re-run
it against the ProRes master — do not hand-edit `assets/logo/intro.webp` or
`lockup-hero.png`, which the script generates together so the still and the
animation cannot disagree. The script documents every cut and why.

If you change the trim bounds, **change `DURATION_MS` in `IntroAnimation.tsx`
too**, and check the last frame. A coloured wipe trails the letters as they
draw and is still on the final "n" until 5.43s of the master; an earlier cut
ends on a wordmark that looks unfinished. That is not hypothetical — it shipped
once.

**Open for the designer:** the intro currently plays on *every* launch. Once per
install, or once per day, is a legitimate alternative and is a one-line change
(persist a flag). Nobody has decided which.

### Design notes

The segmented Sign in / Create account control is the cheapest thing that works,
not a decision — one screen was chosen over two because the flows differ by a
single field. If the Figma separates them, the logic splits cleanly.

The password field already sets `textContentType` and `autoComplete` correctly
per mode (`newPassword` on signup, `password` on sign-in). Keep that on any
rewrite; getting it wrong is why password managers so often fail to fill on
React Native.

---

## 1. `app/rate/[eventId].tsx` — peer rating

**Route:** `/rate/{eventId}` · **Reached from:** the Scene's CTA after an event
you attended, Going's Past rows, the Room's end-of-night recap, and a rating push
(no push kind exists server-side yet; the app routes the likely names).

**What it does.** Asks about the night first — one tap on a 1–5, sent with
`POST /events/:id/rating`, skipped if `userStatus.userRating` says you already
did. Then loads the people you may rate (`GET /events/:id/peer-ratings`), shows
each with the face and name you know them by (from the conversation list, never
the public profile — `lib/ratePeople.ts`), and submits a 1–5, an optional issue,
and an optional note. A failed load says so and offers Try again; "Nothing to
rate" is only the server's real answer.

### Rules the design must not break

| Rule | Why |
|---|---|
| **Never visible to the person rated** | The person most likely to rate someone badly is the person who felt least safe with them. Showing it tells him that the woman who met him rated him down, at an event where he knows who she is and may still be in the room. The feature meant to protect her becomes what exposes her. |
| **No star average anywhere, ever** | Not on a profile, not as a badge, not as a "verified" tick derived from it |
| **Only people you connected with** | A mutual like, so both opted in. The list comes from the server and is never assembled on the client |
| **Only after the event ends** | During the night a rating is leverage; afterwards it is reflection |
| **Harassment is not the bottom of the scale** | It routes to moderation and is never averaged. Four glowing ratings and one harassment report is not a 4.2 |
| **Skipping is free** | No nagging, no guilt copy, no progress pressure. Someone who does not want to rate is telling us something too |

### Design notes

No longer a placeholder (2026-09-28). The scale is five plain steps with a word
at each end ("Not for me" / "Would meet again"), not stars: a five-star row reads
as a public review, which is the one tone this must not have. Still open for the
designer: whether it should resemble a rating widget at all.

---

## 2. `app/event-preferences/[eventId].tsx` — intent and reveal

**Reveal comes first on this screen, and that is a decision, not a layout
accident.** It is reached from the anonymity chip, and landing on "Why are you
here tonight?" answers a question nobody asked. Intent is also the *less*
per-event of the two now: it has a person-level default set once on
`about-you`, so what this screen offers is an override for tonight. Reveal has
no equivalent — it is decided per room, every room, on purpose.

**Since #67 this screen has three things it did not have**, and the design
should keep all three:

1. **The reveal switch is disabled when there is nothing to reveal**, with copy
   naming what is missing — "Add a photo to your profile first — that's what
   other people would see." Revealing shows exactly a name and a photo, so with
   neither, turning it on changes nothing visible and reads as a broken feature.
   This is a **capability gate**, not a completeness meter: one missing input,
   for one feature, at the moment it is reached for. Never a percentage.

2. **The status chip on the Match tab** — "You're anonymous here" / "You're
   visible as Sagar" — taps through to here. It describes **only you**. Showing
   who else has revealed turns a personal choice into a count and makes the last
   holdout visible.

3. **The suggestion prompt after check-in**, when `reveal_by_default` is set:
   *"You usually join as Sagar. Do that here?"* Phrased as a question because
   nothing has happened yet — check-in always creates `revealed: false`, so
   declining writes nothing and killing the app mid-prompt leaves you anonymous.
   Copy implying it was already applied ("you've been revealed — undo?") is
   wrong and describes a window that does not exist.

There is also no GET for per-event preferences, so **the intent chips open
empty**. They are only sent on save if touched — otherwise opening this screen
to flip the reveal switch would silently wipe the intent for the event.


**Route:** `/event-preferences/{eventId}` · **Reached from:** the check-in
trays when the server says `intentNeeded` (intent leads, `askIntent=1`), and
the Blend'n room's settings.

**What it does.** Sets your intent (why you are here) and whether your real name
and photo are visible **in this room**, via
`PUT /events/:id/matches/preferences`.

`DESIGN_HANDOFF.md` calls the reveal control **"the single most important new
screen"**, because it is the counterpart to the entire pseudonymity model.

### Rules the design must not break

| Rule | Why |
|---|---|
| **Reveal defaults to off** | And staying off must never look like an unfinished state |
| **Reveal is per event** | Choosing to be visible at a work meetup is not choosing to be visible at a club |
| **No profile-strength framing** | No progress bar, no completeness meter, no "finish your profile". Anything that makes pseudonymity feel incomplete pressures exactly the people it protects |
| **Never show who else revealed** | That turns a personal choice into a count and makes the last holdout visible |
| **Intent is a tag, not a partition** | Everyone stays in one pool. "Just here for the event" is a first-class answer, not a failure to choose |

### Design notes

No longer a placeholder (2026-09-28); the red banner is gone. Built to sit
beside the rate and forgot-password screens:

- **A close button, two questions, one accent.** Each question is a `title`
  over a `body` explanation, split by a hairline. Save is the one accent, pinned
  under the scroll so it is always in reach and clear of the home indicator.
- **Intent options are rows**, `surface` with a label and a hint, that fill
  `textPrimary` with a check when chosen (the system's selected treatment).
- **"Just here for the event" stands apart behind an "OR".** It is exclusive of
  the other three — picking it clears the rest — so the layout shows that before
  it happens instead of surprising anyone.
- **Reveal is a plain `surface` card with a switch.** "Do this at future events
  too" fades in under it, in the same card, only once reveal is on. Off carries
  no warning, badge or nudge: it is not an unfinished state.
- **Accessibility.** Save is a `button` labelled "Save", with its disabled and
  busy state. Each intent row is a `button` whose `selected` state is announced.
  Simulator QA had found Save reading as a GenericElement (a `TouchableOpacity`
  with no role). `__tests__/eventPreferencesScreen.test.tsx` pins both.

Still open for the designer: whether intent should look like chips (as on
`about-you`) rather than rows. Rows were chosen because each option carries a
hint, and a hint does not fit in a chip.

---

## 3. Match band — removed

`lib/matchBand.ts` (Strong / Good / Some) was never wired into a screen and has
been deleted. The card's shared-interest copy is built in
`lib/gridCardContent.ts` and `components/blendn/PersonCard.tsx`. If a band is
wanted again, design it first: it should not resemble a score, a percentage or
a rank, and "Some" must not read as failure.


---

## 4. `app/about-you.tsx` — the one screen that replaced eight

Reached once, immediately after signup, and never again on its own. Skipping it
writes nothing.

### What it collects, and why each field is there

| Field | Stored as | Who ever sees it |
|---|---|---|
| Intent (multi-select) | `profiles.intent_default` | the **shared subset only**, as "Both here to network" on a card |
| Age | `profiles.age` | on the roster, as a number |
| Field of work | `profiles.work_field` | on a match card as a label, **and only in rooms of 8+** |
| Interests | `user_interests` | as the named overlap — the card's real content |
| Gender | `profiles.gender` | **nobody but them** |
| Orientation | `profiles.orientation` | **nobody but them** |
| Interested in | `profiles.interested_in` | **nobody but them** |

### Rules the design must not break

1. **Gender and orientation appear only when "Dating" is ticked.** A networking
   user is never asked their gender. Unticking dating *clears* both rather than
   hiding them — nothing should be stored that the person can no longer see they
   gave.

2. **"Just here for the event" is a first-class answer**, not a way of declining
   to answer. The ranking damps it exactly as hard as silence, so it must not
   look like the option for people who could not be bothered.

3. **Nothing here may be presented as a completeness meter.** No progress bar,
   no "your profile is 60% complete", no percentage anywhere. The Match tab asks
   for interests at the moment somebody reaches for matching; that is the whole
   prompting strategy.

4. **The age field is optional and labelled optional.** It is asked again here
   only when the account has none, which is every Google and Apple account —
   those routes create a profile without one.

5. **Dating requires 18+**, refused client-side *and* server-side. The copy is
   `"Dating is for 18+ only. Your other choices are fine."` — the second
   sentence matters: it is a refusal of one chip, not of the screen.

6. **"Interested in" appears only sometimes**, and the designer needs to know
   why so the layout does not assume a fixed height. "Straight" plus
   "non-binary" has no defined target set, and "queer" and "pansexual" are
   identities rather than tables — in those cases the server derives nothing and
   the app must ask directly, or the person ends up with no dating tag anywhere
   and no explanation. See `lib/dating.ts`.

7. **Skip writes nothing.** Not "skip and mark them done". Someone who skips is
   in exactly the state of someone who never saw the screen.

### What it looks like now

Chips on black, a number input, one primary button and a text "Skip for now".
Every list is a wrapping row of pill chips, including the eighteen work fields,
which is the part most obviously wanting a designer: eighteen pills is a wall.

### Data it needs

- `GET /api/mobile/work-fields` → `{ slug, label }[]` — served, never hardcoded
- `GET /api/mobile/categories` → the category **tree**, flattened to leaves
- `GET /api/mobile/profiles/:id` → to know whether an age is already on file

### The save, which the design should not restructure

Interests go first through their own endpoint, then everything else in one
`PUT /profiles/:userId`. That order is deliberate: the interests call is
idempotent and re-runnable from edit-profile, while the profile fields cannot be
re-asked — so if one of the two must fail, it has to be the recoverable one. A
design that splits this into two steps with separate buttons would reintroduce
exactly the loss this ordering avoids.

---

## 5. `app/(tabs)/events.tsx` — the home screen, and the city it is about

**This one is not a placeholder that needs styling. It is a finished screen
almost nobody has ever seen**, and the reason is worth understanding before
redesigning it.

### What it already has

Seven sections, all built, all wired: *You're checked in*, an invite hero,
*Interested*, *Upcoming events*, *Nearby Events*, *{City}'s Top Events*, and a
featured hero.

They are all derived from **one** query, and that query was filtered to a 10 km
box around the phone. So on a device 10 km from the nearest event, every section
is empty at once and the screen collapses into a single *"No events nearby"*
with a Refresh button — which is the only state most people have seen it in.

### The change being made, and what the design has to carry

**Browse scope becomes a city you choose**, the way a food-delivery app works.

```
   ┌──────────────────────────────────────────┐
   │  Hey Sagar!                          ⚙︎  │
   │  📍 Bengaluru ▾   ·  Wednesday, 12 Aug   │   ← the picker is the change
   └──────────────────────────────────────────┘
   │  You're checked in        ← never scoped by city (see below)
   │  Nearby            2.4 km · 6.1 km · 11 km
   │  Bengaluru's top
   │  Upcoming
   │  Interested               ← never scoped by city
```

**The picker is the new element.** Tapping the city opens a list of cities that
actually have events, with counts. It is set automatically on first launch and
changeable forever after.

#### What is built, and what is still a placeholder

The behaviour above is **shipped**. The look of it is not.

| | State |
|---|---|
| City scoping the fetch, radius gone | Built |
| `GET /events/cities`, counts that match what opens | Built |
| The picker sheet — "use my current location", then city + count | **Partly built.** Drawn cities are illustrated cards with a living skyline (see `docs/PULSE.md`, City art); the sheet itself has no search, grouping or recents |
| *"Coming soon to {city}"* when we have no events there | Built |
| The header trigger — `📍 City ▾` | **Placeholder.** Inherits `topBarSubtitle`, sized as a caption rather than a control |
| *"You're in Munich. Switch?"* | Built, styled as an ordinary info banner |
| *"You're in Saarbrücken — nothing here yet. Showing Bengaluru."* | Built, neutral style, no action |
| Section-level empty states | Built |
| Distance labels on cards | Built. `formatDistance` in `lib/geo.ts`, rendered in the card's `locationLabel` slot **in place of** the venue name |

**The distance label needs a decision it has not had.** The card has one
metadata slot, so *"2.4km away"* currently **replaces** the venue name rather
than sitting beside it — and it only appears while you are browsing the city you
are in, because a distance measured from Munich to a Bengaluru event is a true
number and useless information. So the same card shows the venue in one state
and a distance in another. That is defensible and it is not designed. Both
matter: distance is what stops someone tapping into an event across town, and
the venue is what tells them whether they know the place.

#### The trap this closed, because the design must not reintroduce it

Three rules, each defensible alone:

1. No stored city → browse the **busiest** city, so nobody lands on a blank page.
2. Don't offer *"you're in X, switch?"* when X has no events — the offer would only lead somewhere empty.
3. The picker lists only cities that **have** events, so every entry opens with something.

Together, on a real device in Germany: dropped into Bengaluru, no banner back,
and their own city absent from the picker. **No way to say where they were.**

The fix is a *"Use my current location"* row that is **not conditional on that
city having events**. Choosing an empty city is allowed, and it is the clearest
signal we get about where to launch next.

**So the picker has two kinds of row** — one locator, then the list — and the
design has to make that legible without making the locator look like just
another city. The current build uses a dashed border and a `navigate` icon,
which is a placeholder, not a decision. The row hides once you are already
browsing where you are.

#### Two messages about where you are, and only ever one at a time

| When | Message | Action |
|---|---|---|
| Device is in a city that **has** events | *"You're in Munich. Browse events here?"* | **Switch** button |
| Device is in a city that **has none** | *"You're in Saarbrücken — nothing here yet. Showing Bengaluru."* | none |

They are mutually exclusive by construction, so the design never has to stack
them. The second is **passive on purpose**: there is nothing useful to tap —
switching to an empty city is a dead end and the header picker is already the
way to move — so a button would be a call to action leading nowhere.

**It is styled neutral, not as a warning.** Every other banner on this screen is
red or amber because something is wrong and an action is owed. This one states a
fact about the world. Dressing it as an alert would make "you live somewhere we
haven't launched" read as a fault, which is both untrue and the wrong first
impression for exactly the users we most want.

Found on a device in Saarbrücken, where the app knew precisely where the user
was and said nothing at all.

**And there are now two different empty states, which must not read the same:**

| State | Copy | Why it differs |
|---|---|---|
| City is on the list, nothing on | *"Nothing on in Bengaluru"* | A quiet week. Check back. |
| City is **not** on the list | *"Coming soon to Munich — we're not live here yet, you're early"* | We have not launched. Refreshing will never help, and the user did nothing wrong |

Conflating them would tell someone in Munich that "nobody has published anything
yet", which reads as the app being broken rather than as us not being there.

**The two worth real attention:**

**The header trigger is a caption that happens to be tappable.** It reads as
supporting text and has no affordance beyond a chevron. This is the primary
control for what the entire screen shows — it should look like one.

**The sheet does not scale past a handful of cities.** It is fine at three and
unusable at forty: no search field, no way to see where you are in the list, and
nothing separating "cities near you" from "everywhere else". Design it for the
launch case *and* the case where this works.

### Rules the design must not break

- **Distance is a label, never a filter.** Every event in the chosen city is
  shown; far ones sort last and say *"42 km away"*. The design must have room
  for that label and must not hide or truncate it — it is the only thing
  standing between "this is far" and a user tapping into something they cannot
  attend.
- **Empty states are per section, never the page.** A city with no events shows
  one honest empty section naming the city and offering the picker. The heroes,
  the checked-in strip and Interested stay. **The whole-page empty state is the
  bug being removed** — do not design a new one.
- **Checked-in and Interested are never scoped by the chosen city.** If someone
  is checked into an event in Munich while browsing Bengaluru, the way back into
  that room must still be on screen. It is a live conversation, not a listing.
- **Never silently switch the city for them.** GPS may *offer*
  — *"You're in Munich. Switch?"* — and only a tap changes it. A two-hour layover
  must not delete somebody's plans at home.
- **Cards must render without a cover image.** Fixed in `NearbyEventCard`, and
  it is a rule rather than a fix: many real events ship without artwork, and the
  card used to render as an empty grey rectangle. Design the no-image state
  deliberately.

### The flow, including the case that broke it

```
  first launch
      │
      ├─ location granted ──► server resolves the city ──► "Bengaluru" selected
      │                                                          │
      └─ location denied ───► city list shown, user picks ───────┤
                                                                 │
                                        ┌────────────────────────┴───────────┐
                                        │                                    │
                            device IS in that city              device is NOT
                                        │                                    │
                              "Nearby", by distance,           "In Bengaluru", by time
                              distances shown                  no distances (they would be noise)
                                                               ┌──────────────────────────────┐
                                                               │ You're in Munich.  Switch? → │
                                                               └──────────────────────────────┘
```

### Ambiguities in the current screen the design should not inherit

Named because several look like features and are not:

| On screen | Actually |
|---|---|
| **"Discover the Best Parties"** | `category` matched by substring on `party`/`night`/`club`/`music`, so a **Classical and Carnatic** concert is a Best Party. Being rebuilt on the real category tree |
| **Both "featured" heroes** | The first event that happens to have a cover image. No editorial choice exists yet — if the design wants one, it needs a rule behind it |
| **"Nearby Events" subtitle** | Showed a stored profile city while the list was sorted by live GPS. Two different notions of "where you are" in one component |
| **"{City}'s Top Events"** | Filtered by city name out of a list already limited to 10 km. The city label was decorative |

### Data it needs

Per event: title, cover image (**optional**), start and end time, venue name,
city, and — for the Nearby section only — distance from the device. Plus the
selected city, the list of cities with counts, and whether the device is
currently in the selected city.

---

## 6. The Board — `app/board/[eventId].tsx`, and its requests in the Banter

**Route:** `/board/{eventId}` — the title and the doors come from the server,
never the link · **Reached from:** the event screen's "The Board" row, **before
the run's first doors only** (`!boardClosed(event.start_time)`, not the day's
window). Requests are answered in the Banter
(`components/board/BoardRequestsSection.tsx`, under message requests), which is
also where a `board_request` push lands.

**On since its server half shipped** (step 6b, admin #608 and #614: block and
report by post or request, blocked authors filtered out of the board, a decline
never sent to the asker, spaces that go down). `BOARD_ENABLED` in `lib/board.ts`
gates the event row, the Banter section and the route, which sends a deep link
home when it is off; a build can switch it off with
`EXPO_PUBLIC_BOARD_ENABLED=false`, and reverting the one commit that turned it on
is the other way back.

**What it does.** Going alone, and looking for somebody to go with. People who
are going post an **offer** (a car, a table — with spaces) or a **seeking**.
Anyone who RSVP'd or saved the event reads the board. Asking is one tap; the
author answers in the Banter; accepting opens a pseudonymous conversation.
Design of record: "Part 3b — the board, designed" in the client plan.

```
Event screen ──▶ The Board                       Banter
  "The Board"     ├─ Write a post (offer|seeking)  ├─ The Board: asks waiting on you
  (pre-doors)     ├─ offers (spaces left) first    │    Decline · Accept ──▶ the DM
                  ├─ seekings, text first          └─ YOU ASKED (quieter)
                  └─ Ask to join ──▶ "Waiting on them"    Waiting on them · Withdraw
                                                          They said yes / Closed
```

### Rules the design must not break

| Rule | Why |
|---|---|
| **Pseudonyms only — never a name, never a photo** | The board is read by people deciding whether to travel with a stranger. A name or a face here hands over identity before anybody agreed to it. Marks are `boardMarkSeed(handle, eventId, id)` — the handle, never a user id (the server does not even send one) |
| **Offer and seeking are two shapes, one accent** | An offer's spaces-left is the board's only real-time signal; it is the loudest line on its card and offers sort above seekings. Identical cards bury it. The accent is the screen's one primary action (Write a post / Post) |
| **The counter is never the only difference** | Each card also says "Offering" / "Looking" in words — for a screen reader, and at the largest text size, where every line wraps rather than truncates |
| **Two empty states, not one** | "Nobody's posted yet" is the common case and invites the first post. "The board's closed" is a different fact (the doors opened) and offers the room instead |
| **A refusal names its gate, in the server's words** | Not going, profile incomplete, five asks waiting, the weekly limit, the content filter — each has a different fix. It stays on screen (not a toast) until the next try |
| **A 409 is a state, never an error** | "You have already asked", "That request has already been answered" are what a double tap on a slow connection looks like. Never red, never an error toast |
| **No confirm on Ask** | Asking is the moment someone feels most exposed; "Are you sure?" says it is dangerous. An inline spinner, then the card says what happened |
| **A decline is never delivered, or inferable** | There is no decline push and no "declined" anywhere. The server sends the asker their declined ask as pending and live until the night lapses, and an ask to somebody blocked as an ask on a withdrawn post; the lines follow what it sends. A 409 on an ask reads "Waiting on them" (one ask per post, ever) or "Full"; never the server's sentence |
| **Report and block are by the post or the ask** | The board never gives the app a user id. ⋯ on a post and More on an incoming ask open Report (the message reasons, an optional note) and Block (confirmed first); the server resolves who. A blocked post or ask leaves the screen at once. A rate-limited report says so rather than "try again" |
| **An accept that cannot go through is a quiet line** | "Your offer is full", "Already answered", or "Closed" (taken down, ended, or a block or closed pair — one line for all three, as the server gives one sentence) under the ask; never a red toast |
| **Accepting never draws the match opener** | The conversation carries `origin_board_request_id`, so the server answers `fromMatch: false`. Greeting two people who agreed to share a car with "You both said yes" is the silent failure this rule exists for (`__tests__/boardConversationNoOpener.test.tsx`) |
| **Pushes carry no text** | `board_request` and `board_request_accepted` say only that something happened — a lock screen is read by other people. Nothing renders a preview from them |
| **Before doors only** | After them the room is the place, gated on presence. A board left open would be a second room with a weaker gate |

### Data each screen reads and writes

| Surface | Reads | Writes |
|---|---|---|
| Event screen row | the event's `start_time` (hidden from doors on) | — |
| The Board | `GET /events/:id/board` (posts: `kind`, `body`, `spacesLeft`, `author` handle, `mine`, `requestCount`); `GET /board/requests` (which posts already carry your ask) | `POST /events/:id/board` `{kind, body, spacesLeft?}`; `DELETE /events/:id/board/:postId` (take down your own); `POST /events/:id/board/:postId/requests` (ask, no message) |
| Banter, The Board | `GET /board/requests` → incoming that are `live`; outgoing that are live, or closed until a day after their doors; your withdrawals hidden | `PATCH /board/requests/:id` `{accept \| decline \| withdraw}`; accept returns the `conversationId` the screen opens; `POST /board/requests/:id/report` `{reason, description?}`, `POST /board/requests/:id/block` |
| A post's ⋯ | — | `POST /events/:id/board/:postId/report` `{reason, description?}`, `POST /events/:id/board/:postId/block` |

### Still open — decisions and work, not styling

| | |
|---|---|
| **A board conversation looks like any other in the inbox** | The conversations payload says `fromMatch: false` but not "from the board", so the Banter row cannot say where it came from. Needs `originBoardRequestId` (or a kind) on `GET /conversations` |
| **`chat` posts** | The server accepts a third kind that asks nothing of anybody. The composer offers only offer and seeking; a `chat` post renders in the seeking shape |

---

## 7. "Running this event? Claim it" — event detail (`components/screens/EventDetailScreen.tsx`)

**A link, not a screen, and the first of two.** Added 2026-10-01 (step 1 of the
product-completion plan). The venue half, "Own this place? Claim it", lands with
the venue detail screen (step 5).

### What it does

On an event **added by Blend'n** (curated) that nobody has claimed, a line under
the location card reads *Running this event? Claim it*. Tapping it opens the
public claim page in the browser — `https://<dashboard host>/claim/<eventId>`.

### Rules the design must keep

- **The server decides whether it shows.** `GET /events/:eventId` sends
  `claim: { url }` only for a curated, unclaimed event; otherwise `null`. Never
  show it from anything the app infers (the host name "Blendn" is not the
  rule: a legacy event with no organiser reads the same).
- **Open the URL as given.** It is built on the dashboard host for the
  environment the app is talking to. The API host has no page there, and a
  hard-coded host sends staging users to production.
- **It leaves the app, on purpose.** The app refuses organiser and venue
  accounts, and the claim page needs no account. Filing there grants nothing:
  a person reviews every claim. Say nothing that promises ownership.
- **Quiet.** Most people reading this screen are attendees; the line is for the
  one organiser in a thousand who finds their own event. Never a button, never
  in the CTA dock.

### Open for design

Placement (currently the last line of the page), wording, and whether it
belongs beside the host byline instead.

---

## 8. The home screen — a map, and a drawer of Events | Places (`components/home/HomeShell.tsx`)

**Added 2026-10-02 (step 2 of the product-completion plan, PR A).** The Pulse
tab (`app/(tabs)/events.tsx`) is now a map with a pull-up drawer. The drawer
holds a segmented control, **Events | Places**. Events is The Pulse exactly as
it was — the same component, moved, with its sections, search, city picker and
empty states. Design ticket: SCRUM-541.

### What it does

- **The map** (`HomeMap.tsx`) fills the screen behind everything: MapLibre
  over OpenFreeMap, restyled dark (`lib/mapStyleEmber.ts`), at zoom 16 tilted
  55°, the city's buildings an opaque cool dark grey under one map-anchored
  moonlight (prototype v2's night). Pins follow the segment — events on
  Events, venues on Places — for the part of the map on screen. Zoomed out, a
  pin is a dot (at a venue its glow steps with its live bucket). Zoomed in
  (step 2c), the twelve pins nearest the centre are lit (`lib/mapLit.ts`,
  `useMapLighting.ts`): the building a pin stands in stands at least 15 m tall,
  its walls banded from a dark foot to the brand colour under a bright crown —
  ember walls and an accent roof for an event, rose walls and an orchid roof
  for a venue — with a glow on the ground around its pin. A live event's glow
  breathes for a few seconds after the map settles, then holds (never with
  Reduce Motion, the drawer full or a screen reader on), and its look wins its
  building. A pin with no building gets a banded pillar (10 m across, 70 m
  tall) with a stronger glow at its foot. The nearest four carry a chip above
  the roof: the name and "LIVE ●" or the start (in India's time, with the date
  past six days), or a venue glyph and its bucket; a screen reader hears plain
  words. Tap a pin, a lit building or a chip to open it. An event lights up
  when its doors open, without a new read. The camera keeps its centre above
  the drawer from the first frame, follows the picked city and your first
  location fix (until you move the map yourself), and shows your position.
  OpenFreeMap's attribution stays on (the OpenStreetMap licence), under the
  top bar; the style can be moved off OpenFreeMap with
  `EXPO_PUBLIC_MAP_STYLE_URL`. **Every map colour, size, timing, the light and
  the camera are `lib/mapTheme.ts`, and provisional**: the owner will redesign
  the app from a design link, and the map's look is that one file
  (SCRUM-566).
- **The top bar** (wordmark and bell) floats over the map. The drawer never
  covers it.
- **The drawer** (`HomeDrawer.tsx`) rests at three heights: `peek` (only its
  header, above the tab bar), `half` (the default) and `full` (under the top
  bar). Drag its header, or tap the handle to step it up. The list inside
  scrolls on its own and never moves the drawer.

### Rules the design must not break

| Rule | Why |
|---|---|
| **No check-in boundary is drawn, anywhere on the map** | The owner's ruling (plan v2 §4). No payload carries the area; a drawn outline is a map of where to stand to be counted. Every lit shape is a public building outline or a public pin, and every glow a fixed radius from the theme. `__tests__/homeMap.test.ts` refuses any fill or line layer on the home map, any read of an area, and any circle sized by something a place carries |
| **The map shows what the server sent** | Pins are the lists' own query for the viewport. Nothing on the phone decides which places are listed |
| **The segmented control is always reachable** | It is in the drawer's header, which is what `peek` leaves showing |
| **Events is The Pulse, not a copy** | One component; a redesign of the Pulse is a redesign of this pane |
| **A screen reader gets the list open** | With VoiceOver/TalkBack on, the drawer opens at `full`; the handle is an adjustable control ("Collapsed / Half open / Expanded") |
| **Switching never loses your place** | Both panes stay mounted once opened. Places reads afresh each time it is opened (a venue an event took over must not linger from a cache) |
| **The keyboard never covers the search** | Typing in the Pulse's search opens the drawer fully; closing the keyboard puts it back |
| **Every row is reachable at half** | The pane is as tall as what shows at the settled height |
| **44pt targets** | The handle and each segment |
| **Media plays only when seen** | The Pulse's hero pauses on Places, at peek, and on another tab |
| **The map follows the city** | Picking a city moves the map to it (`/events/cities` `centre`) |

### Open for design

Everything visual: the drawer's heights and edge, the segmented control, the
handle, whether `peek` shows a summary line, what the map shows at each height.

---

## 9. Places — the list in the drawer (`components/home/PlacesList.tsx`)

**Added 2026-10-02 (step 2, PR A).** The venues in the Pulse's city, nearest
first when the phone has a fix. Each row: the name, the type, the area, the
distance, how many are live, and tonight's event if there is one. A tap opens
the place (§10). Design ticket: SCRUM-542.

### Rules the design must not break

| Rule | Why |
|---|---|
| **A place an event has taken over is not in the list, and the app does not decide that** | From an hour before a real event at a venue starts until it ends, the server leaves the venue out, and the event's card in Events says "at ‹Venue›" instead. One rule, on the server (`lib/venue-visibility.ts` in blendn-admin). The list filters nothing by time; a second rule here is how the list and the map come to disagree |
| **Live is a bucket, never a number** | "Under 5 live", "5–9 live", "10–19 live", "20+ live" — the server's `liveNow`. A count that moved from 4 to 5 as you watched would tell you somebody just walked in (D-19) |
| **Never who** | The list says how many, never which people. People are the venue's room, which only somebody live there may see |

### Data it needs

`GET /api/mobile/venues?city=…&lat=…&lon=…&sortBy=distance` — `apiClient.getVenues`.

---

## 10. A place — `app/venue/[id].tsx`

**Added 2026-10-02 as a stand-in; filled in 2026-10-09 (step 5 of the
product-completion plan).** A row in Places opens it. Design ticket:
SCRUM-555.

### What it does

`GET /api/mobile/venues/:venueId` decides everything on it:

- **The place**: name, type, address.
- **How many are live** — a bucket, never a number: "Under 5 live here",
  "5–9 live here", … When you are live it reads as the others ("You and under
  5 others"): the server's figure never counts you.
- **Go Live** (`live.open`) opens the Go Live sheet (§11). After a window ends
  the button becomes **"Go live again · 20 minutes"** — one tap, the same
  window (PL-M05) — with "Pick another time" under it. Only for the window last
  chosen at this place on its current venue day, never for "stay", and only for
  the account that chose it.
- **Live**: a pill, `LIVE · 18:42 left` ("LIVE · STAYING" for "stay"), counting
  down from the server's `expiresAt` by the server's clock (the `Date` header);
  at zero it asks the server every few seconds until the window is gone.
  "Open the room" (the place's chat), "See who's here" (the Blend'n room — the
  place screen closes first, so it opens on top), and "Stop being live".
- **An event has the place** (`closedReason: event_live_here`): instead of Go
  Live, "‹Event› has this place now" and **Go to the event**, the event's
  check-in. A Go Live refused with `EVENT_LIVE_HERE` gets the same hand-off as a
  sheet.
- **No check-in area** (`no_check_in_area`): a line saying so; no button.
- **Today's room**: locked until you are live ("Only people live here can see
  who's here and join the chat"); open while you are.
- **Tonight's event**, which opens the event.
- **"Own this place? Claim it"** — only for an unclaimed place whose payload
  carries `claim: { url }` (read through `claimUrlFrom`, as §7).
- A page refused as not onboarded / not an adult shows the server's sentence
  and no Try again: no retry fixes it.

### Rules the design must not break

| Rule | Why |
|---|---|
| **Live is a bucket, never a number, and never who** | D-19: a count that moved 4 → 5 as you watched names an arrival. People are the room, for people live there |
| **The countdown reads the server's `expiresAt`** | Re-read on focus and on return from the background. A timer from the tap is wrong the moment the window is extended elsewhere or swept (PL-CU02) |
| **No check-in boundary, anywhere** | No payload carries the area (plan v2 §4) |
| **`EVENT_LIVE_HERE` is a hand-off, not an error** | The person is at the door of an event; the way in is its check-in (PL-CU01) |
| **Seeing who is here costs being seen** | The room is locked until you are live. Never sold, never unlocked by Plus |
| **The claim link is the server's** | Built on the dashboard host for the environment; quiet, leaves the app (§7) |

### Open for design

Everything visual: the pill, where the count sits, the locked room, the hand-off
panel, whether the place gets an image (it has none; tonight's event cover is
available).

---

## 11. The Go Live sheet and the expiry prompt — `app/venue/[id].tsx`, `components/LiveAtVenue.tsx`

**Added 2026-10-09 (step 5).** Both are `ActionTray`s for now. Design ticket: SCRUM-556.

- **The sheet**: "Go live at ‹place›", a sentence on what live means (you see
  who is here and join today's room; they see you by your room name; it ends),
  then **20 minutes · 45 minutes · An hour · Stay while Blendn is open here**,
  Cancel. Where you are goes through the check-in's own gates (permission,
  Precise Location, a fix); Go Live sends any fix up to the server's 150 m and
  lets the server judge, and "Try Again" on a weak fix runs Go Live again.
  "Stay" is sent as asked: whether it is Blendn+'s is the server's to say
  (`PLUS_REQUIRED`), which today it is not; it holds only while the app pings
  from the place, in the foreground.
- **The expiry prompt**: five minutes before a fixed window ends, wherever you
  are in the app, **at most once a night** per place (a "stay" window is never
  prompted — it follows you). "Still at ‹place›?" · "You stop being live at
  9:20 PM." · **Extend 45 min · free** (going live again extends, never
  shortens) · **Stay with Blendn+ · locked** · Let it end.
- **"Stay with Blendn+" is a placeholder.** Blendn+ is step 11; the row opens a
  "Blendn+ is coming" note, never a purchase. So does a `PLUS_REQUIRED` answer.
- **When it ends** (`live:ended`), a toast says so — "You're no longer live at
  ‹place›." / "An event just started at ‹place›…" — and the place, the room
  and the Banter re-read. Nothing is said for an end you made.

### Rules the design must not break

| Rule | Why |
|---|---|
| **The extension is free** | 20/45/60 stay free (ROADMAP, Pricing); only "stay" may ever be Plus |
| **Once a night** | A prompt every window would nag; asked once per venue day on this phone |
| **Never a paywall in the prompt yet** | No purchase exists until step 11; a locked row, not a dead buy button |

---

## 12. A place's room when you are not live — `app/chat/[id].tsx` (`RoomLeftState kind="not_live"`)

**Added 2026-10-09 (step 5).** Design ticket: SCRUM-557. A place's chat is for the people live there.
When your window ends the server answers `NOT_LIVE` (and `live:ended` arrives):
the history and composer go, replaced by "You're not live here any more" ·
"Today's room is for the people live at this place. Go live there again to
rejoin it." · **Go live again**, which opens the place. The room leaves the
Banter's list at the same moment (the server lists it only while you are live).

### Design tickets

| Section | Ticket |
|---|---|
| §10 A place | SCRUM-555 |
| §11 Go Live sheet, expiry prompt, Plus placeholder | SCRUM-556 |
| §12 The room when not live (and the place's locked room) | SCRUM-557 |

---

## Screens that do not exist at all

Named so the gap is visible, not to imply they are next.

| | Status |
|---|---|
| **Presence prompt** — "are you still here?" | Logic exists in `lib/usePresence.ts`, which knows when the server says you are outside the geofence. Nothing renders it |
| ~~**First-check-in screen**~~ | **Built as `app/about-you.tsx`, and moved.** It is asked once at signup rather than at every check-in — see section 4 below |
| **Group check-in / group matching** | Deliberately gated behind the interests fix landing and one real event. Superseded 2026-10-01 by the owner: this is crews, step 9 of plan v2 — see `ROADMAP.md` |
| **Notifications centre, search, profile strength** | In the Figma. Profile strength is **cut** — it contradicts a product that hides profiles until a mutual like. The map is §8 |
| **`/join` attendee landing page** | Deferred by decision. Spec in `BlendnLanding/docs/JOIN_PAGE_BRIEF.md` |

---

## The honest state of the design system

Worth knowing before restyling anything, because it is the real problem:

- **No Satoshi.** `assets/fonts/` holds one file, the Expo starter's SpaceMono,
  unused. The app renders in San Francisco and Roboto
- **None of the brand colours.** `lib/theme.ts` is the **Apple iOS system
  palette** — `#0A84FF` is systemBlue, `#EBEBF599` is secondaryLabel
- **397 hardcoded hex literals** and 210 raw `rgba()` across four competing
  accent systems
- **Contrast failures at token level**: `textTertiary` resolves to about 2.2:1

These placeholder screens use `APP_COLORS` rather than adding to the 397, but
`APP_COLORS` is itself the iOS palette, not the brand.

**The highest-value handoff is tokens, not screens** — a palette and type ramp an
engineer can paste into `lib/theme.ts` and delete 397 literals against. Two
constraints: **Satoshi has no 600 weight** (300/400/500/700/900) and `'600'` is
currently the most-used weight in the repo, and **ink on orange, never white** —
white on `#F05423` is 3.4:1 and fails AA.
