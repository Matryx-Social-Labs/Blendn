# Onboarding

Eight screens, built against the Figma file `Zi2KcUzhEcLRdqyit22LdQ`, canvas
**🕓 Updates**. For designers, for testers, and for whoever changes a step next.

Design tokens are in [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md).

---

## The screens

| # | Route | Frame | Collects | Skippable |
|---|---|---|---|---|
| 1 | `/onboarding/basics` | `1141:3928` | first name, gender, **date of birth** | **no** |
| 2 | `/onboarding/notifications` | `1141:4064` | push permission → `push_enabled` | yes |
| 3 | `/onboarding/location` | `1141:4119` | location permission → `share_location` | yes |
| 4 | `/onboarding/preferences` | `1141:4192` | orientation, looking-for | yes |
| 5 | `/onboarding/journey` | `1141:4290` | city, occupation, field of work, education | yes |
| 6 | `/onboarding/details` | `1141:4408` | interests, bio | yes |
| 7 | `/onboarding/media` | `1141:4502` | up to six photos | yes |
| 8 | `/onboarding/ready` | `1141:4558` | nothing — writes `onboarded: true` | **no** |

**Two frames were deliberately not built.** `1141:3888` (Phone Number) and
`1141:4003` (OTP Verification) — there is no phone auth on the server, so those
screens would collect a number nothing can verify and hand back a code nothing
issued.

**Step one and step eight cannot be skipped.** One carries the birth date every
age rule derives from; the other is the only place `onboarded` is written, so
skipping it would leave the account permanently mid-funnel.

---

## How it works

### Where the state lives

There is no context provider. expo-router gives each step its own route and
therefore its own mount, so there is no common React parent that survives
navigation. **AsyncStorage is the shared parent**, keyed per user id — which is
also what makes resume work: the same mechanism that carries an answer from step
three to step seven carries it across a force-quit.

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
this". A correction on step one would silently wipe an answer from step six.
`stepPayload` in `lib/onboarding.ts` is what narrows it, and
`__tests__/onboarding.test.ts` pins it.

**A failed server save does not block anyone.** The local draft is intact,
`onboarded` is not written until the last step, and step eight re-sends
everything — so the recovery is automatic. The alternative is trapping someone
on a screen because their train went into a tunnel.

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

### 1. The orientation switch is built, and narrower than its label

Frame `1141:4192` puts a switch beside Orientation offering to display it.
**Built** — with the exposure narrower than "show on profile" implies, and the
difference is the point.

Turning it on shows orientation to people who **can already see who you are**:
a mutual match, an open conversation, a room you revealed yourself in. Not to
every caller. Two gates on the server, and both must pass:

| Gate | Question | Default |
|---|---|---|
| `show_orientation` | may this be shown at all? | **false** |
| `maySeeIdentity` | shown to *whom*? | matches, conversations, revealed |

**Why not the switch as drawn.** A single public switch puts orientation in
front of any caller holding a token. This API withholds someone's real name and
photograph from anyone who has not matched, opened a conversation, or been
revealed to — so a field more sensitive than a name cannot be less protected
than one. The allow-list it sits in exists *because a deny-list once shipped
`orientation` and `gender` to any authenticated caller*.

**Why not leave it alone either.** Doing nothing looked like the safe option
and was not. Orientation was already collected and already fed
`deriveInterestedIn`, and was shown to nobody — so the algorithm knew and no
human could, which leaves someone no way to signal a thing the dating feature
exists to act on, and no visible control over a field the product was already
using.

**Two rules follow:**

- The switch appears **only once an orientation is chosen**. One offering to
  publish an unfilled field means nothing, and invites someone to turn it on
  and assume it did something.
- **Clearing the orientation clears the consent** — `orientationConsent` in
  `lib/onboarding.ts`, tested. A stored `true` would outlive the thing it was
  consent for, so answering the question again months later would republish it
  to everyone who had matched in the meantime, with no second decision.

The label on screen says who can see it rather than repeating "Show on
profile", and `EmberToggle` requires its helper text rather than accepting it as
optional. A privacy switch whose blast radius is not on the screen is one people
mis-set, and the cost of mis-setting this one is not symmetrical.

### 2. "Looking for" does not reach matching

The frame offers **Dating, Friendship, Networking, Travel, Open**. The intent
enum the matcher reads is `dating | networking | friendship | just_here` —
Travel and Open are not in it and would be rejected by the API.

These are stored in `looking_for`, which is free text and accepts all five, so
nothing is lost from the profile. What is lost is that these answers do not
influence who anyone is matched with.

**Decision needed:** either add Travel and Open to `connection_intent`, or
accept that this screen is profile decoration and collect intent elsewhere.

### 3. "Other" is stored as "prefer not to say"

The API's gender enum is `woman | man | non_binary | prefer_not_to_say`. The
frame's fourth chip is **Other**.

Someone choosing "Other" is saying *none of these three fit*. We record *they
declined to answer*. Those are different statements, and `deriveInterestedIn`
treats them the same.

**Decision needed:** add `other` to the enum, or change the chip's label to
match what it stores.

### 4. Employment type and class year are not collected

The frame's Occupation block has chips reading **Freelance / Full-time /
Founder**, and Education has a **class year** box. Neither has a column.

What is stored instead is `work_field` — a coarse bucket from
`GET /work-fields`, and the one professional detail that appears on a card in a
pseudonymous room, because *"works in design"* is an attribute while
*"Principal Designer at Swiggy"* is an address.

A field that saves nowhere is a lie told in a form, so those two are absent
rather than decorative.

### 5. Interests come from the server, not the frame

The frame's chips are invented labels — Web3, AI Synthesis, Ceramics — under
headings that do not exist. The screen renders the server's category tree, the
same one the event feed and matching read.

An interest typed into the client is an interest nothing can match on:
`profiles.interests` was free text, so "Software" and "software engineering"
never met, and unpicking that took two PRs.

**"Demisexual"** is in the orientation frame and not in the server's list, so it
is not offered — a chip that 400s on save is worse than an absent one.

### 6. Photos only, no video

The media frame's caption offers *"JPG, PNG and MP4 up to 20MB"*. The upload
path is images end to end — the picker requests images, and the server moderates
profile photos through an image check that has nothing to say about a video.

Offering MP4 would mean either an unmoderated video on a profile or a rejection
after the upload had finished.

### 7. The progress numbers are computed, not copied

The frames disagree with each other and cannot all be right: one header reads
**"STEP 02/05"**, another **"Step 2 of 4"**, another **"Step 4 of 5"**, and the
percentages run 30 / 70 / 80 / 100 across four screens of eight.

Those are mock values from separate design passes. `progressPercent` computes
one honest number and stays right when a step is added.

### 8. No blur, and no illustrations

`backdrop-blur` and the atmospheric blur radii have no React Native equivalent
on a plain view — `expo-blur` blurs what is *behind* a view, which is the wrong
tool for a soft-edged shape. Large, heavily-rounded, 5%-opacity blocks read the
same and cost nothing.

The permission screens' centre illustrations have no exported asset. They are
absent rather than invented — those screens are headline, explanation and two
buttons, which is a normal permission screen.

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
