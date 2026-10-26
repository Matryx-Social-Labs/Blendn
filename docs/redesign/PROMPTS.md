# Paste-ready prompts for Claude Design

Run these in order. Each fenced block is one paste. The prompts point Claude Design at the files in this folder rather than repeating them, so keep what you attach current: if you change [`DESIGN-BRIEF.md`](./DESIGN-BRIEF.md) or [`SCREENS.md`](./SCREENS.md), re-attach them before the next prompt.

The reasons for this order are in [`research/research-type-claude-design.md` §B4–B5](./research/research-type-claude-design.md):
- design system first;
- then one direction pass;
- then one project per flow, never one giant prompt.

Claude Design has no version history, drifts in long chats, and is far more consistent when shared decisions live in a *published* design system than in conversation.

---

## Before you start (once, by hand)

### 1. Decide the font question first

The ITF Free Font License lets Blend'n **embed** Satoshi in the app. It also forbids:
- putting the font files in a public repository;
- making them available to third parties through "any… SaaS platform, design tool".

Uploading Satoshi to Claude Design for your own team is a grey zone. Exported ZIPs and handoff bundles carry the font inline. Pick one:

- **A (recommended): ask ITF first.** Email them under §09 of the licence for written consent to use Satoshi in Claude Design and in the app's private build pipeline. It costs one email.
- **B: work with a stand-in.** Design in **Plus Jakarta Sans** (OFL, already in the app, similar proportions) with Satoshi's sizes from the brief, and swap to Satoshi at implementation. Say "Satoshi stand-in" in Prompt 1a.
- **C: upload Satoshi** and keep everything that embeds it strictly org-internal (see the rules in step 4). Your call on the risk.

### 2. Attach the code: a curated set, not the repo root

**Never attach the local checkout folder.** The main checkout has the Android upload keystore, the iOS certificate and `.env` in its working tree.

A GitHub import of the whole repo also brings in files that would mislead Claude Design:
- a third-party design skill under `skills/` and `.agents/`;
- stale design docs (`docs/DESIGN_SYSTEM.md`, `docs/api/DESIGN_SYSTEM.md`, `docs/UI_IMPROVEMENTS_PRIORITY.md`).

So attach **only these folders, from a fresh `origin/dev` worktree**:
- `docs/redesign/` (this pack)
- `lib/theme.ts`, `lib/motion.ts`, `lib/fonts.ts`, `lib/roomButton.ts`
- `components/`
- `app/`
- `docs/NAVIGATION.md`, `docs/PULSE.md`, `docs/SCENE.md`, `docs/BANTER.md`, `docs/CHAT.md`, `docs/PROFILE.md`, `docs/ONBOARDING.md`, `docs/PLACEHOLDER_SCREENS.md` (its last section is stale, and the brief says so), `docs/api/client-chat-moderation-guide.md`
- `app.json`

If the attach lags, drop `app/` and `components/`. The audits in `docs/redesign/audit/` describe them with `file:line`.

### 3. Upload as files

- **The brand manual PDF** (`Blend Brand manual.pdf`, 10 pages).
- **`docs/redesign/assets/blendn-monogram.svg`** and **`blendn-monogram-white.svg`**: the vector mark, extracted from the manual. The app itself only has PNGs.
- **Real photography.** The brief says "photography carries the colour", so give it real photos or it will invent placeholders:
  - **10–15 real event covers**, including the brightest poster on staging (for the glass contrast test);
  - **6 profile photos**.

  Take all of them **from seeded QA accounts only**, never from real users. These files go to a third party.
- **8–12 screenshots of the current app**, labelled, from seeded QA accounts on an iPhone and an Android:
  - Pulse
  - Scene
  - Tonight with the pass
  - Room
  - Banter
  - room chat
  - DM
  - Me
  - onboarding step 1
  - Settings

  Say which ones you like and which you don't.
- **Fonts** per step 1. Geist Mono loads from Google Fonts by itself.
- Optional: 3–6 reference screenshots from apps in [`research/research-references-states.md`](./research/research-references-states.md) (DICE ticket, Luma event page, Apple Invites card, Instagram story ring), each with one sentence on what to take from it.

### 4. Storage rules for everything Claude Design produces

- **Exports** (ZIP, PDF, handoff bundles) never go into git or onto a public link. The client repo is public, and its `artifacts/` folder is tracked.
- **No "anyone with the link" sharing, no standalone-HTML sharing, and no "Send to" partner tools** for anything that embeds Satoshi.
- Keep exports in the company drive.

---

## Prompt 1a · Foundations (project: "Blend'n — design system")

Use Opus at max effort for the design-system project.

```
You're designing the complete visual and interaction system for Blend'n, an IRL event-networking app for iOS and Android (Expo / React Native). Read these first, in order, and treat them as the brief:

1. docs/redesign/DESIGN-BRIEF.md. It supersedes docs/DESIGN_SYSTEM.md and the visual rules in docs/NAVIGATION.md and tasks/lessons.md, and §0.1 says exactly which rules it reverses and why.
2. The brand manual PDF. Its violet hex is a misprint; the brief has the corrected value.
3. docs/redesign/SCREENS.md, only so you know what the system must serve. Don't draw screens yet.

In this first pass, build only the foundations:
- colour tokens (dark only), the two brand gradients, the orb backdrop (with and without orbs), grain;
- the material tiers: glass, blur and solid for each Material role, side by side, tested over a white, a grey and the brightest supplied poster, with contrast values shown;
- the type scale exactly as in the brief's table;
- spacing, concentric radii, control heights;
- the icon set comparison and your pick (§8);
- a motion page: every token, plus each §9.3 choreography as a timed prototype with its Reduce Motion version;
- a haptics reference page: the §10 vocabulary as name → iOS → Android → when. You can't play haptics; show them as annotations.

Research online where the brief says to (§17) and cite links. If you cannot browse, say so, use docs/redesign/research/ instead, and never invent a URL. Ask before you start if anything in the brief conflicts. Flag conflicts; don't resolve them silently.

End with every decision you made that the brief didn't dictate, so I can approve them.
```

## Prompt 1b · The centre Blend'n button (same project)

```
Now the signature element: the centre Blend'n button, DESIGN-BRIEF §11.

Do the research in §11.5 first and show what you found (with links, or say you couldn't browse). Then draw 2–3 variants of the four states (idle, today, check-in, live ± unread) as still frames, in greyscale too. The §11.3 table is the recommendation, not the only option; one variant should be the "breathing glow" burst so I can compare it with the single pulse. Prototype every transition in §11.4, each with its Reduce Motion version, and show it in the tab bar on iOS and Android, over a bright poster and over ink. Use the vector monogram I uploaded, and prototype the translucent counter-fill idea in §11.3.

Recommend one variant and say why.
```

