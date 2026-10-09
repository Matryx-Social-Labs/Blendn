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
5. **R2-D7** as written above. Its proposal flows are drawn now.
6. **R3-A:** accessibility frames, the icon inventory, the creature set.
7. **Prompt 10** again, across every flow.

## R3-0 · Fix the system, apply the rulings

```
Read docs/redesign/ROUND3.md parts A, B and C. Do these, in order, and show me each before moving on.

1. The token export (B1). Declare every Reduce Motion value as its own token in :root (e.g. --dur-quick-reduce-motion, @kind other). Make the prefers-reduced-motion block alias them with no @kind annotation, or move it to styles.css. Use 160ms, not 0, for the faded durations, and --shake-distance-reduce-motion: 0 instead of zeroing --dur-medium. Then show me _ds_manifest.json: --rise-list must read 8px, --dur-base 220ms and --orb-drift 24px, with the -reduce-motion tokens listed beside them. (--dur-quick can't show the bug: its Reduce Motion value is 160ms too.)
2. The missing tokens (B2): the 0.80 bar and sheet tint, the 0.86 blur tier, --dur-hold 900ms, --dur-hold-staff 1000ms, the creature palettes (8), the venue-type plates and the map ramps.
3. tokens/tokens.json (B3), generated from the CSS: base motion values plus a separate Reduce Motion table, the seven springs as {stiffness, damping, mass: 1}, the type roles, the corrected kinds.
4. The rulings (A1–A4). Make the copy changes and removals their "Frames" column names, before and after side by side. Where it says "As drawn", change nothing. Draw no new frames here: N3, S2, C1 and C4 are drawn by R3-D9, R3-D12/16 and R3-D10. A5–A7 change frames only through the C rows and the R3-D prompts that cite them, except: remove any drawn organiser tools on the Scene (D1), goals on the profile edit screens (D3) and conversation pinning (D4).
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
- **12:** remove Quarterly and Yearly from the page and Manage.
- **16:** each public page in its "listings not public" variant.

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
