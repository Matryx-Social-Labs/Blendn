# Placeholder screens

**For the UI/UX designer, and for whoever audits this later.**

These screens are **functionally complete and visually provisional**. The logic,
the copy meaning, the API calls and the rules are decided. The layout, type,
colour, spacing and motion are not, and are meant to be replaced wholesale.

Each carries a red `PLACEHOLDER DESIGN` banner on screen so nobody mistakes one
for finished work in a demo.

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
| `forgot-password.tsx` | nothing | `apiClient.forgotPassword` → `/api/auth/forgot-password` |

**No screen navigates on success.** The root layout's routing effect watches
auth state and moves the user. Navigating from a screen as well races it — this
is why the Google and Apple handlers have no `router` call either.

### Still missing — decisions and work, not styling

| | |
|---|---|
| **Terms and Privacy are not links** | The text is there; there are no URLs behind it. App Review will check this |
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

**Route:** `/rate/{eventId}` · **Reached from:** nothing yet. Needs an entry
point after an event ends.

**What it does.** Loads the people you may rate (`GET /events/:id/peer-ratings`),
walks them one at a time, and submits a 1–5, an optional issue, and an optional
note.

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

The current 1–5 number row is a placeholder and probably wrong: a five-star row
reads as a public review, which is the one tone this must not have. The brief is
"a private note to us". Worth exploring something that does not resemble a
rating widget at all.

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


**Route:** `/event-preferences/{eventId}` · **Reached from:** nothing yet.
Should be reachable from the match screen and offered at first check-in.

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

"Just here for the event" is exclusive of the other three in the logic — picking
it clears the rest. That should be visible in the interaction, not a surprise.

---

## 3. `lib/matchBand.ts` — Strong / Good / Some

Not a screen; the logic behind the label that replaced the Figma's
`Match Percentage`.

- **Strong** — two or more shared interests
- **Good** — one shared interest
- **Some** — nothing shared, compatible intent

**Please design the band.** It should not resemble a score, a percentage or a
rank. "Some" in particular must not read as failure: while the interest graph is
still filling, most of a room will be "Some", and the copy has to be true rather
than discouraging. The current label is "Worth saying hello".

`sharedInterestSentence()` produces the card's real content — *"You both picked
Techno and Board games"*. That sentence is the product; the band is decoration
around it. It returns null when there is nothing to claim, so nothing is ever
invented.


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

## Screens that do not exist at all

Named so the gap is visible, not to imply they are next.

| | Status |
|---|---|
| **Presence prompt** — "are you still here?" | Logic exists in `lib/usePresence.ts`, which knows when the server says you are outside the geofence. Nothing renders it |
| ~~**First-check-in screen**~~ | **Built as `app/about-you.tsx`, and moved.** It is asked once at signup rather than at every check-in — see section 4 below |
| **Group check-in / group matching** | Deliberately gated behind the interests fix landing and one real event. See `ROADMAP.md` |
| **Map, notifications centre, search, profile strength** | In the Figma. Profile strength is **cut** — it contradicts a product that hides profiles until a mutual like |
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