## Prompt 1c · Components (same project; send in groups)

Send this once per group. The groups, from DESIGN-BRIEF §12:
1. Actions + Selection + Input
2. Navigation + Containers
3. Events + People
4. Chat + Moments + Board + Profile + gesture alternatives

```
Build the §12 components in group <N>: <list>. Name them exactly as the brief does. For each: every state (default, pressed, focused, selected, disabled, loading, error as they apply), iOS and Android variants where §13 says they differ, Reduce Motion behaviour, and its haptic token as an annotation. Use only the published foundations. If a component needs something new, propose it as a foundation change first.
```

**After 1a–1c:**
- Review the decisions list.
- Fix with targeted feedback ("tighten the chip padding to 12", not "make it nicer").
- Use Tweaks for global knobs (orb intensity, glass tint, density).
- Then **publish** the design system and save a ZIP export (per step 4).

---

## Prompt 2 · Direction pass (project: "Blend'n — direction")

Run this once, before the flows, on the journey that matters most.

```
Using the published Blend'n design system, design the core journey in 3 distinct directions so I can choose one. The journey:

The Pulse → tap an event → the Scene → I'm at the venue and the Blend'n button is in its check-in state → open Blend'n → Tonight with the VenuePass → hold to check in → the check-in moment → the Room → someone likes me back → the Match.

Read docs/redesign/SCREENS.md Flows 3 and 4 and docs/redesign/audit/audit-core-loop.md for what each screen must contain and every state.

Each direction must keep every rule in DESIGN-BRIEF §16 and §18 and differ only in the expressive layer:
- orb and glass strength;
- card composition;
- type drama;
- how the check-in and match moments feel.

**One direction must use no orbs at all**, carried by photography, type and the gradient alone.

For the check-in moment, show the "pour" (SCREENS Flow 4) and a smaller on-button version.

Frames: iPhone 402×874 pt, plus the Pulse and the Room at Android 412×915 dp. Use the real photos I uploaded, not placeholders. Make the check-in and match moments clickable prototypes with the real timings from §9.

Label each direction with a name and one sentence on its idea. State what each costs to build (new dependencies, GPU cost on a mid-range Android) using §15.
```

**After it answers:**
- Pick one direction.
- Ask Claude Design to fold its traits back into the design system ("Remix"), then republish.
- Write the choice and its reason into the design-system project's notes.

---

## Prompts 3–9 · One project per flow

One template, once per flow. Start a new project each time, with the published design system.

| Prompt | Flow (SCREENS.md) | Screens | Audit to read |
|---|---|---|---|
| 3 | Flow 4 · Core loop | tab bar, Blend'n overlay (Tonight, pass, Room, PersonCard, ConnectSheet, Match, Recap), Board, Going | `audit-core-loop.md` |
| 4 | Flow 3 · Discovery | home map + drawer (Events \| Places), Pulse, venue placeholder, Scene, Nearby, event preferences, rate | `audit-discovery.md`, `docs/PLACEHOLDER_SCREENS.md` §8–§10 |
| 5 | Flow 5 · Banter and chat | inbox, room chat, room info, DM | `audit-social.md` |
| 6 | Flow 6 · People and profile | Me, edit profile, user profile, friends ×4, invite landing, blocked | `audit-social.md` |
| 7 | Flow 2 · Onboarding | 8 steps + Bring your friends | `audit-entry-system.md` |
| 8 | Flow 1 · Launch and entry | landing, sign-in, forgot password (not the splash) | `audit-entry-system.md`, `audit-core-loop.md` §4 |
| 9 | Flow 7 · Settings and system | settings, about, support, toast/snackbar, the one sheet, banners, empty/error, skeletons | `audit-entry-system.md` |

```
Using the published Blend'n design system, design Flow <N> · <name> from docs/redesign/SCREENS.md.

For each screen:
- Read its entry in SCREENS.md and the matching section of docs/redesign/audit/<audit file>. The audit is the authority on what the screen does, its copy and its states; use the audit's exact copy. SCREENS.md is the authority on how it looks.
- Draw every state in its "Draw these states" list, not just the happy path.
- Use only design-system components and tokens. If you need something new, stop and propose it as a design-system addition first.
- Annotate each interactive element with its motion token and haptic token (DESIGN-BRIEF §9–§10).
- Keep every rule in its "Keep" list and in DESIGN-BRIEF §16, and design out every item in its "Fix while redesigning" list.

Frames:
- iPhone 402×874 pt for every state.
- Android 412×915 dp for the main state of each screen, applying DESIGN-BRIEF §13.
- One 360×800 dp check for the densest screen.

Use the real photos I uploaded. Make the main path a clickable prototype with real transitions.

Finish with:
(1) a table of every screen × state you drew;
(2) anything in the audit you couldn't fit, and why;
(3) any rule you think should change. Don't change it; ask.
```

**After each flow:**
- Review it, fix with targeted feedback, and save a ZIP (per step 4).
- Hand off **that flow** to Claude Code ("Send to local coding agent").
- Prefix the handoff prompt with the block in the handoff section below.

---

## Prompt 10 · Consistency audit (in the design-system project)

```
Review every flow project against the published design system, the checklist in docs/redesign/SCREENS.md Flow 8, and DESIGN-BRIEF §14, §16 and §18. Report drift as a table: screen · what drifted (type role, spacing, colour, radius, icon, glass misuse, a second gradient, a missing state, a missing Reduce Motion or orbs-off frame, a haptic outside the vocabulary, an item from the §18 avoid list, a contrast failure over the white test backdrop) · the fix. Then apply the fixes I approve.
```

---

## Handoff prefix (paste before Claude Design's handoff prompt in Claude Code)

```
Target: React Native 0.86 / Expo SDK 57, the Blendn client repo. Implement this flow's design by changing lib/theme.ts tokens and components/, not by hard-coding values in screens.

Rules:
- No web-only CSS: no font-feature-settings, hover, position: fixed, backdrop-filter.
- Glass goes through one Material component (DESIGN-BRIEF §5.4): expo-glass-effect on iOS 26+, expo-blur below that, the solid Tier B surface on Android until measured.
- Never animate opacity on a glass view or its ancestors. Never put a Reanimated layout transition on a view containing blur (tasks/lessons.md).
- Haptics go through one lib/haptics.ts with the DESIGN-BRIEF §10 table. On Android, only performAndroidHapticsAsync with the API-level fallbacks.
- Prices go through one Price component in Geist Mono.

Fonts:
- Satoshi files are never committed (the repo is public; ITF licence).
- Git-ignore assets/fonts/satoshi/.
- Builds get the files from an EAS file secret, or from the build Mac for ship:local.
- Jest mocks the font.

Old guards:
- scripts/check-design-tokens.js and the design tests encode the OLD system. Update them to the new rules in the same PR, naming each rule change in the description. Never delete a check without replacing it.

Definition of done:
- A screen is done only when its flow has been driven on the iOS simulator and an Android device.
- Every row it writes has been read back from the database.
- The PR states what was driven and what was read back. Green unit tests and a screenshot are not enough.
```

