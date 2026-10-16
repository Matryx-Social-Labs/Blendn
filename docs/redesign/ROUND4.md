# Round 4: one source of truth, check-in end to end, first-run tips, the last missing states (2026-10-15)

Round 4 was written while the redesign was being built. These were read:
- the client, `origin/dev` `a685093`, which has the foundation and every component library PR (#382–#394);
- the published Claude Design project, exported 2026-10-15 with ROUND3 part G applied;
- the server, admin `origin/dev`.

Two audits fed it:
- **the conflicts audit:** every place where an implementer had to choose because the frames, the component pages or the motion cards disagreed;
- **the coverage audit:** every route and state the app can reach, checked against a drawn frame.

**Round 3 was drawn in full.** Every R3 item is in the project apart from three small leftovers (Part 6 B). What's still needed is different in kind: the project tells implementers two or three different things about the same component.

| Part | What | Prompts |
|---|---|---|
| [1](#1--rulings) | Rulings: the open questions the audits raised, decided | R4-0 applies them |
| [2](#2--one-source-of-truth) | Why the project has no single source, and how to fix that | R4-0 |
| [3](#3--check-in-end-to-end) | Check-in from the hold to the Room, drawn as timed frames | R4-1 |
| [4](#4--first-run-tips-coach-marks-and-help) | First-run tips (coach marks) and the Help screen | R4-2 |
| [5](#5--conflicts-the-evidence) | The conflicts: 154 rows with evidence, each with its fix | R4-0, R4-3 |
| [6](#6--missing-screens-and-states-the-evidence) | The missing screens and states, flow by flow, with where the client reaches them | R4-D… |
| [7](#7--not-design-server-follow-ups) | Not design: server changes behind four drawn frames | — |
| [8](#8--round-41-finishing-round-4-2026-10-16) | Round 4.1: what reading the built project found, and the last fixes before the build restarts (inside two places, retiring the deltas) | R4.1-0 … R4.1-5 |

**Authority.** Where this file rules, it wins over ROUND3 and everything before it. Everything it doesn't mention stands.

**One rule settles most of Part 5.** If a row's fix says "pick one" or "decide", and Part 1 doesn't name it, take what is built: the row's "Chose" column. The exception is a choice that breaks a rule in `DESIGN-BRIEF.md` or ROUND3. Then the rule wins, and the row says how. The app has been built and reviewed on those choices; redrawing them back would only move the disagreement.

---

## 1 · Rulings

The owner asked for the recommended option on each (2026-10-15).

| # | Question | Ruling | Rows |
|---|---|---|---|
| R1 | Intent's labels. Flow 4 #14 shows "Meet people · Live music · Dance · Network · Just out" | **ROUND3 D3, everywhere:** Dating · Friendship · Networking · Just here for the event. Single choice. That covers #14 "Why do you go out?", the Flow 3 preferences, Flow 14 and LookingForCard. | 5 A6 |
| R2 | What happens after "You're in." when the server asks a question | **As built (#394).** Part 3 draws it. | 5 C1–C6, A4, A5 |
| R3 | Hold to check in | **The Flow 4 frames, exactly:** the 56 pt pill, the surfaceSunken track and a white label clipped at the fill edge. **No quarter marks** are drawn (owner, 2026-10-15). **#8 supplies only the timing and haptics:** 900 ms linear, `H.tick` at 25/50/75, `H.commit` at 100%. The label is "Hold to blend in"; the screen-reader hint is "Double-tap to check in."; busy is "Checking you in…". A refusal drains on `M.settle` into Flow 4 #16's sheet (#10). Delete the page's ring and shake. Redraw #8 and #10 on the Flow 4 pill, without the marks. | 5 A1–A3, B1 |
| R4 | What "regular" means | **The server's definition** (ROUND3 G3). The badge shows a tier and never a number, so it needs no threshold of its own. | 5 A30 |
| R5 | Under-18 states | **Delete them all.** The product is strictly 18+. | 5 A60 |
| R6 | An unlisted event when shared | **The area, never the venue:** in the share tray, the card and the link preview. Fix the no-op ternary in `flow16.js`. | 5 A74 |
| R7 | Sign out's button | **One kind, secondary, never red,** wherever it appears. "Sign out of every device" is the same kind. | 5 A48 |
| R8 | The haptic on sending a wave | **None** (the vocabulary). #51's ±14° hand turn plays on the PersonCard's Wave button. | 5 A17 |
| R9 | "Here now" on matched and friend cards | **Inside the Room only,** for people in that room. Never on a friend or matched card anywhere else. | 5 A18 |
| R10 | Are map pins controls? | **Yes.** A tap selects the event in the drawer. The target is 44 pt; the pin can stay drawn small. | 5 A38 |
| R11 | "Just walked in" under a face for 10 minutes | **Remove it.** It ties a person to the door, the same as "walked in" (ROUND3 C1). | 6 "Not gaps" |
| R12 | Stop being live | **Confirm it, the same as check-out:** Stay · Stop, `H.destructive` on Stop. | 6 "Not gaps" |
| R13 | Reporting an offer | **Draw the reason step** (6 13-2). The server requires a reason, and a reason makes the report useful. R3-G's one tap becomes the first tap of two. | 6 13-2 |
| R14 | Frames the server can't support yet ("signed out on another device" vs "password reset"; the deleted account; "Clear all · requests stay") | **Keep the frames.** Label each "Needs server" in its corner; the server follow-ups are Part 7. | 7 |
| R15 | Inside more than one place at once: two events at one venue, two venues in one building, overlapping fences | **One pass, for the place you most likely mean,** chosen in this order:<br>1. an event you're going to or saved;<br>2. an event over a venue's own room;<br>3. the soonest-started event;<br>4. the nearest place.<br>With two or more, the pass reads "2 here · Switch", which opens a chooser, and the centre button's label reads "Check in · 2 here". Swiping the Tonight deck never moves the pass: the deck is for browsing, the pass is where you are. If you're already in a room, the pass reads "Hold to switch" and names the room you'll leave (ROUND3 4.8). The server decides which places you're inside (SCRUM-704). | 8 |
| R16 | Do the delta canvases stay? | **No.** A change edits the approved builder. The flow canvas shows the result. Old states are deleted, never kept as "before" frames. One canvas per flow. The project's standing instruction that "a delta never edits an approved builder" is reversed. | 8 |

---

## 2 · One source of truth

The conflicts audit found the same five causes behind most of its 154 rows:

1. **Deltas never reach the builders.**
   - The R3 deltas are drawn as "after" frames that call the approved builder and then patch it. `round3/r3g.js` says "Approved builders are never edited".
   - So no component page shows an R3-G change.
   - The C1 correction ("walked in") is a text-scrub copied into five files. Any frame without it still prints the old line, and that's how "Midnight Lark walked in" reached the device.
2. **Motion cards draw their own UI.** Cards #8–#10, #12–#14 and #35–#47 draw their own pills, bubbles, chips and banners, at 9–11 px and in raw colours. They don't use the components.
3. **Check-in is drawn four times and choreographed once.** That's Part 3.
4. **One field, five vocabularies:** intent (R1).
5. **Component pages that are older than the flows** (Part 5 D).

**The fix, in R4-0:**
- Fold every delta into the builder it patches, then delete the "before" frames and the text-scrubs. A flow, its component page and its motion card should all call one builder, so one change shows everywhere.
- Rebuild every motion card on the real components. A card shows timing, not a second drawing.
- Regenerate `tokens/tokens.json` from the CSS (5 B10), and replace raw values with tokens (5 B11–B14, B19, B27).

---

## 3 · Check-in end to end

**Drawn, before Round 4:** the hold (#8), the pour (#9, which hands off to the Room at 700 ms), the refusal (#10), and the reveal offer and "Why do you go out?" (Flow 4 #13 and #14, sheets over Tonight).

**Never drawn:** what joins them. Three PRs on one day built three answers. This is the one now on `dev` (#394), and the owner has seen it on a phone. Draw it as **one sequence of timed frames** on Flow 4's canvas, iOS and Android, each with a timestamp.

**Order of events**

| t (ms) | What happens | Token |
|---|---|---|
| 0 | The hold starts on the docked pass. The fill moves linearly. | `--dur-hold` 900 |
| 225 · 450 · 675 | A haptic tick at each quarter. Nothing is drawn. | `H.tick` Soft · Light · Medium |
| 900 | Commit. The label turns to "Checking you in…" and the fill stays full while the server is asked. | `H.commit` |
| server OK = 0′ | **The pour.** The gradient floods up through the docked pass and the venue name sits at its top left. | `H.success`, `M.settle` |
| 0′+200 | "You're in." fades in at the bottom left of the pass. | `D.base` |
| 0′+0–600 | The orbs lift once. | `sin(πp)·0.6` |

**With no question**, at 0′+700 Tonight crossfades to the Room (#9). The Room hero enters on `M.travel` and the sections stagger by 28 ms.

**With a question:**
- "You're in." stays until 0′+1600, so it's readable for about a second after it's fully in.
- The pour then fades over `D.base`.
- Only once it has cleared does the sheet rise (`M.travel`).
- The reveal offer comes first, then "Why do you go out?".
- Tapping the backdrop of either sheet counts as "no" or "skip".
- After the last answer, Tonight crossfades to the Room.

**Frames to draw**

1. **The question path:** the pour at 0′+400, at 0′+1200, cleared at 0′+1820, then the reveal sheet over Tonight.
   - Behind the sheet is the pass in its checked-in state ("You're in", not re-armed; 5 C2).
   - Then intent over the same backdrop, and the Room.
   - Draw it with both questions due, with only one, and with neither.
2. **The Room isn't ready at 0′+700:**
   - The pour holds, filled, for up to 4 s.
   - Then it hands off to the Room's skeleton (5 C3).
   - A tap skips straight to the hand-off.
3. **Checking in from the event page:**
   - The page's "Blend in" (Flow 3 #04–#06) opens Blend'n at Tonight with that event's pass docked. From there it's the same sequence, so there is one pour and it is always in the pass.
   - Closing the Room returns to the event page, which now reads "You're in" (5 C4).
4. **Already checked in:** no pour and no haptic. The Room opens directly (5 C6).
5. **"Tell your crew · We're here"** (R2-D1): the pass is gone 700 ms after success, so the row moves to the top of the Room. It stays until it's sent, or for 10 minutes (5 C5).
6. **Reduce Motion:** the same order and the same holds, with 200 ms crossfades in place of the flood and the lift. The haptics are kept.

---

## 4 · First-run tips: coach marks and Help

The owner, 2026-10-15: the Pulse's "Tip: Long-press any event card… / Got it" banner nags. Guidance should be a one-off that teaches a new user, taken from the design, and placed screen by screen as each page is redesigned.

**The rule already exists** on the CoachMark component page:
- the app explains itself at most once per thing, and only the things that aren't obvious;
- one at a time, never a tour, never a scrim, never on a loop;
- it's dismissed by Got it, by using the thing, or by leaving the screen;
- the same text lives in Help.

It agrees with what other apps do. Apple's TipKit shows one tip at a time, and a tip is invalidated once the user has done the action. NN/g found that tutorials make an app feel harder, so teach one interaction at the moment it's needed.

**The client** shows these through one shared hook, `lib/coachMarks.ts`:
- once ever per account;
- never to someone who has already used the feature;
- at most one new tip per app session;
- never before the screen has loaded.

**Inventory: draw each one in place, on its screen, the first time it would show:**

| Where | When it shows | Sentence |
|---|---|---|
| The Pulse / Home drawer (Flow 3) | The first event card is on screen | "Hold an event to save, share or preview it." |
| The centre button (Flow 4) | The first time it changes because you can check in | "You're at {venue}. Tap the button, then hold to check in." (5 A47: the disc is tapped, the pass is held) |
| The Room's reveal bar (Flow 4) | The first time you're in a Room | "People here can't see your name or photo until you choose to show them. You decide, per event." |
| A Banter row (Flow 5) | The first time the Banter has a chat | "Swipe a chat left to mute it." |

Add a row only for something a person can't see on their own. A gesture or a state change qualifies; anything with a label already says what it does.

**Help:** draw Settings › Help › **Tips** (Flow 7). It lists every sentence above, so someone who dismissed a tip can read it again. A row is plain text; nothing replays.

---

## 5 · Conflicts: the evidence

From the conflicts audit. Each row gives the design files and frame or card ids on each side, the quoted values, what the implementer chose (with the PR), and the fix in one sentence. Paths are relative to the project's `guidelines/` folder. The rows are cited elsewhere in this file as "5 A6" and so on. Part 1 rules on the ones that needed a decision; for the rest, apply the row's fix, or follow the rule at the top of this file.

### A · Motion vs component vs flow (and flow vs its own delta)

| # | Side 1 | Side 2 | Disagrees / missing | Chose (PR) | Single-source fix |
|---|---|---|---|---|---|
| A1 | `motion/defs-a.js` #8 "Hold to check in": 48 pt pill; track `#242121` + 1 px 16% border; label 700 14/20, white at rest, `#0D0C0C` over the fill; 1 px quarter marks at 25/50/75%; "Hold to check in" → "Checking in…"; sub-line "You're here. Hold to check in." | `flow-4/Flow 4 · Core loop.html` Tonight #06 (`F4.tonight` → `journey/ui.js` `JU.hold`) and `components/HoldToConfirm.html`: 56 pt; `surfaceSunken` with no border; 700 16/20 with a fingerprint at 20; `textSecondary` at rest (ROUND3 F4 approved this); white over the fill; no marks; "Hold to blend in" → "Checking you in…" | The motion card draws a different pill from the flow and the component: height, track, type, label colours, marks and both strings all differ. "Ticks" in brief §9.3 #8 and SCREENS (Tonight) are haptic, but #8 draws them as visible marks | #391: Flow 4 geometry and copy; #8 for timing, `H.tick`/`H.commit` and the release rewind. No visible marks | Redraw #8 on the Flow 4 pill and copy, and say once whether quarter marks are drawn. |
| A2 | `components/HoldToConfirm.html` refused: "a destructive ring on the pill for one #20 shake, then the label comes back"; `H.error` at t0 | `motion/defs-a.js` #10: `H.error`, "the pass drains on M.settle, not a bounce. Then the refusal sheet"; Flow 4 Tonight #16–#22 notes: "H.error once · pass drains M.settle"; R3-D4 4.7 the same | Two refusal choreographies. #10 also carries its own sheet copy, "Not quite inside yet / Move closer to the entrance and try again.", which is not Flow 4 #16's "Not quite there yet / You're about 180 m from the door… (server copy)" with Open Maps | #391: #10 and R3-D4 (drain, no ring, no shake) | Delete the ring and shake from the HoldToConfirm page, and give #10 Flow 4 #16's sheet. |
| A3 | `components/HoldToConfirm.html` screen reader: "Hold to blend in, button. Double-tap to check in." Busy: "checking you in". Its SR cell draws a "Check in" button labelled "Check in. Double-tap to confirm." | Flow 4 Tonight group: "label 'Check in. Other people at this event will see you.'". `components/events.js` VenuePass consequence line: "Checks you in. Other people at this event will see you." `components/VenuePass.html` SR: "You're here. {title}. {N} inside now…" then the hold button. DESIGN-BRIEF §12 uses the Flow 4 words | Three screen-reader strings for one control. Only Flow 4 and the brief state the consequence | #391: "one strong button"; the label it carries is not stated | Name one accessible label and hint for the check-in hold, and use it on the page, the flow and the pass. |
| A4 | `motion/defs-a.js` #9: a panel inset 12/40/24, radius 24, `#242121`; the venue at 700 20/26 top-left; the flood rises inside the panel; "You're in." at 900 28/32 −0.8 bottom-left, fading in at 200 ms; Room crossfade at 700 ms | Three other versions: `journey/moments.js` `JM.flood`, used by `flow-4/flow4-proto.js`: a full-screen feathered flood, "You're in." in the moment role, centred at 40% height, flood out at 760 ms. `components/MomentPour.html`: a flood "from the foot of Tonight under 'You're in · Toit'", from `JM.pourStill`, 900 ms. Delta R2-D1 "success" (`flow4-delta.js`): the docked pass reads "You're in" with the hold full | Four drawings of the one ceremony. The device drive filmed the full-screen one (DESIGN-DIFFS "Check-in success") | #389 built `JM.flood`; the owner rejected it. #392 rebuilt to #9: on Tonight the flood fills the measured docked pass (R2-D1); #9's 12/40/24 panel only on the event screen | Draw one pour, inside the docked pass, and retire `JM.flood`, `JM.pourStill` and the MomentPour page's full-screen version. |
| A5 | DESIGN-BRIEF §9.2 spring table: `M.celebrate` is for "the check-in pour". `components/MomentPour.html`: "H.commit at the end of the hold, H.success as the flood crests"; Reduce Motion "cuts to the filled state"; "900 ms, M.settle" | Brief §9.3 #9 and `motion/defs-a.js` #9: `M.settle` ("a fill is an effect… no bounce"); "H.success on the server answer, once"; Reduce Motion "200ms crossfades; haptic kept" | Spring, duration (900 vs `M.settle`'s 420), haptic moment and Reduce Motion behaviour each have two answers. No motion card uses `M.celebrate` at all | #388/#392: `M.settle`; `H.success` at mount (the server's answer); 200 ms crossfade | Take the pour out of `M.celebrate`'s list, and set the MomentPour page's haptic and Reduce Motion to #9's. |
| A6 | `flow-4/Flow 4 · Core loop.html` Tonight #14 "Why do you go out?": chips 'Meet people' · 'Live music' · 'Dance' · 'Network' · 'Just out'; "Pick what fits tonight. It shapes who you meet next." | Three other vocabularies, and ROUND3 D3 ("One field: intent… Dating · Friendship · Networking · Just here for the event"; R3-D1 2.1: "One answer"):<br>• `flow-3/flow3.js` event-preferences, askIntent: rows Networking · Making friends · Dating · "or" · Just here for the event, multi-select with an exclusive last row<br>• `flow-14/flow14.js`: Dating · Networking · Friendship · Just here<br>• `flow-2/flow2.js` LOOKING and `components/LookingForCard.html`: Dating · Friendship · Networking · Travel · Open, multi-select | Five label sets and two selection models for one field. Flow 4 #14 contradicts D3 outright. `flow-1/flow1-r3d1.js` `intent()` (R3-D1 #15) already draws D3's four tiles as a single choice, but the LookingForCard page still says "five photo tiles… Multi-select" | #389/#392 kept the existing `/event-preferences` screen (the Flow 3 shape) after the pour; #14's sheet was not built. DESIGN-DIFFS compares the device to Flow 3 #01 | Redraw Flow 4 #14, Flow 3 prefs, Flow 14 and the LookingForCard page with D3's four labels, single choice. |
| A7 | Flow 4 Room #06 "Someone walks in" and the dock line (`flow4.js` `DK.lines`: 'Priya walked in'); `journey/screens.js` dock; the `F5.room` feed | `flow-4/Delta R3-0.html` C1 deletes it, and C12 deletes Tonight #20 "At capacity" and #21 "Already checked in". These deletions are a DOM text-scrub (`fixArrival`) copied into `flow4-proto.js`, `flow4-r3d4.js`, `flow5-proto.js`, `flow9-r3d9.js` and `a11y/a11y.js` | The builders still emit the deleted line. Frames that don't scrub it still show it: `flow4-delta.js` (R2-D1 Room frames), `round2/r2d7.js` and `flow-7/flow7-delta.js`, all on the dock's default, `'lines'`. Frames #20–#21 are still on the Flow 4 canvas. `journey/Core Journey.html` renders `JS.room` 4× with no scrub. The device still prints "Midnight Lark walked in" (DESIGN-DIFFS, Room header) | #390 draws neither "walked in" nor "edited" | Fold R3-0 into the builders: delete the line in `F4.room`, `F5.room` and `JS` screens, and delete Tonight #20–#21. |
| A8 | Disc pill: ROUND3 E #28 and `motion/defs-c.js` #28: "0.8→1 + fade over quick; digits roll on M.snap; leaves with a quick fade". ROUND3 4.6: d → a "drains… on M.settle" | `centre-button/transitions.js` and §11.4: the pill pops from 0.6 on `M.pop` and leaves on `M.snap`; d → a is 400 ms `exit`; the #21 card plays the a → b/c rises on `exit` (an ease-in) where §11.4 says ease-out; transitions.js releases the press on `M.snap`, `ScalePress` on `M.press` | The disc's transitions have two specs | #385: transitions.js (`gentle`, 400 ms; digits swap rather than roll); press release on `M.press` | Make transitions.js the one disc spec, and correct #21, #28 and ROUND3 4.6 to match it (or the reverse). |
| A9 | `components/MomentMatch.html`: `H.success`; the headline "It's mutual" in title 24/30 ("brief" type); faces at 104 | Brief §9.3 #11, motion #11 and ROUND3 D 4.4: `H.match` on the landing frame. The other four moments use the `moment` role. Avatar's scale is 24–112 | The page predates #11 and R3 4.4. Also, `flow-4/Delta R3-D4.html` 4.4 says "headline M.celebrate (#11)", but #11 brings the text in on `ease:'entrance'` over `D.base`. `components/sets.js` `momentMatch` draws the stock Lucide `cat` for creatures, where `flow4-r3d4.js` uses the drawn set | #388: `H.match`, `moment`, faces at 112 (Recap 72); the headline rises on `M.celebrate` | Set the page to `H.match`, the `moment` role and an Avatar size. |
| A10 | Flow 2 prototype: Ready's `H.success` fires before the celebration. Flow 10: the Blend moment under Reduce Motion keeps "same timings" | `components/MomentReady.html`: `H.success` as the mark completes. The Match's rule: a 200 ms fade and the haptic at once | Moment timing differs between flow and page | #388: page (Ready); the Match rule (Blend) | Write one Reduce Motion rule for the L4 moments, and put Ready's haptic on one frame. |
| A11 | `backdrop/time-of-night.html`: orbs "off" under Reduce Motion and on Android | Motion #22: "static". Its code moves ±12/±8 in a half-scale phone (±24 pt). `assets/orbs-moment.svg` orange 0.38 vs the token 0.36. The "late" set has no end time | Orb visibility, drift and alpha each have two values; the late set never ends. `time-of-night.html` says "Time of night never reaches this frame" (Android, Reduce Motion), while motion #53 swaps the set on Android and under Reduce Motion (instantly) | #388: visible and still; ±24 pt; the token's 0.36; late ends at 06:00 | State "static, not off", the drift in pt, the alpha from the token, and the late set's end. |
| A12 | ChatBubble, ReactionBar and ContextMenu pages: `H.select` as the bar appears. Composer page: no haptic on Send. ChatBubble "tap to retry": `H.primary` | `haptics/haptics.js` and §10.2, R3-D5 and motion #36: `H.longPress` on the hold, then `H.reaction` scrub/land. Vocabulary, #12 and the Flow 5 prototype: `H.send`. The ReactionBar page also gives `H.select` "on each reaction given or taken back", where #37 and §10 say `H.reaction` | The chat pages' haptics predate the vocabulary. Motion #36/#37 also draw a different six emoji (`👍 ❤️ 😂 🔥 👀 🙌` vs `chat.js` `👍 ❤️ 😂 😮 😢 🔥`) and a different chip (surface + 38% outline vs sunken, yours ringed white) | #390: `H.longPress`, `H.reaction`; `H.send` on send and retry | Correct the three pages to the vocabulary. |
| A13 | `components/TypingIndicator.html`: "the dots breathe one after another on M.fade"; under Reduce Motion, dots held at 40 · 70 · 100% | Motion #14: "opacity 0.35↔1 and Y 0↔−2, a 1200ms cycle with a 160ms phase offset"; under Reduce Motion, a static "typing…" label | Two loops and two Reduce Motion states | #390: the page's dots | Pick one, and fix the other source. |
| A14 | `components/ImageViewer.html`: on black, gradient scrims, dismiss on `M.travel` | `components/chat.js`: ink. Motion #33: release on `M.fling`. No dismiss threshold is named anywhere | Background, scrim and dismiss spring disagree; the threshold is missing | #390: ink; a scrim pill; `M.fling`; #7's 140 pt / 900 pt/s borrowed | Draw the viewer on ink with a scrim pill and name its dismiss threshold. |
| A15 | `a11y/Accessibility.html` and `a11y/a11y.js`: "one element per message group" | ChatBubble page reading order: one element per message, the name a separate button | Two screen-reader structures | #390: per message | Make the a11y page match ChatBubble. |
| A16 | PersonCard "Waved": the page draws a white 56 circle with a check and no word | Flow 15 #18: an outlined surface pill with a hand + "Waved". R3-D4 frames #12/#15: the label settles to a white pill, check + "Waved" | Three drawings of one state | #391: R3-D4 | Redraw the PersonCard page and Flow 15 #18 to R3-D4. |
| A17 | PersonCard page: `H.success` as the wave lands. Motion #51: the hand turns ±14° twice while sending | #51, R3-D4 and ROUND3 E: no haptic on send. R3-D4 #11–#12 draw a busy spinner, then a check, so there is no hand to turn | Haptic differs; the #51 motion has nothing to play on | #391: no haptic; the hand turn not built. It recommends playing #51 on the circle's hand in place of the spinner | Decide the wave-send frame (hand turn or spinner) and drop `H.success` from the page. |
| A18 | R3-D4 frames draw "Here now" on the matched and friend variants | ROUND3 D 4.1: presence only for variant a | Presence on variants e/f | #391: a `here` prop, default off | Remove "Here now" from variants e and f, or rule that it applies. |
| A19 | R3-D4 PersonCard chips: 8% white on iOS glass | P1 `InterestChip`: surface fill | Two chip looks on the card | #391: InterestChip, as is | Draw the card's chips as InterestChip. |
| A20 | `components/RollingNumber.html`: `M.settle`; Reduce Motion crossfades; 28 pt on the Recap | Motion #24 and #26: `M.snap`; Reduce Motion instant | Spring and Reduce Motion differ | #391: #24; `title` (24) | Put #24's spring and Reduce Motion on the page. |
| A21 | Toggle page and SettingsRow page: `H.select` on a switch change | `haptics/haptics.js`: `H.toggle` "(custom toggles only)"; §10.2 | The pages use the wrong token | #386/#387: `H.toggle` | Set both pages to `H.toggle`. |
| A22 | `components/TabBar.html`: `H.select` on a tab change | §10.1 rule 5, §10.2's "none" list and §13. Flow 4 tab strip: "tab switch none" | The page contradicts the flow and the brief | #387: none | Set the TabBar page's haptic to none. |
| A23 | DESIGN-BRIEF §13: Android toggle with a brand-fill track when on; Android primary keeps its scale; Android selected chip label heavier; iOS detail title centred | ROUND3 F1: white track, ink thumb, both platforms. Button page: no scale on any kind on Android. Chip builder: no heavier weight. TopBar page: start-aligned at rest, centred only when condensed | §13 disagrees with the rulings and pages | #386/#387: F1; the page's ripple with no scale; the builder; the TopBar page | Bring §13's Android toggle, press, chip and title lines into line with the pages (or the reverse). |
| A24 | Toast page: live region polite. Field pages: the error read as the hint | §14: errors are assertive | Announcement level | #386/#387: error toasts assertive; field errors are the hint, announced on iOS and an assertive live region on Android | Make the Toast and field pages assertive for errors. |
| A25 | Motion #48: the loader morph's half-cycle is 375 ms | Motion #24: 700 ms. Neither is a token | Two durations, no token | #386: `DURATION.medium` (320) | Give the morph a token duration and use it in #24 and #48. |
| A26 | `components/TextField.html`: "Reduce Motion: the error ring appears without the #20 shake" (so a shake exists). Its builder's resting border is 16% white. Chip intro: a 1.5 pt shared outline. RadioCard blocked: 60%. SegmentedControl pressed: 70% | ROUND3 B10: the shake moves to the primary. Page intro and §12: `inputBorder` 38%. Chip builder: 1 pt. System disabled 45%. `OPACITY.pressed` 85% | Page intros disagree with their own builders and the rules | #387: no field shake; 38%; 1 pt; 60% kept (the reason must stay readable); 70% kept as a constant | Make each P1 page's intro, builder and the brief state one value. |
| A27 | `components/SettingsRow.html` Bold Text note: the hint "stays 400" and "goes 400 → 700" | The `fnt()` builder: 400 and 500 → 700, 700 → 900 | The page contradicts itself | #386: `fnt()` | Delete the note or make it match `fnt()`. |
| A28 | `components/Button.html`: names only `H.primary` | §10.2: `H.destructive` on a destructive confirm. The strong-neutral ("the primary on glass") has no press haptic | Haptics for other kinds missing | #386: none on strong; `H.destructive` on destructive | List the haptic for every Button kind on the page. |
| A29 | `components/InAppBanner.html` wave kind: "says who waved and that a tap waves back"; drops in on `M.settle`; context "tap to wave back" | R3-D9 9.1: "Tap: opens the overlay at their card"; 16 pt down + fade on `base`, out on `quick`; "{event} · now". ROUND3 R2: wave back lives on the card | What a tap does, the motion, the copy and the dwell (page 4 s; Flow 9 9.4 and §21.5 5 s) all differ | #393: R3-D9 for the wave kind; other kinds keep `M.settle` (no delta covers them). iOS slides without the fade | Redraw the InAppBanner page to R3-D9, and give the non-wave kinds a motion. |
| A30 | `components/AchievementBadge.html` and `flow-14/flow14.js`: "Regular here" means "3+ visits in 60 days" | `round3/r3g.js` and `flow-13` R3-G: a regular means "3 or more nights in the last 30 days" | Two definitions of "regular" | Not ruled in a PR | Use one threshold for "regular", or rename the badge. |
| A31 | R3-G (`round3/r3g.js`) and Flow 10/14/11 frames draw CrewCard tags (clear, 1 pt at 22%), CrewStrip's 44 pt raised action, OverlapLine labels (1.5 pt at 35%) and NotLiveNotice's raised well | The shared P0/P1 Chip, Button (56/48/36) and StateScreen (well on `surface`, invisible on a surface card) | The flows draw bespoke versions of the shared components | #393: the flow drawings | Either restyle the flow frames with the shared components or add these as named variants on the component pages. |
| A32 | Delta R2-D7: Stay locked is "a small Plus mark, not a locked row" | Its own builder: the row dimmed to 70% + the server's sentence + a gradient "Plus" chip | The delta's text and its frame disagree | #393: as drawn | Make the R2-D7 text match the frame (or redraw). |
| A33 | "Pour" names three things: the check-in flood (#9); `round2/pass.js` the door pass (PassDisc, §21.5, "the pour" in SCREENS-ADDITIONS 13.2); and the disc "pour in reverse" for live time. "VenuePass" is the check-in pass, though the brief called the G3 door pass that | — | Names collide | #388/#391: MomentPour = check-in; DoorCode = the G3 code block | Rename the door pass and its "pour", and reserve "pour" for check-in. |
| A34 | `components/Facepile.html`, `GridFace.html`, `RollingNumber.html` and `CountTicks.html`: an arrival is "H.arrive on the Room". Facepile: "a new arrival takes a white ring for one M.settle" | Motion #25 (`defs-c.js`): `haptic:'none'`, "their disc enters the grid 0.8→1 on M.snap… Above 'busy' only the count moves". Flow 4 Room annotation: the face "springs in M.pop 0.6→1"; #06 "· none". §10: `H.arrive` is only for a wave or like-back aimed at you | Three arrival motions; four pages put a haptic on an event the card and the flow keep silent | #391: the Facepile's arrival ring on `M.settle` (the page); the Room's arrival is deferred | Make the four pages and the Flow 4 annotation say #25: no haptic, a disc in the grid on `M.snap`, no ring. |
| A35 | `components/VenuePass.html` state "outside the fence · the hold is dimmed": "Go live when you're here · 350 m", "Walk in and the pass arms itself." | The same page's intro: "The pass appears when the phone is inside the event's fence". Flow 4 Tonight: the pass "docks… when inside a fence". Flow 3 Scene #04 "Live · outside the fence" uses a "Not quite there yet" refusal. "Go live when you're here" is the Places venue button's copy | The page invents a state no flow has, with another feature's copy | Not stated in #391 | Delete the outside-the-fence pass, or draw it in Flow 4 with event copy. |
| A36 | `components/TonightCard.html`: "Swiping moves the deck on M.snap"; screen reader "1 of 3… (adjustable)" | Flow 4 Tonight annotation: "deck swipe → M.fling with velocity… VoiceOver 'Next event'" | Spring (and lost velocity) and the screen-reader pattern | #391: `M.snap` + `H.select` on settle; adjustable "1 of 3" with named actions | Pick one spring and one screen-reader pattern for the deck. |
| A37 | `components/EventCard.html` and `components/IconButton.html`: a save is `H.select`; EventCard draws no long-press | Flow 3 Pulse annotation: save "M.pop 1→1.2→1 · H.like"; "long-press 320 ms → peek M.settle 1.03… H.longPress". Motion #36: "Hold 400ms" on cards | The save haptic; the peek missing from the page; 320 vs 400 ms. Flow 3's save pops 1→1.2→1, where motion #15 pops 0.85→1 | #391: tap pushes, no haptic; no peek built | Add the save and peek to the EventCard page with one haptic and one hold time. |
| A38 | `components/MapCard.html`: "On the home map a pin tap is H.select"; each pin is read as "{title}, {time}, pin", nearest first | Flow 3 home annotation: pins are "content art, not controls… a tap recentres · none". Home #08: "map out of the reading order" | Whether pins are controls | #391: 10 pt pins in a 2 pt ink ring; a cluster zooms; focus and haptic not stated | Decide whether pins are focusable controls, and make the page and Flow 3 agree. |
| A39 | `components/AmenityTile.html`: "The Scene's bento and the venue page's 'Good to know': a 76 pt surface tile"; 14 pt icon in the label | `places/fullpages.js`: "GOOD TO KNOW… Plain body, no tiles". Its "HERE TONIGHT" tiles are 96 pt high, with a 22 pt icon and value 500 15/20, and its note says "126 tall in the build" | The cited section has no tiles; three heights (76, 96, 126) | #391: 76 pt, 16 pt icon | Give the amenity tile one height and remove the "Good to know" claim. |
| A40 | `components/SectionHeader.html`: action "700 14 white: 'See all'… the Flow 3 / Flow 4 16 pt 'See all' are unified to this" | `flow-4/flow4.js` Tonight #02–#06 and `journey/screens.js` Pulse: "See all ›" at 700 16/20 in textSecondary | The flows were never updated | #391: 700 14 white (R3) | Redraw the flows' "See all" from SectionHeader. |
| A41 | `components/DayHeading.html`: the date in 700 17/24 ("Sat 4 Oct") + the weekday in meta | `flow-4/flow4.js` Going #05: day headings in `heading` 700 20/26, no weekday. tokens: no 700/17 role | Two sizes; 17 bold is not a role | Not stated in #391 | Set DayHeading to a role and use it in Going. |
| A42 | `components/MeetNextCard.html`: "reshuffles on the timer beside the heading (M.settle)"; a mono "4:12" countdown chip | Flow 4 Room: "Meet next cards crossfade together". Motion #52: out 8 pt left over `quick`, in 16 pt from the right, 40 ms stagger, `M.settle`. DESIGN-BRIEF timeouts: "Refreshes in 12 min" as text, with a warning 30 s before | Three reshuffle motions; a ticking chip vs a sentence | #391: deferred to the Room (#52) | Put #52 and the brief's sentence on the page and in Flow 4. |
| A43 | `components/UnreadDivider.html`: "fades out on M.fade when you reach the bottom" | Motion #29: "the divider is gone on the next visit. Never while it is being read" | The page does what the card forbids | #390: "as their pages" | Set the page to #29. |
| A44 | `components/TypingIndicator.html` "in a DM" draws the creature. `flow-5/flow5.js` dm() leaves a 32 pt spacer + 8 pt gap | `ChatBubble.html`: "a DM · no names, no creature". Flow 5 DM #16: "Typing · aligned with the bubbles"; its keep line: "Fix: … the typing indent" | Indent and face in a DM | Not stated in #390 | Draw typing in a DM flush with the bubbles, no face. |
| A45 | Flow 4 `Delta R2-D1.html` person: "Like for Nebula · H.primary"; "Like as yourself · text · H.primary" | `components/PersonCard.html` and ROUND3 4.1: Like is `H.like` (HeartPop #15). The page has no "Like for {crew}" state | A like with the primary's haptic; a missing state | #382: `H.like` on every Like, crew card included | Set the crew like to `H.like` and add it to the PersonCard page. |
| A46 | `components/ImageViewer.html`: "⋯ offers Save and Report… Save: H.success" | §10: `H.success` is for server-confirmed outcomes; C20: Copy is none. `flow-5/Delta R3-D5.html` #38: the viewer is swipe to dismiss + Report only | A success haptic on a local save; Save not in the delta | Not stated in #390 | Remove Save (or its haptic) from the ImageViewer page. |
| A47 | `components/CoachMark.html`: "You're at Vinyl Night. Hold the button to check in." (pointing at the disc in state c); "Hold the button when you're at the event. It checks you in." | Flow 4 tab strip: the disc is a tap (`H.disc` on press-in) that opens Tonight; the hold is the VenuePass pill. `VenuePass.html`: "Nothing else on Tonight asks for a hold" | The coach mark teaches a gesture no flow has | #390: "as their pages" | Rewrite the coach mark: tap the disc, then hold the pass. |
| A48 | `components/Sheet.html` medium detent "Sign out?": `['Sign out','destructive']` | `flow-7/flow7.js` (#11) and `flow7-proto.js`: `'primary'`. `flow-2/flow2.js` (#06): `'primary'` + Cancel secondary. `flow-7/flow7-r3d7.js` "Sign out everywhere": `'strong'`. DESIGN-BRIEF §16: "Sign out asks first and is **not** red" | Four button kinds for Sign out; the canonical page breaks §16 | Not built yet (Flow 7) | Draw Sign out as one kind (not red, and not the gradient primary) on the Sheet page and in Flows 2 and 7. |
| A49 | `components/Sheet.html`: "The fixed order: primary · strong · secondary · destructive · text", primary first | Flow 7 canvas, group `sheet`: "the primary last on stacks, trailing in rows"; #06 "secondary · destructive · text, primary last". `flow7.js` delete (#13) and `flow-6/flow6.js` safety sheet (#09) put destructive above secondary | Two opposite orders; flows that follow neither | #386: the page's order | State one button order, and re-stack the Flow 6 and 7 sheets to it. |
| A50 | `components/Sheet.html` intro: "buttons are named with the verb, never 'OK'" | The same page's "refusal · server copy" cell and `components/StateScreen.html`: `[['OK','strong']]` | The canonical pages break their own rule | Not stated | Rename both "OK" buttons with a verb. |
| A51 | `components/Toast.html` and motion #19: dwell ≥5 s (≥10 s with Undo); enters −16 → 0 on `M.snap`; exits `quick` + 8 pt drift | Flow 7 canvas, group `toast`: "3 s, 5 s with an action"; "fade + 12 pt rise M.snap… exit 160 exit" | Dwell, rise and exit. The same group says "the older toast steps back 4% and dims" (it dims glass), and its skeleton note says "content crossfades in over quick" where #17 says `base` | #386: #19's dwell (named constant) | Make Flow 7's toast annotation match #19. |
| A52 | Flow 7 about #03 "Version copied" (`{kind:'success',text:'Copied 1.0.0 (118)'}`, "H.select (proposed)") and support #04 "Copied support@blendn.app" | Toast page: "none for info and for Copy (C20)"; motion #46: "none (Copy is never a success)"; Flow 7's own about annotation: "toast 'Copied' · none (C20)" | Copy drawn as a success with a haptic. Motion #46 also says Copy confirms inline ("glyph crossfades to a check… 'Copied' for 2s"), but Flow 6 invite and Flow 7 About/Support confirm with a toast | #386: `silent` toast for Copy | Make every copy action #46's inline check, with no toast and no haptic, in Flows 6 and 7. |
| A53 | `flow-6/flow6.js` `user()` #12 "Like refused" (`H.error`) calls `JS.toast`: a 44 pt capsule at 500 15/20 with a check glyph beside "Likes are for people in the room. (server copy)" | The Toast page: the `journey/screens.js` capsule "is a different shape and stays there"; error toasts carry the error treatment. ROUND3 R4: no haptic on a refusal about another person | A refusal with a check glyph, the wrong component and an `H.error` that R4 removes | Not built yet (Flow 6) | Redraw Flow 6 #12 with the Toast component, no check and no haptic (or as R3-D4 4.3's line). |
| A54 | `components/Banner.html`: offline "Offline. Showing what loaded last."; paused "Live updates paused. Pull to refresh."; "the lead word carries the meaning" | `flow-4/flow4.js` Tonight "Offline. Showing what loaded earlier."; Room "Offline. Some actions won't work until you're back." and "Updates paused. Trying to reconnect." + Try again; Flow 7 #01 "You're offline. Some actions…", #02 "Live updates paused." + Retry, #03 "Reconnecting…"; Flow 15 #16 "Offline. Showing what you had." | Five offline sentences and three paused ones; Flow 7 breaks the lead-word rule | #386: the page's banners | Publish one offline and one paused sentence (with or without the action) and use them in every flow. |
| A55 | Motion #44: "slide 16pt + fade, base in / quick out; content shifts on M.settle" | Flow 4 Room #12 and Deltas R2-D3/R2-D4: "banner fade 150/120". Flow 7 pieces: "fade + rise M.snap · leaves on exit". `components/Banner.html`: no motion, no Reduce Motion | Three banner motions; the page has none | Not stated in #386 | Put #44 on the Banner page and in the flow annotations. |
| A56 | `components/SettingsRow.html` "error · rolled back (#39)": the hint "Couldn't save. Try again." (its intro: "the hint names the setting") | Flow 7 settings #08: a toast "Couldn't save "Read receipts". Try again."; motion #39: "a toast names the setting"; `components/Toggle.html`: "flips it back with H.error once and the toast" | A row hint vs a toast that names the setting. Motion #39 also misnames the setting ("Friends can see me in rooms"; R6, Flow 7 and SettingsRow say "Friends can see who I am in rooms") | #386: `H.error` when the rollback arrives (row state) | Draw the rollback as #39's toast on the SettingsRow page. |
| A57 | `components/SettingsRow.html` "a group at 360 dp": Blocked users (shield, "3") and "Get a copy of your data" (chevron) under "Privacy"; Show online status hint "People in a room can see you're there" | `flow-7/flow7.js`: Blocked users under "Safety" (ban icon); hint "Off: you're counted at events but not listed to other people there." `flow7-r3d7.js`: data export `trail:'external'`. DESIGN-BRIEF §16: "Blocked users under Safety" is test-pinned | The canonical group breaks a pinned order and the flow's copy | #386: the page's group in the gallery | Redraw the page's sample group from Flow 7. |
| A58 | `components/Toggle.html`: "In a SettingsRow: the only place a toggle lives"; "The switch is fixed-size" | `flow-2/flow2.js` preferences: "Show on profile" in a 36 pt pill with `transform:scale(0.8)`, plus a toggle in the anonymity card. `flow-3/flow3.js` prefs: "Do this at future events too" in a 56 pt radius-16 row, not `BC.settingsRow` | Toggles outside a SettingsRow; one shrunk | Not built yet | Put those toggles in SettingsRows (or allow the placements on the Toggle page). |
| A59 | `components/Chip.html` at the cap: "none on a dimmed chip: the tap does nothing, the counter is the explanation" | Flow 2 preferences/details: "a 300 ms shake only… no haptic". Delta R3-D1 #17/#18: "counter nudges on M.press". Flow 6 edit: "at the cap the rest dim, H.error once". Delta R2-D3: "a 4th pick is refused with no haptic" | Five behaviours, two haptics, for one tap. Flows 1 and 2 also give #20's shake as 300 ms; #20 is 320 (`D.medium`) | #387: none, dimmed with the cap as the hint | Choose one at-cap behaviour and annotate every flow with it. |
| A60 | `components/LookingForCard.html` "under 18 · Dating is not drawn"; Flow 2 #05 "Under 18 · no Orientation · no Dating"; R3-D1 #16 "minor · Dating absent"; Flow 3 prefs #08 "Under 18 · Dating hidden"; `flow-14/flow14.js` `!o.minor` | DESIGN-BRIEF §1 "strictly 18+"; §16 "the under-18 path refuses kindly"; Flow 2 basics #04 "Under 18" is a dead end at step 1 | Under-18 states drawn for a product a minor can't enter | #387: the under-18 cell drawn | Delete the minor variants (or rule why they exist). |
| A61 | `components/RadioCard.html` glyph form: "I have space" (car well, "You're offering a ride or a table.") and "I'm looking" (hand well); the source is Flow 4 | `flow-4/flow4.js` Board composer #04/#05: two 32 pt chips ("I have space" / "I'm looking"), 8% white when off, no glyph, no consequence line | The cited source draws something else | Not built yet (Board) | Redraw the Board composer's kind picker as RadioCards (or drop the claim from the page). |
| A62 | `components/TextArea.html`: a surface box, radius 24, 1 pt border, min 160 pt, the counter "n/max" in the label row, amber and never red; "the Board composer is unified to it" | `flow-4/flow4.js` composer: 112 pt, radius 16, 8% white, 38% border, "0/500" inside. Flow 6 "About you": a sunken box, 100 pt, no border, "48 / 500" in the card header. Flow 7 report note: 80 pt, "0 / 500" under the box. R3-D1 #08: "512 / 500" in `#FF5A4F` | Three non-canonical boxes; a red counter | #387: the page | Redraw the Board, Flow 6 and Flow 7 boxes as TextArea, and make R3-D1 #08's counter amber. |
| A63 | Bio cap 500: the TextArea page; Flow 2 keep "one bio cap (500) shared with Edit profile"; R3-D1 #08 "Keep it under 500 characters · 512 now." | `flow-15/flow15.js` `rateLimit('fields')`: "Keep it under 160 characters · 173 now." on a bio drawn as a 56 pt single-line field | Two caps; field vs TextArea | Not built yet | Make Flow 15's frame use the 500 cap and a TextArea. |
| A64 | `components/TextField.html`: "That doesn't look like an email."; "Use at least 12 characters." | Flow 1 sign-in #04 and forgot #05: "Enter a valid email address."; #07 "Use at least 12 characters. Length beats symbols." Delta R3-D1 #06: "Enter a full email address."; "Use 2 to 30 letters." | Three wordings of one error | #387: the page's copy as samples | Publish one email error and one password error and use them everywhere. |
| A65 | Flow 2 journey: `BC.textField` (surface `#242121` + hairline) inside a radius-32 surface card | Flow 6 edit ("inputs 56 pt pills on surfaceSunken"): `#1A1818` pills, padding 20, no resting border; the error "Enter your age" with no icon | Two treatments of a field on a card; the page covers neither | #387: not covered | Add the "field on a surface card" variant to the TextField page. |
| A66 | `components/inputs.js`: textField, textArea and dateField placeholders in T3 `#9A9594`; Flow 1 #03 "placeholder textTertiary" | `tokens.json` `text-placeholder` `#8F949D` (used only by searchField); DESIGN-BRIEF §4.1: "cool on purpose, so an empty field never reads as filled" | Three of four inputs ignore the placeholder token | Not stated in #387 | Use `text-placeholder` in all four input builders and in Flow 1's note. |
| A67 | `components/DateField.html` "invalid date · ring only" (no sentence); spec "H.error once if… refused on submit (under 18, impossible date)" | Flow 2 basics #05: "That is not a date we recognise." with "none (as-you-type validation)"; Delta R3-D1 #07 repeats the sentence | Copy and haptic for one state are opposite | #387: invalid = ring only; refused = ring + sentence | Pick one invalid-date treatment for the page and Flow 2. |
| A68 | `components/Stepper.html`: "A disc at its bound dims to 45% and does nothing"; no roll; haptic "none at a bound" | ROUND3 E #40 and motion #40: "a stepper's digits roll; at a bound, a 4pt nudge on M.press" | No roll and no nudge on the page. Motion #40 also draws the Go Live dial as "Go live for" 1 h → 2 h, where GoLiveSheet and Places offer 20 / 45 / 60 min and Stay | #387: the page (45% at a bound) | Add #40's roll and nudge to the Stepper page. |
| A69 | `components/Button.html`: loading is a spinner after 300 ms with the label kept ("The label never changes to 'Loading'"); disabled 45% | `flow-3/flow3.js` prefs: the primary becomes "Saving…" with no spinner (#06); disabled is `background:SURF;color:T3` (#01) | Both states contradict the canonical Button | #386: the page | Redraw Flow 3 prefs #01/#06 with the Button's loading and disabled states. |
| A70 | `components/TopBar.html`: "Save: H.primary press-in; H.success when the save lands" | Button page and motion #45: `H.primary` "only where no outcome haptic follows within ~1 s". Flow 6 edit Save: "H.success on OK · H.error" | Two haptics the rule says not to pair | #387: Save plays `H.primary` | Drop `H.primary` from TopBar Save. |
| A71 | `components/StateScreen.html`: suspended "Your account is suspended" / "Write to support ↗"; Android "Blend'n can't reach the server"; title 700 24/30; wells 56 or 80 with a white or T2 glyph | `flow-15/flow15.js`: "This account has been suspended." + "Email support" / "Back to start"; "Can't reach Blend'n" / "You're still signed in…"; Flow 1 forgot #03: a 72 pt well; Flow 7 ErrorBoundary: a red `#FF5A4F` glyph and "CONTACT SUPPORT" as a mono label, not a button | Copy, well size and glyph colour differ from the flows the page lifts from | #386: the page's 56/80 wells | Make Flow 15/1/7 use StateScreen's wells and one set of sentences. |
| A72 | `components/Loader.html`: sections use the morphing loader; Reduce Motion "wait line at 5 s" | Flow 2 journey #03, details #03 and friends #01: a spinner + a line. Motion #48 and brief #24: under Reduce Motion, "static mark + text from t0" | Which loader in sections; when the line shows under Reduce Motion | #386: the line still at 5 s under Reduce Motion | Make Flow 2 use the Loader, and set one Reduce Motion rule. |
| A73 | Small disagreements:<br>• `components/SegmentedControl.html` says "nothing else drew one", but `flow-3/flow3.js`'s drawer draws Events \| Places as an 8% track in the glass drawer<br>• `components/Avatar.html` "a stack of six at 32" vs `Facepile.html` "up to five… then '+N'"<br>• the Flow 7 sheet annotation "drag past 80 pt… springs home M.settle" vs motion #5 "30%… M.fling"<br>• the Android Try again haptic: Flow 1 A2 `H.primary` (VIRTUAL_KEY) vs Flow 15 15.13 A1 none | — | Small cross-source disagreements | Not stated | Resolve each in the component page and the flow annotation together. |
| A74 | `flow-16/flow16.js`, unlisted event: the share tray subtitle `· ${EV.venue}, ${o.unlisted?EV.area:EV.area}`, the image card line `${EV.venue} · ${o.unlisted?EV.area:EV.area}` and the WhatsApp preview description (16.2 #14). The ternary is a no-op, so the venue always prints | `flow-16/flow16-groups.js` 16.1 #06 "Unlisted event · area only"; 16.4 #02 "area only · noindex"; the message box in the same tray shows "Indiranagar" only | An unlisted event's frames leak the venue name, against the flow's own rule | Not built yet (sharing) | Redraw the unlisted tray, card and preview with the area only. |
| A75 | Motion #12–#14 and #35–#37: your bubble `#fff` with `#0D0C0C` text, inbound `#242121`, radius 15, tail 4; #12 crossfades the fill to white | `components/chat.js` `chatBubble`: yours surfaceRaised, inbound surfaceSunken, radius 20, tail 6; the ChatBubble intro: "Nothing is coloured" | Every chat motion card draws a different bubble | #390: the component | Redraw the chat cards' bubbles from ChatBubble. |
| A76 | Motion #37: "someone else reacts" writes "Night Owl reacted" in the phone | ROUND3 E #37 and `flow5-proto.js`: "Other people's: roll only"; `motion/rejected.html` rejects incoming reaction bursts | The card names another person's reaction | #390: other people's reactions roll the count | Delete the line from #37. |
| A77 | Motion #41/#42: pins `#F05423` with a 2 px white ring; the cluster a white disc with ink "500 10px" digits | `components/MapCard.html`: "Pins are 10 pt dots ringed in ink… one cluster: an ink disc, a white ring and the count" | Pin ring and cluster polarity | #391: the page (10 pt pins, ink ring) | Redraw #41/#42's pins and cluster from MapCard. |
| A78 | Motion #45: "I'm going" → "Going"; stays on gradientBrand; width settles 120 → 96 | `flow-3/flow3-proto.js`: → "You're going" with a check; "pill goes quiet" (gradient → 8% white); "the width is already full so nothing settles" | Label, end state and width for the same button | Not built yet | Make #45 and the Flow 3 prototype one sequence. |
| A79 | Motion #26: a pill with a live dot, the number 47 → 48 and the bucket word "Lively" → "Busy"; #25: "Above 'busy' only the count moves" | `inputs.js` LivePill: "a bucket word, never a number"; brief §21.1 "a bucket, never a number"; buckets "Under 5 · 5–9 · 10–19 · 20+ live" (`places/Places.html`, `flow11.js`); the map ramp quiet/few/busy/packed | "Lively" is in no set; a number beside a bucket; "busy" is undefined, so #25's threshold is too | Not built yet | Publish one bucket set with numeric bounds, and redraw #26 with it. |
| A80 | Motion #28 badge/dot: in 0.8→1 + fade over `quick`, out with a `quick` fade | Flow 5 Banter: "unread dot pops in / out M.pop"; Flow 9: "badge clears · at once when the screen opens" | Three badge motions | Not built yet | Annotate Flows 5 and 9 with #28. |
| A81 | Motion #43: title "Your night" (22 px); blocks "2h 14m at Fandom" · "3 people met" · "1 match"; title rise + 28 ms stagger | `components/MomentRecap.html`: "It's over · That's a wrap", two tiles (time in the room, matches). Flow 4 Recap: "That's a wrap" in moment type, two stat tiles, "entrance fade base". `flow-4/Delta R3-D4.html` 4.5 #22 adds the "People from tonight" row, which the MomentRecap page lacks | Title, block count (an invented "people met"), entrance and a missing row | #388: the page's four states (no People from tonight) | Redraw #43 and MomentRecap from Flow 4 + R3-D4 4.5. |
| A82 | `components/MomentBlend.html`: "H.success as the emblems meet" | `flow-10/flow10-groups.js` 10.8: "like the Match (§9.3 #11 …) · H.match for the person whose like made it only"; #06 (seen on next open) "none"; §21.5 | Haptic, and who gets it | #388: `H.match`, only for the person whose like made it | Set the MomentBlend page to `H.match` for the liker only. |
| A83 | `components/CrewStrip.html`: "Crew Nebula · 2 of 4 here"; screen reader "2 of 4 here" | `flow-10/flow10b.js` and 10.6: "Crew Nebula · 2 of 4 in" | "here" vs "in" | Not stated in #393 | Pick one word. |
| A84 | `H.primary` and `H.select` on secondaries and rows:<br>• CrewStrip page and Flow 10 10.6: "H.primary press-in on We're here" (drawn as a raised secondary)<br>• Flow 12 12.1: the free path "full-weight button · H.primary" beside "Continue — ₹49 · H.primary"<br>• `flow-13/Delta R3-G.html`: "Stop offers from Toit · H.select"<br>• Flow 12 12.4: "locked row · H.primary" | §10.2: `H.primary` is "the screen's one gradient primary"; §10.1 rule 5: secondaries and rows are silent. ROUND3 E #45 says "We're here" is a secondary with no press haptic | Haptics on non-primaries | #393: `H.primary` on the strong free path; "Not now" silent | Re-annotate these four with the §10 vocabulary. |
| A85 | `components/CrewCard.html`: "Liked keeps the heart" | `flow-10/flow10.js`: Like with no heart; Liked as a ✓ "Liked for {crew}". DESIGN-BRIEF §8: liked is "the same outline heart in ink inside a solid white badge" | Three liked states | Not stated in #393 | Pick one liked treatment for crew cards. |
| A86 | `components/NeverForSalePanel.html` (`social.js`): a surface card, radius 24, heading 700 20/26 white, "drawn as plainly as the plans" | `flow-12/flow12.js` page: a 1 px 14% hairline outline, no fill, a `shield` icon, heading 500 17 in textSecondary; refs "a quiet hairline panel (the page's memorable detail)" | Fill, heading, icon | #393: "components/social.js (canonical lift)" | Make the page match Flow 12's panel (the memorable detail). |
| A87 | `flow-11/flow11.js` `venueBoard` (11.1 #01): Bar `#3A2A3E→#5A3328`, Live music `#422B2B→#2F3A2C`, Restaurant `#2E3A33→#4A2E3A` (no token); a 72 pt ringed disc with a white glyph over the orbs, noted "(PL.venueArt)" | `tokens.json` `palettes.plate` and `sets.js` PLATES: bar `#3A3328→#4A3A2E`, live-music `#422B2B→#3A2A3E`, garden-bar; the glyph at 70% white on a full-bleed split | Colours, the set of types and the rendering | #384: the tokens' six plates | Redraw Flow 11's venue art from the plate tokens (and add or drop Restaurant). |
| A88 | Copy drawn in motion cards that no flow uses:<br>• #47 "Nothing yet tonight" (`flow4.js` Going: "Nothing here yet")<br>• #44 "Slow down a moment" + "0:10" (Flow 15 #15: "Slow down — try again in a minute")<br>• #10's sheet (A2), #39's setting (A56) and #43's recap (A81) | The flows | The cards carry their own strings | — | Use flow strings in the cards. |

### B · Rule breaks (tokens, glass, type floor, contrast)

| # | Side 1 | Side 2 | Disagrees / missing | Chose (PR) | Single-source fix |
|---|---|---|---|---|---|
| B1 | `motion/defs-a.js` #8 `lab2` and #10 `lab`: `#0D0C0C` text on the `gradient-fill` | `tokens/tokens.json` `text-on-gradient` #FFFFFF (ink is only `text-on-orange-flat`) | Ink on the gradient | #391: white | Redraw #8 and #10 with white on the fill. |
| B2 | `motion/defs-a.js` #9 "You're in." at 900 28/32 −0.8; the venue at 700 20/26, no tracking | Type roles: `moment` 44/48 (DESIGN-BRIEF §6 names "You're in." as a moment string); `heading` 20/26 −0.2 | Off-role type in the one ceremony | #392: 28/32 as drawn; `heading` with −0.2 for the venue | Set "You're in." in a role (moment, or a new one) and the venue in `heading`. |
| B3 | `flow-16/flow16.js` `ORANGE='#FF7A1A'`: the "18+" chip (`chip18`), and the date/time, "VENUE" and date-line accents on the OG and story images | Tokens: `brand-orange` #F05423; no #FF7A1A | Not a token | #393: `brandOrange` | Replace #FF7A1A with `brand-orange` in Flow 16. |
| B4 | `round3/r3g.js` `offerEdits`: `BC.iconButton(top,'ellipsis',{tier:'control'})` sized 36×36 on the offer card | `<Material>` and §5: no glass on cards; targets are 44/48 | Glass on a card; under the target size | #393: a plain 36 pt ellipsis on the card surface, slop to 44/48 | Draw the offer card's ⋯ as a plain glyph on the card, with a 44/48 target. |
| B5 | `flow-16/flow16.js` story `imageCard` (1080×1920): the link line `mono(c,36,EV.url…)`, the "I'm going" pill 700 36/64, the recap's 'blendn.app' at 36 | `components/StoryCard.html` shows the story at 270 wide (¼), where these render at 9 px. `type.floor` 12. Nothing says what the floor is on an exported image | Under the floor as the page shows them; no rule for exported images | #393: the floor × 4 = 48 px | State the type floor for 1080-wide exports and size the story's small lines to it. |
| B6 | `flow-16/flow16.js` share tray: `['Instagram Story','instagram']` | Lucide 1.x has no brand icons; ROUND3 B6: one inventory | A brand glyph that doesn't exist | #393: `camera` | Name the Instagram row's glyph from the inventory (or supply a licensed brand mark). |
| B7 | The pages load Lucide 0.469: `bar-chart-3`, `circle-help`, `fingerprint` (the hold's glyph), `trash-2`, `pause-circle` | Lucide 1.x: `chart-column`, `circle-question-mark`, `fingerprint-pattern`, `trash`, `circle-pause` | The inventory uses old names | #382/#386: mapped | Move the inventory and the pages to Lucide 1.x names. |
| B8 | Glass that fades:<br>• Toast #19 enter/exit fade<br>• Sheet page Reduce Motion fade<br>• TopBar page "M.fade 160 ms" on the bar glass<br>• Motion #36 Reduce Motion "the menu fades over 200ms" + the bar's opacity ramp<br>• transitions.js fades the disc's (c) glass label<br>• InAppBanner fade<br>• motion #30's `setG` ramps the bar tint and blur over 250 ms (its own desc: "never animated opacity")<br>• the glass pills in #13 "New messages ↓", #27 "↑ New" and #49 "3 new ↓" fade in by opacity<br>• #33's Reduce Motion fades the glass PersonCard | §5.2 rule 6 / `<Material>`: glass materialises, never fades (ROUND3 E #30) | Rule broken in nine places | #386/#387/#390/#393/#385: glass moves or mounts; contents fade; Android solid fades | Rewrite those cards' and pages' iOS motion as move/materialise, with fades only on Android solid. |
| B9 | Other glass misuse:<br>• IconButton disabled 45% on the glass circle<br>• the hold dimmed to 45% inside the glass pass (`components/events.js` `hold`: the VenuePass page's outside-the-fence state; Flow 4 Delta R3-D4 #31, "between days · hold disabled 45%")<br>• TopBar's glass circles on the scrolled bar glass<br>• §12: SegmentedControl "a glass capsule" | §12 "never on glass"; "no glass on glass"; the SegmentedControl page and B10 say solid | Rule broken or self-contradicting | #386: the glyph dims, not the circle. #387: kept the circles (P0 IconButton); solid segmented | Fix the IconButton and TopBar pages and §12's SegmentedControl line. |
| B10 | Material: tokens `glass-tint-text` 0.60 ("toasts, composer") | The Material page and `components.js` draw toasts at 0.80, and `material.js` at 0.60. Media tint: page 0.25, `material.js` 0.20, no token. The blur tier for control/media is ink 0.72 in `components.js` and `blur-material` surfaceSunken 0.72 in the tokens. The solid tier is surfaceSunken 0.94 on the page and `#242121` in the tokens/§5.3. Sheets on iOS 16.4–25 are "opaque" in §5.3 and blur 0.94 in the tokens | The token file and the Material page disagree on five values. `textSecondary` at 0.60 over white is 2.35:1 | #382: 0.80; 0.25; the tokens; blur 0.94 | Regenerate `tokens.json` from the Material page's values (adding a media tint) and make §5.3 match. |
| B11 | Disc: `centre-button/disc.js` pill 16 pt; glow outer alpha 0.35 with spread; the optional sheen has no gradient token. `motion/defs-c.js` #28 draws an orange badge on the disc | `SIZE.badge` 18; `MATERIAL.glowCheckIn` 0.40, no spread; §11.2 rule 6: white pill, ink digits | Values off the tokens; the badge against the rule | #385: the tokens; no sheen; white pill | Draw the disc from the tokens and fix #28's badge. |
| B12 | Tokens the pages use but `tokens.json` lacks: the 1.3× cap in fixed controls (`MAX_FONT_SCALE.button` reads 2); the 36 pt row action; toast 15/20; pressed washes 6%/12%; the spinner track 25%; sheet handle; Android 50% scrim; toast dwell; spinner period; `--dur-hold`/staff duration | ROUND3 B2/B3 | Missing tokens | #386: named constants in `components/ds/shared.ts`, each citing its page | Add these to `tokens.json`. |
| B13 | Off-role type sizes:<br>• Price 32<br>• RollingNumber 28<br>• SectionHeader count Mono 18<br>• GridFace/MeetNextCard names 500 15/20<br>• toast 15/20 Medium<br>• RadioCard avatar 64, Match faces 104, Recap 80<br>• LinkPreviewCard pixel sizes 48, 168, 88, 96<br>• the TopBar Save pill and ManageStatusRow "Fix it in…" at 44 pt<br>• `flow-15/flow15.js` `sys` titles 700 28/34<br>• Mono 13 counters ("Step n of 8" on the ProgressBar page and Flow 2; "3 of 10")<br>• Flow 1's Google/email labels 500 21/24 "to match Apple's" (Apple's is 17)<br>• buttons at 44/32 (Flow 6 `pillBtn`), 32 (Flow 2 Retry) and 40 (Flow 7 Android dialog) | Roles `display` 34, `title` 24, `heading` 20, `meta` 14; Avatar sizes; Button 56/48/36 | Off the scales | #387/#391/#393: snapped to the nearest role or size | Snap these in the pages. |
| B14 | Off-scale spacing and icon sizes:<br>• P0: 14, 10, 6, 28<br>• P1: 6, 10, 20<br>• P3: 14/18 pt glyphs, 10/14 paddings<br>• P2: AmenityTile 12/14 padding, 14 pt icon<br>• P4: 10, 13, 14, 15, 22<br>• 22 pt `sliders-horizontal` and plus glyphs on the SearchField and MonoFamily pages and in Flows 2, 3 and 6<br>• Chip Android pressed corner 8 dp | SPACE 2/4/8/12/16/24/32/48; ICON 16/20/24; `radius.pressed-android` 12 | Off the scales | #386/#387/#390/#391/#393: snapped | Snap the builders to SPACE and ICON. |
| B15 | `components/SwipeRow.html` destructive: `#FF5A4F` fill with white text | 3:1; the token `destructive-fill` #D92D20 exists for this | Contrast | #390: `destructiveFill` | Use `destructive-fill` on SwipeRow. |
| B16 | Shadows: SwipeRow's open row, the CoachMark card, and the MapCard address text-shadow | Surfaces are flat (DESIGN_SYSTEM, §5) | Shadows drawn | #390/#391: none | Remove the shadows. |
| B17 | MapCard: ground `#141212` with SVG roads, building plates under pins, a rose venue ramp | `surfaceSunken`; the real map (client #383's night palette); violet venues | Non-token ground; the ramp disagrees with the map | #391: `surfaceSunken`, a map slot, violet only | Draw MapCard as a frame around the real map, with token pins. |
| B18 | Under 12 pt after ROUND3 B8:<br>• `flow-2/flow2.js` onboarding dock note `font-size:11px` and the "You" tag `font-size:11px`<br>• `flow-3/flow3-r3d3.js` multi-day day strip 500 11/14 (R3-D3 3.2, a new frame)<br>• in-phone UI in the motion cards, at full scale (their titles are 20/24): 9 px in #52 (Meet next names); 10 px in #27, #28, #29, #42, #46; 11 px in #13, #14, #17, #21, #26, #27, #33, #35–#39, #43, #44, #47, #49, #51 | `type.floor` 12 | The floor broken again, including in an R3 delta | Not built yet | Raise these to 12. |
| B19 | Motion names outside the vocabulary: "M.fade" (the TimeRing, TypingIndicator, UnreadDivider, ReceiptMark and TopBar pages; RevealSheet "discs cross-fade to photos (M.fade)", where Flow 10 10.9 and §21.5 say `base` with a 40 ms stagger). Durations outside the tokens: "fast 160" (Flows 1 and 2), "banner fade 150/120" (Flow 4 Room #12, Deltas R2-D3/R2-D4) | §9: press · snap · settle · travel · fling · pop · celebrate, durations by name | Not a token | #391/#387: a `base` fade | Replace "M.fade", "fast" and 150/120 with duration tokens. |
| B20 | Annotations rendered as copy:<br>• `flow-10/flow10b.js` crew strip "off": "Crews are off at this event. The strip hides and "We're here" is refused." (the same file's `F4.banner` version is just "Crews are off at this event." + a note)<br>• "(server copy)" printed as UI text: StateScreen `server:true`, the PersonCard "pre" variant, SystemNotice | — | A designer's note shipped as UI text | #393 (owner's ruling): "Crews are off at this event." only. #386: "(server copy)" not rendered | Move both notes out of the drawn string. |
| B21 | `components/ReactionBar.html`: "40 pt targets". `components/events.js` RevealBar: "Show them who you are" and "Ask them" at `height:40px` | tokens: target 44/48; control 48 | Under the target size, off the scale | #391/#390: built (RevealBar actions wrap) | Make both 44/48. |
| B22 | `components/chat.js`: Send pressed `scale(0.94)`, ReactionPill 0.94, a PollBubble option 0.98 | token press scale 0.97 (0.9 only for the disc). Flow 5 Room: "Send gradient disc 44 · press 0.9 M.press" | Four press scales | #390: not stated | Use the token press scale in `chat.js` and Flow 5. |
| B23 | `components/Sheet.html` tall detent "Report this message" drawn with `BC.mat('sheet')` (ink 0.80 + blur 20); the flows' report, filters and "Write a post" sheets inherit it via `BC.sheet` | DESIGN-BRIEF §5.3: "Task sheets (report, edit, filters): Opaque at full height"; the Flow 7 group `sheet`: "solid at full height" | Glass where the brief says opaque | #386: the Sheet holds the glass tier (not stated per detent) | Draw full-height task sheets solid on the Sheet page. |
| B24 | Motion #45 primary: `linear-gradient(135deg,#F05423,#BE5C71,#925DA9)` (gradientBrand) with a white label; #46's share card: white 12 px text on gradientBrand, plus `rgba(255,255,255,0.8)` text at 10 px | DESIGN-BRIEF §5.3: "Primary button: Solid gradientFill"; `components.js` button uses FILL (#D83F0F…); white on #F05423 is 3.50:1 (#366) | White text on the gradient that fails AA | Not stated in #386 | Redraw #45/#46 on `gradient-fill` with opaque text tokens. |
| B25 | Motion #27 row dot `#F05423`; #29 unread pill `#F05423` with `#fff` "500 10px" text; #35 reply bar `border-left:2px solid #F05423` on the glass composer | `inputs.js` PresenceDot "10 pt white (unread, Flow 5 rows)", the badge white with ink; `flow5-proto.js` #27 sets the dot white; ReplyPreview "a white rule"; `text-on-orange-flat` is ink; §5.2 rule 4: no colour on glass but the one primary | Orange where the system draws white, white on orange, colour on glass | #387/#390: white dot, white pill, white rule | Redraw #27, #29 and #35 with the white dot, pill and rule. |
| B26 | Motion #44 iOS banner: `rgba(36,33,33,0.9)`, radius 10, a grey `#9A9594` dot | `components/Banner.html`: "Banners are always solid… two tints (destructive for offline, warning for paused)… 16 pt radius"; §5.3 "Solid, always" | Translucent banner, wrong radius and tint | #386: the page's banner | Redraw #44 from the Banner page. |
| B27 | Colours in the motion cards that aren't tokens:<br>• off track `#3A3636` (#39, #40); tokens/Toggle `#959090`<br>• detent dots `#5A5555`<br>• map blocks `#1F1C1C`, lit `#3A2A22`/`#5A3A2A` (the token ramps are oklch)<br>• the defs-c face palette `#3a5a4a`… (not `palettes.creature`)<br>• `rgba(36,33,33,0.86)` (#33, #34, #41) and `rgba(36,33,33,0.9)` (#36, #37, #44, #46, #51)<br>• #26 pill `rgba(255,255,255,0.10)`<br>• placeholder photo gradients in #4, #11, #15, #23, #32 | `tokens.json` | Raw colours | — | Redraw the cards from tokens (and mark photo placeholders as slots). |

### C · Missing choreography and states between frames

| # | Side 1 | Side 2 | Missing | Chose (PR) | Single-source fix |
|---|---|---|---|---|---|
| C1 | Motion #9 and `flow4-proto.js`: the pour hands to the Room at 700 ms, with no question | Flow 4 Tonight #12/#13 (reveal offer) and #14 ("Why do you go out?") are drawn as still sheets over Tonight. SCREENS: "after check-in: the reveal offer… **or** the 'Why do you go out?' question" | Not drawn:<br>• pour → sheet → Room, and how long "You're in." stays before a sheet<br>• the order when both questions are due<br>• what a backdrop dismiss means <br>The prototype never shows either sheet. Three PRs in one day built three answers | #389: Room first, intent on top of the Room. #392: pour → reveal → intent → Room, held until the intent screen unmounts; a backdrop close of the reveal = "no". #394 (after the device showed the sheet rising over a fading pour): with a question, "You're in." holds until an invented `ASK_AT` of 1600 ms, the pour fades over `D.base`, then the sheet; with none, the Room at 700 ms | Draw pour → (reveal) → (intent) → Room as timed frames: the hold before a sheet, the order when both are due, and the backdrop close. |
| C2 | Flow 4 #12–#14 draw the pass re-armed behind the sheet ("Hold to blend in", `PASS` with no progress) | Delta R2-D1 "success": the pass reads "You're in" with the hold full | What Tonight shows behind a post-check-in sheet. The device drive hit this (a live "Hold to blend in" for 0.3–0.8 s) | #392: the R2-D1 "You're in" pass | Redraw #12–#14 over the "You're in" pass. |
| C3 | Motion #9: the Room crossfade at "~700ms" | No frame for a Room that hasn't loaded at 700 ms | The wait state | #392: `ready` holds the pour full until the Room loads, with a 4 s limit (`ROOM_WAIT_MS`); after that Tonight shows and the Room's poll brings it in | Draw the held pour and say what happens at the limit. |
| C4 | Motion #9 and Flow 4 assume the overlay's docked pass | The event screen (Scene) checks in with no pass. Where it hands off (its chat, or the Room) is not drawn | The pour and hand-off from the event screen | #389: hand-off into the event chat (replace). #392: push the chat; #9's 12/40/24 panel. This fixed an Android crash | Draw the event-screen check-in success and its destination. |
| C5 | Delta R2-D1 "success": the "Tell your crew — We're here" strip grows the pass by 130 pt (250 with two crews) after your check-in | Motion #9 leaves the pass at 700 ms | When the strip is seen or tapped, since the pass is gone 700 ms after success | #392: out of scope; not built | Place "Tell your crew" in the post-pour sequence (on the pass during a hold, or in the Room). |
| C6 | `flow-4/Delta R3-0.html` C12: "Already checked in" deleted; "The pass simply stays, or the Room opens" | No transition is drawn for the quiet way in | How "already in" enters the Room (no pour?) | #389: a quiet way in, no pour, no success haptic | Draw "already checked in": the motion into the Room, with no pour. |
| C7 | Motion cards that span components: #12 (the field → bubble arc), #37 (bar → chip flight), #25 (arrival), #33 (face → card), #52 (Meet next reshuffle), #51 (receive ring), #23 (DM reveal crossfade), #42 (cluster split) | No screen frame owns them; the component pages stop at their own edge | Who owns the cross-component motion | #390/#391: deferred to the Room, DM and map screens | Attach each to its screen frame in Flows 4/5 and the map. |
| C8 | States missing from component pages:<br>• IconButton selected<br>• Sheet's Android destructive dialog (Flow 7 A2; §13)<br>• Toast's two-toast stack (Flow 7)<br>• TimeBadge "Ended" (§12; drawn in Flow 3) | §4.7's polarity flip; the flows | Not drawn on the canonical pages | #386: §4.7 for IconButton (white disc, ink glyph); the others not stated | Draw these four states on their component pages. |
| C9 | EventCard text on the photo; MeetNextCard fixed at 164 | ROUND3 B5 asks for 200% text frames | The large-text states of fixed-height cards | #391: text capped at 1.5×; `minHeight` 164 | Draw both at the largest size. |
| C10 | `creatures/creatures.js` maps animal nouns. Venue plates are keyed `bar`, `garden bar`…. `round2/emblem.js` takes a number | The server's pseudonym nouns (many not animals: "Comet", "Phoenix"), `venue_type` (`pub_bar`, `nightclub`, `live_music_venue`…) and `emblemSeed` (a string) | The mappings from server data to the drawn sets | #384: the non-animal cast from the whole pseudonym (owner ruling: hashing the noun alone makes every "… Comet" the same creature). #384: the plate mapping left to the adopting screen. #388: FNV-1a on the seed | Publish the noun → creature, `venue_type` → plate and seed → emblem tables. |
| C11 | `components/Composer.html`: "Flow 15's composer strips (#5–#7, #15–#18) used it already"; states muted · automuted · locked · closed · ratelimited · notcheckedin | `flow-15/flow15.js` `lockedComposer`: not_open_yet ("Opens in 3h 20m"), not_live ("Go live"), hidden, archived (#6–#7) | Four server lock reasons exist only in Flow 15's local copy | #390: the six; left / ended / banned draw nothing | Add Flow 15's four lock reasons to the Composer page. |
| C12 | Motion #27 and `flow5-proto.js` stop at "A finger was down: nothing moved; the glass '↑ New' pill offers the way up." | ROUND3 E #27; no flow | When the held row finally moves: on lift, on scroll end, on a pill tap, or on the next visit | Not built yet | Draw the deferred reorder's release. |
| C13 | `components/CountTicks.html`: "past eight the ticks shrink to fit, never wrap"; the largest drawn is "8 · 1 here"; the builder fixes `width:12px` | `flow-10` 10.3 #04: "A crew has at most 12 people." | The 9–12 form | Not stated in #393 | Draw CountTicks at 12. |
| C14 | `flow-11/flow11-groups.js` 11.2 #05 "Busy": "H.threshold fired"; the GoLiveSheet page's "first time" cell passes `{first:true}`, which `flow11.js` `goLive` never reads | The group's own annotation: "H.commit at the edge"; the page: "(900 ms, H.tick ×3, H.commit, H.success)" | A wrong haptic on one frame; a first-time state that isn't drawn | #393: the hold from P2 (`H.commit`) | Fix #05's haptic and draw the first-time GoLiveSheet. |

### D · Component pages (and tokens) older than the flow or delta that supersedes them

| # | Side 1 | Side 2 | Disagrees | Chose (PR) | Single-source fix |
|---|---|---|---|---|---|
| D1 | `components/ExpiryPrompt.html`: "At 2 minutes left the venue room asks once (H.threshold): stay or let it lapse"; SR "Your session ends in 2 minutes. Stay… Let it end" | `flow-11/Delta R3-G.html` 11.4 #01–#02: at the end, "Your live time at Toit is up · Still here?", **Extend 45 min — free** (`H.primary`), the Plus row (none), Done for now (none). The base `flow11.js`, `places/places.js` and the Flow 12 Tonight sheet still say "Extend 20 min — free" / "Your free 20 minutes are up". The client's built strings differ again: "Extend 45 min · free" · "Stay live till I leave · Blendn+" · "Let it end" | Timing, haptic and three sets of labels. The page's own `ended` cells still draw "Extend 20 min — free". The R3-G frame gives Extend only `H.primary`, dropping base 11.4's `H.success` on the server's OK. The page's "Ended · you can go live again" is drawn nowhere (11.4 #06: "Not live here any more…") | #393: R3-G (asks at the end, no `H.threshold`) | Redraw the ExpiryPrompt page from R3-G, update Flow 11/12/Places to 45, and pick the design's labels or the built ones. |
| D2 | `components/SessionSheet.html`: "offers to stay (Blend'n+), extend once, or end now; ending is one tap, nothing to confirm"; `H.select` on extend; "Live · 42 min left" / chip "42:00 · Leave"; the state "until 6 am · Stay active" passes `until:true` to `F11.session`, whose `until = o.until or '21:50'` prints **"Live until true"**. The page also draws an `end:true` cell that renders a confirm sheet, against its own intro | `flow-11/flow11-groups.js` 11.3 #01–#05: Extend only in the last 5 minutes, labelled with the new end ("Extend · Live until 22:10"); End always confirms; Extend `H.primary` → `H.success`; minutes at rest, mm:ss only in the last 5 (also §21.5); no "until 6 am" state | A stale page with a broken state | #393: Flow 11; "until 6 am" drawn as the Stay form ("ends 00:40 at the latest") | Rebuild the SessionSheet page from Flow 11 11.3, and delete the "until 6 am" cell or give it a real value. |
| D3 | `components/NotificationRow.html`: stale rows say "This isn't available any more"; Accept `H.success` when recorded; a separate time | Flow 9 frame (and the page's own frame): "This request is no longer open"; Flow 9 prototype: `H.primary` on the press, then `H.success`; the frame never draws a separate time (the kinds table puts it in context) | Copy, haptic, layout. The page's pills are Accept / Not now (its intro and `flow9.js` say Decline), and its done line is "You're friends" (9.2 #07: "You're friends now"). Two of its examples are kinds Flow 9 doesn't have ("You're in. Vinyl Night is live" on a glyph tile; "Quiet Heron asked to join your car" with Join). Its stack shows 2 faces + 1 for "3 new matches", against Flow 9's 3 for "2 new matches". R3-D9 #04's report row ("We looked at your report and took action.") isn't on the page | #393: the frame; both haptics; "Vinyl Night · 2 min ago" | Make the page's intro and spec match Flow 9. |
| D4 | `components/OverlapLine.html`: "nothing at all when there is nothing", and "Small room tonight" | Flow 14 frames: "none" is the intent line ("Both here to make friends", SCREENS-ADDITIONS "never empty"); a small room is an ordinary line without the Tier B label; shared labels with a 1.5 pt edge at 35% | Empty and small-room states. The page's sentences ("Both CSK — in RCB country 💛", "You both picked filter coffee over chai ☕") aren't the server's (R3-G #01 "You both picked Filter coffee over Chai", #02 "Both from Tamil Nadu"; G4 "Use the server's sentences"), and the weak card shows 3 labels where G4 says 2 before a reveal | #393: Flow 14; the line or nothing; no "Small room tonight" | Redraw OverlapLine's empty and small-room states from Flow 14. |
| D5 | `components/ShareSheet.html`: "none on open and on Copy (C20); the OS share sheet's own after More" | `flow-16/flow16-groups.js` and the prototype: WhatsApp and Instagram Story `H.primary`, More… `H.select`, Copy none | Haptics | #393: Flow 16 | Copy Flow 16's haptics onto the page. |
| D6 | `components/TonightSheet.html`: `H.primary` on Continue only | Flow 12 groups: "free path · full-weight button · H.primary" (Go live for 1 hour — free / Extend 45 min — free). R3-G G2: perks and crew extras are "Coming soon" until SCRUM-584, but the page's `perk` and `crew` triggers sell them | The free path is missing; triggers sell unbuilt things. The `expiry` trigger still reads "Your free 20 minutes are up…" / "Extend 20 min — free" (R3-G #10: 45). The page says "a text 'Not now'"; Flow 12 12.1 says "Not now as a secondary button… never a text link" | #393: `H.primary` on the free path; "Not now" silent; perk/crew drawn, documented as not to open until SCRUM-584 | Add the free path to the page, and mark or remove the perk and crew triggers. |
| D7 | `components/OfferCard.html`: haptic "none. Redeem is the staff hold (Flow 13)"; Audiences regulars · **lapsed** · **live**; why "…3 or more nights **this month**"; valid "until 6 am" (Pebble) | `round3/r3g.js` / Flow 13 R3-G (G3): regulars only; "…3 or more nights in the last 30 days. Blend'n picked who — {venue} never sees the list…"; "Use at the door" `H.primary`; ⋯ with Report and Stop offers; staff type a rotating code, no staff hold | The page predates G3. It keeps the old footer ("Turn off offers from Toit · Turn off all offers"), has no ⋯ (R3-G #11: Report this offer · Stop offers from Toit · Cancel), labels "Why am I seeing this?" where `flow13.js` draws "Why you got this", and puts the window in Geist Mono where the frame uses Satoshi | #393: R3-G; "Use at the door" `H.primary` | Rebuild the OfferCard page from R3-G and drop the lapsed and live audiences. |
| D8 | `components/HoldToConfirm.html` from-line: "The staff hold (Flow 13) is the same pill at 1000 ms". `tokens.json` and `motion.css`: `hold-staff` 1000 | G3: no staff hold | A stale token and note | #382: token dropped; #391: not built | Delete `hold-staff` and the note. |
| D9 | `components/RevealSheet.html`: `H.success` on "Revealed · both sides" | Delta R3-0 C7: a toast + each side's header line; `H.success` for the one who revealed | Haptic owner | #393: the sheet is silent; the caller's toast plays `H.success` | Move the haptic to the toast on the page. |
| D10 | `components/AchievementBadge.html`: "Three badges, all from check-ins" (Shows up · 5+ nights this month · Regular here); haptic none; no interaction drawn | Flow 14 groups: "badge · tap → one line of what it means · none". `flow-14/Delta R3-G.html` G4 adds the crew badge "Out together often" ("never '{N} nights out together'"), one pill on the crew row | Tap state missing; the G4 states aren't on the page: the "Show my badges" switch (#04/#05), the room-under-8 card with no badge (#06), the crew badge (#07) | #393: optional silent `onPress` (the caller supplies the line); the crew badge always "Out together often" | Add the tap state and the crew tier badge to the AchievementBadge page. |
| D11 | `components/Composer.html`: its own sentences, a mute countdown, "Check in to post", four lines of growth, a spinner in Send. `components/ContextMenu.html`: "never more than four" rows. `components/ChatBubble.html`: "edited" | R3-0 C2–C4 server copy; R11 (no countdown); "RSVP to this event to join the chat" + I'm going; R3-D5 5.3 five lines (132 pt); R3-D5 5.2 five rows for theirs in a room; audit §0.7 (nothing says "sending"); C6 (nothing edits). `flow-5/Delta R3-D5.html` bubble states missing from the ChatBubble page: emoji-only (#45), waiting for connection (#29), "Not sent · Two links at most" (#18), the upload ring (#33), "Removed by moderation" photo (#37), links (#43), and a tap on the avatar opening the PersonCard (#01) | The chat pages predate R3-0 and R3-D5 | #390: the deltas | Redraw Composer, ContextMenu and ChatBubble from R3-0 and R3-D5. |
| D12 | `creatures/creatures.js`: "34 in all", holding 38 paths; an 18-noun map left over from the old Lucide map (cat, dog, rabbit…) that the server never sends; `whale` reachable only by the literal noun | The server's pseudonym noun list | The set's own count and map are stale | #384: all 38 ported; the extras inert | Correct the count and replace the noun map with the server's nouns. |
| D13 | Amenity fixtures: "Vegetarian" in the AmenityTile gallery | The never-build list | A cut feature on a component page | #391: dropped from the gallery | Remove "Vegetarian" from the page. |
| D14 | `components/PollBubble.html`: hidden "Results when it closes"; "the 409 is a SystemNotice" | `flow-15/Delta R3-0.html` #02 (C8): "Results appear when the poll closes (server copy)". `flow-15/flow15.js` poll('409'): "a solid banner above the composer, 2 s" | Pre-C8 copy; the 409 in the wrong place | Not stated in #390 (open / voted / withheld / hidden / closed built) | Update the PollBubble page to C8 and Flow 15's 409. |
| D15 | `components/SystemNotice.html` samples: the thin line "Nebula · 3 revealed · 1 keeps it private"; the server sentence "You've already voted in this poll." | ROUND3 C7 (no server row: a toast + header lines); C8 and `flow-15/Delta R3-0.html` #01 delete the poll line | Deleted lines shown as samples | Not stated in #390 | Replace both samples. |
| D16 | `components/SwipeRow.html`: "Mute and More on a room or a chat, Unmatch in red" | `flow-5/Delta R3-D5.html` #41 room row "Mute · Leave" (`H.destructive`), #42 "DM row · Mark read" only. ROUND3 C5: DMs can't be muted | Pre-5.11 actions; mutes a DM | Not stated in #390 (72 pt actions, `H.detent` per crossing) | Rebuild SwipeRow's action sets from R3-D5 5.11. |
| D17 | `components/PersonCard.html` / `BC.personCard`: no View profile; waved-at-you is "{name} waved at you" with an unlabelled hand circle; no refusal state | `flow-4/Delta R3-D4.html`: "View profile" (text, 44 pt) on every variant but g; #14 the chip "Waved at you · 2 min" + "Wave back"; #16–#18 the refusal line | The page lags R3-D4 4.1–4.3 | #391: R3-D4 | Rebuild the PersonCard page from R3-D4. |
| D18 | `components/Avatar.html`: "Lucide outline animal" creatures; the palette row draws Lucide icons (cat, bird, snail…) | `journey/ui.js`: the B7 creature set replaces them; `components/Creatures.html` | The Avatar page predates the creature set. So does `components/Creatures.html` ("drawn here honestly as stand-ins: B7's set… replaces this map"; "The eleven glyphs available today"), though `sets.js` says "B7 done" | #386: Avatar draws the merged `<Creature>` | Redraw the Avatar page's creature form from the creature set. |
| D19 | `components/TonightSheet.html` "App Store" cell: the store line "One night · until 6 am"; "success" cell: the toast "Staying live at Toit · until 6 am". `round3/r3g.js` `tonight` swaps the toast only when the trigger is not stay/expiry/none, so the R3-G builder keeps "until 6 am" on the Stay path | `flow-12/Delta R3-G.html` #08 "24 hours · one-off", #09 toast "Blend'n+ · Night Pass · 24 hours"; G2 "never 'until 6 am'" | Night Pass described as "until 6 am" | Not stated in #393 | Redraw the TonightSheet page and R3-G's Stay path with "24 hours". |
| D20 | `components/PlanCard.html`: "Two at launch (P4 ruling): Monthly ₹199 and Night Pass ₹49 ('Just tonight · doesn't renew · until 6 am')"; SR "radio button, 1 of 2". `flow-16/Delta R3-D12-16.html` group "12 · Two plans" ("Quarterly and Yearly are removed…") still reads as current, though `flow-12/Delta R3-0.html` is marked superseded | `flow-12/Delta R3-G.html` #01: "3 months · Night Pass · 24 hours", "Just tonight · ₹49 · 24 hours · doesn't renew"; G2 "Keep all four (P4 superseded)" | The page and a live delta still say two plans | #393: four packages, "3 months" | Rebuild the PlanCard page from R3-G and mark R3-D12-16's group 12 superseded. |
| D21 | `components/ManageStatusRow.html` draws the unpatched `F12.STATUS`: trial "₹199/month starts 17 Oct. We'll remind you on 15 Oct."; Night Pass "Night Pass · tonight" / "Until 6 am. It doesn't renew."; haptic "none" though grace/hold draw "Fix it"; iOS cells read "Renews 3 Nov · ₹199 · Google Play" and "Fix it in Google Play…" above "Fix it in the App Store" | `flow-12/Delta R3-G.html` #05: "14 days of Blend'n+, free, until 29 Oct. Nothing renews…"; #06 "Night Pass · 24 hours" / "Until 9:42 pm tomorrow…"; flow-12 12.3 "Fix it… · H.primary" (the brief sides with the page) | Trial and Night Pass copy predate G2; the haptic and the store name are wrong | #393: `Button` md for "Fix it in…" | Rebuild the ManageStatusRow page from R3-G, with the platform's store. |
| D22 | `flow-11/flow11-groups.js` 11.2 #03 "Stay selected · free today" (+ a "free today" chip); #04 "Proposal — not built"; keep "Stay is free today; the locked frame is a proposal…" | ROUND3 G1: Stay without Plus is `403 PLUS_REQUIRED`; the GoLiveSheet page: "(Stay is Blend'n+)". The R3-G Flow 11 delta redrew only 11.4 | Flow 11's Go Live frames predate G1 | #393: Stay locked, per R2-D7 | Redraw 11.2 #03/#04 to G1. |
| D23 | Gallery cells whose props the builder ignores or prints:<br>• SessionSheet `until:true` → "Live until true" (D2)<br>• CrewCard `{overlap:true}` → the line reads "true" (`flow10b.js` passes "You both: Dance floor · Friendship")<br>• RevealSheet "revealed" cell passes `{revealed:true,state:'revealed'}`, but `blendRoom` reads `o.reveal`, so it draws the unrevealed room<br>• GoLiveSheet "first time" (C14) | The flow builders | Component pages that render wrong states | #393: built to the flows | Re-render each page cell against its builder's real props. |
| D24 | Flow 4 and 5 base canvases carry motion values the pack replaced, with no delta correcting them:<br>• Flow 5: #12 "press 0.9… M.travel 400", #23 "M.settle 700", #16 "18 ms stagger", #36 "long-press 250", #35 "rubber-bands to 88" (R3-D5 fixes only #35/#36)<br>• Flow 4: Meet next "crossfade together" (#52), arrival "M.pop 0.6→1" (#25), "banner fade 150/120" (#44) | Motion #12 (300 ms, split axes), #16 (28 ms), #36 (400), #35 (96), #52, #25, #44 | Old annotations still on the flows | — | Re-annotate Flows 4 and 5 from the motion pack. |
| D25 | `motion/Motion.html`: "Nothing here is in a flow prototype yet" | Deltas R3-D3, R3-D4, R3-D5 and R3-D10 put #45, #25, #33, #51, #27, #35, #36 and #37 in their prototypes | A stale index | — | Update Motion.html's status line. |


---

## 6 · Missing screens and states: the evidence

From the coverage audit. Every route under `app/` and the states it renders, each checked against the project two ways: a frame index, and a search for its copy text and state name. A state is listed only if both searches came back empty. Rows give the client `file:line` on `origin/dev`, the nearest frame to extend, and whether new server data is needed.

**Frame-file abbreviations**

| Short | File |
|---|---|
| F1 | `flow-1/Flow 1 · Launch and entry.html` |
| F2 | `flow-2/Flow 2 · Onboarding.html` |
| F3 | `flow-3/Flow 3 · Discovery.html` |
| F4 | `flow-4/Flow 4 · Core loop.html` |
| F5 | `flow-5/Flow 5 · Banter and chat.html` |
| F6 | `flow-6/Flow 6 · People and profile.html` |
| F7 | `flow-7/Flow 7 · Settings and system.html` |
| F*n*g | `flow-n/flown-groups.js` |
| PL | `places/Places.html` |
| FP | `places/Full Pages.html` |

Deltas are cited as `flow-n/Delta R3-D4`. Frames are cited as `file · group · #n`.

**How to read "Searched"**
- Patterns are regexes, and `.` stands for an apostrophe.
- A count is the number of hits across `guidelines/`.
- A count with "in X" is limited to that folder.


### A · Missing screens and states

#### A.1 · States with their own layout

##### Flow 1 · Entry

| ID | What's missing | Where the client reaches it | Nearest frame to extend | Needs server? | Searched |
|---|---|---|---|---|---|
| 1-1 | "Check your inbox" after **Resend** is refused: rate-limited ("Too many reset requests. Try again in N minutes.") or "Couldn't send the reset link. Try again.", inline on the sent screen | `app/forgot-password.tsx:121-123`, `:189`; copy in `lib/signInRefusal.ts` (`forgotPasswordMessage`, `rateLimitedMessage`) | F1 · forgot · #03/#04. The `F1.forgot` builder takes `error` on the sent screen, but no frame uses it | No | `Too many reset requests` 1 (`flow1.js`, entry-screen branch only); no forgot frame combines "sent" with an error |

##### Flow 3 · Discovery

| ID | What's missing | Where the client reaches it | Nearest frame to extend | Needs server? | Searched |
|---|---|---|---|---|---|
| 3-1 | **The Scene's organiser detail sections:**<br>• Accessibility (pairs)<br>• Good to know (pairs)<br>• House rules<br>• Health guidance<br>• Questions (an expandable FAQ)<br>• Cancellations | `components/screens/EventDetailScreen.tsx:1321-1325` → `components/scene/SceneSections.tsx:793`; titles `lib/eventDetails.ts:114-130` | FP · #1 The Scene · live, inside the fence (it has only a prose "Good to know") | No: `GET /events/:id` already sends `details` | `House rules` 0 · `Health guidance` 0 · `Cancellations` 0 · `FAQ` 0 · `Good to know` 3 (prose only) |
| 3-2 | **Report this event:** the client's five reasons, an "Add details (optional)" field, Send report (busy), an inline failure ("Couldn't send your report." + Try again) | `lib/safetyUtils.ts:398-426`, `components/SheetHost.tsx:113-160` | F3 · scene · #24 draws four different reasons ("Misleading or fake · Unsafe venue · Harassment or hate · Something else") and no details, sending or failure states. The server takes any reason string. Note step: flow-5/Delta R3-D5 · safety · #27 | No | `Add details` 0 · `Couldn.t send your report` 0 · `Concerns about the organiser` 0 · `look like a real event` 0 |
| 3-3 | **Name chips over the lit roofs:**<br>• event chip: title + "LIVE ●" or "Fri · 8:00 pm"<br>• venue chip: storefront glyph + bucket<br>• tapping a chip or a lit building opens the page directly | `components/home/MapLitLayers.tsx:255-296`, `lib/mapLit.ts:339-352`, `components/home/HomeMap.tsx:475`, `:570` | flow-11 · F11g · 11.7 · #01 ("tap → its card in the drawer", no labels); flow-3/Delta R2-D4 · map · #01/#02 | No | `LIVE ●` 0 · `storefront` 0 · the `homeLit` builder draws no labels |
| 3-4 | **"Show my location"** button on the map: rides the drawer's edge; following and pending states; hidden when the drawer is full | `components/home/LocateButton.tsx:19-54`, `HomeMap.tsx:574` | F3 · home · #02/#09 | No | `Show my location` 0 · `recentre` 1 (an annotation) |
| 3-5 | **Map attribution, in two places:**<br>• the on-map credit that shows when the map opens and then fades<br>• About › **MAP DATA**, the credits with their licences | `components/home/MapCredit.tsx:30`, `HomeMap.tsx:572`; `app/about.tsx:18-22`, `:76-79`; sources `lib/mapStyleEmber.ts:179-205` | F3 · home · #02; F7 · about · #01 (fonts credited only) | No | `OpenStreetMap` 0 · `Overture` 0 · `OpenFreeMap` 0 · `Map data` 0 · `attribution` 0 |
| 3-6 | **City art:**<br>• skyline cards in the city picker: city name, its name in the local script, "N events", "You're here"<br>• a skyline banner on the quiet, coming-soon and no-city Pulse empties | `components/cityArt/CityArtCard.tsx:41-74`, `app/(tabs)/events.tsx:2382-2393`, `:2164-2165` | F3 · pulse · #15 (plain rows); #06–#08 (icon empties) | No: the art is drawn in the client | `skyline` 0 · `city ?art` 0 |
| 3-7 | City picker with **no cities**: "No cities have published events yet." (+ "Turn on location to browse where you are.") | `app/(tabs)/events.tsx:2368-2373` | F3 · pulse · #15 | No | `No cities` 0 |
| 3-8 | Places pane, **first load fails** with nothing listed: "Couldn't load places / Check your connection and try again." (it replaces the pane) | `components/home/PlacesList.tsx:122-126` | F3 · home · #12 and PL · pane · #07 draw only the inline refresh failure; the events equivalent is F3 · pulse · #25 | No | `Couldn.t load places` 0 · `didn.t refresh` 2 (inline only) |
| 3-9 | **Pulse below the sections:**<br>• a "More events" header<br>• row notes "Checked in" and "Ended"<br>• the time label "Happening now" | `app/(tabs)/events.tsx:1429`, `:1443`, `:2291-2294`; `lib/pulse.ts:93` | F3 · pulse · #02; `components/EventCard.html` | No | `More events` 0 · `Happening now` 1 (flow-4 only) · `Checked in` 0 in flow-3 |
| 3-10 | **Filter sheet with a group absent:** no "How far" without a location fix; no "What" when the categories fail to load | `components/pulse/FilterControl.tsx` (`hasLocation`, `categories.length > 0`) | F3 · pulse · #14 | No | `How far` 2 · `Any distance` 1 (both the full sheet) |

##### Flow 4 · Core loop

| ID | What's missing | Where the client reaches it | Nearest frame to extend | Needs server? | Searched |
|---|---|---|---|---|---|
| 4-1 | **Room chat dock when the event's chat can't be found:** the toast "The chat for this event is not open yet." replaces opening the chat | `components/blendn/BlendnScreen.tsx:364-381` | F4 · room · #14; F15g · composer · #03 (not_open_yet, drawn on the chat screen only) | No | `not open yet` 0 · `chat for this event` 0 |
| 4-2 | **"Ended" in Going:**<br>• a Next up card labelled "Ended" (a multi-day event whose remaining days were cancelled)<br>• an "Ended" section, where cancelled RSVPs come last | `app/(tabs)/going.tsx:267`; `lib/goingSections.ts:19`, `:41`, `:76-79` | F4 · going · #05/#08; flow-3/Delta R3-D3 · days · #05 | No: the server already sends the field | `Ended` 0 in flow-4 and in `flow3-r3d3.js` |
| 4-3 | **Board, taking your post down:**<br>• confirm "Take your post down? · It leaves the board. Anybody who asked is not told why." (Take down · Cancel)<br>• failure "Couldn't take it down. Try again."<br>• toast "Taken down" | `app/board/[eventId].tsx:213-243` | F4 · board · #07 (the confirm and toast exist only in annotation text) | No | `Take your post down` 0 · `Anybody who asked is not told` 0 · `Taken down` 1 (annotation) |
| 4-4 | **Board, the settled lines of an ask:**<br>• on a Board card: "Closed" (the post is gone or the ask lapsed) and "You withdrew this"<br>• in the Banter's Board section: "They said yes — you're in each other's chats"; after a clash on Accept, "Your offer is full", "Already answered" or "Closed"; and the fallback "Wants to join you at {event}" | `app/board/[eventId].tsx:141-145`, `:195-198`; `lib/board.ts:170-174`, `:195-200`, `:214`; `components/board/BoardRequestsSection.tsx:150-152` | F4 · board · #10/#12; PL · board · #03 (Banter · The Board) | No: the 409 sentences are already mapped | `You withdrew` 0 · `Your offer is full` 0 · `Already answered` 0 · `Wants to join you` 0 |
| 4-5 | **Two location trays:**<br>• "Location unavailable · Location services are temporarily unavailable. Please try again."<br>• "Location error · Failed to get your current location. Please check your GPS settings and try again."<br>Reached on the check-in hold, Go Live and the expiry prompt's Extend | `lib/locationFix.ts:186`, `:188` | F4 · tonight · #23–#26 | No | `Location error` 0 · `Failed to get your current location` 0 · `temporarily unavailable` 2 (the F3 Nearby list state, not a tray) |

##### Flow 5 · Banter and chat

| ID | What's missing | Where the client reaches it | Nearest frame to extend | Needs server? | Searched |
|---|---|---|---|---|---|
| 5-1 | **"You're not in this room"** (403 on a room you never joined or left on another phone) and the Rejoin outcomes:<br>• "Check in at the event to join its room."<br>• "Couldn't rejoin this room. Try again."<br>• "You're back in the room"<br>A crew room falls through to this state with event wording | `components/chat/RoomLeftState.tsx:32`; `app/chat/[id].tsx:398-401`, `:842-855`; `lib/crews.ts:277` | F5 · room · #25 Left the room | No | `not in this room` 0 · `rejoin this room` 0 · `back in the room` 0 |
| 5-2 | **Room info for a place's (venue-day) room:**<br>• its leave copy talks about "the event"<br>• "In the room" shows the exact total that a place's header withholds | `app/chat-info/[id].tsx:224`, `:278`; `lib/placeRoom.ts:40-44` | F5 · info · #01; flow-5/Delta R2-D2 · info · #04 (how a room kind changes the rows) | No | `Room info` 0 in flow-11 and places |
| 5-3 | **The Banter "Live now" row for a place's room:** the place as title, **no count**, "You're here". The drawn hero shows "14 in the room", which a place must never show | `app/(tabs)/chat.tsx:1011-1019`; `components/banter/inbox.ts:106` | F5 · banter · #03 | No | `You.re here` 0 in flow-5 and places |
| 5-4 | **The mute sheet for a room that's already muted:**<br>• title "Notifications"<br>• body "{Muted until …}. You still see every message here; the room just doesn't notify you."<br>• Unmute, then the durations<br>• toast "Room unmuted" | `app/chat-info/[id].tsx:184-203` | F5 · info · #02/#03 | No | `Unmute` 0 |
| 5-5 | **Loading older messages:** "LOAD OLDER MESSAGES" / "LOADING…" at the top of the feed, in rooms and DMs | `app/chat/[id].tsx:1042-1053`; `app/private-chat/[conversationId].tsx:878-889` | F5 · room · #05 | No | `Load older\|older messages` 1 (annotation only) |
| 5-6 | **DM loading:** a spinner, under the match-opener card when there is one | `app/private-chat/[conversationId].tsx:876-877` | F5 · room · #01 (the room's skeleton) | No | none of the DM frames #01–#21 is a loading state |
| 5-7 | **Two DM trays:**<br>• Options tapped before the conversation loads: "Still loading — The conversation details are on their way…" or "Couldn't load this conversation — Its options need the conversation details…", with Cancel · Try again<br>• Ask-to-reveal refused: "Couldn't ask" + the server's copy or "Couldn't ask them. Try again." | `app/private-chat/[conversationId].tsx:929-945`, `:446` | F5 · dm · #20 (Options); F5 · dm · #05 (Reveal asked) | No | `Couldn.t ask` 0 · `Still loading` 2 (the Loader page and motion only) |
| 5-8 | **A DM withheld by moderation at send:** the bubble is removed, then the tray "Not sent — That message was removed by moderation and was not delivered." | `app/private-chat/[conversationId].tsx:674-677` | F5 · room · #12 (rooms only) | No | `was not delivered` 0 · `wasn.t delivered` 1 (F5 room #12) |
| 5-9 | **A DM reply quoting a message that's gone:** "Message unavailable" | `app/private-chat/[conversationId].tsx:91-94` (the server sends `replyTo.unavailable`) | `components/ReplyPreview.html`; F5 · room · #06 | No | `Message unavailable` 0 |

##### Flow 6 · People and profile

| ID | What's missing | Where the client reaches it | Nearest frame to extend | Needs server? | Searched |
|---|---|---|---|---|---|
| 6-1 | **Edit profile when its load fails:**<br>• the form stays blank and editable, with the toast "Couldn't load your profile. Try again." only if the call throws<br>• a failed photo read becomes a false empty grid ("0/6" + Add tile) | `app/edit-profile.tsx:217-221`, `:313`; `lib/photoUtils.ts:680-697`; `components/PhotoManager.tsx:417-418` | F6 · edit · #11 (Loading); F6 · me · #08 (Failed · nothing cached) | No | `load your profile` 0 · `F6.edit` has no failed option |
| 6-2 | **Edit profile, interests loading or failed:** "Loading interests…" / "Couldn't load interests. You can add them later from your profile." | `components/InterestPicker.tsx:109`, `:114` | F2 · details · #03/#04 (onboarding only) | No | `add them later` 0 · `Loading interests` 1 (flow2.js) |
| 6-3 | **Edit profile, fields of work fail to load:** the "WHAT DO YOU DO?" heading with no chips and no sentence | `app/edit-profile.tsx:308-309`; `components/profile/MatchingFields.tsx:183-190` | F2 · journey · #04; flow-6/Delta R2-D3 · edit · #01 | No | no failure state among the `Field of work` hits in flow-6 |
| 6-4 | **The remove-photo confirm** "Remove this photo? / It comes off your profile. You can add it again later." (Remove photo · Cancel), and the photo refusals that aren't drawn:<br>• "Couldn't remove that photo. Try again."<br>• "Could not save your photos" (Make-main refused)<br>• "Your photos didn't open. Try again."<br>• "Photo must be at least 200x200 pixels." | `components/PhotoManager.tsx:173`, `:215`, `:234-283`, `:272`; `lib/photoUtils.ts:220`, `:397`, `:652` | F6 · edit · #01 (the tile's ×); flow-6/Delta R3-D6 · photo · #09–#12 | No | `Remove this photo` 0 · `remove that photo` 0 · `photos didn.t open` 0 · `200x200` 0 |
| 6-5 | **Edit profile's EDUCATION and PHONE inputs.** The frames draw only Name, Age, Location and Occupation | `app/edit-profile.tsx:617`, `:630` | F6 · edit · #01 | No | `Phone number` 0 (the only "Phone" hits are flow-5's contact warning) |
| 6-6 | **The "About" line on a revealed profile:** languages, home state and sign, e.g. "Speaks Malayalam · From Kerala · Leo ♌" | `app/user/[id].tsx:527-531`; `lib/aboutYou.ts:156-157` | F6 · user · #04; F14g · 14.2 · tiers · #01 | No: the client already reads `languages`, `homeState` and `sign` | `♌` 0 · `Speaks [A-Z]` 0 relevant |
| 6-7 | **`/edit-about-you` as its own route.** The design puts these fields inside Edit profile. The route's own states:<br>• loading (intro text only, Save disabled)<br>• "Couldn't load this"<br>• "Couldn't save. Try again." | `app/edit-about-you.tsx:148`, `:163`, `:172` | flow-6/Delta R2-D7 · fields · #04/#05; F14g · 14.2 · #01 | No | `Languages you speak\|Besides English` 0 |
| 6-8 | **The friend invite landing when Send or Accept fails after loading.** Four server answers all become "That didn't go through. Try again.":<br>• 403 unfinished profile<br>• 429<br>• 404 (the link was reset)<br>• 400 (yourself) | `app/f/[token].tsx:91-98` | F6 · invite · #01/#02/#06; F15g · 15.19 · #01/#02 | No | `didn.t go through` 0 on the invite group · `Couldn.t send the request` 0 |

##### Flow 7 · Settings and system

| ID | What's missing | Where the client reaches it | Nearest frame to extend | Needs server? | Searched |
|---|---|---|---|---|---|
| 7-1 | **Sign out when the server didn't confirm it:** the info toast "Signed out on this phone. We couldn't reach the server, so you may stay signed in elsewhere for a while." | `app/settings.tsx:356-360` | F7 · settings · #12/#17 | No | `Signed out on this phone` 0 · `stay signed in elsewhere` 0 |
| 7-2 | **Delete account while a store subscription is running:** "Cancel Blendn+ in your App Store subscriptions first. Deleting your account doesn't cancel it." (Google Play on Android) + "Manage subscription" | `app/settings.tsx:306-318`, `:629-642` | F7 · settings · #13 and A2 | No: it reads `GET /me/plus` | `doesn.t cancel` 0 · `Manage subscription` 0 · `subscri` 0 in flow-7 |
| 7-3 | **The crash screen when Contact support opens no mail app:** the inline line "Write to support@blendn.app and mention {E-XXXX}." The boundary sits above the toast provider, so a toast can't be used | `components/ErrorBoundary.tsx:94-100`, `:139-143` | F7 · sheet · #10 ErrorBoundary | No | `and mention` 0 · `mention E-` 0 |

The map credits in About are row 3-5.

##### Flow 10 · Crews

| ID | What's missing | Where the client reaches it | Nearest frame to extend | Needs server? | Searched |
|---|---|---|---|---|---|
| 10-1 | **The Crews screen loading** (a blank list) **and failed** ("Your crews didn't load") | `app/crews/index.tsx:144-157` | F10g · 10.1 · #03; flow-6/Delta R2-D3 · me · #03 | No | `crews didn.t load` 0 |
| 10-2 | **The decline-invite confirm:** "Decline {crew}? / {inviter} isn't told. They can't ask you into this crew again for 30 days." (Decline · Cancel), and the failure "Couldn't decline. Try again." The design declines with no confirm | `app/crews/index.tsx:111-120`, `:130` | F10g · 10.3 · #01; flow-5/Delta R2-D2 · inbox · #02 | No | `isn.t told. They can.t ask` 0 · `Couldn.t decline` 0 |
| 10-3 | **Make a crew and Invite friends when the friend list can't be shown:**<br>• "Loading your friends…"<br>• "Your friends didn't load — try again"<br>• "Add friends first — a crew is made from your friends."<br>• "Every friend of yours is in this crew, or you have none to ask yet." | `app/crews/new.tsx:147-151`; `app/crews/[crewId].tsx:255-257` | F10g · 10.2 · #05 | No | `Loading your friends` 0 · `made from your friends` 0 · `none to ask` 0 |
| 10-4 | **Make a crew refused because a picked person is no longer a friend** (404, the server's sentence "You can only invite your friends…") | `app/crews/new.tsx:91`; `lib/crews.ts:220` | F10g · 10.2 · #07 | No | `only invite your friends` 0 |
| 10-5 | **Crew detail loading** (plain "Loading…") **and failed** ("This crew didn't load") | `app/crews/[crewId].tsx:84-86` | F10g · 10.4 · #02 | No | `crew didn.t load` 0 |
| 10-6 | **"We're here" on crew detail, reachable before your own check-in, and its refusals:**<br>• "Check in at the event first — each of you checks in with your own location."<br>• "Your crew isn't here yet — two of you need to be checked in."<br>• "Couldn't tell your crew. Try again."<br>The design offers "We're here" only after your own check-in | `app/crews/[crewId].tsx:127-132`, `:230`; `lib/crews.ts:233` | F10g · 10.6 · #04/#06; flow-4/Delta R2-D1 · success · #01 | No | `Check in at the event first` 0 · `two of you need to be checked in` 0 · `Couldn.t tell your crew` 0 |
| 10-7 | **The Room's Crews view, everything except the happy path:**<br>• loading spinners<br>• "No crew yet — make one from your friends."<br>• "Couldn't check whether this is on. Tap to try again."<br>• "Check in to see the crews here." (NOT_CHECKED_IN)<br>• "The crews didn't load. Tap to try again."<br>• "More crews" paging, and "More crews didn't load." + Try again | `components/crews/CrewsView.tsx:333-428` | flow-4/Delta R2-D1 · room · #03/#04; F10g · 10.7 · #01 (the board draws only "No crews here yet" and "Crews are off") | No | `No crew yet` 0 · `Couldn.t check whether` 0 · `Check in to see the crews` 0 · `crews didn.t load` 0 · `More crews` 0 |
| 10-8 | **Crew chat after you were removed (USER_BANNED):**<br>• "You're no longer in this crew's chat" + Back<br>• removed live, it shows the event room's tray "You have been removed from this chat by the organiser." | `lib/crews.ts:69`, `:277` → `components/crews/CrewParts.tsx:306`; `app/chat/[id].tsx:396`, `:606`, `:715`, `:837`, `:1080` | F15g · gone · #01; flow-5/Delta R2-D2 · roomstate · #01; F10g · 10.4 · #07 (only the owner's side) | No | `no longer in` 0 |
| 10-9 | **The crew chat's first-open notice.** The event room's banner "This room is anonymous. Be kind, keep it safe — people here are real." shows in a crew chat, where people are named | `app/chat/[id].tsx:1087`; `RoomGuidelinesBanner.tsx:59` | F5 · room · #04; F10g · 10.5 · #02 | No | `This room is anonymous` 0 in flow-10 |
| 10-10 | **The Blend room after you leave it.** It falls back to "You left this room / …Rejoin to read and post again, or check in at the event." | `app/blend/[blendId].tsx:146-152`; `components/chat/RoomLeftState.tsx:27` | flow-5/Delta R2-D2 · info · #05; F5 · room · #25 | No | `You left this room` 2 (the F5 event room only) |
| 10-11 | **The Blend's people screen loading** ("Loading…") **and failed** ("This Blend didn't load") | `app/blend/[blendId].tsx:65-79` | flow-5/Delta R2-D2 · info · #04; F5 · info · #06/#07 | No | `This Blend didn` 0 |

##### Flow 11 · Places live

| ID | What's missing | Where the client reaches it | Nearest frame to extend | Needs server? | Searched |
|---|---|---|---|---|---|
| 11-1 | **Go Live refusals with no tray:**<br>• `GPS_TOO_VAGUE`: "GPS signal too weak" + Try Again<br>• `RATE_LIMITED`: "Too many tries · Try again in {N}"<br>• timeout, offline or no code: "Couldn't go live", with the server's sentence or "We couldn't make you live here. Please try again." (Cancel · Try Again)<br>• `NOT_FOUND` after the page loaded: "This place isn't available"<br>• Stay when the paywall may not open: "Staying live is part of Blendn+ · Pick a time instead — you can extend it for free before it ends." (OK · See Blendn+)<br>Reached from the venue page and from the expiry prompt's Extend | `lib/goLive.ts:192-214`; `lib/useGoLive.ts:61-71`, `:106-120`, `:197`; `components/LiveAtVenue.tsx:165` | F11g · 11.2 · #06–#10; F4 · tonight · #26 (weak GPS, for check-in); flow-11/Delta R2-D7 · stay · #01 | No: the codes and `retryAfter` are already sent | `GPS signal too weak` 0 · `Too many tries` 0 · `Couldn.t go live` 0 · `Pick a time` 0 · `See Blend.n\+` 0 |
| 11-2 | **The venue page refused before it loads** (`FORBIDDEN`, not onboarded; `AGE_RESTRICTED`, no adult age): only the server's sentence, with no fix button | `app/venue/[id].tsx:39`, `:83`, `:320-327` | F15g · links · #01–#03 (drawn for event links only); F11g · 11.1 · #01 (the same gate, but as a dock state on a page that has loaded) | No | `Not open to you` 4 and `Finish your profile first` 4, all check-in or event-link screens |
| 11-3 | **The one-tap "Go live again · {45 minutes}" primary** + a "Pick another time" link. The choice is remembered per venue until that venue's day ends | `app/venue/[id].tsx:212-239`; `lib/goLive.ts` (`oneTapChoice`) | F11g · 11.2 · #02; PL · venue · #02 | No | `Pick another time` 0 · `Go live again ·` 0 |

##### Flow 12 · Blend'n+

| ID | What's missing | Where the client reaches it | Nearest frame to extend | Needs server? | Searched |
|---|---|---|---|---|---|
| 12-1 | **The Plus page's price states:**<br>• prices loading<br>• "Couldn't load prices." + Try again<br>• "Purchases aren't available yet." (plans dimmed, Restore disabled; shown when there's no store key, a store-user mismatch or no packages) | `app/plus.tsx:236-244`, `:268`, `:304-309`; `lib/purchases.ts:179` | F12g · 12.2 · #02; flow-12/Delta R3-G · plans · #01 | No | `Loading prices` 0 · `load prices` 0 · `aren.t available` 0 |
| 12-2 | **Waiting for the grant after a purchase or restore:**<br>• "Confirming with the store…"<br>• after 60 s: "Taking longer than usual — it'll unlock as soon as the store confirms."<br>• then "You're in.", and the header's Not now becomes Done | `app/plus.tsx:214-222` | F12g · 12.1 · #07/#08; flow-12/Delta R3-G · #09 | No: the client polls `GET /me/plus` | `Confirming with the store` 0 · `longer than usual` 0 |
| 12-3 | **Store errors with their own copy:**<br>• already purchased (+ Manage subscription)<br>• the receipt belongs to another Blend'n account<br>• purchases not allowed on this device (Screen Time)<br>• no connection to the store<br>• the store user isn't this account | `app/plus.tsx:127-130`; `lib/purchases.ts:139-158` | F12g · 12.1 · #10 (the generic failure) | No | `already have this` 0 · `belongs to another` 0 · `Screen Time` 0 · `No connection to the store` 0 |
| 12-4 | **Restore outcomes:** "Restoring…", "No purchases to restore", "Couldn't reach the store. Try again." | `app/plus.tsx:147-168`, `:309`; `lib/purchases.ts:178-189` | F12g · 12.3 · #01 (its annotation mentions a spinner and toast only); 12.2 · #03 | No | `Restoring` 0 · `No purchases to restore` 0 · `reach the store` 0 |
| 12-5 | **The Plus page when `GET /me/plus` fails:** no status, no launch line, no plans, and nothing tells you why | `app/plus.tsx:90-96`, `:176`, `:208` | F12g · 12.2 · #01; F7 · pieces · #05 (LoadError) | No | `didn.t load\|Couldn.t load` 0 in flow-12 and `r3g.js` |

##### Flow 13 · Regulars and offers

| ID | What's missing | Where the client reaches it | Nearest frame to extend | Needs server? | Searched |
|---|---|---|---|---|---|
| 13-1 | **The offer screen before the offer is known:**<br>• loading<br>• "This offer didn't load." (or the server's error) + Try again<br>• 404 "This offer isn't yours to open." | `app/offer/[id].tsx:62`, `:68`, `:203-212` | flow-13/Delta R3-G · pass · #05 (offline, drawn with the offer already on screen); F15g · gone · #01–#05 | No | `isn.t yours` 0 · `offer didn.t load` 0 |
| 13-2 | **Reporting an offer: the reason step.**<br>• "Report this offer / What's wrong with it? We look at every report; the place isn't told who sent it." with Offensive · Misleading · Spam · Feels unsafe · Something else · Cancel<br>• the 409 "You've already reported this offer. We're looking at it."<br>R3-G draws Report as one tap, but the server **requires** a reason (admin `app/api/mobile/offers/[offerId]/report/route.ts:27`) | `app/offer/[id].tsx:139-141`, `:214-229` | flow-13/Delta R3-G · offers · #11; F7 · sheet · #02 (report reasons) | No | `Feels unsafe` 0 · `look at every report` 0 · `already reported` 0 |
| 13-3 | **"Let them know I'm a regular" refused:**<br>• 409 `VENUE_UNCLAIMED`: "Nobody runs this place on Blendn yet, so there's nobody to tell."<br>• 403 `AGE_RESTRICTED`: "…Add your date of birth to your profile first." | `app/offer/[id].tsx:108-122`, `:180-193` | F13g · 13.4 · #01/#04; flow-13/Delta R3-G · #12 | **Partly.** `GET /venues/:id/regular` has no age-eligibility field, so the ask can't be hidden in advance | `nobody to tell` 0 · `Nobody runs` 0 |
| 13-4 | **The venue page's "No offers from {venue}" switch** ("Offers go to people who come here often. You can stop them.") and its failure "That didn't save. Try again.". The design keeps this on the offer card's ⋯ and footer, and gives the venue page only the quiet line | `app/venue/[id].tsx:373-385` | flow-13/Delta R3-G · offers · #11; F13g · 13.1 · D1/D2 | No: `PUT /venues/:id/regular {offersMuted}` | `No offers from` 0 · `come here often` 0 |

#### A.2 · Outcome toasts and trays on screens that are drawn

These need copy and placement on a drawn screen, not a new layout. The patterns exist: `components/Toast.html` (error) · F7 · toast · #02 · F7 · sheet · #04. Every search below returned 0.

| Flow | What the client shows | Where | Nearest frame |
|---|---|---|---|
| 3 | **Scene trays**, each with "Try again.":<br>• "Couldn't RSVP"<br>• "Couldn't cancel your RSVP"<br>• "Couldn't update your RSVP"<br>• "Couldn't save the event" | `EventDetailScreen.tsx:582`, `:591`, `:617`, `:625`, `:674`, `:704` | F3 · scene · #01–#03 |
| 3 | **Pulse peek:**<br>• "Couldn't save this event. Try again."<br>• "Couldn't remove this event from Saved. Try again."<br>• success "Checked out / You have been checked out of this event."<br>• "Check-out failed / Couldn't check you out. Try again." | `app/(tabs)/events.tsx:616-619`, `:676-691` | F3 · pulse · #16/#18 |
| 4 | **Room:**<br>• visibility switch refused: "Couldn't change who can see you. Nothing has changed."<br>• Check out busy (spinner on the chip), and its failure "Couldn't check you out. You're still in this room." | `lib/useRoomControls.ts:74-96`, `:110-128`; `BlendnScreen.tsx:634-636` | F4 · room · #09/#10, #16 |
| 4 | **PersonCard › Message:** "Sending…", then the failure "Couldn't send the request. Try again." (the sheet stays open) | `BlendnScreen.tsx:681-699`; `components/grid/ConnectSheet.tsx:160` | F6 · user · #08; flow-4/Delta R3-D4 · #10 |
| 4 | **Going:**<br>• "Couldn't remove {title}. Try again." (the row comes back)<br>• "Couldn't save {title} again." (Undo refused) | `app/(tabs)/going.tsx:217-237` | F4 · going · #10 |
| 6 | **Profile and friends:**<br>• "Couldn't save your profile. Try again."<br>• "Your request didn't send. Try again."<br>• accept or withdraw: "That didn't go through. Try again."<br>• "The conversation didn't open. Try again."<br>• "{name} is no longer a friend" | `app/edit-profile.tsx:470`; `app/user/[id].tsx:401`, `:405`; `lib/useFriendRequests.ts:69`, `:80`; `app/friends/[userId].tsx:91`, `:124` | F6 · edit · #10; user · #08; friends · #09/#12; friend · #01/#03 |
| 10 | **Crew detail:**<br>• "Couldn't save that. Try again." (both switches)<br>• "Couldn't send the invites. Try again."<br>• "You left {crew}"<br>**Crews view:**<br>• "Couldn't send the like. Try again."<br>• "Couldn't tell your crew. Try again." | `app/crews/[crewId].tsx:141`, `:155`, `:180`, `:201`; `CrewsView.tsx:178`, `:193`, `:291` | F10g · 10.4 · #01/#05; flow-4/Delta R2-D1 · room · #03 |
| 11 | **Venue page, Stop being live:** "Stopping…", then "Couldn't stop. Try again." | `app/venue/[id].tsx:166-180` | F11g · 11.3 · session · #05 |

#### Not gaps: the client still reaches states the design deleted

Don't draw these. They are listed so the Round 4 prompts don't re-add them.

| State | Ruling | Where the client reaches it |
|---|---|---|
| The bell opens the old notifications sheet | C9 | `components/pulse/NotificationBell.tsx:180-302` |
| "Message request declined" rows in the bell | N1 | `NotificationBell.tsx:249-273`; `lib/notifications.ts:348-352` |
| "Priya walked in", beside the face stack and in the dock | C1 | `components/blendn/RoomSections.tsx:135`; `BlendnScreen.tsx:404` |
| "Just walked in" under a face for 10 minutes. C1 doesn't name it, but it ties a person to the door the same way | — | `lib/roomMoments.ts:97` |
| Organiser tools on the Scene | D1 | `EventDetailScreen.tsx:754-856`, `:1463-1616` |
| Multi-select "Looking for" with Travel and Open | D3 | `components/onboarding/LookingForCards.tsx:46-47` |
| Edit profile's Goals and Looking-for cards | D3 | `app/edit-profile.tsx:57-58`, `:726-751` |
| The orange "Pulse" title | C18 / F3 | `components/pulse/PulseHeader.tsx:263` |
| The old Cancel RSVP body | C15 | `EventDetailScreen.tsx:635` |
| "edited" on a bubble, if the server ever sends the flag | C6 | `components/chat/ChatBubble.tsx:276` |
| "Wants to message you" when a request has no note | C11 | `app/(tabs)/chat.tsx:1052` |
| An ended DM keeps its composer | F5 · dm · #14 | `app/private-chat/[conversationId].tsx:1073` |
| A reason on blocked-user rows (unreachable today) | C14 | `app/blocked-users.tsx:22-35` |
| Stop being live with no confirm. The design says check-out always confirms | — | `app/venue/[id].tsx:280` |

- **Checked and dismissed: "At capacity" at the door.** The admin check-in route still catches `CAPACITY_FULL` (`checkin/route.ts:198`), but nothing on admin dev throws it. C12's premise holds.
- **"PLACEHOLDER DESIGN — logic is final, layout is not" banner:** it shows on `/plus`, `/offer`, `/crews*`, `/edit-about-you`, the Places pane, the venue page, the Board and the Crews view. It's a build marker, not a state.

#### Drawn frames the server can't support today

1. **Signed out "on another device" vs "your password was reset".** These are flow-1/Delta R3-D1 · landing · #04/#05 and F15g · 15.4 · #01/#02. The refresh route returns the same 401, "Invalid or expired refresh token", for every revoked token, so the app can't tell the two apart. It needs a reason field.
2. **15.3 Deleted account.** Google and Apple sign-in return 401 "Account not found", the same code as an expired token. Only the message text tells them apart.
3. **9.2 "Clear all · requests stay".** `DELETE /notifications` deletes every row, with no kind filter.
4. **13.1 one-tap Report on an offer.** The server requires a reason (see 13-2).

---

### B · Round 3 items never drawn

**Every listed item is in the export.** Three leftovers:

| Item | What's missing | Searched |
|---|---|---|
| **4.8** | The **venue composer's reason "You checked in somewhere else."** The 4.8 group names it ("(R3-D5)"), but R3-D5 has no composer frame for it. The pass (#29) and the toast (#30) are drawn | `checked in somewhere else` → 1 file, `flow-4/Delta R3-D4.html` (refs text only) |
| **5.9** | Two of the five server refusals, "That photo is empty. Try again." and "Send photos through the app rather than linking to them", exist only as the annotation on #36. Same layout as #34–#36, so a copy note, not a missing state | `photo is empty` / `rather than linking` → 1 file, the `h:` annotation of #36 |
| **R3-A 3** | The creature set is drawn (`creatures/Set.html`, 38 glyphs; its card says 34), and flows reach it through `journey/ui.js` `creatureGlyph`. **Two stock Lucide cats bypass it:** `components/sets.js` (the MomentMatch page's creature pairings) and `flow-6/flow6.js:16` (the photo stack with no photos). The R3-D4 Match frames #19–#21 are correct | `ic\('cat'` → those 2 files |

Where each item is drawn:

**Flow 4 · `flow-4/Delta R3-D4`**

| Item | Groups and frames |
|---|---|
| 4.1 | card #01–#12, A1 |
| 4.2 | wave #13–#15 |
| 4.3 | refuse #16–#18 |
| 4.4 | match #19–#21 |
| 4.5 | people #22–#24 |
| 4.6 | cancel #25 |
| 4.7 | precise #26–#28 |
| 4.8 | switch #29–#30 |
| 4.9 | days #31–#34 |
| 4.10 | board #35–#36 |

**Flow 5 · `flow-5/Delta R3-D5`**

| Item | Groups and frames |
|---|---|
| 5.1 | sender #01–#02 |
| 5.2 | menu #03–#10, A1 |
| 5.3 | kb #11–#16, A2 |
| 5.4 | spam #17–#18 |
| 5.5 | video #19–#22 |
| 5.6 | preview #23 |
| 5.7 | safety #24–#27 |
| 5.8 | rows #28–#30 |
| 5.9 | photo #31–#38 |
| 5.10 | contact #39–#40 |
| 5.11 | swipe #41–#45 |
| 5.12 | info #46–#47 |

**The other deltas**

| Item | Where |
|---|---|
| 6.1 · 6.2 · 6.3 | `flow-6/Delta R3-D6`: anon #01–#02 · request #03–#04 · photo #05–#14 |
| 3.1 · 3.2 · 3.3 | `flow-3/Delta R3-D3`: changed #01–#03 · days #04–#06 · venue #07–#09 |
| 7.1 · 7.2 | `flow-7/Delta R3-D7`: account #01–#05, A1 · data #06–#07 |
| 9.1 | `flow-9/Delta R3-D9`: wave #01–#03, A1 |
| 9.2 | `flow-9/Delta R3-D9`: report #04–#05 |
| 9.3 | `flow-9/Delta R3-D9`: badge #06–#09 |
| 9.4 | `flow-9/Delta R3-D9`: copy #10–#11, plus `flow-9/Delta R3-0` |
| 10.1 · 10.2 | `flow-10/Delta R3-D10`: reduced #01–#04, A1 · reveal #05 |
| 10.3 | `flow-10/Delta R3-D10`: gone #06–#08, plus `flow-10/Delta R3-0` · gone #01–#05 |
| 1.1 | `flow-1/Delta R3-D1`: landing #01–#05 · errors #06–#08 · links #09–#11 |
| 1.2 | `flow-1/Delta R3-D1`: reset #12–#14, A1 |
| 2.1 · 2.2 · 2.3 | `flow-1/Delta R3-D1`: intent #15–#16 · expertise #17–#18 · pulled #19 (plus `flow-2/Delta R3-0`) |
| 16 | `flow-16/Delta R3-D12-16`: public #03–#11, A2 |

**R3-A**
- **1 · Accessibility frames** (`a11y/Accessibility.html`, built by `a11y.js`):
  - 200% text on 360 dp: `textTabBar`, `textPass`, `textComposer`, `textCard`;
  - Reduce Transparency, Increase Contrast and Bold Text: `matrix`;
  - screen-reader order: `srRoom`, `srChat`, `srCard`.
- **2 · Icon inventory** (`icons/Inventory.html`): zap is outlined, and `alert-circle` has 0 hits.
- **3 · Creature set:** as above.

**Motion #25–#53**
- Every card exists (`motion/25…53`). Each is defined in `defs-c.js` (#25–#39) or `defs-d.js` (#40–#53), with haptic, Reduce Motion and Android fields.
- The prototype additions are in:
  - `flow4-proto.js`: #25, #33, #51;
  - `flow5-proto.js`: #27, #35, #36, #37;
  - `flow3-proto.js` and `flow10-proto.js`: #45.
- The #53 orb sets are in `backdrop/time-of-night.html`, and the rejected list is `motion/rejected.html`.

**Flows 9–16 (SCREENS-ADDITIONS):** every item in every "Draw" list is drawn, read with ROUND3 C and G applied. The ones checked by copy:
- the Flow 10.7 states on the `flow10b.js` board: "No crews here", "Crews are off at this event", "That crew isn't here any more", "Likes count for the whole crew";
- the Flow 11.1 venue states on the `flow11.js` board: `no_check_in_area`, `event_live_here`, hidden `liveNow`, closed or unknown;
- 12.3's 11 status cards (F12g · status);
- 12.4's lapse line;
- all 23 notification kinds in 9.3, plus the 9.2 report row;
- Flow 15 #1–#22 (#20 is in F11g · 11.3 · outside).

---


---

## 7 · Not design: server follow-ups

These four drawn frames need a server change before the client can show them. R14 keeps the frames, labelled "Needs server". Each change becomes a Jira ticket (`found-in-redesign-r4`).

| Frame | The server today | Change |
|---|---|---|
| Signed out "on another device" vs "your password was reset" (flow-1 Delta R3-D1 · landing · #04/#05; F15g · 15.4 · #01/#02) | The refresh route answers every revoked token with the same 401, "Invalid or expired refresh token" | Return a reason with the 401: `revoked_elsewhere`, `password_reset` or `expired` |
| 15.3 Deleted account | Google and Apple sign-in answer 401 "Account not found", the same code as an expired token. Only the message text differs | A distinct code for a deleted account |
| 9.2 "Clear all · requests stay" | `DELETE /notifications` deletes every row; there's no kind filter | Keep friend and message requests when clearing |
| 13-3 "Let them know I'm a regular" for someone with no date of birth | `GET /venues/:id/regular` has no age-eligibility field, so the client can't hide the ask in advance | Add the eligibility to that response |

---

## 8 · Round 4.1: finishing Round 4 (2026-10-16)

Written after reading the project as it stood once the Round 4 prompts had run (`round4/Status.html`, `github.md`, the Flow 4 canvas and its builders). Much of the round landed:
- **The folds:** R2-D1–D5, R2-D7, R3-0, R3-G, R3-D1 2.1, R3-D3, R3-D4 4.1–4.3, R3-D6, R3-D7, R3-D9 9.2 and R3-D10 10.2 now live in the approved builders. "Walked in" is gone at the source.
- **The rulings:** R1–R14 are applied.
- **Check-in:** drawn end to end on the Flow 4 canvas (`flow4-checkin.js`), with motion #9b.
- **Coach marks:** the four marks and Help › Tips.
- **The missing states:** 159 R4-D frames.

What follows is everything still to do before the client build restarts. The build waits for all of it.

### 8.1 · The hold has no quarter marks

The project synced `docs/redesign/` from the brief branch at 21:06:17Z on 2026-10-15. The owner's ruling against quarter marks (#396) reached that branch 20 seconds later, so the project applied the old R3. The marks are drawn in:
- `journey/ui.js` `JU.hold`: the `marks`, and the comment "Quarter marks (R3)";
- `flow-4/flow4-checkin.js` `F4C.hold` (comment);
- the Flow 4 canvas's "Check-in end to end" group: the refs text and frames 01–04 ("marks at 25/50/75", "the mark turns ink");
- motion #8 and #9b;
- the HoldToConfirm page;
- `round4/Status.html` ("R3 quarter marks on the hold").

Remove them all. The H.tick annotations at 225, 450 and 675 stay: they are haptics, and nothing is drawn for them.

### 8.2 · Retire the deltas: one canvas per flow (R16)

The Round 2 and Round 3 delta canvases now call the approved builder on both sides. Their "before" and "after" frames are mostly the same picture. Where they differ, the "before" is a retired screen that an implementer could build by mistake.

**Retire them:**
- **Fully folded R2-\* and R3-\* canvases:** delete the canvas and its card page (`Delta R2-D1.html` with `DeltaR2D1.html`, and so on).
- **Anything not yet folded:** fold it into its builder first, then delete. The status page names R2-D7's Flow 4 and Flow 11 pieces as possibly unfolded.
- **The four kept as compositions** become ordinary groups on their flow canvases, drawn from the builders:
  - R3-D5's gestures and keyboard (Flow 5);
  - R3-D9's wave banner (Flow 9);
  - R3-D16's share sheet over the Scene (Flow 16);
  - R3-D10 10.1's person sheet over a crew chat (Flow 10).
- **The R4-D canvases (159 frames):** fold them into their flow canvases as groups, titled by their part 6 row ids. Then delete the `Delta R4-D*` canvases and cards. `round4/r4d.js` and `r4d2.js` may stay as helper files, but the frames live on the flow canvas.
- **The helpers:** once nothing uses `round2/delta-canvas.js`, `round2/r2d7.js` or the `flow*-delta.js` / `flow*-r3d*.js` alias files, delete them. `R3.mark`, the "Needs server" marker, moves into `components/` or `journey/ui.js`.

**Reverse the standing rule.** Replace the "Deltas" section of the project's `CLAUDE.md` with:

> A change edits the approved builder; the flow canvas shows the result. Old states are deleted, never kept as "before" frames. If a change would alter an approved frame the prompt didn't name, list it and ask before changing it.

Then each flow is one canvas, one builder file and its prototype, and a component page and a motion card call that same builder.

### 8.3 · Inside more than one place (R15)

**The server today:**
- **One room at a time.** A new check-in or Go Live checks you out of every other room. Today that happens silently (SCRUM-635, designed in ROUND3 4.8).
- **Overlapping fences are allowed.** Several events can run at one venue, venues can share a building, and outlines can overlap. You may check in to any one place whose fence you're inside.
- **The one preference the server has:** while an event is on at a venue, it takes over the venue's own room. This is already drawn (`places.js` `venueSheet` "taken").
- **The client today** guesses with "nearest pin within 100 m" (SCRUM-704).

**Nothing in the project draws being inside two places.** Draw these as a new group, "Inside more than one place", on the Flow 4 canvas, iOS and Android:
1. **Tonight, inside two places.** The pass docks for the first in R15's order and carries a "2 here · Switch" control. The deck shows the other place as an ordinary card. Annotate: swiping the deck never moves the pass.
2. **The chooser.** A sheet listing each place you're inside, one row each:
   - the event or venue name;
   - its kind: an event, or "Go live" for a venue;
   - its start time, or its live bucket;
   - a check on the current pick.

   Choosing a row re-docks the pass on `M.settle`; the hold starts only on the pass. The haptic is H.select on a row, nothing more.
3. **The centre button** in state (c) with the label "Check in · 2 here".
4. **Two events at one venue** (the same building, two rooms): the event title tells them apart, as in "Vinyl Night · at Toit" and "Bass Thursday · at Toit". The server has no field for a room within a venue, so don't draw one.
5. **A venue and an event at the same place:** the event wins (R15 order 2). Show that the chooser lists only the event while it's on, and point to the venue page's "taken" sheet. Don't redraw it.
6. **Already in a room, inside another place:** the pass reads "Hold to switch" with the line "You'll leave Vinyl Night". After the switch comes the "You left Vinyl Night" toast. That is ROUND3 4.8 (#29, #30): bring those frames onto this group if they aren't already on the Flow 4 canvas.
7. **Approximate location** (precise location off): no pass at all. Tonight shows the 4.7 tray's line instead. Draw how this reads when the deck is full.
8. **Reduce Motion:** the re-dock is a 200 ms crossfade.

The copy here is proposed. Mark the chooser "Needs server" until SCRUM-704's "which places am I inside" read exists.

### 8.4 · The prototype and the Pulse coach mark

- **The Flow 4 prototype:** `flow4-proto.js` still animates the pour with `JM.flood`, full-screen. Rebuild it on `F4C.pour` inside the docked pass. Play both endings: the Room at +700, and the question path at +1600 → +1820. Then retire `JM.flood` and `pourStill`.
- **The Pulse coach mark:** in the client build, the mark sits above the first event card. When its sentence wraps to two lines, about 24 pt of it covers the bottom of the search bar. Draw the Pulse mark at 2 lines and on a 360 dp screen, and say where it goes when it doesn't fit above the card: below the card, or the card scrolls first.

### 8.5 · Still open from Round 4

From `round4/Status.html`. Finish these in this round:
- **R4-3, cell by cell.** Rebuild every component page's cells from the builder the flows call, so a page can't drift again. The pages name their builder today, but their cells still carry their own props.
- **The part 5 rows that need new drawing:** A18, A19, A31, A37–A39, A44, A45, A53, A55, A56, A59–A63, A65–A67, A71–A73, A75, A77, A78, A80, A81, A85, A87, A88, B2 (a type role for "You're in."), B5–B9, B13, B14, B17, B20, B21, B23, C7, C9–C12, D17 (the PersonCard page from R3-D4 in full), D19 and D24.
- **Prompt 10,** the consistency audit across every flow, last.

### 8.6 · Not design (filed)

- **SCRUM-704:** a server read of "which places am I inside", judged against the real fences and in R15's order. The disc and Tonight use only that read.
- **SCRUM-705:** "one room at a time" is enforced only in app code. Make the switch one transaction, and back it with a partial unique index (one open check-in per person).
- **SCRUM-635:** the silent switch, already filed.
