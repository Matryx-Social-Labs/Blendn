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