---

## Later · Splash and launch animation (decide after the redesign)

Not now. After the redesign, the owner decides whether Claude Design prototypes the launch sequence or Claude Code builds it directly. If Claude Design does it, use this:

```
Design the launch sequence for Blend'n as a timed prototype:
- the static native splash, which must be the animation's exact first frame;
- the monogram's entrance;
- the hand-off to the landing screen for signed-out users, and to the Pulse for signed-in users.

Use the vector monogram (docs/redesign/assets/blendn-monogram.svg) and the brand gradient.

Constraints:
- ≤2.2 s total, tap to skip.
- A Reduce Motion version (a fade of 300 ms or less).
- No sound.
- Android's system splash is one solid colour + one icon, so orbs can only appear after the hand-off.
- Today's sequence and its constraints are in docs/redesign/audit/audit-core-loop.md §6.6 and DESIGN-BRIEF §20.

Give me every timing and easing as numbers, frame by frame, so it can be rebuilt with Reanimated. There is no Lottie or video export.
```

---

# Round 2 · Delta prompts and new flows (2026-10-03)

Flows 1–8 are already built in Claude Design. Round 2 adds what was never designed:
- notifications
- crews and group matching
- Places live
- Blend'n+
- regulars
- matching v2
- system states
- sharing and link previews

It also changes some screens you've already approved. **Don't re-run the round-1 prompts.**
- **Delta prompts** are run *inside* an existing project and change only what they name.
- **New-flow prompts** start new projects.

What each screen must contain is in [`SCREENS-ADDITIONS.md`](./SCREENS-ADDITIONS.md). The system additions are in [`DESIGN-BRIEF.md` §21](./DESIGN-BRIEF.md).

**Before you start:**
- Re-attach the updated `docs/redesign/` folder to every project you'll touch (it now has `SCREENS-ADDITIONS.md` and `research/round2/`).
- Upload 2–3 screenshots of the phone's current notification shade and lock screen (iOS and Android, dark mode) so push frames match the real OS chrome.

## Order

1. **R2-D0** in the design-system project (the new components). Publish.
2. New flows that the server already serves:
   - **R2-9** Notifications
   - **R2-10** Crews
   - **R2-11** Places live
   - **R2-16** Sharing
   - **R2-15** System states
3. Deltas into the flows you've already built (they reuse the new components):
   - **R2-D1** core loop
   - **R2-D2** Banter
   - **R2-D3** profile
   - **R2-D4** discovery
   - **R2-D5** settings
   - **R2-D6** entry
4. Proposal flows (no server yet):
   - **R2-14** Matching v2
   - **R2-12** Blend'n+
   - **R2-13** Regulars
5. **R2-D7**: place the proposal pieces into the existing projects (only after step 4).
6. **Prompt 10** again: the consistency audit, now across every project.

---

## R2-D0 · Design-system additions (in "Blend'n — design system")

```
Round 2 adds screens that need new components. Read docs/redesign/DESIGN-BRIEF.md §21 (the additions) and skim docs/redesign/SCREENS-ADDITIONS.md so you know what they serve. Add only these, in the published system's existing language, without changing any approved component:

1. Notifications: Bell + badge (1–9, "9+"), NotificationRow (every leading-visual type in SCREENS-ADDITIONS 9.3: photo, creature disc, glyph tile, crew emblem, event cover + kind badge, stacked discs), the request-row variant with inline actions, NotificationSection header, InAppBanner (glass capsule), PushNotification mock frames (iOS lock screen and Android shade, dark).
2. Crews: CrewEmblem system (squircle × 12 palettes × 12 night motifs, seeded, no text; sizes 24/40/56/96/160; a page showing all 144 combinations at 40pt), CountTicks, CrewCard, LikingAsChip, BlendMoment, RevealSheet, RevealedCollage, CrewStrip.
3. Places live: GoLiveSheet (20/45/60/Stay), LivePill (minutes; mm:ss in the last 5), SessionSheet, ExpiryPrompt, the centre button's live-at-a-venue variants (§21), and LiveActivity and Android ongoing-notification mocks labelled "Sketch — later" (no action buttons).
4. Money and regulars (proposal styling): TonightSheet, PlanCard, NightPassRow, NeverForSalePanel, ManageStatusRow, OfferCard + "Why you got this", PassDisc ("the pour", with its states).
5. Matching v2: OverlapLine, Badge (achievement, never a count), ThisOrThat card.
6. System: StateScreen (one pattern for suspended, update required, maintenance, not found, no longer available), PollBubble (open / voted / closed, withheld counts).
7. Sharing: ShareSheet, LinkPreviewCard templates (OG 1200×630 and square), StoryCard (1080×1920), PublicEventPage and PublicVenuePage (web).

For each: every state, iOS and Android variants where they differ, Reduce Motion behaviour, haptic annotation. Before drawing the emblem system and the pass, show me 2 variants of each. Publish when I approve.
```

---

## New-flow prompts (one new project each, with the published design system)

Use this template. Fill in the flow number and name from the table.

| Prompt | Flow | Server status |
|---|---|---|
| R2-9 | Flow 9 · Notifications | Built |
| R2-10 | Flow 10 · Crews and group matching | Built (a new crew of one is currently dissolved by the server, so draw the forming state as blocked) |
| R2-11 | Flow 11 · Places live | Built |
| R2-15 | Flow 15 · System states | Built |
| R2-16 | Flow 16 · Sharing and link previews | Needs build (public pages and OG images) |
| R2-14 | Flow 14 · Matching v2 | Mostly proposal |
| R2-12 | Flow 12 · Blend'n+ | Proposal (no server) |
| R2-13 | Flow 13 · Regulars | Proposal (no server) |

