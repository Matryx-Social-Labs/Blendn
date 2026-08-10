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

## Screens that do not exist at all

Named so the gap is visible, not to imply they are next.

| | Status |
|---|---|
| **Presence prompt** — "are you still here?" | Logic exists in `lib/usePresence.ts`, which knows when the server says you are outside the geofence. Nothing renders it |
| **First-check-in screen** — the two chip-pickers replacing onboarding | Decided in `DESIGN_HANDOFF.md`, unbuilt. Interests are collected in onboarding today |
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
