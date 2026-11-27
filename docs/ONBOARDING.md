# Onboarding

One screen per step under `app/onboarding/`, in the order `ONBOARDING_STEPS`
(`lib/onboarding.ts`) gives, built against the Figma file `Zi2KcUzhEcLRdqyit22LdQ`, canvas
**🕓 Updates**. For designers, for testers, and for whoever changes a step next.

Design tokens are in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md).

---

## The screens

| # | Route | Frame | Collects | Skippable |
|---|---|---|---|---|
| 1 | `/onboarding/basics` | `1141:3928` | first name, **date of birth** | **no** |
| 2 | `/onboarding/preferences` | `1141:4192` | intent (why you go out), how you enter a room | yes |
| 3 | `/onboarding/details` | `1141:4408` | interests, bio | yes |
| 4 | `/onboarding/media` | `1141:4502` | up to six photos | yes |
| 5 | `/onboarding/location` | `1141:4119` | location permission → `share_location` | yes |
| — | `/onboarding/ready` | `1141:4558` | nothing — writes `onboarded: true` (the payoff, not counted) | **no** |

**Five steps since Flow 2 (2026-11).** Notifications left the flow: push is asked at the first "I'm going"
(`lib/pushAsk.ts`), and finishing onboarding defers the tabs' start-up prompt (`markPushDeferred`,
`lib/pushDecline.ts`). "Your journey" (city, occupation, field of work, education) lives in Edit profile. A stored
`notifications` / `journey` from an older build resumes at preferences / details (`RETIRED_STEPS`, `lib/onboarding.ts`).

**Two frames were deliberately not built.** `1141:3888` (Phone Number) and
`1141:4003` (OTP Verification) — there is no phone auth on the server, so those
screens would collect a number nothing can verify and hand back a code nothing
issued.

**The first step and the last (`ready`) cannot be skipped.** One carries the birth date every
age rule derives from; the other is the only place `onboarded` is written, so
skipping it would leave the account permanently mid-funnel.

---

## How it works

### Where the state lives

There is no context provider. expo-router gives each step its own route and
therefore its own mount, so there is no common React parent that survives
navigation. **AsyncStorage is the shared parent**, keyed per user id — which is
also what makes resume work: the same mechanism that carries an answer from one
step to a later one carries it across a force-quit.

Keyed per account because two accounts on one device — every tester's device —
would otherwise share one record, and the second person to sign in would resume
into the first one's half-finished flow.

### Two saves per step, and they are different

| | What | Why |
|---|---|---|
| **Local** | the whole draft, on every keystroke | nothing typed is lost, including on a screen that was never submitted |
| **Server** | only *this step's* fields | see below |

Sending the whole draft on every step would mean going back to fix a typo in
your name re-sends an empty `bio` — and the API reads a present key as "set
this". A correction on step one would silently wipe an answer from a later step.
`stepPayload` in `lib/onboarding.ts` is what narrows it, and
`__tests__/onboarding.test.ts` pins it.

**A failed server save stops on the step and says so.** It used to move on
silently, trusting the last step to re-send everything; in practice that walked
somebody through the rest of the flow on answers the server had not taken, to a final
save that failed on the same field. Now a toast says what failed and Continue
is the retry. The local draft is kept either way, and the step is only marked
done once the server has it, so resume lands back on it.

### Resume

`resumeStep` takes three inputs:

- **`finishedOnServer`** — `profiles.onboarded`. Wins over everything, so
  finishing on a phone does not re-run the flow on a tablet.
- **`stored`** — this device's progress. This is what makes quitting on step
  five come back to step five.
- **`isNewAccount`** — session-scoped, and **false on the next launch**. On its
  own it was never enough: it is exactly why someone who quit partway through
  used to land on the events tab with a half-filled profile and no way back in.

A record exists only while a flow is unfinished; finishing deletes it. So the
steady state for an established account is one local read that misses — **no
network call on the launch path**.

A stored step this build does not recognise (a rename, an older install) parses
back to the first step rather than navigating to a route that no longer exists.

---

## Where the build departs from the frames, and why

Every one of these is a place the design asks for something the product does not
have. None of them are silently ignored — each is either mapped honestly or left
out, and listed here.

### 1. No gender, no orientation, no Dating (register D-002, client/09, SCRUM-1192)

