# Round 3: what the built design still misses, and making it feel alive (2026-10-09)

The third part of the pack. Written after reading the published Claude Design project ("Blend'n Design System": Flows 1–16, the round-2 deltas D1–D5, the motion cards, the decision log), file by file, against:
- the client, `origin/dev` `393ab46`;
- the server, admin `origin/dev` `ac4a485`.

Five reviews:
- tapping a person and connecting;
- everything inside a chat;
- every route and server state against a drawn frame;
- motion and aliveness;
- the component library and the handoff to code.

What this file holds:

| Part | What | Prompts |
|---|---|---|
| [A](#a--rulings-every-open-question-decided) | Rulings: every open question, decided | R3-0 applies them |
| [B](#b--fix-the-system-first) | The system: a token bug that would ship a motionless app, the missing component library, accessibility frames, drift | R3-0, R3-1, R3-A |
| [C](#c--corrections-drawn-frames-that-contradict-the-server-or-a-rule) | Corrections: drawn frames that contradict the server or a rule | R3-0 |
| [D](#d--new-screens-and-states-by-flow) | New screens and states, flow by flow: the small paths nobody drew (tap a person in the chat, wave back, the long-press menu…) | R3-D… |
| [E](#e--making-it-alive-motion-pack-2) | Making it alive: motion pack 2 (#25–#53) | R3-2 |
| [F](#f--not-design-server-and-client-follow-ups) | Not design: server and client follow-ups | — |

**Authority.** Where this file rules on something, it wins over `DESIGN-BRIEF.md`, `SCREENS.md` and `SCREENS-ADDITIONS.md`. Everything it doesn't mention stands.

**How the project is organised (this changes the prompts).** Every flow was built inside the one design-system project as `guidelines/flow-N/`, not one project per flow. So every Round 3 prompt runs in that project. The delta wrapper still applies: change only what's listed, before and after side by side.

---

## A · Rulings: every open question, decided

The owner asked for the recommendations to be taken (2026-10-09). "As drawn" means the project already shows it.

### A1 · Notifications (Flow 9)

| # | Question | Ruling | Frames |
|---|---|---|---|
| N1 | The server's "Message request declined" push and bell row | **Dropped, both.** No declined state, anywhere. | As drawn (not drawn). **Server change** (F). |
| N2 | A crew's user-typed name as a lock-screen title | **Never.** No user-typed text on a lock screen: "Your crew's here" / "Someone from your crew is here." | Flow 9 copy table and lock screens. |
| N3 | What the app-icon badge counts | **Unseen bell rows + conversations with unread messages**, one per conversation; muted rooms excluded. | Flow 9: an iOS home-screen and an Android launcher frame. |
| N4 | A message request's sender on the lock screen | **Nameless.** "Message request" / "Someone wants to message you." The name shows in the app. | As drawn (proposed copy). |
| N5 | Title or sentence case | **Sentence case.** | As drawn. |
| N6 | Names on the lock screen for DMs and room replies | **Nameless for every kind, friends included.** "New message" / "2 new messages"; "Reply in your room" / "Someone replied to you." Crew and Blend replies open their own rooms. | Flow 9: the proposed column becomes the only column. |

### A2 · Crews (Flow 10)

| # | Question | Ruling | Frames |
|---|---|---|---|
| C1 | A line in crew chat when someone reveals the crew | **Yes:** "{First name} revealed Nebula in tonight's Blend." People are named inside a crew already. | 10.5: a third system line. Needs server. |
| C2 | Is a moderator-hidden crew told? | **Yes**, as drawn (10.4 #12). | As drawn. |
| C3 | 1:1 DMs or friend requests out of a Blend | **Not in v1.** The reveal shows a first name and a photo; people meet in the room. | None. |
| C4 | Archived crew chats and closed Blends | **Both leave the Banter when they close**: a dissolved crew at once, a Blend at its close (12 h after the event ends). That is what the server does; nothing is readable afterwards. A stale link shows Flow 15 #11's card. | Correction C21: the drawn read-only "Archived" and "Closed" states go. |
| C5 | Keep the word "Blend" | **Keep.** | None. |

### A3 · Places live, Blend'n+ and regulars (Flows 11–13)

| # | Question | Ruling | Frames |
|---|---|---|---|
| P1 | Staff redeem a door pass by tap or by hold | **A 1-second hold**, as drawn, with a single activation for screen readers. It replaces the earlier "tap": a pocket tap can't spend a one-use pass. | As drawn. |
| P2 | Night Pass product type | **A one-off, not a subscription.** Google Play: a one-time product. App Store: a non-renewing subscription. Both through RevenueCat; confirm against the store guidelines when built. | None. |
| P3 | Trial length | **14 days**, reminder on day 12, as drawn. | As drawn. |
| P4 | Plans on offer | **Monthly ₹199 and Night Pass ₹49 only at launch.** Quarterly and yearly were never priced by the owner. | Flow 12 page and Manage: remove Quarterly and Yearly. |
| P5 | Default selection | **Monthly** on the page, **Just tonight** in the Tonight sheet. | As drawn. |
| P6 | The expiry prompt | Free extend is the gradient primary; Blend'n+ a solid secondary; **never on a night's first Go Live.** | As drawn. |
| P7 | Tonight's word on the pass | **Keep**, 12% tint. | As drawn. |
| P8 | The centre button while live at a venue | **Variant 1, the plain full disc.** The time lives in the live pill. The fill already means "you can check in here"; a second meaning on it confuses both. | Flow 11 disc board: mark variant 2 "Rejected". |
| P9 | (c′) "Go live · Toit" on the disc | **Later.** It needs venue check-in areas on the client. | Stays a proposal. |

### A4 · Sharing (Flow 16)

| # | Question | Ruling | Frames |
|---|---|---|---|
| S1 | The organiser's name on public pages | **The organisation's name only** ("Hosted by Toit Live"), never a person's; "Added by Blend'n" when the platform added it. | As drawn. |
| S2 | Store badges and the Smart App Banner | **Hidden until the store listings are public.** Until then the page has "Open in Blend'n" only. | Flow 16: a "listings not public" variant of each page. |
| S3 | A Meta app for native Story stickers | **Not now.** The Story card goes out as an image with the link copied first, as drawn. | As drawn. |

### A5 · "Decide, then draw or delete" (Flow 15)

| # | Item | Ruling |
|---|---|---|
| D1 | Organiser tools on the Scene | **Deleted** from the attendee app. Organisers use the dashboard. |
| D2 | `/preview` screens in production | **Dev builds only.** |
| D3 | `goals` / `looking_for` (edited, read by nothing) | **One field: intent.** Onboarding's "Looking for" tiles become the intent matching reads: Dating · Friendship · Networking · Just here for the event. Travel and Open go; `goals` leaves the edit screens. |
| D4 | Conversation pinning | **Cut.** |

### A6 · The designer's flagged decisions (decision log, "Conflicts flagged")

| # | Decision | Ruling |
|---|---|---|
| F1 | Toggle on = white track, ink thumb (2) | **Approved.** |
| F2 | 80% ink under bar and sheet glass, 60% under toasts (3) | **Approved** (measured). Make them tokens (B2). |
| F3 | The Pulse title's orange word on glass (29) | **Removed.** "The Pulse" is all white; colour on glass belongs to the one primary. |
| F4 | HoldToConfirm's resting label in `textSecondary` (30) | **Approved.** |
| F5 | Check out's confirm in `destructiveFill` (40) | **Approved.** |
| F6 | `H.success` on Accept friend request (86) | **Approved**: it fires on the server's answer. |
| F7 | Blocked users as creature marks (88) | **Approved.** |
| F8 | The location step's fence sentence (103) | **Approved**, while it never states a distance. |
| F9 | Three orbs defined, two visible | **Approved.** |

### A7 · New rulings the reviews needed

| # | Question | Ruling |
|---|---|---|
| R1 | What a tap on a person opens | **The same PersonCard from every room surface**: a grid face, a Meet next card, a chat avatar or name, a long-press, a room-info member, the wave's dock row, the wave banner. Crew and Blend members open a reduced sheet (D · 10.1). |
| R2 | What a wave is | **A live moment, nothing more:** no row, no push, no history (the server's design). **Wave back is allowed.** No "mutual wave" outcome. The old bell row "Night Cat waved at you" is deleted (C9). |
| R3 | "While you're in the Room" (§21.1) | **Means checked in**, overlay open or not. A wave that arrives with the overlay closed shows as an in-app banner. |
| R4 | A haptic when a like or wave is refused | **None.** A refusal about another person never carries `H.error`; it must not feel like rejection. `H.error` stays for refusals about you (a form, your check-in). |
| R5 | People after the night | **Yes:** Recap gets "People from tonight", pseudonyms marked "Was here", with Like and Message, until the room's chat closes (24 h after the end). The server already allows both. |
| R6 | A friend in the room | **Only when the room already names them to you** (they turned on "Friends can see who I am in rooms", or revealed here): labelled "Friend", Message opens your friend DM, no Like. **Any other friend is a stranger here:** the ordinary card, Like included, and nothing marks them. Being friends is not consent to being recognised. |
| R7 | "Add friend" from a revealed match | **No.** Friends arrive by invite link only (§16). |
| R8 | View profile before a reveal | **Stays**, showing only what the server sends: pseudonym, age, city. |
| R9 | Photos in chat | **DM photos only, once both people have revealed (or are friends), images only** (no GIF, video or audio). **No attendee media in event rooms**; the server must refuse it. |
| R10 | Links in chat | **Tappable, through a sheet that names the domain.** Never a link preview: fetching one would hand the poster the reader's IP address from an anonymous room. |
| R11 | A mute's countdown | **Dropped.** The server sends no end time and lifts an automatic mute only on the next send. The copy says "an hour", no ticking clock. |
| R12 | iPad | **Tablet support off for v1** (`supportsTablet: false`). No iPad frames. |
| R13 | Rate the app | **The system prompt only, after a Recap with a match.** No custom pre-prompt. |
| R14 | Grievances and a copy of your data | **A Grievances row on About** (name and grievance@ address; IT Rules 2021 r.3(2)). **"Get a copy of your data"** opens a support email until an export exists. |
| R15 | Tab-bar minimise on scroll (iOS 26) | **Later (v2).** |
| R16 | Time of night | **Yes, as change, not loops:** pre-rendered orb sets swapped at launch and on foreground (motion #53), and copy built from real times ("Early. Doors from 8."). Never urgency the data doesn't support. |
| R17 | Room "breathing", incoming reaction bursts, confetti | **No.** They loop, arrive unsolicited, or make motion carry state. |

---

## B · Fix the system first

### B1 · The token export ships a motionless app (blocker)

`tokens/motion.css` has the right values. Its `@media (prefers-reduced-motion: reduce)` block repeats ten declarations **with the `/* @kind */` annotation**. The manifest compiler reads every annotated declaration as a token, and the last one wins. So `_ds_manifest.json`, which the Claude Code handoff reads, lists the Reduce Motion values as the defaults:

| Token | Base (correct) | In the manifest |
|---|---|---|
| `--dur-quick` / `--dur-medium` | 160 / 320 ms | 0 / 0 ms |
| `--dur-base` / `--dur-long` | 220 / 520 ms | 200 / 200 ms |
| `--rise-list` / `--rise-modal` / `--rise-message` | 8 / 24 / 12 px | 0 each |
| `--orb-drift`, `--orb-scale-min`/`max` | 24 px, 0.96 / 1.04 | 0, 1 / 1 |

A build from that export has Reduce Motion on for everyone: no list rise, instant exits, static orbs.

**Fix:**
1. Declare the Reduce Motion values as **their own tokens in `:root`**, with the suffix `materials.css` already uses, e.g. `--dur-quick-reduce-motion`.
2. In the `@media` block, **only alias them, with no `@kind`**: `--dur-quick: var(--dur-quick-reduce-motion)`. Or move the block into `styles.css`, which contributes no tokens.
3. Correct the values while there:
   - §9.3 says Reduce Motion "fades", which a 0 ms `quick` can't do: use 160 ms.
   - Express "no shake" as `--shake-distance-reduce-motion: 0` instead of zeroing `--dur-medium`, which every 320 ms effect shares.

**Verify:** `_ds_manifest.json` lists `--rise-list` as `8px` and `--dur-base` as `220ms`, with the `-reduce-motion` tokens listed beside them. With reduced motion emulated in a browser, `getComputedStyle(document.documentElement).getPropertyValue('--rise-list')` reads `0px`. (Don't check `--dur-quick`: its Reduce Motion value is also 160 ms, so it can't show the bug.)

### B2 · Missing tokens

- **Glass tints the frames already use:** bar and sheet ink **0.80** and the **0.86** blur tier (decision 3). The manifest has only `--glass-tint-text 0.60`, so a handoff would build bars where `textSecondary` measures 2.35:1.
- **Hold durations:** `--dur-hold: 900ms` (check-in, Go Live) and `--dur-hold-staff: 1000ms`. The hold's speed is information and stays under Reduce Motion; today it's a literal.
- **Palettes now written as literals:**
  - the creature palettes (4 in `ui.js`; the client has 8);
  - the venue-type plates (`places.js`, `flow11.js`);
  - the map ramps (11.7).

### B3 · Tokens code can use

The tokens exist only as CSS custom properties, and the builders repeat them as 50–75 raw hex and 240–430 raw px values each. Add **`tokens/tokens.json`** (or an RN `theme.ts`), generated from the CSS, with:
- base motion values plus a separate Reduce Motion table;
- the seven springs as `{ stiffness, damping, mass: 1 }`;
- the type roles;
- the corrected kinds (text colours are `color`, not `font`).

The handoff reads that file, not the frames.

### B4 · The component library (Prompt 1c was never run)

The manifest has `components: []`. Every component is a function inside a flow builder, copied from flow to flow:
- the white "strong" button ×6;
- the spinner ×3;
- the section header ×3;
- the refusal ×3;
- the toggle, segmented control, live pill, toast, 36 pt pill and poll bubble ×2 each.

No builder draws a **pressed** state, and none draws Reduce Transparency, Increase Contrast, Bold Text or large text.

**Every component page shows:**
- states: default · pressed (iOS scale, Android ripple + squared corner) · focused · selected · disabled · loading · error;
- iOS and Android;
- Reduce Motion · Reduce Transparency · Increase Contrast;
- text at 2.0× (capped at 1.3× in fixed-height controls) and Bold Text;
- 360 dp;
- its haptic token (or "none") and its screen-reader label and order.

Lift these, in priority order (R3-1 sends them in five groups):

| Group | Components |
|---|---|
| **P0 · system** | Material tiers (glass · blur · solid, each with Reduce Transparency and Increase Contrast) · Button: primary, secondary, tertiary, destructive, strong-neutral, at 56 / 48 / 36 pt · IconButton · Sheet / ActionTray (three detents, the fixed button order) · Toast / Snackbar with Undo · Banner and VisibilityBanner (4 states) · SettingsRow + grouped list · Avatar (photo, creature, crew square; 24–112) · the morphing loader · GlyphWell / StateScreen / EmptyState / LoadError as **one** pattern (today 56 pt and 80 pt wells) |
| **P1 · inputs** | TextField · TextArea + counter · SearchField · DateField (DD/MM/YYYY, never drawn) · Chip and InterestChip · SegmentedControl (disabled is 45%, never on glass) · Toggle (Android pressed thumb, off outline) · RadioCard · LookingForCard · Stepper · TopBar (rest, scrolled, condensed) · TabBar (Increase Contrast outline) · ProgressBar · the Geist Mono family on the 12 pt floor: Badge / unread pill, PresenceDot, LivePill, TimeBadge, Price |
| **P2 · events and people** | EventCard (hero, row, compact) · TonightCard · VenuePass · HoldToConfirm (armed, disabled, refused, screen-reader path) · AmenityTile · MapCard · map pin and **cluster** (never drawn) · DayHeading · SectionHeader · Facepile · **PersonCard (every D · 4.1 variant)** · MeetNextCard · GridFace · TimeRing · RevealBar · RollingNumber |
| **P3 · chat and gestures** | ChatBubble · Composer (every reason, keyboard up) · ReactionBar and ReactionPill · **SystemNotice (never drawn)** · BroadcastNotice (image and **video**) · TypingIndicator · ReplyPreview · UnreadDivider · ReceiptMark · PollBubble · **SwipeRow · ContextMenu · ImageViewer** (never drawn), each with its tap alternative · Tooltip / coach mark |
| **P4 · the rest of R2-D0** | NotificationRow (6 visual types, request and stale) · InAppBanner (+ the wave kind) · CountTicks · CrewCard · CrewStrip · LikingAsChip · RevealSheet / collage · GoLiveSheet · SessionSheet · ExpiryPrompt · OverlapLine · achievement Badge · TonightSheet · PlanCard · NightPassRow · NeverForSalePanel · ManageStatusRow · OfferCard · ShareSheet · LinkPreviewCard · StoryCard |
| **P5 · sets and moments** | **The creature set** (B7) · venue-type plates · the moments as canonical pages: Match (three identity pairings, D · 4.4), the pour, It's a Blend, Ready, Recap |

### B5 · Accessibility frames (none exist)

Draw:
- the tab bar, the VenuePass, the composer and the PersonCard at **200% text on a 360 dp** screen (§14 asks for the first three);
- the tab bar, a sheet and the Room under **Reduce Transparency**, **Increase Contrast** and **Bold Text**;
- the **screen-reader order** for the Room, a chat and the PersonCard.

### B6 · An icon inventory

The builders use about 115 Lucide glyphs; there's a mapping only for amenities. One page:
- every glyph used, its name, its size;
- one name per glyph (today `alert-circle` and `circle-alert` both appear);
- `zap` is drawn filled (decision 102), against the outlined-only rule.

### B7 · The creature set isn't drawn

The frames use 7 stock Lucide animals on 4 palettes. The server names people with about 60 pseudonym nouns, and the client maps them to about 30 creatures on 8 palettes (`lib/pseudonymAvatar.ts`). Lucide has no fox, owl, lion, wolf or dragon.

Draw a **bespoke creature set**:
- one per creature the client maps;
- outlined, at the monogram's stroke;
- legible at 24 pt;
- on the 8 two-colour palettes as tokens.

The anonymous room is the product's face; it shouldn't be stock icons.

### B8 · The 12 pt floor regressed after the round-1 audit

11 px text is back in:
- TimeRing;
- Flow 2's "Main photo" label;
- the Flow 5 delta's badge;
- the Blend room's "+N" tile;
- a Flow 16 label;
- one spot in Flow 6.

### B9 · Annotations

- **Empty haptic fields on interactive states:** 48 of 75 Flow 10 states, 42 of 50 Flow 15 states. Each needs a token or "none". Examples:
  - validation errors take `H.error` once on submit;
  - "Revealed · both sides" takes `H.success` for the one who revealed;
  - "Muted · arriving live", the poll states, "Retrying" and the banners take none.
- **Motion names outside the vocabulary:** `M.standard` (×6), `M.shake`, `M.send`, `M.arrive`, `M.like`, `M.sheet`. Use the §9 tokens (`press · snap · settle · travel · fling · pop · celebrate`, durations by name) or a choreography number (#12, #13, #15, #20).
- **Builders that carry no M./H. tokens:** flows 1, 3, 4, 5-delta, 6, 7, 9, 11, 12, Places. If the annotations live in the canvases, fine; if not, add them.
- **Never annotated anywhere:** `H.detent`, `H.drag`, `H.arrive`. D adds their uses.

### B10 · Rule drift

| Where | Drift | Fix |
|---|---|---|
| Flow 10 validation | The field shakes, with no haptic | Shake the primary, `H.error` once on submit (decisions 95, 150) |
| Flow 13 staff hold | `H.threshold` | `H.tick` (§21.5), `H.success` on the stamp |
| Flow 11 Go Live hold (decision 134) | 700 ms, `H.threshold` | The check-in hold exactly: 900 ms, the `H.tick` ramp, `H.commit`, then `H.success` (§21.5). One hold in the product |
| Flow 6 invite landing | The orbs lift | Orbs lift only at check-in, the Match and Ready (§9.3 #22) |
| `F4.sheet` on Android | 60% scrim | 50% (§13) |
| SegmentedControl disabled | 60% opacity on glass | 45%, never on glass (§12) |
| The readme's caveats | Satoshi "from Fontshare" | It's served locally (decision 138) |

### B11 · The project's own records

- Decision numbers 90–99 are used twice.
- The decision log has no passes for Flows 13 and 14 or for the five deltas.
- `github.md` last synced 2026-10-03 16:22, before Flows 10–16 and the deltas.
- The `Delta R2-D*.html` canvases aren't registered as cards.
- The project's `docs/redesign/` has no `research/round2/`, which R2-D5 cites. Re-sync from the branch.

### B12 · Fonts (for the owner, not the designer)

The project holds the full Satoshi package (`uploads/Satoshi_Complete/`, 60 files) and serves `assets/fonts/satoshi/` through `tokens/fonts.css`. Every export and handoff bundle will carry them. If the ITF licence you hold doesn't cover a design tool, remove both and use option B of PROMPTS step 1.

---

## C · Corrections: drawn frames that contradict the server or a rule

| # | Where | Drawn | Correct |
|---|---|---|---|
| 1 | Flow 5 room feed; Flow 4 Room (beside the facepile and in the dock) | "Priya walked in" | **Delete everywhere.** No server line exists in the feed, and a name at the moment someone arrives ties them to the door, even for people who hid themselves. Arrivals are the count step and the grid (#25). |
| 2 | Flow 5 closed composer | "The night's over. The room stays readable until 06:00." | "This chat has closed. Event chats stay open for 24 hours after the event ends." (server copy). 06:00 is the venue-day reset only. |
| 3 | Flow 5 composer | "Check in to post" + Check in | The server's `NOT_CHECKED_IN` is "RSVP to this event to join the chat" (server copy), with an **I'm going** chip (Flow 15 #8's shape). |
| 4 | Flow 5 muted composer | Own copy + "posting comes back in 43 min" | Organiser: "The organiser has muted you in this room." Automatic: "You are muted in this room. Your messages have been flagged for policy violations." (server copy). No countdown (R11). |
| 5 | Banter | A muted DM row | **Delete.** DMs can't be muted. |
| 6 | Flow 5 bubbles | An "edited" option | **Delete.** Nothing edits or unsends. |
| 7 | Flow 10 Blend room | A feed line "Nebula · 3 revealed · 1 keeps it private" | No server row: a toast plus each side's header line (10.9). |
| 8 | Flow 15 / D2 polls | "You've already voted in this poll." | **Delete:** a vote can be changed while the poll is open. The hidden line is "Results appear when the poll closes" (server copy). |
| 9 | Flow 3 old bell sheet | A row "Night Cat waved at you", empty copy "Waves, matches and reminders…" | **Delete both** (R2). The bell opens Flow 9. |
| 10 | Flow 6 anonymous profile | "Design · Koramangala", "Interests · 3 shared" | The server sends only pseudonym, age and city for a room-anonymous person. Draw D · 6.1. |
| 11 | Flow 5 request card | "Wants to message you" | The request carries a required note; show it verbatim, two lines. |
| 12 | Flow 4 | "At capacity" and "Already checked in" refusal sheets | **Delete.** The server never sends them (Flow 15 "don't design"). |
| 13 | Flow 2 media | A pulled photo drawn blurred | The photo is gone: an empty tile with the shield glyph (D · 6.3). |
| 14 | Flow 6 blocked users | A reason under each row | The server returns no reason; the date only. |
| 15 | Flow 3 / Flow 7 | Two different "Cancel your RSVP?" bodies | One: "Your place goes to the next person in line." |
| 16 | Flow 12 | Quarterly and Yearly plans | Remove (P4). |
| 17 | Flow 9 | Two copy columns; "Crew update" | Rulings N2, N6. |
| 18 | Flow 3 | "The Pulse" with an orange word | All white (F3). |
| 19 | Flow 11 | Disc variant 2 | Marked "Rejected" (P8). |
| 20 | Every copy action | — | Annotate **none** on Copy. The client fires a success haptic there, against §10 (success is a server outcome). |
| 21 | Flow 10 crew chat "Archived" and Blend room "Closed" / "Closed early" | Read-only rooms | The server refuses both once they close (`lib/room-kind.ts`): they leave the Banter, and a stale link shows Flow 15 #11's card (C4). |

---

## D · New screens and states, by flow

Each item names its delta prompt. Copy marked "(server copy)" is verbatim; everything else is proposed.

### Flow 4 · The core loop (R3-D4)

**4.1 · The PersonCard, from everywhere** (R1). Today it's drawn only in its Liked state.

- **Entry points:**
  - a grid face or Meet next card;
  - a chat avatar or name (5.1);
  - a long-press's top row;
  - a room-info member;
  - the dock row "{name} waved at you";
  - the wave banner (9.1).
- **Actions:** **Like** (the gradient primary, `H.like`, HeartPop #15) · **Wave** · **Message** (the ConnectSheet; reveals you) · ⋯ (Block / Report) · **View profile** (the client has it; the design omits it).
- **Variants:**

| Variant | Who | Actions |
|---|---|---|
| a · Here now | Checked in and listed | Like · Wave · Message · ⋯ |
| b · Was here | Checked out | Like · Message · ⋯ (no Wave; likes need only a past check-in) |
| d · Pre-event room | **You** are in on an RSVP or save, not a check-in | ⋯ only, with "You can only message people from an event you have both attended" (server copy) |
| e · Matched | — | **Say hi** is the primary (`H.primary`), opens the DM |
| f · Friend (R6) | A friend the room names to you | "Friend" label · Message opens your friend DM · no Like |
| g · Unavailable | Account gone, or a block either way | "This profile isn't available." Identical for every cause |
| h · Thin card | Anyone the loaded roster and deck don't list, whatever the reason | Pseudonym, age, city · Message · ⋯. **The card never varies by why** |

- **States:**
  - Liked;
  - Requested (a check glyph, label "Request sent to {name}");
  - Wave sending (busy);
  - Wave sent: the label settles to "Waved" (the server can't promise delivery: a wave to a closed app simply doesn't happen);
  - Waved (still, as Flow 15 #18);
  - **Waved at you** (4.2);
  - in a venue room after they've left, the like is refused (4.3).
- **Motion:** the face travels from the grid cell into the card (#33); the sheet rises on `M.travel`. No haptic on opening.

**4.2 · Responding to a wave** (R2)
- The dock line "{name} waved at you" (no emoji) becomes a row; it opens their card.
- The toast is tappable to the same card. The dock row stays, so the toast is never the only way.
- On the card:
  - a still chip "Waved at you · 2 min" (kept on the phone only, gone after 10 minutes);
  - the wave button reads **Wave back**, settling to "Waved".
- **Haptic:** `H.arrive` once on receipt (today it fires twice). None on sending. The wave's own motion is #51.

**4.3 · Like and wave refusals** (R4)

One neutral line under the actions, never naming them and never implying rejection:
- **"That didn't go through."** Used for both of the server's same-for-everyone answers: like 404, and wave "They're not in the room right now".
- Check-in refusals: the server copy, e.g. "Check in to wave at people here", with a **Check in** action.
- A 429: "Slow down a moment, then try again."
- **No haptic.**

**4.4 · The Match moment when nobody is named.** Anonymous is the default; the drawn moment shows two photos only. Draw three pairings:
- creature ↔ creature;
- you named ↔ them as a creature;
- both named.

Copy: "It's mutual" · "You and {name} matched · {reason}", where {name} is the name the room shows you (the pseudonym unless they're named to you; never a pseudonym beside a photo) · Say hi / Keep looking. `H.match` on the landing frame; under Reduce Motion the faces are placed and the haptic fires at once.

**4.5 · People from tonight** (R5)
- **Entry:** a Recap secondary, "People from tonight".
- **Deck:** a read-only deck of pseudonyms marked "Was here", with Like and Message.
- **Closing:** gone when the room's chat closes. After that the Recap shows the counts only.
- **Nobody to show:** the row is absent. Never explained: an empty deck next to the Recap's counts would tell someone they were blocked or kept apart.

**4.6 · The event was cancelled while you're inside** (needs server, F)
- **The Room:** crossfades to a calm solid card:
  - title "{Event} was cancelled";
  - body "The organiser called it off. You're checked out.";
  - **See what's on tonight** (strong-neutral, to Tonight) · Close.
- **The disc:** drains live → idle on `M.settle`.
- **Haptic:** none; it's unsolicited, like the auto-checkout notice.

**4.7 · Precise location is off at the door**

Today this reads "GPS signal weak · accuracy 3000m", which moving can never fix.

- **The tray:**
  - title "Precise location is off";
  - body "Check-in needs your exact spot to confirm you're inside. Turn on Precise Location for Blend'n.";
  - one path line in Geist Mono, per platform:
    - iOS: "Settings › Blend'n › Location › Precise Location";
    - Android: "App info › Permissions › Location › Use precise location";
  - **Open Settings** (strong-neutral) · Not now.
- **On the attempt:** `H.error` once; the pass drains on `M.settle`.
- **On Tonight while it's approximate:** a quiet line "Approximate location. Check-in needs precise."

**4.8 · Checking in elsewhere takes you out**

Today it happens silently.
- **The VenuePass:** "Checking in here takes you out of {A}.", with the label "Hold to switch".
- **After:** a toast "You left {A}." If A was a venue, its composer gets the reason "You checked in somewhere else."; an event's room stays open as before.
- **Haptic:** none extra.

**4.9 · Multi-day events on Tonight and the pass** (with 3.2)
- Between days: "Day 3 starts Tue, Sep 29, 9:00 PM." (server copy shape).
- The refusals:
  - "Day 3 has been cancelled. Day 4 starts …"
  - "The rest of this event has been cancelled."
  - "Day 3 of 3 has been cancelled, so the event is over." (server copy)

**4.10 · The Board's ⋯ and a post taken down**
- **Post ⋯ and ask ⋯** open the one sheet:
  - "Blocking hides you from each other here and everywhere else…" (client copy);
  - Report · Block {pseudonym} · Cancel;
  - `H.destructive` on the Block confirm.
- **A post the slower check takes down:** the author sees "Your post was taken down. It didn't meet the community guidelines." (needs server). People who asked lose the row silently.

### Flow 5 · The Banter and chat (R3-D5)

**5.1 · Tap the sender** (R1). The single largest gap: today nothing opens from a message, in the app or the design.
- A tap on a message's avatar or name opens the PersonCard (4.1) on `M.travel`. No haptic on the tap.
- **Long-press** keeps `H.longPress` and gains a top row, "{pseudonym}", to the same card.
- **Block from a message:** the server accepts a room handle; the menu offers Report only today.

**5.2 · The long-press menu, every kind of message.** Only "someone else's room message" is drawn.

| Message | Reaction bar | Actions |
|---|---|---|
| Theirs, in a room | Six emoji | {pseudonym} › · Reply · Copy · Report… · Block… |
| Yours, in a room | Six emoji | Reply · Copy |
| Still sending | — | Copy |
| In a room that refuses writes (muted, locked, closed, left) | None (the server refuses reactions too) | Copy · Report… |
| Theirs, in a DM | None (DMs have no reactions) | Reply · Copy · Report… |
| Yours, in a DM | None | Reply · Copy |
| A DM that failed | — | The failed sheet: Try again · Copy · Delete · Cancel |
| Removed placeholders, broadcasts, polls | — | **No menu** (say so) |

- **iOS:** the bubble lifts over a 55% dim, the bar above, the menu below.
- **Android:** a solid menu, no blur, back closes.
- **Motion:** #36 (lift), #37 (reaction lands), #35 (swipe to reply).
- **Haptics:** `H.longPress` · `H.reaction` while scrubbing and landing · `H.threshold` at the swipe trigger · **none on Copy**.

**5.3 · The keyboard and the composer**

No chat frame draws a keyboard, yet every send happens there.
- **Frames:**
  - iOS, keyboard up, the composer at 1, 3 and 5 lines (132 pt cap, then it scrolls inside);
  - the reply preview attached;
  - the "New messages" pill riding above;
  - Android resized for the keyboard, with the solid composer.
- **A counter from 900 characters:** "100 left", in Geist Mono.
- **Dismiss:** interactive drag on iOS, on drag on Android.
- **The composer grows without a layout animation.** Orbs pause (#34). No haptic.

**5.4 · Spam and rate limits**

Today these show developer text, e.g. "Burst rate exceeded (6 messages in 10s)".
- One state for both: the drawn "Slow down a moment · You can post again in 0:10". It needs `retryAfter` (F).
- Too many links: a failed bubble, "Not sent · Two links at most".
- `H.error` once, on the answer.

**5.5 · Sponsored video**

The scheduler already sends `video`.
- A Sponsored card with a 16:9 first-frame poster, a 44 pt glass play control and "Sponsored · {brand}".
- A tap plays it inline, muted, with a mute toggle. It never autoplays.
- Loading: a static poster skeleton. Failed: "Couldn't load this · Try again".
- No haptic.

**5.6 · What a Banter row says for anything that isn't text.** Today a row can read "Pebble: 📢 [Announcement from Toit]…" or "…: [video]".

| Message | Preview |
|---|---|
| Announcement | "Announcement · Toit: {text}" |
| Image / video | "Photo" / "Video" |
| Poll | "Poll: {question}" |
| Crew system lines | As written |
| Removed | Skipped |
| Sponsored | **Never** the preview; fall back to the last person's line |

**5.7 · Safety sheets reachable today but never drawn**
- **The message request ⋯:**
  - "Blocking stops them asking again and hides you from each other. A report goes to our team, and they are not told who sent it." (client copy);
  - Block · Report · Cancel;
  - toast "{name} is blocked".
- **Report sent:** "Report sent. Our team will review it." (client copy).
- **The "Something else" step:** a note.
- **After a block:** their messages leave the feed (`quick` fade, reflow on `M.settle`).

**5.8 · Failed and draft rows; sending offline**
- **Row line 2:**
  - "Not sent · Tap to retry", with a circle-alert icon at 14 (never colour alone);
  - "Draft · {text}".
  - Precedence: failed, then draft, then the last message.
- **Offline:** a send waits with "Waiting for connection" (clock, `textTertiary`), sends itself on reconnect, and becomes failed after 2 minutes. It's an offline state, not a "sending" spinner; say so.

**5.9 · Photos in DMs** (R9)
- **Sending:** attach in the DM composer only, once revealed or friends. Picker → preview with a caption. Upload as a determinate ring.
- **Refusals, verbatim (server copy):**
  - "That photo did not finish uploading. Try again."
  - "That photo is empty. Try again."
  - "That file is too large to send."
  - "That kind of file can't be sent."
  - "Send photos through the app rather than linking to them"
- **Removed by moderation after delivery:** the sender sees a dashed placeholder; the recipient sees it vanish.
- **The viewer:** swipe to dismiss, with Report (#33).
- **Location:** a DM photo is re-encoded on the phone before upload, as profile photos are, so no location metadata leaves the phone.

**5.10 · A warning before sending contact details** (needs server)
- An info row above the field, not a lock: "This looks like a phone number. This room is anonymous — a message with contact details is removed before anyone sees it." (server copy). Send stays enabled.
- Crew rooms need their own sentence, since people there are named.

**5.11 · Swipe actions, links and emoji**
- **Room rows:** Mute (the drawn mute sheet) · Leave (confirm, `H.destructive`). **DM rows:** Mark read only.
- **Links:** tappable through a domain sheet, never a preview (R10).
- **Emoji:** 1–3 alone render at 32 pt.

**5.12 · Room info members open the card.** Today the crowd grid has no tap target. Members are drawn by the roster's rule (needs server, F).

### Flow 6 · People and profile (R3-D6)

**6.1 · An anonymous person's profile, as the server sends it**
- **Shown:**
  - the creature hero;
  - "{pseudonym}, {age}" and the city;
  - the pill "Anonymous until you both reveal";
  - "{pseudonym} hasn't revealed who they are yet. Connect, talk, and either of you can reveal when you want to."
- **Actions:** Like (only when you arrived from a room) · Connect · ⋯.
- **Not shown:** interests and neighbourhood.

**6.2 · A message request, opened from their profile**

Today the client wrongly shows "Requested".
- "{Name} wants to message you", their note in a quote card.
- **Decline** (surface) · **Accept** (white) · ⋯ Block / Report.
- `H.success` on accept. Decline shows nobody anything.

**6.3 · The photo path, end to end**

| Step | Content |
|---|---|
| Source sheet | Take a photo / **Choose from library** (client copy) |
| Camera sheets | "Camera access is off" (with Open Settings) · "No camera here" (client copy) |
| Reposition | Drag and pinch in the hero frame · **Use photo** · Choose another. `H.drag` on pick-up, release on `M.settle` |
| Refusals under the grid (server copy) | "That photo is too large. Pick one under 10 MB." · "That file isn't a photo. Pick a JPEG, PNG or WebP." · "That looks like a blank image. Pick a photo of yourself." · "That photo did not finish uploading. Try again." |
| Pulled by moderation | An empty tile with the shield glyph (needs a signal, F) |
| Main photo pulled | "Your main photo was removed. The next one is your main photo now." · "Think we got it wrong? Write to support@blendn.app." |

### Flow 3 · Discovery (R3-D3)

**3.1 · The event changed while you're going** (needs server)
- **On the Scene:** a solid line under the hero, "Updated · new start time" or "new venue". The old time is struck through; the new one is in Geist Mono.
- **On Going rows:** a "New time" / "New venue" label.
- **Motion:** `M.settle` on first sight. No haptic.

**3.2 · Multi-day events**
- The date range in Geist Mono: "Sat 27 – Mon 29 Sep".
- The Doors tile reads "Day 2 of 3".
- A day strip with a cancelled day struck through.
- The between-days CTA (4.9).

**3.3 · Small unhappy states**
- **The venue page:** skeleton; "This place didn't load." · Try again.
- **Leave the waitlist:** "Leave the waitlist?" / "You'll lose your place in line. If you join again later, you go to the back." / Stay on it · **Leave waitlist** (client copy).

### Flow 7 · Settings and system (R3-D7)

**7.1 · The Account card**
- **"Signed in with Google · {email}"** (display only).
- **Password** (email accounts) opens a sheet:
  - "Change your password?" / "We'll email a link to {email}. Reset links work once, and for an hour.";
  - **Send link**.
- **Sign out of every device** (the server already does it) opens a sheet:
  - "Sign out everywhere?" / "Every phone signed in to this account is signed out, this one too. Notifications stop on all of them.";
  - **Sign out everywhere** (not red, no haptic).
- Change email and Devices stay hidden until the server has them.

**7.2 · Grievances and your data** (R14)
- **About:** a Grievances row with the officer's name and the address.
- **Settings › Privacy:** "Get a copy of your data" opens a prefilled support email.

### Flow 9 · Notifications (R3-D9)

**9.1 · The wave banner** (R3)
- **Layout:** the InAppBanner with a creature disc at 32 · "{name} waved at you" · "{event} · now" · no buttons.
- **Tap:** opens the overlay at their card.
- **Motion:** 16 pt down + fade on `base`, out on `quick`.
- **Haptic:** `H.arrive`: the one exception to §21.5's "In-app banner: none", under R3. Every other banner kind stays silent.

**9.2 · A report you made was acted on** (needs server). A bell row: "We looked at your report and took action." Never who or what.

**9.3 · The app-icon badge** (N3) on an iOS home screen and an Android launcher.

**9.4 · The copy changes** N2 and N6.

### Flow 10 · Crews (R3-D10)

**10.1 · People in a crew chat or a Blend open a reduced sheet** (needs server: block already accepts crew and Blend handles; reporting a person doesn't)
- **Crew:** first name + photo · Report · Block.
- **Blend:** pseudonym · Report · Block.
- No Like, Wave or Message (C3).

**10.2 · The reveal line** (C1) in crew chat.

**10.3 · A dissolved crew or a closed Blend leaves the Banter** (C4). Replace the drawn read-only "Archived" crew chat and "Closed" Blend room with Flow 15 #11's cards, shown only when a stale link or notification opens them.

### Flows 1–2 · Entry and onboarding (R3-D1; it carries the unrun R2-D6)

**1.1 · Everything in R2-D6:**
- 15.1–15.4 placed on the landing;
- the field errors (Flow 15 #15) in sign-in and onboarding;
- links held through sign-in.

**1.2 · The password-reset web pages**

Today an attendee who resets a password is sent to the dashboard's `/login`, which refuses them. Web frames, in the dashboard's light register:
- **Entry:** "Set a new password" (server copy).
- **Dead link:** "This link no longer works" / "Reset links work once, and for an hour." (server copy) / Request a new link.
- **Done, for an attendee:**
  - "Password changed" (server copy);
  - "Open Blend'n and sign in with your new password.";
  - **Open Blend'n** (an app link; store badges per S2);
  - keep "Any mobile app sessions on this account were signed out, in case someone else had them." (server copy);
  - no redirect to `/login`.

**2.1 · "Looking for" becomes intent** (D3): Dating · Friendship · Networking · Just here for the event.

**2.2 · Expertise** as step 2 of field of work in the onboarding journey step (14.3).

**2.3 · The pulled photo tile** (C13).

### Flows 12 and 16

- **12:** remove Quarterly and Yearly (P4).
- **16:** each public page in its "listings not public" variant (S2).

### R2-D7 can run now

Its proposal pieces were waiting on Flows 12–14, which are drawn. Run it as written in PROMPTS.md.

---

## E · Making it alive: motion pack 2

**The principle: alive through change, calm otherwise.** The app feels alive when it answers: a finger, a person arriving, a number moving. It doesn't feel alive because something loops. The only loops: the orbs, the typing dots while someone types (#14), and the door pass's wave (§21.5). Three layers:

1. **Physics, everywhere.** Every animation runs on the seven springs and carries the finger's velocity. This adds no new motion and is the largest single gain. The client drifts today (F).
2. **Reactive:** the room visibly changes when something happens (#25–#29, #37, #51, #52).
3. **Ambient:** the orbs only, plus the time-of-night set (#53).

| Idea | Verdict | Why |
|---|---|---|
| Time-of-night tint | **Keep** (#53) | Pre-rendered, swapped at launch or foreground, never animated live; L0 only |
| The Room "breathing" with activity | **Reject** | It loops and makes motion carry state; the bucket label and #26 do the job |
| Arrivals | **Keep, narrowed** (#25) | The count steps; a listed person's disc enters the grid; nobody is named; above "busy", only the count moves |
| The map's lit buildings | **Keep, static** (#42) | Stepped, at most one change a minute; never twinkling windows, never a boundary |
| Typing dots | **Keep** (#14) | Already compliant |
| Reaction bursts | **Split** | Your own reaction lands (#37); other people's only roll the count |
| Copy by the hour | **Keep, text only** | From the clock and real data; never in errors or consequences; "Last call" only from a real end time |
| A Scene's cover tint on load | **Add** | One crossfade on `base` |
| Confetti, perpetual pulses, idle loops | **Reject** | §18 |

**Motion pack 2.** Haptics are §10 tokens. RM = Reduce Motion. A = Android.

| # | Name · trigger | Spec | Haptic | RM | Where |
|---|---|---|---|---|---|
| 25 | **Arrival** · someone checks in while the Room is open | The count steps (#26). For people the roster lists, their disc enters the grid at 0.8 → 1 on `M.snap`, opacity over `base`; neighbours reflow on `M.settle`. **No line names anyone**: a name at the moment someone walks in ties them to the door. Above "busy" only the count moves | none | 200 ms crossfade | Room, venue room |
| 26 | **Count or bucket step** | Digits roll (#24); bucket words crossfade on `base`; pill width on `M.settle`; at most one step per 10 s per element | none | Instant | Room, Pulse, Places, Scene. **Not crew cards:** there one tick fills and nothing else moves (§21.5) |
| 27 | **Inbox reorder** · a message lands below the top row | Preview and time crossfade over `quick`, the dot pops (#28); at +300 ms the row moves to the top on `M.settle`. With a finger down, the list scrolling or the row off-screen: no move, and a glass "↑ New" pill (`M.snap`) | none | Instant reorder | Banter |
| 28 | **Badge or dot** | Appears 0.8 → 1 + fade over `quick`; digits roll on `M.snap`; "9+" never rolls; leaves with a `quick` fade | none | Instant | Disc pill, Banter, bell |
| 29 | **Unread → read** · on leaving | Dot and pill leave over `quick`; the title's weight swaps at t0; the divider is gone next visit. Never while it is being read | none | Instant | Banter, Notifications |
| 30 | **Scroll-edge chrome** · scroll 0–56 pt | At 8 pt the glass materialises (`glassEffectStyle`, 250 ms; never animated opacity); the large title scrolls away; the small title crossfades in between 24 and 56 pt. A: solid alpha 0 → 0.94 + hairline | none | Glass at the threshold; title swaps at 40 pt | Pulse, Banter, Notifications, Me, Scene |
| 31 | **Tab-bar minimise** (v2, iOS 26) · scrolling down past 120 pt | Collapses to the selected tab + disc on `M.settle`; restores on scroll up, a tab tap, or the top. The disc never hides | none | No minimise | Pulse (R15) |
| 32 | **Hero stretch** · overscroll at the top | The hero scales from its bottom edge, up to 1.15 with the pull; the scroll view's own return. A: the system stretch | none | Kept (direct manipulation) | Scene, venue, profiles |
| 33 | **Face → card; photo → viewer** | A copy of the face travels from the grid cell to the card's 112 pt face on `M.travel` while the sheet rises; close reverses. The viewer drag tracks 1:1, release on `M.fling` | none | Sheet fades 200 ms; face shown in place | Room, profiles, DM photos |
| 34 | **Keyboard follow** | Composer, docks and list inset follow the keyboard frame by frame; the newest message stays pinned; orbs pause | none | Unchanged (system motion) | Chats, sign-in, onboarding, Board, search |
| 35 | **Swipe to reply** | Tracks 1:1 to 56 pt, then rubber-bands at 0.5× to 96 pt; the reply glyph scales 0.6 → 1 with progress; armed at 56 pt; release on `M.fling`; the reply bar rises 8 pt over `base`. A: start ≥ 24 dp from the edge (system back) | `H.threshold`, once per crossing | Kept; the bar fades | Room chat, DMs |
| 36 | **Long-press menu** · hold 400 ms | Press to 0.97 (`M.press`), lift to 1.03 (`M.settle`); backdrop to 55% over `base`; the menu springs from the item (`M.snap`, 0.9 → 1 at its anchor); the six reactions stagger 18 ms. A: dim only, no blur | `H.longPress`; `H.reaction` while scrubbing | No lift; menu fades 200 ms | Cards, bubbles |
| 37 | **Your reaction lands** | The emoji flies from the bar to the chip in 180 ms on split axes; the chip pops 0.85 → 1 (`M.pop`); the count rolls. Other people's: roll only | `H.reaction` on landing | Chip appears | Chat |
| 38 | **Filter re-sort** | Jump to the top; leaving items fade over `quick`; new ones fade + rise 8 pt over `base`, 18 ms stagger, ≤ 6 visible; ≤ 12 reflow on `M.settle`, more crossfade | `H.select` on the chip | `quick` crossfade | Pulse, Places, Nearby |
| 39 | **Rollback** · the server refuses an optimistic change | The control returns on `M.snap` after the answer; the toast names the setting | `H.error` | Instant | Switches, Save, I'm going |
| 40 | **Dial and stepper detents** | Thumb moves per detent on `M.snap`; a stepper's digits roll; at a bound, a 4 pt nudge on `M.press`. Native pickers keep their own ticks | `H.select` (custom only) | No roll, no nudge | Go Live dial, Board spaces |
| 41 | **Map camera** | Within a city: pan/zoom ≤ 600 ms, `standard`; across cities: no flight, a 200 ms crossfade; never during a drawer drag | none | Jump + 200 ms fade | Home map |
| 42 | **Map layers** | The lit layer fades in once over `long`; live steps crossfade over `long`, at most once a minute; clusters split from their centre on `M.settle`; no pulse, no glow on controls, no boundary | none | Swap + 200 ms fade | Home map, onboarding location |
| 43 | **Recap entrance** · after the disc drains | Title fades + rises 8 pt; ≤ 5 blocks, 28 ms stagger; numbers arrive already set (no count-up) | none | Fade | Recap |
| 44 | **System banners** · offline, paused, realtime cut, rate limit | Slide 16 pt + fade, `base` in / `quick` out; content shifts on `M.settle`; a countdown changes without animating | none | Fade | Flow 15 and the screens it lists |
| 45 | **Async primary** · a primary that waits for the server | Press 0.97 (`M.press`); the spinner shows only after 300 ms; on OK the old label exits up 8 pt over `quick`, the new one enters over `base`, width on `M.settle`; a refusal plays #20. A: squares to 12 dp while pressed and busy, back on `M.snap` | `H.primary` only where no outcome haptic follows within ~1 s (never on I'm going, §10.2) → `H.success` / `H.error` on the answer | Crossfades; width instant | I'm going, Join, Save ("We're here" is a secondary: no press haptic) |
| 46 | **Share and copy** | The tray rises with the card already rendered (no shimmer); copy's glyph crossfades to a check over `base`, "Copied" for 2 s. A 13+: skip our "Copied" (the system shows its own) | none | Instant swap | Flow 16, invite, About, Support |
| 47 | **Empty → first item** · while focused | The empty state fades over `quick` with an 8 pt drop; the item enters as #16; the container resizes on `M.settle` | none | Crossfade | Going, Banter, Board, crews |
| 48 | **A long wait** · still waiting at 5 s | The loader stops on the static monogram; a line naming the wait fades in; a text Try again at 10 s. Nothing loops past 5 s | none | Static mark + text from t0 | Any wait over 1 s |
| 49 | **Back from the background** · after more than 60 s | Missed arrivals aren't replayed; counts roll once to now; "N new ↓" if scrolled up; the disc pulses at most once; the orbs resume where they paused | none | Values swap | Tabs, Room |
| 50 | **Landing from a push or link** | A native push straight to the target (no stepping through screens between); the target is scrolled to a third of the screen; a 16% white highlight in over `base`, out over `long` from 1 s | none | A still highlight for 2 s | DM, a notification's target, a request, the Scene |
| 51 | **Wave** | Send: the hand rotates ±14° twice over 600 ms, once; the label becomes "Waved". Receive: a ring on the sender's disc grows 1 → 1.25 and fades over 600 ms, with the toast and dock row | Receive: `H.arrive`; send: none | No wiggle, no ring | Room |
| 52 | **Meet next reshuffle** · the 15-minute boundary; never while a card, sheet or screen-reader focus is inside | The three cards leave together 8 pt left over `quick`; three new ones enter 16 pt from the right, 40 ms stagger, `M.settle` | none | Crossfade | Room |
| 53 | **Time-of-night set** · launch or foreground crosses 21:00 or 01:00 | A pre-rendered orb set swaps with a crossfade over `long`; L0 only | none | Instant swap | Backdrop |

**Platform notes.**
- **Liquid Glass materialises; it never fades** (WWDC25 219). That's #30.
- **Sheets spring from the control that opened them** (WWDC25 356). That's #36.
- **Material 3 Expressive:** spatial springs may overshoot and effects never do; hero moments use the expressive scheme, routine ones the standard one. That's #45.
- **Apple Invites' confetti on every RSVP** is the counter-example: Blend'n spends its celebrations once.
- **Telegram and Signal:** swipe-to-reply thresholds of 45–64 pt with one haptic, and a reaction's 0.18 s flight (#35, #37). Sources are in [`research/round3-motion.md`](./research/round3-motion.md).

---

## F · Not design: server and client follow-ups

The design can be drawn without these. Building it can't. Listed for the owner, to file as tickets.

**Server (admin)**
- **N1:** stop sending the "Message request declined" push and writing its bell row.
- **The crews sweeper still dissolves a new crew of one with open invites** within 15 minutes (`lib/crews/sweep.ts` `repairCrews` counts `crew_members` only). Flow 10's "Forming" state stays blocked until it counts open invites.
- **4.6:** when an event is cancelled:
  - emit `live:ended { reason: 'cancelled' }` to each checked-in person;
  - add checked-in people to the cancel push. Today it goes to RSVPs and saves only.
- **1.2:** the reset-password page redirects every user to the dashboard's `/login` after 2.5 s (`app/reset-password/page.tsx:77,121`), which refuses attendees.
- **#25:** `event:room:checkin` goes to the room for everyone, including people with online status off, whom the roster hides (`lib/check-in-core.ts:401` against `checkins/route.ts:149`). Filter it by the roster's rule; the client prints "{name} walked in" from it today.
- **4.6:** decide whether a cancelled event's chat closes; today it stays open for its normal window.
- **5.12:** the room-info participants list ignores `visibleInRoom`. It always shows the pseudonym, even for someone the roster shows by name.
- **R6:** a friend flag on the room roster, set only where `visibleInRoom` already names them; never for a friend with `friends_see_me_in_rooms` off.
- **10.1:** let `POST /users/:id/report` accept crew and Blend handles, as block already does.
- **5.4:**
  - `retryAfter` on `SPAM_BLOCKED`;
  - human sentences for "Burst rate exceeded…" and "Too many links (3)".
- **5.6:** strip the "📢 [Announcement…]" and "📣 [Sponsored]" prefixes from previews, and never use a sponsored message as one.
- **R9:** refuse attendee media in event rooms; allow DM photos only between people who've revealed, or friends; prove with a test that a sealed copy carries no location metadata (nothing strips EXIF today).
- **5.10:** serve the contact-details warning before sending, with a crew-room variant.
- **4.10:** tell the author when the slower check takes a Board post down.
- **3.1:** `changedAt` and `changes[]` on the event and RSVP reads.
- **6.3:** a signal when moderation pulls a photo.
- **9.2:** a bell row when a report is acted on.
- **C1:** the crew-reveal system line.
- **N2, N4, N6:** the push copy.
- **4.1 h:** a single-card read for a person who isn't on the loaded deck page.
- Later: outgoing message requests (`direction=sent`), `mutedUntil`.

**Client**
- **Waves (4.2, 9.1):**
  - `room:wave` is heard only while the overlay is open (`useRoom`), so a wave is lost with it closed;
  - a received wave fires two haptics; a sent one fires Light.
- **Copy (C20):** Copy fires a success haptic.
- **Profiles (6.1, 6.2):**
  - `/user/[id]` always starts unliked: `youLiked` isn't passed from the card;
  - a received message request shows as "Requested".
- **Chat (5.1, 5.8, 5.11):**
  - the chat avatar is a plain `View` with no tap target;
  - a failed send is dropped when you leave the chat, and there are no drafts;
  - links aren't tappable.
- **Photos (6.3):** the limit says 5 MB while the server allows 10 MB.
- **Motion (E):**
  - `MOTION_SPRING.gentle` / `snappy` bounce at 0.36 / 0.45;
  - four `LinearTransition`s use an off-token curve;
  - `ScalePress` runs on the JS thread, fires `selectionAsync` on every press, and drops the press squash under Reduce Motion.
- **Not installed yet:** `expo-glass-effect` (#30), `expo-battery` (the Low Power pause), `expo-sensors` (the PassDisc tilt), `lucide-react-native`.
- **Theme:** still the old EMBER palette and Plus Jakarta Sans.
- **R12:** `supportsTablet: true`.