```
Using the published Blend'n design system (with the round-2 additions), design Flow <N> · <name> from docs/redesign/SCREENS-ADDITIONS.md.

- The flow's "Rules" list is non-negotiable; most of it is the server's own behaviour or an owner ruling. Where the file quotes server copy, use it word for word, or show it beside the proposed copy and label which is which.
- Draw every state in every "Draw" list.
- **Screens that belong to an existing project are changed by a delta prompt, not here:** 9.1, 9.6, 10.7, 11.1, 11.6, 11.7, 14.1–14.3, and Flow 15 #5–11. For those, draw only the new components on an artboard; the delta places them into the approved screens. Don't redraw approved screens in this project.
- Frames: iPhone 402×874 pt for every state; Android 412×915 dp for the main state of each screen (DESIGN-BRIEF §13); push and lock-screen frames in both OS styles where the flow has them.
- If the flow is marked "proposal", label every frame "Proposal — not built" in the corner.
- Use real photos I uploaded, never placeholders. Crew emblems and creature avatars come from the design system.
- Annotate each interactive element with its motion and haptic token.
- Make the main path a clickable prototype.

Finish with:
(1) a screen × state table;
(2) the flow's open questions with your recommendation for each;
(3) anything you think breaks a rule. Ask, don't change.
```

---

## Delta prompts (inside the existing flow projects)

Use this wrapper around each delta:

```
Make only the changes listed below in this project. Keep every other screen and state exactly as I approved it. For each screen you change, show it before and after, side by side. If a change forces something I didn't list (spacing, another screen's state), stop and tell me instead of doing it. Read the SCREENS-ADDITIONS.md sections named for each change.

<the delta's list>
```

**R2-D1 · Flow 4 (core loop)**
- **The Room:**
  - a **People | Crews** segmented control;
  - the Crews view;
  - the crew strip;
  - "You're the first from Nebula";
  - the "Open to joining a crew tonight" card for solo people (10.7).