Dating is not an intent in 1.0. Gender (step 1's "I am" row), orientation (step 2's Orientation chips and their "Show on
profile" switch) and interested-in were read only by the server's dating compatibility check, so they went with it: the
app neither asks, loads nor sends them. A draft or profile from before 1.0 that still holds them is not shown or re-sent;
the server keeps the columns until the serving and trust lanes strip them. Putting dating back is one PR that restores
Edit profile's dating chain, not step 1's gender row (advisor pick, 2026-11-27).

### 2. "Looking for" is the intent (fix round 2026-10-27, OUT-01)

The step is now "Why you go out": two photo tiles, **Friendship** and **Networking** (either or both), and **Just here**
(exclusive), written as `intent_default` (`friendship | networking | just_here`, the values matching reads). A stored
`dating` is dropped on read (D-002). It no longer writes `looking_for`; older profiles keep what they hold and it is
read-only.

Before this, onboarding wrote only `looking_for`, so a new account had an empty
`intent_default`: matching could not use the answer, `profileIsComplete` refused
its first Lobby post, and the first check-in asked again. No backfill: the
first-door ask covers older accounts.

### 3. Employment type and class year are not collected

The frame's Occupation block has chips reading **Freelance / Full-time /
Founder**, and Education has a **class year** box. Neither has a column.

What is stored instead is `work_field` — a coarse bucket from
`GET /work-fields`, and the one professional detail that appears on a card in a
pseudonymous room, because *"works in design"* is an attribute while
*"Principal Designer at Swiggy"* is an address.

A field that saves nowhere is a lie told in a form, so those two are absent
rather than decorative.

### 4. Interests come from the server, not the frame

The frame's chips are invented labels — Web3, AI Synthesis, Ceramics — under
headings that do not exist. The screen renders the server's category tree, the
same one the event feed and matching read.

An interest typed into the client is an interest nothing can match on:
`profiles.interests` was free text, so "Software" and "software engineering"
never met, and unpicking that took two PRs.

### 5. Photos only, no video

The media frame's caption offers *"JPG, PNG and MP4 up to 20MB"*. The upload
path is images end to end — the picker requests images, and the server moderates
profile photos through an image check that has nothing to say about a video.

Offering MP4 would mean either an unmoderated video on a profile or a rejection
after the upload had finished.

### 6. The progress numbers are computed, not copied

The frames disagree with each other and cannot all be right: one header reads
**"STEP 02/05"**, another **"Step 2 of 4"**, another **"Step 4 of 5"**, and the
percentages run 30 / 70 / 80 / 100 across four of the frames.

Those are mock values from separate design passes. `progressPercent` computes
one honest number and stays right when a step is added.

### 7. No blur, and no illustrations

`backdrop-blur` and the atmospheric blur radii have no React Native equivalent
on a plain view — `expo-blur` blurs what is *behind* a view, which is the wrong
tool for a soft-edged shape. Large, heavily-rounded, 5%-opacity blocks read the
same and cost nothing.

~~The permission screens' centre illustrations have no exported asset.~~ No
longer true — see #9. Left here because the surrounding blur/atmosphere
substitution is still accurate.

### 8. What a 2026-09-19 pass against Figma found, and fixed

A frame-by-frame comparison (not a re-read of this document — an actual
`get_design_context` call per screen) turned up drift this file never recorded.
Fixed in code; recorded here so the next pass does not rediscover it:

- **`basics`** was missing the "Dynamic Visual Anchor" curation card — a 192px
  amber-toned preview card ("CURATION PHASE / Personalizing your bioluminescent
  feed...") between the date-of-birth field and the footer. The frame's asset
  is now committed at `assets/onboarding/curation.png` and rendered the same
  way the permission illustrations are: real view, hidden from screen readers,
  decorative only.
- **`location`** was missing the frame's reassurance line under "Maybe
  later" — *"Your precise location is never shared with strangers."* Added as
  a `footerNote` prop on `OnboardingScreen`, available to any screen that needs
  one (none of the other steps currently do).
- **`details`**'s bio counter read `0/500`; the frame's is `0/300`.
  `BIO_LIMIT` corrected to 300.
- **`details`** was also missing the frame's three bio-writing prompts
  ("A perfect Sunday involves...", etc.) — static, non-interactive cards
  shown below the bio field to unstick a blank textarea. Added.
- **`details`** renders bio before interests; the frame draws interests
  first. This is deliberate (see the file's own comment: the interest wall is
  long, and the bio question gets answered while attention is fresh) — not a
  bug, just never written down here until now.
- **`preferences`** has an "Anonymity" section — the room-visibility default
  — that does not exist in frame `1141:4192` at all. Also deliberate: it is
  "the only screen that gets to teach" the anonymous-by-default concept
  before someone meets it at a check-in (see the file's own comment). Not
  drawn in the frame, kept in the build, now written down here rather than
  only in the file's own header comment.
- **`journey`**'s secondary link read "Skip"; the frame's is "Save as Draft".
  Relabelled — the underlying action was already save-and-leave (every
  onboarding step persists a local draft on every keystroke), so this was a
  copy mismatch, not a behavior one.
- **`media`**'s grid gap was 12px against the frame's 16px, and the empty-slot
  "+" was two bare rectangles with no background — the frame wraps it in a
  48px circular `EMBER.surface` chip. Both corrected.
- **`ready`** was the largest gap: a single flat summary card next to the
  frame's finished "profile preview" bento — 128px avatar in a gradient ring
  with a checkmark badge, a divider before the bio quote, an Interests card
  with individual chips (one accent-highlighted), and icon-fronted Primary Hub
  / Looking For cards. Rebuilt to match, using real draft data rather than the
  frame's placeholder ("Julia Ember"). **Not** rebuilt: the frame's duplicate
  "PROFILE STATUS 100%" progress header (the shared `OnboardingScreen` header
  already shows this on every step, so a second one on the last step alone
  would be redundant) and the frame's decorative slide-icon CTA button
  (`EmberButton` is shared across every step; changing it for one frame
  would break the consistency the shared component exists to guarantee).

**One thing this pass did not check**: whether the shared unified header
(back arrow + progress bar + percentage, described in #7) itself counts as a
frame departure worth a line here. It's a deliberate consistency call over
each frame's own bespoke header treatment, and it predates this pass — noted
so nobody re-flags it as new drift.

---

## Testing it

`__tests__/onboarding.test.ts`, 25 cases. The two things worth testing are
**resume** (three inputs that can each be wrong independently) and **partial
saves** (whose failure mode is silent data loss three screens back).

To walk it by hand:

1. Sign up with a new email → lands on `/onboarding/basics`.
2. Fill in a name and a birth date. Continue is disabled until both are valid.
3. Get to step four or five, then **force-quit the app**.
4. Reopen → back on the step you left, with your answers still in the fields.
5. Finish. Check the dashboard user list: `onboarded` is true.

Step 5 is the one that has never been true before. `profiles.onboarded` has
existed since the first schema and the dashboard funnel has always counted it;
**nothing had ever set it.** The API accepted it on `PUT /profiles/:userId` the
whole time — no client sent it, so the funnel read zero and the number was
mistaken for a product problem.