- **Check-in success:** a "Tell your crew — We're here" row per crew; sent and already-sent states (10.6).
- **PersonCard:**
  - "Like for Nebula" / "Like as yourself" when you're in a present crew (10.7);
  - the still "Waved" state (Flow 15 #18).
- **The Blend moment** as a sibling of the Match moment (10.8).
- **The centre button:** the live-at-a-venue variants (11.3; the Go Live invite is a proposal).
- **The Blend'n overlay:** the venue-room header variant; NOT_LIVE and every `live:ended` state (11.4–11.6).
- **Going:**
  - Past lists places you went live at, labelled by venue;
  - share from a row's overflow (16.1).
- **Check-in:**
  - the refusal-tray actions Finish profile / Add your age (Flow 15 #22);
  - after RSVP "Going", the "Bring someone?" share row (16.1) and the in-context push ask (9.7).
- **Offline banner** wherever it's missing in this flow (Flow 15 #16).

**R2-D2 · Flow 5 (Banter and chat)**
- **The inbox:**
  - crew chat rows (square emblem);
  - crew invites as request rows (Join opens the consent screen);
  - Blend rooms under Live now, then as rows with "closes 4 am";
  - the bell in the header opens the Notifications screen (9.1).
- **Crew chat:** first names, and only the two system lines (10.5).
- **The Blend room:** first-open card, two-sided people sheet, reveal sheet, closing, closed (10.9).
- **Room info** for crew and Blend rooms: no room report; crew report; leave (10.4, 10.9).
- **The composer:**
  - one state per server reason, including not_open_yet, not_live, hidden, archived;
  - banned;
  - mute arriving live (Flow 15 #6–7).
- **Room-level states:** removed from the room, the room is gone (Flow 15 #5); realtime cut by the server (#21).
- **The pre-event room:** the countdown header (Flow 15 #8).
- **Poll bubbles** (Flow 15 #17).
- **An ended DM:** remove the composer (Flow 15 #11).

**R2-D3 · Flow 6 (people and profile)**
- **Me:**
  - a Crews row (with an invite dot) and the Crews screen (10.1);
  - **Friends › Invite** opens the share tray (16.1).
- **Friends:**
  - "Make a crew" from the friends list (10.2);
  - the friend-link refusals (Flow 15 #19).
- **Edit profile:** expertise as step 2 of field of work (14.3, served today).
- **Offline banner** wherever it's missing in this flow (Flow 15 #16).

**R2-D4 · Flow 3 (discovery)**
- **The home top bar's bell** opens the Notifications screen (9.1).
- **Venue detail** replaces the placeholder, with share (11.1, 16.1). Places rows show the live bucket.
- **The home map lit** (11.7).
- **The Scene:**
  - Share opens the share tray (16.1);
  - the cancelled and "no longer available" states (Flow 15 #10);
  - the age-gated, finish-profile and broken-link refusals (#9);
  - field validation errors (#15);
  - the in-context push ask after RSVP (9.7).
- **The Pulse:** the one-time "You were sent Neon Nights" banner after onboarding from a shared link (16.7).
- **Offline banner** wherever it's missing in this flow (Flow 15 #16).

**R2-D5 · Flow 7 (settings and system)**
- **Settings:**
  - Notifications (9.6), with muted rooms;
  - How you match (14.4).
- **The one sheet:** crew report reasons, and the Blend block copy ("You won't see each other in this Blend, or in crews tonight. The Blend carries on for everyone else.", research/round2/research-crews.md §6.3).
- **System screens** from Flow 15 that live in this project's family:
  - not found (#12);
  - can't reach / maintenance (#13);
  - update required (#14);
  - rate limited (#15).

**R2-D6 · Flows 1–2 (entry and onboarding)**
- **The landing:** the account-suspended, staff-account and deleted-account screens; a reason-aware session-ended notice (Flow 15 #1–4).
- **Sign-in and onboarding:**
  - field validation errors (Flow 15 #15);
  - expertise as step 2 of field of work (14.3);
  - the in-context permission asks (9.7) don't change onboarding's own notifications step.
- **Links:** opened while signed out are held through sign-in (Flow 15 #12).

**R2-D7 · Proposal pieces into existing projects** (only after R2-12, R2-13 and R2-14 are drawn)
- **Flow 4 (core loop):**
  - the one-sentence overlap on PersonCard and crew cards (14.1, crew cards from crew tags and intent only);
  - the locked "earlier nights" row in Going › Past (12.4).
- **Flow 6 (profile):**
  - a "Passes & offers" row (13.1);
  - a Blend'n+ row (12.2);
  - badges (14.5);
  - the new matching fields with "who sees this" lines (14.2);
  - crew extras, locked: a crew photo seen only inside the crew, emblem colours from the 12 palettes (12.4).
- **Flow 7 (settings):**
  - Blend'n+ manage (12.3);
  - Privacy › Regulars (13.4);
  - Notifications › Offers from venues (13.3).
- **Flow 11 (Places live):**
  - "Stay" locked behind Blend'n+;
  - the expiry prompt's Plus row (11.4, 12.1).

---

# Round 3 · Fix the system, the small paths, and motion (2026-10-09)

Round 3 comes from reading the built Claude Design project against the app and the server. Everything is in [`ROUND3.md`](./ROUND3.md):
- **A:** rulings on every open question;
- **B:** fixes to the system;
- **C:** corrections to drawn frames;
- **D:** the screens and states nobody drew;
- **E:** motion pack 2;
- **F:** the server and client work that isn't design.

**Every prompt runs in the "Blend'n Design System" project.** That is where every flow was built (`guidelines/flow-N/`). Use the delta wrapper from Round 2 for every R3-D prompt.

**Before you start:**
- Re-sync `docs/redesign/` into the project from the `docs/redesign-brief` branch. It now has `ROUND3.md`, `research/round3-motion.md` and the `research/round2/` folder the project is missing.
- Hand off nothing to Claude Code until R3-0 is published. Today's export would build the app with Reduce Motion on for everyone (ROUND3 B1).

## Order

1. **R3-0:** fix the system, apply the rulings and the corrections. Publish.
2. **R3-1:** the component library, sent in groups P0 → P5.
3. **R3-2:** motion pack 2.
4. The deltas, in this order:
   - **R3-D4** core loop;
   - **R3-D5** chat;
   - **R3-D6** profile;
   - **R3-D3** discovery;
   - **R3-D7** settings;
   - **R3-D9** notifications;
   - **R3-D10** crews;
   - **R3-D1** entry and onboarding (it carries the never-run R2-D6);
   - **R3-D12/16**.
5. **R3-G:** Flows 11–14 aligned with what the server now serves.
6. **R2-D7** as written above. Its proposal flows are drawn now.
7. **R3-A:** accessibility frames, the icon inventory, the creature set.
8. **Prompt 10** again, across every flow.

## R3-0 · Fix the system, apply the rulings

```
Read docs/redesign/ROUND3.md parts A, B and C. Do these, in order, and show me each before moving on.

1. The token export (B1). Declare every Reduce Motion value as its own token in :root (e.g. --dur-quick-reduce-motion, @kind other). Make the prefers-reduced-motion block alias them with no @kind annotation, or move it to styles.css. Use 160ms, not 0, for the faded durations, and --shake-distance-reduce-motion: 0 instead of zeroing --dur-medium. Then show me _ds_manifest.json: --rise-list must read 8px, --dur-base 220ms and --orb-drift 24px, with the -reduce-motion tokens listed beside them. (--dur-quick can't show the bug: its Reduce Motion value is 160ms too.)
2. The missing tokens (B2): the 0.80 bar and sheet tint, the 0.86 blur tier, --dur-hold 900ms, the creature palettes (8), the venue-type plates and the map ramps.
3. tokens/tokens.json (B3), generated from the CSS: base motion values plus a separate Reduce Motion table, the seven springs as {stiffness, damping, mass: 1}, the type roles, the corrected kinds.
4. The rulings (A1–A4). Make the copy changes and removals their "Frames" column names, before and after side by side. Where it says "As drawn", change nothing. Draw no new frames here: N3, S2, C1 and C4 are drawn by R3-D9, R3-D12/16 and R3-D10. A5–A7 change frames only through the C rows and the R3-D prompts that cite them, except: remove any drawn organizer tools on the Scene (D1), goals on the profile edit screens (D3) and conversation pinning (D4).
5. The corrections (C, rows 1–21). Before and after.
6. The type floor (B8), the annotations (B9) and the rule drift (B10). List each change.
7. The project's records (B11). Renumber the duplicate decisions. Add log entries for Flows 13 and 14 and the deltas. Register the delta canvases as cards. Update github.md.

Don't redraw anything that isn't listed. If a change forces another, stop and ask. Publish when I approve.
```

## R3-1 · The component library (send one group at a time)

```
Prompt 1c was never run: _ds_manifest.json has components: []. Every component lives inside a flow builder and is copied from flow to flow. Read docs/redesign/ROUND3.md B4 and DESIGN-BRIEF §12 and §21.

Build canonical component pages for group <P0 | P1 | P2 | P3 | P4 | P5> from the B4 table. One page per component, registered as a card. Each page shows:
- default · pressed (iOS scale; Android ripple and squared corner) · focused · selected · disabled · loading · error, where they apply;
- iOS and Android;
- Reduce Motion · Reduce Transparency · Increase Contrast;
- text at 2.0× (1.3× cap inside fixed-height controls) and Bold Text;
- a 360 dp width;
- the haptic token (or "none"), the screen-reader label and the reading order.

Lift each component from the flow builder that draws it best (B4 names the copies). Then point every flow at the canonical version and delete the copies, without changing how any approved frame looks. If unifying two copies would change an approved frame, show me both and ask.

Finish with a table: component · page · states drawn · the flow copies it replaced.
```

## R3-2 · Motion pack 2

```
Read docs/redesign/ROUND3.md part E and research/round3-motion.md. The principle: alive through change, calm otherwise. Nothing loops except the orbs, the typing dots while someone types (#14), and the door pass's wave (§21.5).

1. Add a motion card for each of #25–#53, in the same format as cards 01–24:
   - the storyboard with real timings, and the spec;
   - the haptic token;
   - the Reduce Motion version, playable;
   - the Android difference.
2. Don't add them to any flow's prototype yet. Each flow's R3-D prompt does that, inside the delta wrapper, once the frames they animate exist.
3. Draw the three time-of-night orb sets for #53 as assets, with the orbs-off frame unchanged.
4. Draw the "Rejected" list from part E as one card, so nobody adds those later.
```

## R3 delta prompts

Each goes inside the Round 2 delta wrapper. The sections named are in [`ROUND3.md`](./ROUND3.md) part D.

**R3-D4 · Flow 4 (core loop)**
- **4.1 · The PersonCard from every entry point:**
  - every variant (a–h) and every state in the table;
  - View profile;
  - motion #33.
- **4.2 · Responding to a wave:**
  - the tappable dock row and toast;
  - "Waved at you · 2 min";
  - Wave back.
- **4.3:** like and wave refusals, with no haptic.
- **4.4:** the Match moment in three identity pairings.
- **4.5:** "People from tonight" from the Recap.
- **4.6:** the event cancelled while you're inside.
- **4.7:** precise location off at the door, iOS and Android.
- **4.8:** checking in elsewhere.
- **4.9:** multi-day on Tonight and the pass.
- **4.10:** the Board's ⋯ sheets, and a post taken down.
- **Prototype:** add motion #25, #33 and #51 to the Flow 4 prototype.

**R3-D5 · Flow 5 (Banter and chat)**
- **5.1:** tap the sender: avatar, name, long-press row, Block from a message.
- **5.2:** the long-press menu for every kind of message in the table, iOS and Android.
- **5.3:** keyboard up, the composer at 1/3/5 lines, the counter, Android resize.
- **5.4:** spam and rate limits.
- **5.5:** sponsored video.
- **5.6:** the Banter preview table.
- **5.7:** the safety sheets: request ⋯, report sent, "Something else".
- **5.8:** failed and draft rows; sending offline.
- **5.9:** photos in DMs.
- **5.10:** the contact-details warning (needs server; label it).
- **5.11:** swipe actions, links, emoji-only.
- **5.12:** room-info members open the card.
- **Prototype:** add motion #27, #35, #36 and #37 to the Flow 5 prototypes.

**R3-D6 · Flow 6 (people and profile)**
- **6.1:** the anonymous profile, as the server sends it.
- **6.2:** a received message request on a profile.
- **6.3:** the photo path, every step in the table.

**R3-D3 · Flow 3 (discovery)**
- **3.1:** the event changed while you're going, on the Scene and in Going.
- **3.2:** multi-day events.
- **3.3:** the venue page loading and failed; leave the waitlist.
- **Prototype:** add motion #45 to I'm going.

**R3-D7 · Flow 7 (settings and system)**
- **7.1:** the Account card: signed in as, Password, Sign out of every device.
- **7.2:** Grievances on About; "Get a copy of your data".

**R3-D9 · Flow 9 (notifications)**
- **9.1:** the wave banner.
- **9.2:** a report acted on.
- **9.3:** the app-icon badge on both home screens.
- **9.4:** copy rulings N2 and N6.

**R3-D10 · Flow 10 (crews)**
- **10.1:** the reduced person sheet in crew chat and the Blend room (needs server; label it).
- **10.2:** the reveal line in crew chat.
- **10.3:** a dissolved crew or a closed Blend leaves the Banter: replace the drawn read-only "Archived" and "Closed" states with Flow 15 #11's cards.
- **Prototype:** add motion #45 to Join.

**R3-D1 · Flows 1–2 (entry and onboarding)**
- **1.1:** everything in R2-D6 above. It was never run.
- **1.2:** the password-reset web pages: entry, dead link, done for an attendee.
- **2.1:** "Looking for" becomes intent (Dating · Friendship · Networking · Just here for the event).
- **2.2:** expertise as step 2 of field of work.
- **2.3:** the pulled photo tile.

**R3-D12/16 · Flows 12 and 16**
- **12:** see R3-G below.
- **16:** each public page in its "listings not public" variant.

## R3-G · Flows 11–14: align with what the server now serves

Run after R3-0, inside the delta wrapper. Blend'n+, regulars and matching v2 were built after Round 3, so these frames move from "Proposal — not built" to built, where ROUND3 part G says so.

```
Read docs/redesign/ROUND3.md part G. For each row whose "Design change" isn't "As drawn", change the frames it names, before and after side by side:
- Flow 11: the expiry prompt's copy (45 min).
- Flow 12: all four plans ("3 months", not "Quarterly"), Night Pass · 24 hours, the server-granted trial with nothing renewing, "What you get" as built (perks and crew extras "Coming soon"). Keep the Tonight sheet and its preselection: the client builds them.
- Flow 13: the door pass with the rotating code and its 30-second ring (no staff hold, no tonight's word), the four pass states, "Why you got this" for regulars only, the visible-regular line without a photo, Report and Stop offers from {venue} under ⋯, the offline pass.
- Flow 14: label counts before and after a reveal, the server's overlap sentences, the three-a-day refusal, the "Show my badges" switch, the room-under-8 state, the crew badge as a tier.
Remove "Proposal — not built" from every frame that is now built; keep it on artists, the icebreaker, the match band and Wrapped.
```

## R3-A · Accessibility, icons, creatures

```
Read docs/redesign/ROUND3.md B5–B7.

1. Accessibility frames (B5). Draw:
   - the tab bar, the VenuePass, the composer and the PersonCard at 200% text on a 360 dp screen;
   - the tab bar, a sheet and the Room under Reduce Transparency, Increase Contrast and Bold Text;
   - the screen-reader order for the Room, a chat and the PersonCard, as numbered overlays.
2. The icon inventory (B6). One page with every Lucide glyph the project uses: name, sizes used, where. One name per glyph. Redraw the filled zap as an outline.
3. The creature set (B7). Show me 2 variants first, then the set:
   - one creature per noun group the client maps (read lib/pseudonymAvatar.ts);
   - outlined, at the monogram's stroke;
   - legible at 24 pt;
   - on the 8 palettes as tokens.
   Then replace the stock Lucide animals in every flow.
```

## Handoff prefix: two lines to add once R3-0 is published

Add to the "Rules" list of the handoff prefix above:

```
- Tokens come from tokens/tokens.json (base motion values; Reduce Motion is a separate table read through useReducedMotion()), never from the frames' literals or the manifest.
- Before building, check that the manifest's --rise-list reads 8px and --dur-base 220ms. If either reads its Reduce Motion value, stop: the export still carries the Reduce Motion values as defaults.
```

---

# Round 4 · One source of truth, check-in end to end, first-run tips (2026-10-15)

Round 4 comes from building the app on the published project. Everything is in [`ROUND4.md`](./ROUND4.md):
- **1:** rulings on the questions the build raised;
- **2:** why the project tells implementers two or three things about the same component, and the fix;
- **3:** check-in from the hold to the Room, as timed frames;
- **4:** first-run tips (coach marks) and the Help › Tips screen;
- **5:** the 154 conflicts, with evidence and a fix each;
- **6:** the 54 screens and states the app reaches that no frame draws;
- **7:** four server changes behind frames that are already drawn.

**Every prompt runs in the "Blend'n Design System" project.** Use the Round 2 delta wrapper for every R4-D prompt.

**Before you start:** re-sync `docs/redesign/` into the project from `dev` (the same files are on `docs/redesign-brief`). It now has `ROUND4.md`.

## Order

1. **R4-0:** one source of truth, the rulings, and the system rows of Part 5. Publish.
2. **R4-1:** check-in end to end.
3. **R4-2:** coach marks and Help › Tips.
4. **R4-3:** the component pages and motion cards, rebuilt from the builders, one group at a time.
5. **R4-D:** the missing states, flow by flow, in the order the client is being rebuilt: Flow 4 → 5 → 3 → 6 → 10 → 11 → 12 → 13 → 7 → 1.
6. **Prompt 10** again, across every flow.

## R4-0 · One source of truth, the rulings, the system

```
Read docs/redesign/ROUND4.md parts 1, 2 and 5. Do these in order, and show me each step before moving on.

1. Fold every delta into the builder it patches (part 2). For each R2-D*, R3-0, R3-D* and R3-G "after" that calls an approved builder and patches it, move the change into that builder. Then delete the "before" frames, the text-scrubs (for example the C1 "walked in" scrub in five files) and the round3/r3g.js wrapper. When you finish, a flow, its component page and its motion card should all call one builder. List each builder you changed and the frames that changed as a result; any frame that changes in a way a delta didn't ask for, show me before and after.
2. Apply the rulings R1–R14 (part 1). Before and after for every frame that changes.
3. Regenerate tokens/tokens.json from the CSS and fix part 5 B10–B14, B19 and B27: raw colours, sizes, spacing and durations become tokens. Add the missing tokens B12 names. Then show me _ds_manifest.json: --rise-list 8px, --dur-base 220ms, --dur-hold 900ms.
4. Fix the rule breaks in part 5 B (glass, the type floor, contrast, targets, designer notes drawn as copy). Use the fix column in each row.
5. For every other part 5 row whose fix says "pick one" or "decide": take the row's "Chose" column, unless it breaks a rule in DESIGN-BRIEF.md or ROUND3, in which case follow the rule. List the rows and what you took.

Don't redraw anything that isn't listed. If a change forces another, stop and ask. Publish when I approve.
```

## R4-1 · Check-in end to end

```
Read docs/redesign/ROUND4.md part 3 and rulings R2 and R3. On the Flow 4 canvas, draw check-in as one sequence of timed frames, iOS and Android, each labelled with its timestamp and the token or haptic that fires:

1. The hold on the docked pass, exactly as the Flow 4 frames draw it (no quarter marks): 0, 225, 450, 675 and 900 ms, with the H.tick and H.commit annotations and "Checking you in…" at commit (R3). Redraw motion cards #8 and #10 on this pill and remove #8's quarter marks.
2. The pour inside the docked pass: server OK, +200 ("You're in." fading in), +700.
3. No question: the Room at +700 (motion #9).
4. With a question: +400, +1200, cleared at +1820, then the reveal sheet over Tonight with the checked-in pass behind it, then intent, then the Room. Draw it with both questions due, with one, and with neither. A backdrop tap is "no" or "skip".
5. The Room isn't ready at +700: the pour holds, filled, up to 4 s, then hands off to the Room skeleton. A tap skips.
6. Checking in from the event page: Blend in opens Blend'n at Tonight with that pass docked; the same sequence; closing the Room returns to the event page reading "You're in".
7. Already checked in: no pour, straight to the Room.
8. "Tell your crew · We're here" at the top of the Room, until it's sent or for 10 minutes.
9. Reduce Motion: the same order and holds, with 200 ms crossfades; the haptics are kept.

Then update motion card #9 to show both endings (Room at 700; the question path), and retire the other three drawings of the pour (ROUND4 part 5 A4).
```

## R4-2 · Coach marks and Help › Tips

```
Read docs/redesign/ROUND4.md part 4 and the CoachMark component page. Draw each coach mark in the inventory in place, on its own screen, as the frame where it first appears: the caret on what it names, iOS and Android, at 200% text, and Reduce Motion (no pop). Use the sentence from the table word for word.

Then draw Settings › Help › Tips in Flow 7: a plain list of every coach-mark sentence, grouped by screen.

Don't add a coach mark for anything a person can already see or read. If you think a screen needs one that isn't in the inventory, list it with your reason and ask; don't draw it.
```

## R4-3 · Component pages and motion cards (send one group at a time)

```
Read docs/redesign/ROUND4.md part 5 A and D. For group <P0 | P1 | P2 | P3 | P4 | P5>: rebuild each component page from the builder the flows now call (after R4-0), so the page can't drift from the flows again. Apply every A and D row that names a component in this group. Rebuild each motion card that draws one of these components on the real component: it shows timing, haptics and Reduce Motion, not a second drawing. Finish with a table: component · rows applied · what changed on the page.
```

## R4-D · The missing states (inside the delta wrapper)

Each one goes inside the Round 2 delta wrapper. The rows are in [`ROUND4.md`](./ROUND4.md) part 6. Each row names the nearest frame to extend and the client `file:line` that reaches the state.

**R4-D4 · Flow 4 (core loop):**
- every Flow 4 row in part 6 A.1: the chat dock when the event's chat isn't open, "Ended" in Going, taking down a Board post, the Board ask end lines, and the two location trays;
- the Flow 4 toasts and trays in A.2;
- the 4.8 leftover in part 6 B: "You checked in somewhere else." on the venue composer.

**R4-D5 · Flow 5 (Banter and chat):**
- every Flow 5 row in A.1: "You're not in this room" and the Rejoin outcomes, Room info and the Banter row for a place's room, the already-muted sheet, loading older messages, and DM loading, trays and withheld-at-send;
- the 5.9 leftover: the two photo refusals as drawn frames.

**R4-D3 · Flow 3 (discovery):**
- every Flow 3 row in A.1: the Scene's organizer-written sections (house rules, FAQ, accessibility, cancellations) as attendee-facing text, the report-event reasons, the map's name chips, locate button and credits, and the city skyline art;
- the Flow 3 toasts and trays in A.2.

**R4-D6 · Flow 6 (people and profile):**
- every Flow 6 row in A.1: the edit-profile load failure, the remove-photo confirm, the Education and Phone fields, the About line on a revealed profile, and `/edit-about-you`;
- the Flow 6 toasts in A.2;
- the stock Lucide cat on the empty photo stack (R3-A 3 leftover): use the creature set.

**R4-D10 · Flow 10 (crews):**
- every Flow 10 row in A.1: crews screen and crew detail loading and failed, the decline-invite confirm, "We're here" before check-in, the Room's Crews view states, crew chat after removal, and the Blend room after leaving;
- the Flow 10 toasts in A.2.

**R4-D11 · Flow 11 (Places live):**
- the Go Live refusals (weak GPS, rate limit, timeout, not found, Stay locked);
- the venue page refused before it loads;
- one-tap "Go live again";
- Stop being live, confirmed (R12).

**R4-D12 · Flow 12 (Blend'n+):**
- prices loading, failed and unavailable;
- waiting for the store to confirm;
- store errors;
- restore outcomes;
- the status read failing.

**R4-D13 · Flow 13 (regulars):**
- the offer screen loading, failed and 404;
- the report's reason step (R13);
- "let them know" refused;
- the venue page's "No offers from {venue}" switch.

**R4-D7 · Flow 7 (settings and system):**
- a sign-out the server didn't confirm;
- deleting an account while a subscription runs;
- the crash screen with no mail app;
- Help › Tips (from R4-2), if it isn't drawn yet.

**R4-D1 · Flow 1 (entry):**
- Forgot password: Resend refused on "Check your inbox".

**Match page:** replace the stock Lucide cat in `components/sets.js` with the creature set (R3-A 3 leftover).

---

# Round 4.1 · Finish Round 4 (2026-10-16)

The project after Round 4 was read file by file. Most of the round landed: the folds, the rulings, check-in end to end, the coach marks and the 159 missing states. [`ROUND4.md` part 8](./ROUND4.md#8--round-41-finishing-round-4-2026-10-16) lists what's left. **The client build restarts once all of Round 4.1 is published.**

**Every prompt runs in the "Blend'n Design System" project.** There is no delta wrapper this round: R16 retires it. Each change edits the approved builder, and the flow canvas shows the result.

**Before you start:** re-sync `docs/redesign/` from `docs/redesign-brief` (or `dev`). Then check it carries the no-quarter-marks ruling: `ROUND4.md` R3 says "No quarter marks", and the last sync missed that by 20 seconds. Check it also has R15, R16 and part 8.

## Order

1. **R4.1-0:** quarter marks out; the standing rule reversed.
2. **R4.1-1:** retire the delta canvases, one canvas per flow.
3. **R4.1-2:** inside more than one place.
4. **R4.1-3:** the Flow 4 prototype and the Pulse coach mark.
5. **R4.1-4:** R4-3 cell by cell, and the part 5 rows that need drawing.
6. **R4.1-5:** Prompt 10 across every flow. Publish.

## R4.1-0 · Quarter marks out, the rule reversed

```
Read docs/redesign/ROUND4.md ruling R3 and part 8.1. The hold has no quarter marks. Remove them everywhere they are drawn or described: JU.hold in journey/ui.js (the marks and the comment), F4C.hold in flow-4/flow4-checkin.js, the Flow 4 canvas's "Check-in end to end" group (refs text and frames 01–04), motion #8 and #9b, the HoldToConfirm page, and round4/Status.html. Keep every H.tick annotation at 225 / 450 / 675: they are haptics, with nothing drawn.

Then replace the "Deltas" section of the project's CLAUDE.md with ROUND4 part 8.2's rule: a change edits the approved builder, the flow canvas shows the result, old states are deleted, and anything the prompt didn't name is listed and asked about first.

Show me the hold at 0, 450 and 900 ms afterwards.
```

## R4.1-1 · Retire the deltas: one canvas per flow

```
Read docs/redesign/ROUND4.md ruling R16 and part 8.2.

1. For every Delta R2-* and R3-* canvas: confirm each "after" is now drawn by an approved builder on its flow canvas. If any isn't, fold it into the builder first and tell me which. Check R2-D7 in Flows 4 and 11 especially. Then delete the canvas and its card page.
2. Move the four compositions onto their flow canvases as ordinary groups, drawn from the builders:
   - R3-D5's gestures and keyboard (Flow 5);
   - R3-D9's wave banner (Flow 9);
   - R3-D16's share sheet over the Scene (Flow 16);
   - R3-D10 10.1's person sheet over a crew chat (Flow 10).
3. Fold every Delta R4-D* canvas into its flow canvas as groups titled by their part 6 row ids, then delete the R4-D canvases and cards.
4. Delete the helpers nothing uses any more: round2/delta-canvas.js, round2/r2d7.js, and the flow*-delta.js and flow*-r3d*.js alias files. Move R3.mark into journey/ui.js or components/.
5. Update round4/Status.html and github.md.

When you finish, each flow is one canvas, one builder file and its prototype. List every file you deleted and every group you added.
```

## R4.1-2 · Inside more than one place

```
Read docs/redesign/ROUND4.md ruling R15 and part 8.3. The server allows overlapping fences (two events at one venue, venues sharing a building) but only one room at a time. Nothing in the project draws being inside two places.

Add a group "Inside more than one place" to the Flow 4 canvas, iOS and Android, drawn from the approved builders (F4.tonight, the VenuePass, the Sheet, the disc). Draw the eight frames in part 8.3:
- Tonight inside two places, with "2 here · Switch";
- the chooser sheet;
- the disc's "Check in · 2 here";
- two events at one venue;
- a venue and an event at the same place;
- already in a room ("Hold to switch", "You left Vinyl Night");
- approximate location;
- Reduce Motion.

Annotate that swiping the deck never moves the pass. Mark the chooser "Needs server" (SCRUM-704). Show me the chooser and the pass before drawing the rest.
```

## R4.1-3 · The Flow 4 prototype and the Pulse coach mark

```
Read docs/redesign/ROUND4.md part 8.4.

1. Rebuild flow-4/flow4-proto.js on F4C.pour inside the docked pass, not JM.flood. Play both endings: the Room at +700, and the question path ("You're in." held to +1600, cleared by +1820, then the reveal and intent sheets, then the Room). The hold has no quarter marks. Then retire JM.flood and pourStill.
2. Draw the Pulse coach mark when its sentence wraps to two lines, and on a 360 dp screen. Today it covers about 24 pt of the search bar. Say where it goes when it doesn't fit above the first card.
```

## R4.1-4 · Component pages cell by cell, and the rows left to draw

Run the existing **R4-3** prompt above, one group at a time (P0 → P5). Then:

```
Read docs/redesign/ROUND4.md part 8.5 and part 5. Draw each part 5 row that needs new drawing, using its fix column: A18, A19, A31, A37–A39, A44, A45, A53, A55, A56, A59–A63, A65–A67, A71–A73, A75, A77, A78, A80, A81, A85, A87, A88, B2 (give "You're in." a type role), B5–B9, B13, B14, B17, B20, B21, B23, C7, C9–C12, D17 (the PersonCard page in full) and D19, D24. Where a row's fix says "pick one", take what ROUND4's opening rule says. Finish with a table: row · what changed · where.
```

## R4.1-5 · Consistency audit, then publish

Run **Prompt 10** across every flow. Then update `round4/Status.html` so its "Still open" list is empty, or lists only "Needs server" items. Publish.
