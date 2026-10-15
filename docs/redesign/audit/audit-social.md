# Blendn client — social surfaces audit (Banter · chat · friends · profile)

Source of truth for the redesign of these screens. Read from the code, not the file names.

- **Code read:** `the client repo (a clean origin/dev worktree)` at `54481d2` ("feat(board): turn the board on (step 6c) (#362)", 2026-10-01), a clean worktree of `origin/dev`. All paths below are relative to that root. `file:line` refers to that commit.
- **Docs read first:** `docs/CHAT.md`, `docs/BANTER.md`, `docs/PROFILE.md`, `docs/DESIGN_SYSTEM.md`, `docs/api/client-chat-moderation-guide.md`. Also `tasks/lessons.md`, `lib/theme.ts`, `scripts/check-design-tokens.js`, and the shared pieces these screens lean on (`ActionTray`, `SheetHost`/`lib/sheet.ts`, `LoadError`, `AppHeader`, `PulseTopBar`, `RealtimeStatusBanner`, `EmberButton`).
- **Redesign direction this audit is written against:** glass/translucent material on the floating control and navigation layer. Solid content cards. A backdrop of ambient brand-colour orbs (orange `#F05423` and violet ≈`#8E4BAA`). The brand gradient goes on the Blend'n mark and on each screen's single primary action. Outlined icons, Satoshi type, rich motion and haptics. Dark only, 18+.

Material-layer legend used throughout:

| Layer | Meaning |
|---|---|
| **Glass control** | Floating chrome over content and orbs: top bars, the composer, FABs, floating back/⋯ buttons, the search field, status toasts |
| **Glass sheet** | Modal surfaces over a dimmed page: the app's one sheet (`SheetHost`/`ActionTray`), `ConnectSheet`, match moment, mute/leave/report steps |
| **Solid content** | Readable things: bubbles, rows, cards, profile sections. Opaque, so text contrast never depends on what is behind it |
| **Over-photo scrim** | Text or controls that sit on a photograph (profile hero name, memory tiles, photo badges) |

---

## 0. Read this first: cross-cutting findings

### 0.1 The current design system forbids the new direction, and a linter enforces it

- `docs/DESIGN_SYSTEM.md:123-129` ("Surfaces are flat"): no shadows, glows, `BlurView` glass or gradient fills. The only allowed gradients are photo scrims and pseudonym avatars.
- `scripts/check-design-tokens.js:88-95` **fails `npm test`** on any `shadow*` key or any `<BlurView>`. It also fails on raw hex/rgba, raw `borderRadius`, and raw font sizes. The glass layer cannot ship until this rule is changed. `expo-blur ~57.0.3` is already installed (`package.json:33`).
- `tasks/lessons.md:16` records that the owner rejected a "frosted-glass CTA with an orange bloom" and a "pulsing halo on the room button" as "very AI generated". **The new direction must not rebuild that exact thing.** Glass belongs on chrome, the primary action carries the gradient with no bloom or glow, and status stays a still mark. Brief the designer on this explicitly.
- `tasks/lessons.md:5` is a performance rule: no Reanimated layout transitions on a view that contains a `BlurView` or a shadow, because each frame becomes a layout pass plus a blur redraw. This matters for the composer (it grows with multiline input), `ReplyBar`, and banners that appear above a glass bar.
- Code comments that cite "no glass" and will need revisiting:
  - `components/chat/ChatComposer.tsx:18-20` ("drew it translucent and blurred; it is a flat `EMBER.surface` instead")
  - `components/pulse/PulseTopBar.tsx:133-134` ("The frame's 80% fill under a 12pt blur is glass; the feed now passes under a flat band")
  - `components/chat/ChatBubble.tsx:179-183`: the avatar disc is flat because "a gradient is a native view… a chat would pay it for thirty". Keep this cost rule in mind for orbs and gradients inside lists.

### 0.2 Brand colour and contrast: the gradient has no single label colour that passes AA

- Current accent is `EMBER.accent #FF906D` with dark text `EMBER.onGradient #5B1600` (`lib/theme.ts:154-156`). `DESIGN_SYSTEM.md:111-112` notes that white on the accent fails contrast.
- New stops, as computed WCAG contrast:
  - **orange `#F05423`**: white text **3.5:1** (fails AA for 16px text); `#0F0E0E` text 5.5:1 (passes)
  - **violet `#8E4BAA`**: white text **5.6:1** (passes); `#0F0E0E` text **3.4:1** (fails)
- So an orange→violet primary button fails AA somewhere along its length with either white or dark text, at today's `TYPE.button` (16/24 bold). Options: deepen the orange stop, make button labels "large text" (≥ 18.66px bold, where 3:1 is enough), or put the label on the stop it passes against. `__tests__/themeContrast.test.ts` pins contrast today, so whatever tokens are chosen need to be added there.
- `EMBER.violet #F79EFF` is currently "the one cool hue… nothing else" (`DESIGN_SYSTEM.md:115-116`). The brand violet replaces that meaning.
- **Pseudonym avatar palette collision:** `lib/pseudonymAvatar.ts:44-53` deliberately picks hues that "never read as the accent, success or white". Two of its eight pairs are violets: `#5B4B8A→#8B6FB8` and `#5A3F63→#8C6699`. Next to a brand violet ≈`#8E4BAA`, those discs will read as a branded state rather than as a person. The palette needs re-tuning alongside the brand colours.

### 0.3 Type, icons and tokens

- Fonts today: Plus Jakarta Sans for display/title/heading/button and Manrope for body/meta/label/caption (`lib/theme.ts:228-233`). Loaded from `@expo-google-fonts/*`. **Satoshi is not on Google Fonts.** It has to be bundled (Fontshare files through `expo-font`), and the `TYPE` roles (`lib/theme.ts:318-405`) re-mapped. `MAX_FONT_SCALE` caps per role (`DESIGN_SYSTEM.md:53-55`) must carry over.
- Icons: Ionicons plus two MaterialIcons. **These filled glyphs need outline equivalents:**
  - `pencil`, `person-add` (`app/(tabs)/profile.tsx:422,437`)
  - `people` (`app/chat/[id].tsx:134`, `app/chat-info/[id].tsx:256`)
  - `search` (`components/banter/BanterSections.tsx:65,74`)
  - MaterialIcons `groups` and `person` (`BanterSections.tsx:339,538`), a second icon family
  - `send` (`ChatComposer.tsx:124`), `arrow-undo` (`SwipeToReply.tsx:57`), `link` (`InviteLinkCard.tsx:18`)
  - `close-circle` (red on a white disc) (`PhotoManager.tsx:384`)
- Options glyphs are inconsistent: `ellipsis-vertical` in the room and DM headers, `ellipsis-horizontal` on profiles, the friend profile and the request "More" disc.
- Spacing, radius and control tokens (`SPACE`, `EMBER_RADIUS`, `CONTROL`) are solid and worth keeping. "One row, one height" (`DESIGN_SYSTEM.md:69-75`) is honoured across these screens.

### 0.4 Haptics inventory (everything in scope)

`useInteractionFeedback` (`lib/useInteractionFeedback.ts`) exists but **no in-scope screen uses it**. Every haptic is a direct `expo-haptics` call:

| Where | Trigger | Haptic | file:line |
|---|---|---|---|
| Room and DM | Long-press a bubble (menu opens) | `impactAsync(Medium)` | `app/chat/[id].tsx:887`, `app/private-chat/[conversationId].tsx:830` |
| Room and DM | "Copy" in the message menu (after the clipboard write) | `notificationAsync(Success)` | `app/chat/[id].tsx:823`, `app/private-chat/[conversationId].tsx:795` |
| Room and DM | Swipe-to-reply crosses its 56pt trigger | `impactAsync(Light)` | `components/chat/SwipeToReply.tsx:29,39` |
| `user/[id]` | A Connect request is sent successfully | `impactAsync(Light)` | `app/user/[id].tsx:402` |
| Me tab (PhotoStack) | A card is flicked to the back of the pile | `impactAsync(Light)` | `components/motion/SwipeDeck.tsx:46,238` |
| Me tab (Nights out) | Scrub or tap lands on a new night | `selectionAsync` | `components/profile/NightsOut.tsx:208` |
| Edit profile (photos) | "Make main" | `impactAsync(Light)` | `components/PhotoManager.tsx:234` |
| Edit profile (interests) | Chip toggled / cap (10) reached | `selectionAsync` / `notificationAsync(Warning)` | `components/InterestPicker.tsx:110,115,118` |
| `ScalePress` default | press-in, *unless* `haptic={false}` | `selectionAsync` | `components/motion/ScalePress.tsx:52` |

Only three `ScalePress` uses in scope keep the default haptic: "Write a starter" (`app/chat/[id].tsx:1034`), "Say hi 👋" (`app/private-chat/[conversationId].tsx:1049`) and "Rejoin" (`components/chat/RoomLeftState.tsx:44`). Every other one passes `haptic={false}`. `EmberButton`, `LoadState`, `ActionTray`/`SheetHost` and `Toast` fire no haptics.

**No haptic at all on:**
- send (room or DM)
- a reaction pick
- Accept/Decline on a message request or a friend request
- Mark all read, pull-to-refresh, mute/unmute, leave room, rejoin success
- unfriend, block, unblock, report submitted
- Like on a profile (the haptic sits on the mutual `MatchMoment`, `components/blendn/MatchMoment.tsx:80`, `Success`)
- the reveal confirmation, accepting an invite link, a save in Edit profile

### 0.5 Motion inventory (everything in scope)

| What | Motion | file:line |
|---|---|---|
| Your just-sent bubble | fade + 6pt rise, 150ms `bezier(0.23,1,0.32,1)`; Reduce Motion = fade only | `components/chat/ChatBubble.tsx:128-140,177` |
| Swipe to reply | 1:1 drag to 56pt, rubber-band to 88 (×0.35), arrow fades/scales 0.6→1, spring home (damping 20, stiffness 240) | `components/chat/SwipeToReply.tsx:32-52`, `lib/swipeReply.ts:2-16` |
| Typing dots | RN core `Animated` loop, opacity 0.3↔1, 320ms ease-in-out, 160ms stagger; row at 0.6 opacity; Reduce Motion = still at 0.6 | `components/chat/TypingIndicator.tsx:35-66,92` |
| Reply bar | `fadeInFast` 150 / `fadeOutFast` 120 | `components/chat/ReplyBar.tsx:17`, `components/motion/presence.ts:22-23` |
| Scroll-to-newest disc | `popIn`/`popOut` (0.9↔1 scale + fade, 150/120ms) | `app/chat/[id].tsx:1069`, `app/private-chat/[conversationId].tsx:1079` |
| DM empty card → first message | `fadeOutFast` exit | `app/private-chat/[conversationId].tsx:1033` |
| Banter message request leaves | `FadeOut` 160ms + `LinearTransition` 220ms `bezier(0.77,0,0.175,1)` reflow | `app/(tabs)/chat.tsx:976-980,1121-1122` |
| Profile Connect→Requested label | crossfade keyed on label (skip on first paint) | `components/profile/ProfileSections.tsx:415-425` |
| Me tab sections | `FadeInUp` 520ms gentle ease, 16pt rise, 70ms stagger ×10 | `app/(tabs)/profile.tsx:57-58,392-601` |
| Stats numbers | odometer roll, 900ms, 90ms column stagger | `components/profile/RollingNumber.tsx:19-21,79-138` |
| Nights out grid | columns rise in (opacity + 0.6→1 scale, 460ms each, 45ms stagger, 200ms delay); selected dot pops 1.5× with overshoot; caption slides 16pt from the side you moved toward (320ms) | `components/profile/NightsOut.tsx:54-122,82-100` |
| Photo pile | deal (250ms beat + 620ms fan-out), drag tilt, throw 220ms + spring 550ms under the pile, tap press 0.97 | `components/motion/SwipeDeck.tsx:37-43,196,210-260` |
| Photo grid reorder/remove | `LinearTransition` 250ms + `fadeOutFast` | `components/PhotoManager.tsx:43,319-320` |
| Press feedback (all `ScalePress`) | scale 0.97 (rows 0.98), 120ms CSS transition | `components/motion/ScalePress.tsx:35-86` |
| Sheets | `RisingSheet` rise 300 / sink 240 on iOS sheet curve, drag-to-dismiss (30% or 800pt/s), scrim fades | `components/motion/RisingSheet.tsx:28-55,132-240,293-342` |
| Lightbox | `SwipeToDismiss` throw-away + `ZoomableImage` pinch/double-tap | `components/motion/SwipeToDismiss.tsx:77-145`, `ZoomableImage.tsx:52+` |

**No motion at all on:**
- inbox rows, the unread dot clearing, Live now rows, the search filter
- reactions changing count
- broadcasts arriving, room state changes (lock or mute)
- reveal state changing in a DM, friends list rows, invite landing state changes
- edit-profile cards, the blocked list

### 0.6 Where the docs and the code disagree (designers will read the docs)

| Doc says | Code does | Evidence |
|---|---|---|
| Bubble corners 24, tail 4 (`docs/CHAT.md:96`), inbound `#1B1919` | radius 16 (`md`), tail 8 (`sm`); inbound `surfaceSunken #211F1F`, outbound `surface #272525`. The bubble's own header comment says "16 except one, which is 4" | `ChatBubble.tsx:15-19,357-363` |
| DMs have "No reactions or replies" (`docs/CHAT.md:229-231`) | DMs **have replies** (swipe and menu, quote in bubble, SCRUM-409). Still no reactions | `app/private-chat/[conversationId].tsx:325,790,837,853` |
| DM read is "an accent ✓✓" (`docs/CHAT.md:235-236`) | three states: `✓` sent (tertiary), `✓✓` delivered (tertiary), `✓✓` read (`textPrimary`) | `ChatBubble.tsx:202-209,375-380`, `lib/receipts.ts` |
| The composer is "a floating pill… the conversation runs underneath it" (`ChatComposer.tsx:10-16`) | It is **in flow** after the `FlatList` inside a `KeyboardAvoidingView`. The feed stops at it and never runs beneath | `app/chat/[id].tsx:988,1091` |
| Me tab is a "control panel… 'Preview'… routes to `/user/<own id>`" (`docs/PROFILE.md:15-46`) | Me tab **is** the full profile now. No Preview; the code comment says the owner wanted "one merged profile page" | `app/(tabs)/profile.tsx:319-329`, `tasks/lessons.md:20` |
| "The CTA is black… 80pt padding" (`docs/PROFILE.md:141-152`) | No black CTA exists. `ProfileActions` is a `surfaceSunken` pill tray | `ProfileSections.tsx:501-529` |
| `ProfileHero` blurred path: "nothing reaches this path in the real app" | `app/user/[id].tsx` passes the server's 40px `blurPhoto`, and the path is live | `ProfileSections.tsx:83-86` vs `app/user/[id].tsx:483,509-510` |
| Moderation guide: `USER_BANNED` → overlay; `NOT_CHECKED_IN` → message; `chat:memberMuted` → live disable; withheld send → placeholder | See §0.7. Several are not implemented | — |

### 0.7 Moderation and restriction states: guide vs code (the chat UI must show these)

| Signal | Guide UX (`docs/api/client-chat-moderation-guide.md`) | What the client does today | file:line |
|---|---|---|---|
| `USER_MUTED` on send (room) | persistent banner, input disabled, "You can still read" | composer lock `muted`: a `meta` line above the pill "You're muted in this room." The field is read-only with placeholder "Can't send right now" and send is dimmed. The failed bubble stays, plus a toast with the server's sentence | `app/chat/[id].tsx:608-609`, `ChatComposer.tsx:53-58,81-101` |
| Auto-mute expiry (1h) | next send succeeds → clear | any successful send lifts the lock. But with the field read-only, the **only** send left is tapping a failed bubble to retry it. No countdown, no "muted until" | `app/chat/[id].tsx:646-652` |
| `chat:memberMuted` socket | disable input live | **not wired**: no listener in `lib/socketClient.ts` (only `messageDeleted` and `memberBanned`, lines 137-138, 678-686) | — |
| Already muted when the room opens | (Option B: check upfront) | the Banter row knows (`membership.status === 'muted'` → "Muted — you can read, not post"), but **the room screen does not pre-lock the composer**. You find out by sending | `app/(tabs)/chat.tsx:341`, `lib/roomState.ts:12-21` |
| `USER_BANNED` | full-screen overlay, hide input | no lock case, so it falls to "unlocked". You get a failed bubble and a toast. The `chat:memberBanned` socket opens an `ActionTray` "Removed — You have been removed from this chat by the organiser." with OK → `router.back()`. Reopening it depends on the server's code: `FORBIDDEN` → `RoomLeftState` "You're not in this room" with a Rejoin the server then refuses; any other code (e.g. `USER_BANNED`) → "Couldn't load this chat" + a Try again that can never succeed | `app/chat/[id].tsx:542-549,620-623,371-373` |
| `CHAT_LOCKED` | banner, input disabled | lock `locked`: "You can read this room, but not post in it." | `app/chat/[id].tsx:610-611` |
| `CHAT_CLOSED` (not in guide) | — | lock `closed`: "This room is closed." | `app/chat/[id].tsx:612-613` |
| `NOT_CHECKED_IN` | "Check in to send messages" | no lock; failed bubble plus the server's sentence as a toast | `app/chat/[id].tsx:620-623` |
| `SPAM_BLOCKED` | brief toast | room: no lock (failed bubble + toast). **DM: timed `rate_limited` lock.** Inconsistent | `app/private-chat/[conversationId].tsx:683-688` |
| `RATE_LIMITED` | — | lock `rate_limited` "Slow down a moment — too many messages.", auto-lifts after `retryAfter` (clamped 1–120s, default 5) | `app/chat/[id].tsx:614-618` |
| `moderation_hidden: true` on send | **placeholder bubble** + warning | **bubble removed** and a modal `ActionTray` "Not sent — That message was removed by moderation and was not delivered." (room and DM) | `app/chat/[id].tsx:659-663`, `app/private-chat/[conversationId].tsx:694-698`, `lib/sendOutcome.ts` |
| `chat:messageDeleted` + `moderation` + own | placeholder | placeholder bubble (dashed outline, italic "This message was removed by moderation."; no long-press, no swipe) | `app/chat/[id].tsx:527-540`, `ChatBubble.tsx:265-269,366-372` |
| `messageDeleted` (others / admin) | remove | removed from the list, no trace | `app/chat/[id].tsx:538` |
| History with `moderation_hidden` | placeholder persists | placeholder | `app/chat/[id].tsx:308` |
| `LEFT_ROOM` / `FORBIDDEN` (history, send, react) | — | `RoomLeftState` replaces the feed and composer | `app/chat/[id].tsx:371-372,654,750,982-983` |
| DM `NOT_FOUND` (closed or blocked; never says which) | — | "This conversation has ended / It is no longer available to either of you." **But the composer is still drawn under it** | `app/private-chat/[conversationId].tsx:515-517,1008-1015,1101` |
| DM reply to a moderated message | — | the quote reads "Message unavailable" | `app/private-chat/[conversationId].tsx:94` |

**Design implication.** The redesign should specify a composer **state system**, because today the code has four `meta`-line locks plus `RoomLeftState`:

- normal
- sending (by design there is none: `ChatComposer.tsx:37-50`)
- failed (on the bubble)
- muted
- auto-muted with an expiry
- locked by the organiser
- room closed
- rate-limited (timed)
- not checked in
- banned / removed
- left the room
- conversation ended or blocked (DM)

The plumbing gaps (no `memberMuted` listener, no pre-lock on open, banned not a lock, ended DM shows the composer) should be filed alongside the design.

### 0.8 Product rules that must survive any restyle (one place)

1. **Rooms are anonymous.** In a room, avatars are generated marks and never faces. The seed is the **pseudonym**, never a user id (`lib/pseudonymAvatar.ts:23-36,129-147`; `docs/CHAT.md:112-123`). The same person is the same creature and colour on every surface in that event, and a different one at the next event.
2. **Identity is the server's call**, and it fails closed. `identityVisible`/`theyRevealed` decide what is drawn. The UI never infers a reveal from a photo having arrived (`docs/PROFILE.md:189-196`, `lib/profileIdentity.ts:48-63`, `app/(tabs)/chat.tsx:540-557`). An unrevealed match gets the generated disc, never an empty grey circle (`docs/BANTER.md:128-141`).
3. **Never blur client-side.** The blurred hero is the server's 40px derivative, and there is no real URL on the device (`lib/pseudonymAvatar.ts:1-21`, `lib/conversationReveal.ts:139-153`, `app/user/[id].tsx:45-51`).
4. **Reactions show a count, never who** (`docs/CHAT.md:178-179`, `ChatBubble.tsx:69-78,301-308`). Only the six server emoji (`lib/apiClient.ts:473`: 👍 ❤️ 😂 😮 😢 🔥).
5. **No read receipts in rooms.** DMs only, own messages only (`docs/CHAT.md:235-240`, `ChatBubble.tsx:87-94`).
6. **Attendees post no media.** No `+`/attach and no emoji button in the composer (`docs/CHAT.md:130-148`). Sponsored broadcasts may carry media. **Sponsored is always labelled and must never borrow the organiser's or room's voice** (`BroadcastNotice.tsx:24-30`).
7. **A failed send stays in the thread** as "Not sent · Tap to retry" and is never silently dropped (`docs/CHAT.md:83-86`). A history load failure is never shown as the "start the conversation" empty state (`docs/CHAT.md:88-90`).
8. **Typing lives at the end of the feed**, not pinned over the composer (`docs/CHAT.md:183-191`).
9. **The quote sits inside the bubble.** "edited" is on the bubble, not by the timestamp (`docs/CHAT.md:173-177`).
10. **One inbox, not tabs.** A person is round and a room is a square cover. Checked-in rooms are lifted out into Live now. Unread is three changes and never a height change. No counts on rows. No hairlines (`docs/BANTER.md:30-60`).
11. **No compose button** in the inbox. A DM starts from a person (`docs/BANTER.md:107-108`).
12. **The accent (future: the brand gradient) is for at most one thing per screen**, plus the tab bar's own chrome. Accept/selected/unread/presence take neutral treatments (`DESIGN_SYSTEM.md:85-110`).
13. **Presence is a still `success` dot**, never motion and never the accent (`BanterSections.tsx:143-150`, `tasks/lessons.md:16`). This is in direct tension with "rich motion". The designer must decide whether a live pulse comes back and how to avoid the rejected "halo".
14. **Revealing is irreversible**, and the confirmation must say so before the tap (`lib/conversationReveal.ts:93-110`). Sending Connect reveals you, and `ConnectSheet` says so above the field before any typing (`components/grid/ConnectSheet.tsx`).
15. **There is no search for people.** Friends arrive only by invite link (`app/friends/add.tsx:19-28`). "Not now" and "Remove friend" are silent: the other person is never told.
16. **Matching data is special-category.** A networking user is never asked their gender. Dating fields are shown and written only while Dating is ticked (`components/profile/MatchingFields.tsx:32-43`, `app/edit-profile.tsx:441-450`). Dating is offered only to an age that may date (`mayDate`, SCRUM-294).
17. **The app's one sheet** (`lib/sheet.ts`): every "are you sure", report and block flow is a step of one sheet, never `Alert.alert` (Android drops options beyond three) and never a second stacked modal.

---

## 1. Screens

### `app/(tabs)/chat.tsx` — The Banter (inbox)

- **Files and components:**
  - `app/(tabs)/chat.tsx`: `ChatInner` 209-1074, `InboxSkeleton` 1082-1100, `InboxLoadFailed` 1102-1104, `EmptyInbox` 1106-1119
  - `components/banter/BanterSections.tsx`: `BanterSearch`, `BanterHeading`, `BanterBucketHeading`, `BanterLiveRoom`, `BanterConversation`, `BanterRequest`, `PseudonymDisc`, `RoomCover`, `MutedMark`
  - `components/banter/inbox.ts`: time labels, buckets, previews
  - Shared: `components/pulse/PulseTopBar`, `components/pulse/NotificationBell`, `components/RealtimeStatusBanner`, `components/board/BoardRequestsSection` (behind `BOARD_ENABLED`), `components/LoadError` (`LoadState`/`LoadError`), `components/Skeleton`, the app sheet (`lib/sheet.ts`)
- **Job:** every conversation you have, rooms and people, on one list, with the room you are standing in lifted to the top and message requests waiting on an answer. **Entry/exit:**
  - Entry: the Banter tab (4th slot of `Pulse · Going · [Blend'n] · Banter · Me`). Tapping the tab again scrolls to the top (`useScrollToTop`, 230).
  - Exits by push: `/chat/[id]` (a room), `/private-chat/[conversationId]` (a DM, also after Accept), `/user/[id]` (request avatar or name), `/(tabs)/events` (empty-state CTA).
  - The bell opens the notifications sheet.
- **Primary action:** none on a populated inbox, by rule (`docs/BANTER.md:77-82`). Accept is strong-neutral. The **empty state's "Explore events"** and the **failed state's "Try again"** are their states' single accent. The redesign's brand gradient therefore appears here only on the tab bar's Blend'n mark, unless a state screen is showing.
- **Content, top to bottom:**
  1. `PulseTopBar` "The Banter" + `NotificationBell` (absolute and opaque `EMBER.bg`, 64pt, `PulseTopBar.tsx:7,126-136`).
  2. `RealtimeStatusBanner` absolutely under the bar (`top: insets.top + 64 + 8`, 1029-1032). It appears only when offline ("You're offline. Some actions won't work until you're back.", destructive tint) or when the socket drops ("Reconnecting…" / "Live updates paused." + RETRY, warning tint).
  3. The list (content `paddingTop insets.top + 64 + 32`, gutter 24, bottom clears the 92pt tab bar). Its header (938-1010) contains:
     - `BanterSearch`: a 48pt `surface` pill, search glyph, placeholder "Search conversations...".
     - A partial-failure line (`meta`): "Some chats couldn't load. Pull down to try again." (only when one list failed and rows exist).
     - **Live now** (`heading` 20): one `BanterLiveRoom` per checked-in room. A `surfaceSunken` panel, radius 16, padding 16, a 56pt square cover (radius 8; a MaterialIcons `groups` glyph on `surface` when there is none), the title `bodyStrong` (+ muted bell-slash), an 8pt still `success` dot, and "You're here · N in the room".
     - **Requests** + count (`meta`): `BanterRequest` rows. Each has a 56pt photo (or a `person` glyph disc), name + time, two lines of message ("Wants to message you" if empty), then 32pt pills **Decline** (`surface`, `textSecondary` label), **Accept** (`textPrimary` fill, `bg` label), and a 32pt `surface` **More** disc (⋯).
     - **The Board** section (if `BOARD_ENABLED`; a placeholder design per `docs/BANTER.md:38`).
  4. Bucketed conversations: `BanterBucketHeading` "Today / This week / Earlier" (`DayHeading`, `bodyStrong`). The first heading carries a "MARK ALL READ" text action (`label`, `textPrimary`) when any DM is unread. Then `BanterConversation` rows:
     - Avatar 56pt: room = square cover; person = round photo; unrevealed match = gradient `PseudonymDisc` with a 26pt emoji; revealed with no photo = initials on `surfaceSunken`.
     - Line 1: title `bodyStrong`, optional bell-slash, time `meta` on the right.
     - Line 2: preview `body` `textSecondary` ("You: …", "Mika: …"), plus a reserved 10pt unread-dot slot.
     - Fixed 80pt row (56 + 12 + 12), no hairlines (`BanterSections.tsx:403-418`).
- **Interactive elements:**
  - Search: types and filters title, preview and a room's last sender in place. Clear button while editing (iOS). `keyboardDismissMode="on-drag"`.
  - Live now row tap → room. Clears that row's unread locally and records it as the "open room" so incoming messages don't bump it (251-265).
  - Conversation row tap → room or DM. A DM also writes last-read locally and marks "Asked to reveal" seen for the session (267-281).
  - Request: avatar or name tap → `/user/[id]`. **Decline** / **Accept** respond optimistically: the row fades out, and Accept pushes the new DM (826-870).
  - Request **More** opens the sheet "{name}" with the copy "Blocking stops them asking again and hides you from each other. A report goes to our team, and they are not told who sent it." It offers **Block** (destructive; a `respond` with `block`, toast "{name} is blocked"), **Report** (reason step via `userReportStep`; then declines the request), and Cancel (880-910).
  - MARK ALL READ: optimistic for **DMs only**. Rooms can't be marked read server-side (`docs/BANTER.md:84-96`). Rollback + toast "Couldn't mark your chats as read. Try again." (392-409).
  - Pull-to-refresh (forces both lists + requests + the board) (670-677).
  - Bell → the notifications sheet. The tab press scrolls to the top.
  - **No** long-press and **no** swipe actions on rows.
- **Current feedback:**
  - Haptics: **none** on this screen.
  - Motion: only the request exit (`FadeOut` 160 + `LinearTransition` 220, 976-980, 1121-1122). Pressed rows dim to `OPACITY.pressed` (0.85) (`BanterSections.tsx:356`).
- **States:**
  - Loading: four skeleton rows at real geometry (person, room, person, person) (1080-1100).
  - Empty: `LoadState` glyph tile `chatbubbles-outline`, "No conversations yet", "Blend in to an event and its room appears here — or message someone you met there.", accent **Explore events** (1106-1119). Hidden when Live now, Requests or Board have content (1016).
  - Search with no hits: "No chats match "q"" (1046-1048).
  - Failed: `LoadError` "Couldn't load your chats" + Try again (1102-1104).
  - Partial failure: the `meta` line above.
  - Offline / socket: `RealtimeStatusBanner`.
  - Moderated: a row's preview becomes the room-state line "Muted — you can read, not post" or "Locked by the organiser — read only" (`lib/roomState.ts:18-21`).
  - Muted notifications: a bell-slash after the title, title shrinks (`BanterSections.tsx:330-332,443`).
  - Unrevealed match: generated disc.
  - Reveal asked: preview "Asked to reveal names" in `textPrimary`.
  - A match nobody has written in yet: "You matched — start the conversation" (`lib/matchOpener.ts:85-88`). A room with no messages: "No messages yet".
  - First-run: the same as Empty.
  - Blocked: a blocked person's conversation leaves the list after the server answer; there is no row-level blocked state.
- **Data and source (what's real):**
  - `GET /chat/groups` (`getChatGroups`): `event.title`, `event.coverImageUrl`, `memberCount`, `lastMessage{content,user{id,name}=room pseudonym,createdAt}`, `unreadCount`, `isCheckedIn`, `membership.status`, `status`, `mute` (459-510).
  - `GET /conversations`: `otherUser{id,name=pseudonym until reveal,image=null until reveal}`, `lastMessage{senderId}`, `unreadCount`, `theyRevealed`, `revealRequested`, `fromMatch` (512-581).
  - `GET message requests?status=pending`: `sender{name,avatar}`, `message`, `createdAt` (413-452).
  - Live data: private messages via `subscribeToUserNotifications`; room messages via one `subscribeToChatMessage` per room (680-772); local echo of your own sends via `chatListUpdates` (776-810).
  - Polling by `useLiveSync`: 20s connected, 8–30s disconnected (812-824). Caches: 60s TTL, 15s background throttle (168-171).
  - Time labels from `inbox.ts`: "now", "5m", "3h", "Yesterday", "Tue", "Oct 4", "Oct 4, 2025". Never device locale.
- **Rules to keep (beyond §0.8):**
  - Checked-in rooms are lifted out and never repeated (283-298).
  - Never-used conversations sort to the bottom (300-307).
  - Unread is three changes: preview `bodyStrong` `textPrimary`, time `textPrimary`, a 10pt dot. The dot's slot is reserved (`BanterSections.tsx:226-234,449-460`).
  - Muted is a glyph, not the word, because "Muted" in this list already means the organiser stopped you posting (`BanterSections.tsx:325-329`).
  - A placeholder name is "Someone", never "Unknown" (526-533).
  - Decline comes first and Accept last (`BanterSections.tsx:595-598`).
  - Faces are fine in the inbox: they are people you already have a thread with (`BanterSections.tsx:23-29`).
  - The request leaves at the same time the request goes out; it does not wait for the fade (831-836).
- **Redesign opportunities:**
  - The top bar is an opaque `bg` band and is the obvious **glass control** candidate, with the list scrolling under it and the orbs behind.
  - The search pill is a flat `surface` 48pt control. As glass it should share one material and height with the top bar's actions.
  - **Live now** is the most important object here ("where you are") and is drawn as a quiet sunken panel with a 56pt thumbnail. Candidates for the brand treatment: the event cover full-bleed with an over-photo scrim, the headcount as a live number (`RollingNumber` already exists with a short-roll mode, `RollingNumber.tsx:90-96`). The presence dot is still by rule (decision needed).
  - Rows have no press haptic, no entrance motion, and an opacity-only press. The unread dot appears and disappears in one frame. Mark-all-read clears every dot in one frame with no confirmation or haptic.
  - **Three avatar systems in one list** (photo circle, emoji-on-gradient disc, square cover), plus initials on grey and a MaterialIcons glyph fallback. The generated disc's 26pt emoji is "design-exception" sizing (`BanterSections.tsx:426-427`). Unify the disc treatment (ring? material?) so pseudonymous and named people read as the same family.
  - The room-state line ("Muted — you can read, not post") is drawn exactly like a message preview. It deserves a status chip treatment (warning or neutral tint), distinct from speech.
  - Request rows are unboxed rows with 32pt pills that look like conversation rows minus the tap. As solid cards they would separate "needs an answer" from "conversations". The pills are below the 44pt target and rely on hitSlop (`BanterSections.tsx:656-657`).
  - The bucket headings use `bodyStrong` (`DayHeading`) while section headings use `heading` 20. That makes two heading systems on one scroll.
  - No unread count lives on the Banter tab itself. The only count-badge in the bar is on the Blend'n disc for the live room (`app/(tabs)/_layout.tsx:195-260`). The doc says "the total is on the bell", but the bell counts **notifications** (`NotificationBell.tsx:51-68`). **Verify** before designing where total chat unread lives.
  - Pull-to-refresh tint is `textSecondary` with a native spinner. That's a good place for a branded refresh moment.

### `app/chat/[id].tsx` — Event room chat

- **Files and components:**
  - `app/chat/[id].tsx`: `GroupChatHeader` 109-174, `GroupChatInner` 212-1115
  - `components/chat/`: `ChatBubble`, `ChatComposer`, `BroadcastNotice`, `SystemNotice`, `TypingIndicator` (+ `typingLabel`), `ReactionPicker`, `ReplyBar`, `SwipeToReply`, `RoomGuidelinesBanner`, `RoomLeftState`, `ChatLoadFailed`
  - Shared: `components/motion/ScalePress`, `components/motion/presence` (`popIn`/`popOut`), `components/ActionTray`, the app sheet, `RealtimeStatusBanner`, `OptimizedImage`
  - Helpers: `lib/roomMembership`, `lib/reactions`, `lib/sendOutcome`, `lib/useFollowEnd`, `lib/mergeNewestPage`
- **Job:** the temporary, anonymous room for an event you're checked into: read the room, talk to it, react, reply, and see broadcasts from the organiser or sponsors. **Entry/exit:**
  - Entry by push from: a Banter row or Live now; the Room's "Join Chat" toggle / chat dock (`components/blendn/ChatDock.tsx`); check-in's "Go to Chat"; a push notification.
  - Exits: back (swipe or chevron); ⋮ → push `/chat-info/[id]`; a socket ban → tray → back.
  - Header-less stack screen with custom header (`Stack.Screen headerShown:false`, 964).
- **Primary action:** **Send** (the composer's 32pt accent disc). Every other control is secondary by comment (`app/chat/[id].tsx:1162`, `RoomGuidelinesBanner.tsx:104`). In `RoomLeftState` the primary is **Rejoin**; in the failed state it is **Try again**.
- **Content, top to bottom:**
  1. **Header** (hairline bottom border, 109-202):
     - 48pt back chevron.
     - A 40pt **square** event cover (radius 8; a `people` glyph on `surface` when there is none).
     - Room name `bodyStrong` + a bell-slash 16pt if you muted notifications.
     - Subtitle `meta`: the event title when the room is named differently, else "N in the room" (`lib/roomMembership.ts:109-114`).
     - 48pt `ellipsis-vertical` → Room info.
  2. If you're outside the room: `RoomLeftState` replaces everything below.
  3. `RealtimeStatusBanner` (margin gutter).
  4. `RoomGuidelinesBanner` (once per room until "Got it"):
     - Shield icon, "This room is anonymous. Be kind, keep it safe — people here are real.", and text actions COMMUNITY GUIDELINES and GOT IT.
     - `surface` with a hairline, radius 16.
  5. **Feed** (`FlatList`, gutter 24, item gap 16):
     - Header: a spinner while loading, or "LOAD OLDER MESSAGES" / "LOADING…" (`label` text action).
     - Items:
       - `SystemNotice` day pills ("Today", "Yesterday", "Oct 4[, 2025]").
       - System messages (sender `system`) in the same pill.
       - `BroadcastNotice` for `announcement` / `sponsored`: full width, `surfaceSunken`, radius 24, a 3pt rail (white for announcement, `textTertiary` for sponsored), label "ANNOUNCEMENT · ORG" or "SPONSORED", body, time.
       - `ChatBubble` wrapped in `SwipeToReply`.
     - Footer: `TypingIndicator` ("Cosmic Panda is typing…" / "3 people are typing…").
  6. A floating **scroll-to-newest** 48pt `surface` disc with a chevron, absolute at right 24 / bottom 80 (1068-1081, 1147-1152).
  7. `ReplyBar` when replying: a full-width `surfaceSunken` strip with a hairline top, a 3pt bar, "Replying to {name}", one line of text, and a 48pt close.
  8. `ChatComposer`:
     - Gutter-inset pill: `surface`, 1pt `separator` border, radius pill, padding 8.
     - Multiline input up to about 5 lines (132pt), `maxLength` 1000.
     - Placeholder "Share your thoughts…".
     - 32pt accent send disc with a 16pt filled `send` glyph in `onGradient`, dimmed to 0.45 when there is nothing to send.
     - Lock note line above it when locked.
- **Bubble anatomy, today (spec for the designer):**

  | Part | Inbound (theirs) | Outbound (yours) | file:line |
  |---|---|---|---|
  | Row | avatar + column, gap 16, top-aligned | right-aligned, **no avatar** | `ChatBubble.tsx:330-331,184-190` |
  | Avatar | 40pt circle, **flat** `mark.colors[0]`, a 20pt animal emoji seeded on the pseudonym (`markSeed(name, room:sender)`) | — | `ChatBubble.tsx:171,333-341` |
  | Meta row (above the bubble) | **name `bodyStrong` 16 white** then time `caption` 11 `textTertiary` | time then "You" (`bodyStrong`) | `ChatBubble.tsx:193-224,349-355` |
  | Bubble | `surfaceSunken #211F1F`, radius 16, bottom-left 8 (the "tail"), padding 16/12, max width 78% | `surface #272525`, bottom-right 8 | `ChatBubble.tsx:327,357-363` |
  | Text | `body` 16/24 Manrope, white | same | `ChatBubble.tsx:374` |
  | Reply quote | **inside** the bubble, top: 2pt `textTertiary` bar, name `caption` `textSecondary`, two lines of text `caption` | same | `ChatBubble.tsx:251-263,385-390` |
  | Edited | "edited" `caption` `textTertiary` under the text, inside | same | `ChatBubble.tsx:276,381` |
  | Removed (moderation; only ever your own) | — | transparent, 1pt **dashed** `textTertiary` border, italic "This message was removed by moderation." No long-press, no swipe | `ChatBubble.tsx:265-269,366-372`; `app/chat/[id].tsx:911,935` |
  | Failed | — | the bubble becomes a retry button; under it "Not sent · Tap to retry" `caption` `destructive` | `ChatBubble.tsx:226-245,279-283,383` |
  | Reactions | under the bubble, wrap, gap 4. Each pill `surfaceSunken`, padding 8/2, emoji `meta`, count `caption` only if >1. **Yours: a 1pt `textPrimary` edge** | right-aligned | `ChatBubble.tsx:285-312,392-408` |
  | Receipts | **none in rooms** (pinned by a test) | none | `ChatBubble.tsx:87-94` |
  | Grouping | **none**: every message repeats avatar, name, time; 16pt between all items | every own message repeats "time You" | `app/chat/[id].tsx:1122` |
  | Timestamps | `formatTime`: device-locale `toLocaleTimeString` 2-digit if under 24h, else en-US "Mon D, HH:MM" | same | `app/chat/[id].tsx:100-107` |
  | Images | **none**: there is no media field and none is rendered | none | `docs/CHAT.md:128-132` |
  | Entrance | none for history; **your optimistic send** fades + rises 6pt over 150ms | — | `ChatBubble.tsx:128-140,177`; `app/chat/[id].tsx:919` |
  | Memo | `memo`'d; `onLongPress` is stable so typing doesn't re-render every bubble | — | `ChatBubble.tsx:318-324`; `app/chat/[id].tsx:886-889` |

- **Interactive elements:**
  - Back; ⋮ → Room info (passes `roomName`, `eventTitle`, `eventImage`).
  - **Long-press a bubble (250ms)** → Medium haptic + the app sheet (817-877):
    - Title: the sender's pseudonym, or "Your message".
    - Message: the text truncated at 120 characters.
    - `content` = `ReactionPicker` (six 48pt discs, yours filled white) for delivered messages.
    - Actions: **Reply**, **Copy** (Success haptic), **Report** (others' only → reasons: Harassment or threats / Hate speech / Inappropriate content / Spam or scam / Something else), Cancel.
    - A still-sending message: Copy only.
    - A failed message: title "Not sent", "This message didn't reach the room.", **Try again** (primary) / Copy / **Delete** (destructive) / Cancel.
  - Picking a reaction closes the sheet and toggles optimistically. The server tally replaces it. Rollback + toast on refusal ("Couldn't add your reaction. Try again.", or the server's sentence) (741-754).
  - **Swipe a bubble right**: claims after 12pt horizontal (fails at 10pt vertical), triggers at 56pt with a Light haptic, rubber-bands to 88, release → reply. Disabled for removed or failed bubbles (911, `SwipeToReply.tsx:32-46`).
  - Tap a failed bubble → retry with the same `client_id` (730-733).
  - LOAD OLDER MESSAGES (tap, not scroll) (946-960).
  - Scroll-to-newest disc (shown when more than 80pt from the end).
  - Guidelines: COMMUNITY GUIDELINES opens the browser; GOT IT dismisses for this room (persisted per user and room).
  - Composer:
    - Typing emits `startTyping` once and `stopTyping` after 2s idle or when the field clears (1096-1107).
    - Focus scrolls to the end after 120ms.
    - Send clears the field, drops the reply, scrolls, emits the inbox update, and delivers (697-728).
  - Empty state's **Write a starter** puts "Hey everyone 👋" in the composer (it does not send) (1034-1043).
  - `ReplyBar` close.
  - Rejoin (in `RoomLeftState`).
  - Drag the feed to dismiss the keyboard.
- **Current feedback:**
  - Haptics: long-press Medium (887); Copy Success (823); swipe trigger Light (`SwipeToReply.tsx:29`); Write a starter / Rejoin `ScalePress` selection. **No haptic on send, on react, or on a lock.**
  - Motion: sent bubble rise (`ChatBubble.tsx:128-140`), swipe drag + spring, typing dots, `ReplyBar` fade, scroll disc pop, sheet rise.
- **States:**
  - Loading: a spinner in the list header.
  - Empty room: "Start the room conversation" (`title`) / "Be the first to post so everyone can join." / **Write a starter** (`surface` pill) (1027-1044).
  - History failed: `ChatLoadFailed` "Couldn't load this chat" + accent Try again (1015-1025). Shown only when nothing is on screen.
  - Offline / socket: `RealtimeStatusBanner`.
  - Left / out: `RoomLeftState` "You left this room" or "You're not in this room" + accent Rejoin. Rejoin refusals arrive as toasts ("Check in at the event to join its room." for a 404). Success toast: "You're back in the room".
  - Composer locks (muted / locked / closed / rate-limited): see §0.7.
  - Banned: tray then back (no in-screen state).
  - Moderated own message: dashed placeholder. Withheld at send: bubble removed + "Not sent" tray.
  - Failed send: the bubble marked.
  - Typing: footer.
  - First-run: the guidelines banner.
  - Partial (older pages): "LOAD OLDER MESSAGES".
  - **Missing:** a muted-on-open state, a not-checked-in state, a banned state, the event context banner (CHAT.md open ask 1), a new-messages count on the scroll disc.
- **Data and source:**
  - `GET /chat/groups/:id/messages?limit=50&before=` → `id`, `user{id,name}` (the room pseudonym, or "Attendee" as a placeholder), `content`, `moderation_hidden`, `metadata.sponsored_message_id`, `message_type`/`type`, `parent_id` + `parent_message`, `is_edited`, `created_at`, `reactions[{emoji,count,mine}]`, `pagination{hasMore,nextCursor}` (298-405).
  - `GET /chat/groups` for the cover, title, `memberCount` and mute (458-476).
  - Sockets: message, typing, reaction (full tally), messageDeleted, memberBanned, memberLeft (478-579).
  - Writes: send (with `client_id`, `parent`), react, rejoin.
  - `useLiveSync` resyncs on reconnect and polls every 15s while disconnected (795-801). Messages cached 60s.
  - **Sponsored media is not read** even though sponsored broadcasts may carry it.
  - Broadcast labels are parsed out of the server's content prefix (`📢 [Announcement from X]\n`, `📣 [Sponsored]\n`) (`BroadcastNotice.tsx:45-53`).
- **Rules to keep:** §0.8 items 1, 4-9 and 13. Plus:
  - Broadcasts are full width with no tail and no avatar, so they read as "not somebody talking to you". Sponsored is labelled and quieter than an announcement (`docs/CHAT.md:154-166`).
  - `SystemNotice` uses one shape for day separators and room narration (`SystemNotice.tsx:8-21`).
  - The tail corner is on the sender's side; backwards reads as wrong (`docs/CHAT.md:94-102`).
  - Only your optimistic send animates in. History and older pages never do (`ChatBubble.tsx:95-106`).
  - Room leave is enforced server-side; `RoomLeftState` replaces both feed and composer (`docs/CHAT.md:60-69`).
  - The header subtitle rule (`docs/CHAT.md:71-76`).
- **Redesign opportunities:**
  - **Grouping:** consecutive messages from one sender should collapse: avatar on the last, name on the first, time on the group (or revealed on tap/drag). Today every inbound line costs avatar + name + time + 16pt gap, and every own line repeats "HH:MM You".
  - The inbound name is `bodyStrong` 16 white, the same weight and size as the message itself. Speaker and speech compete.
  - Timestamps use the device locale (`toLocaleTimeString`) while the inbox bans locale formats (`components/banter/inbox.ts:5-8`). Pick one format.
  - The **composer is not actually floating**. Make it the glass control layer and let the feed scroll beneath (it needs a bottom content inset equal to composer + keyboard). Keep the multiline growth off layout transitions per `tasks/lessons.md:5`.
  - Send is a 32pt disc with a filled glyph and no press feel. It should become the brand-gradient primary, with an outlined send glyph, a send haptic, and a bubble hand-off animation from composer to feed.
  - Lock states are a single `meta` line above the pill. That is too quiet for "you can't post". Design a proper restricted composer (icon + reason + what to do + expiry), per §0.7.
  - `ReplyBar` is a full-bleed sunken strip glued above a gutter-inset pill. The two don't share a shape. Attach the reply preview to the composer's glass.
  - Reactions: no quick path (only long-press → sheet), no haptic on pick, no count animation, and the pills are tiny (`SPACE.sm`/`xxs` padding). The picker sits inside a generic action sheet; a contextual reaction bar anchored to the bubble is the expected pattern (six emoji only).
  - **Broadcasts were "derived, not designed"** (`docs/CHAT.md:209-210`). The announcement rail is a white hairline, sponsored is grey, there is no organiser identity, no media, no CTA, and no arrival motion. This is the one commercial surface in the room and it needs a real design (CHAT.md open ask 4).
  - Day pills don't stick while scrolling. Older history is a tap button, not infinite scroll.
  - The scroll-to-newest disc uses a magic `bottom: 80` that won't track a growing composer, has no unread count, and uses `TouchableOpacity activeOpacity 0.8` (off-token).
  - The guidelines banner is a generic info card pushing the feed down. With glass chrome it could be a dismissible glass notice under the header.
  - The typing indicator uses RN core `Animated` (not Reanimated) and sits at 0.6 opacity. It could share the bubble-to-be shape so the next message "grows" from it.
  - The withheld-on-send path removes the bubble and opens a modal tray. The guide wants an inline placeholder + toast, which is lighter.
  - The header is a flat row with a hairline and should be the glass control bar. The square 40pt cover is good; the subtitle "N in the room" could be live (`RollingNumber` short roll).
  - Event context banner: undecided (CHAT.md open ask 1: ENDS IN vs STARTS IN, no faces, copy).

### `app/chat-info/[id].tsx` — Room info

- **Files and components:** `app/chat-info/[id].tsx` (`ChatInfoInner` 72-357, `ActionRow` 359-391); `components/AppHeader`, `components/chat/ChatLoadFailed`, `components/profile/ProfileSections#ProfileHeading`, `components/Skeleton`, `OptimizedImage`; `lib/roomMembership` (mute options and labels), `lib/safetyUtils#showRoomReportOptions`, `lib/sheet`.
- **Job:** what this room is, how loud it is for you (mute), the rules, a report for the room as a whole, the way out, and who's in it, drawn as the room draws them. **Entry/exit:**
  - Entry: push from the room header ⋮ (params `id`, `roomName`, `eventTitle`, `eventImage`).
  - Exits: back; a member → push `/user/[id]` with `pseudonym`, `roomSeed` and `eventId`; Leave → `router.dismissTo('/(tabs)/chat')` (pops the room as well) + toast; Guidelines → external browser.
- **Primary action:** none is accented. The four rows are neutral, and **Leave room** is `destructive` text. The failed member list's "Try again" is that state's accent.
- **Content, top to bottom:**
  1. `AppHeader` "Room info" + back.
  2. Room block: a 56pt square cover (radius 8; a `people` glyph fallback) + title (`heading`, two lines) + subtitle `meta` (the event title when different).
  3. Four `ActionRow`s (`surfaceSunken`, radius 16, min 56, 20pt icon, `bodyStrong` label, optional `meta` detail, trailing chevron):
     - **Mute notifications** (icon `notifications-outline` / `-off-outline`; detail "Muted until 9:30 PM" / "Muted until tomorrow, 8:00 AM" / "Muted until you turn it back on")
     - **Community guidelines** (trailing `open-outline`)
     - **Report this room** (`flag-outline`)
     - **Leave room** (`exit-outline`, destructive red)
  4. `ProfileHeading` "In the room" + total count.
  5. Member rows:
     - A 40pt flat mark disc (the same seed as the bubble) with an emoji.
     - Name `bodyStrong` ("You" for you; "Attendee" fallback).
     - Role `meta` ("Organiser" for admin, "Moderator").
     - Chevron (not on you).
  6. Footer "SHOW MORE" / "LOADING…" (pages of 100).
- **Interactive elements:**
  - Mute row → sheet "Mute notifications" ("The room stops notifying you. You can still read and post, and nobody's told."): For 1 hour / For 8 hours / Until tomorrow / Until I turn it back on / Cancel.
  - When already muted: "Notifications" with the label, plus **Unmute** (primary) and the same options.
  - Each option runs `POST/DELETE /chat/groups/:id/mute`, shows a toast, and keeps the sheet open with "Try again" on failure (172-212).
  - Guidelines → `Linking.openURL`.
  - Report this room → reasons sheet: People are ganging up on someone / Hate speech or slurs / Someone could get hurt / The host is letting it happen / Spam or scam / Something else (`lib/safetyUtils.ts:527-560`).
  - Leave room → sheet "Leave this room?" ("You'll stop getting its messages and notifications, and it leaves your Banter. You can rejoin by checking in at the event again.") with **Leave room** (destructive) / Cancel (219-241).
  - Member tap → profile. SHOW MORE pages.
- **Current feedback:** no haptics; no motion beyond the sheet; pressed rows dim to 0.85.
- **States:**
  - Members loading: four skeleton rows.
  - Failed: `ChatLoadFailed` "Couldn't load who's in this room".
  - Empty members: nothing drawn.
  - A member leaving live: they're removed and the count drops (`memberLeft`, 140-147).
  - Muted: the row detail and the icon swap.
- **Data and source:**
  - `GET chat participants?limit=100&offset=` → `participants[{userId (a room handle, rh_…), name (the pseudonym), role}]`, `totalCount`.
  - `GET /chat/groups` → event id, title, cover, `mute`.
  - Mute, unmute, leave, report endpoints.
- **Rules to keep:**
  - The mute is only your pushes, and nobody is told (`docs/CHAT.md:41-46`). It is **not** the organiser's mute.
  - Leave is the one removal you can undo, and the confirmation says so.
  - Report this room is for what no single message shows. Report-the-event lives on the event page (`docs/CHAT.md:48-51`).
  - Members are drawn exactly as the bubbles draw them (the same seed). A member tap passes the pseudonym and `roomSeed` so the profile matches (`docs/PROFILE.md:198-211`).
  - Members on the same event are dropped from the list.
- **Redesign opportunities:**
  - Reads like a settings form: four identical sunken rows above a plain list.
  - The members are the fun part: a field of creature marks. A grid or "crowd" of discs with roles as badges would carry the room's character, and could double as an event-context hero with the cover behind a scrim.
  - The mute state is only a detail line; a still bell-slash chip near the title would match the room header.
  - **Leave room** in red sits in the same stack as Mute; spacing or a danger zone would separate it.
  - No haptic on mute, unmute or leave. No count motion when members leave.
  - The `people` glyph is filled (§0.3).

### `app/private-chat/[conversationId].tsx` — Direct message

- **Files and components:**
  - `app/private-chat/[conversationId].tsx`: `ChatHeader` 128-199, `PseudonymMark` 202-209, `RevealBar` 247-280, `PrivateChatInner` 303-1124
  - The same `components/chat/` pieces as the room with `variant="direct"`: `ChatBubble`, `ChatComposer`, `SystemNotice`, `TypingIndicator`, `ReplyBar`, `SwipeToReply`, `ChatLoadFailed`
  - Plus `ScalePress`, `ActionTray`, the app sheet, `RealtimeStatusBanner`
  - Helpers: `lib/conversationReveal`, `lib/directThread`, `lib/receipts`, `lib/unreadDivider`, `lib/matchOpener`, `lib/safetyUtils#showConversationOptions`
- **Job:** a two-person thread. It is pseudonymous for matches until each side reveals, and named for accepted message requests and friends. **Entry/exit:**
  - Entry by push from: a Banter row; request Accept; friend profile Message; `user/[id]` Message; the match moment's "Say hi" (may pass a `draft` opener); a push notification.
  - Exits: back; the header identity → `/user/[id]` once named; ⋮ → options; Unmatch/End → back.
- **Primary action:** **Send**. The reveal control is deliberately `surface`, not accent. The empty state's "Say hi 👋" is `surface` too.
- **Content, top to bottom:**
  1. **Header**:
     - Back, then the identity target: a 40pt **round** avatar (photo / generated mark seeded on the pseudonym / initials) + name `bodyStrong` + a two-line subtitle `meta` with the reveal state:
       - "You're both anonymous here"
       - "They can see your name. You can't see theirs yet."
       - "You can see their name. They can't see yours."
     - ⋮ "Conversation options".
     - Hairline bottom border.
  2. **RevealBar** (only while there's something to do; 247-301):
     - An optional nudge `meta` "{name} asked to know who you are".
     - A 48pt `surface` pill with `eye-outline` "Show them who you are", or `hand-left-outline` "Ask {name} to reveal".
     - Hairline bottom.
  3. `RealtimeStatusBanner`.
  4. **Feed**:
     - Header: a **match opener card** when `fromMatch` (`surfaceSunken`, radius 32, padding 24: "You both said yes." (`heading`) + "You and {name} liked each other. Say something — they are waiting on the same screen."). Then the loading spinner or "LOAD OLDER MESSAGES".
     - Items: day pills; an **unread divider pill** "N unread messages" (the same `SystemNotice` shape); `ChatBubble variant="direct"` inside `SwipeToReply`.
     - Footer: `TypingIndicator`.
  5. The scroll-to-newest disc.
  6. `ReplyBar` ("Replying to {name}" / "Replying to yourself").
  7. `ChatComposer` (the same "Share your thoughts…" placeholder as the room).
- **DM bubble differences:**
  - No avatar and no name on either side (`ChatBubble.tsx:80-86,184,199-210`).
  - The meta row is the time only, plus receipts on your own: `✓` sent / `✓✓` delivered (`textTertiary`), `✓✓` read (`textPrimary`). The receipt sits **above** the bubble in the meta row.
  - Replies are quoted inside the bubble; a deleted or moderated parent reads "Message unavailable"; an image or video parent reads "📷 Photo" / "🎥 Video".
  - No reactions (the picker is not offered).
  - Time is always `toLocaleTimeString` 2-digit.
- **Interactive elements:**
  - Header identity tap → profile (only when `pseudonymous === false || theyRevealed`; 436-440).
  - ⋮ → sheet "{name}": View profile (when named) / **Unmatch…** or **End conversation…** (destructive) / Cancel. That leads to a confirmation (`lib/conversationReveal.ts:119-137`):
    - Not revealed: "The conversation closes for both of you and you won't see each other in rooms again. They never saw your name."
    - Revealed: "They already know your name and photos — unmatching doesn't undo that."
    - Actions: **Unmatch** / Unmatch and report → reasons / **Block and report** → reasons / Cancel (`lib/safetyUtils.ts:241-311`).
    - If the conversation record didn't load: a tray "Couldn't load this conversation" or "Still loading" with Cancel / **Try again** (942-974).
  - RevealBar:
    - "Show them who you are" → a tray "Show {name} who you are?" ("They'll see your name and photos. This can't be undone — you can block them, but you can't take it back.") with **Show them** / Not now. A refusal shows a tray "Not yet" with the server's sentence (e.g. "Add a photo to your profile first").
    - "Ask {name} to reveal" → a request, then a tray "Asked — We let {name} know. They'll decide in their own time." (450-502).
  - Long-press (Medium haptic) → sheet titled their name / "Your message" / "Not sent": Reply or Try again, Copy (Success haptic), Delete (failed only), Report (theirs only → reasons), Cancel (786-818).
  - Swipe right to reply (not for failed). Tap a failed bubble to retry.
  - LOAD OLDER; the scroll disc; the composer (typing start/stop as in the room).
  - Empty state **Say hi 👋** **sends** "Hey 👋" at once (1049-1058).
  - On first open, the thread scrolls to the unread divider (768-776).
- **Current feedback:**
  - Haptics: long-press Medium (830), Copy Success (795), swipe Light, Say hi `ScalePress` selection. **None on send, reveal, ask, or unmatch.**
  - Motion: arriving messages (yours, or the first one into an empty thread) rise in (416-420, 841); the empty card fades out as the first message lands (1033); `ReplyBar` fade; the scroll disc pop; sheets.
- **States:**
  - Loading spinner.
  - Empty: glyph tile `chatbubble-ellipses-outline`, "Start the conversation!", "Say hi to {name}.", **Say hi 👋** (1027-1059).
  - Ended (`NOT_FOUND`): glyph tile, "This conversation has ended", "It is no longer available to either of you." **The composer is still rendered**, and the header falls back to the route name.
  - History failed: `ChatLoadFailed` "Couldn't load this conversation".
  - Conversation record failed: the options tray above.
  - Pseudonymous / one-way / both revealed: the subtitle and RevealBar variants. An accepted message request has no RevealBar and no subtitle.
  - Rate-limited / spam: a timed composer lock.
  - Withheld: bubble removed + "Not sent" tray. Failed: the marked bubble.
  - Unread on open: the divider + anchored scroll.
  - Typing.
  - Offline: the banner.
  - Blocked: indistinguishable from Ended, by design.
- **Data and source:**
  - `GET /conversations/:id` → `otherUser{id,name,image}` (the pseudonym and `null` until they reveal), `youRevealed`, `theyRevealed`, `revealRequested`, `fromMatch`, `pseudonymous` (372-403).
  - `GET /conversations/:id/messages?limit=50&before=` → messages `{id, senderId, sender, text, isRead, deliveredAt, replyTo{id,senderName,text,mediaType,unavailable}, createdAt}`, `firstUnreadId`, `unreadCount`, `hasMore`, `nextCursor`.
  - The API also returns and accepts `mediaUrl`/`mediaType` (image or video) (`lib/apiClient.ts:2777-2816`), but the client **drops it** (`mapMessage`, 79-89) and has no send UI.
  - Sockets: conversation message, typing and read, plus `delivered`. `markPrivateMessagesRead` as messages show.
  - The route `draft` param pre-fills the composer (321).
- **Rules to keep:**
  - The server resolves the name and photo; the route param is only a first paint (344-352, 925-929).
  - The header is a button only once they are a name to you (`docs/CHAT.md:255-262`).
  - One reveal control, never two (`lib/conversationReveal.ts:46-52`). The irreversibility copy comes before the tap.
  - There is no "declined" state for a reveal ask.
  - The match opener is a permanent list header, not an empty state (878-887).
  - "Unmatch" is the wrong verb for a non-match: use "End conversation" (`lib/conversationReveal.ts:131-132`).
  - Report is on their messages only. Copy is on everything.
  - Receipts are DM-only.
  - The ended state never says whether you were blocked.
- **Redesign opportunities:**
  - **The reveal is the emotional centre of a match DM and is drawn as a grey pill in a strip.** It deserves a designed moment: brand material, a two-sided "you / them" visual of the state, and a celebratory transition when both have revealed. Today nothing animates when names and photos arrive. Keep the confirmation's irreversibility copy.
  - After "Ask {name} to reveal" the bar doesn't change. The code sets `revealRequested` to its previous value (460), so the same button stays tappable. Design an "Asked" state.
  - Receipts are glyph text in the meta row **above** the bubble, which is unusual (most apps put them under or inside, at the end). `✓✓` delivered and `✓✓` read differ only in grey vs white.
  - **`TypingIndicator` is indented 56pt for an avatar the DM doesn't have** (`TypingIndicator.tsx:92`), so the dots don't line up with the bubbles.
  - The ended state keeps the composer, which invites a message that will 404.
  - The composer placeholder "Share your thoughts…" is the room's copy (`ChatComposer.tsx:101`) and reads oddly in a DM.
  - The match opener card is a 32-radius sunken block "built from the Banter's card idiom" and flagged for a designer pass (1137-1149). It could be the hero of the empty thread: two marks or faces, orbs, brand.
  - The unread divider uses the day-pill shape, so "N unread messages" looks like a date.
  - Media: decide whether DMs show images (the API supports them) or keep text-only and remove the dead fields.
  - The header is a hairline row and the glass candidate. The identity area could carry a small reveal-state glyph rather than a two-line subtitle on a 402pt phone.

### `app/friends/index.tsx` — Friends

- **Files and components:** `app/friends/index.tsx` (26-105); `components/friends/PersonRow`, `components/friends/RequestsRow`; `components/AppHeader`, `components/LoadError`, `components/Skeleton`, `components/onboarding/EmberControls#EmberButton`, `components/ui/Text`; `lib/useFriendRequests`, `lib/friends#friendsSinceLabel`.
- **Job:** the people both of you said yes to, by real name and photo. **Entry/exit:**
  - Entry: push from the Me tab's **Friends** stat.
  - Exits: back; a row → `/friends/[userId]`; header `person-add-outline` / the empty CTA → `/friends/add`; RequestsRow → `/friends/requests`.
- **Primary action:** none when populated. The empty state's **Add friends** (`EmberButton`, accent). Failed: Try again.
- **Content, top to bottom:**
  1. `AppHeader` "Friends" + back + right icon `person-add-outline`.
  2. `RequestsRow` (when incoming > 0): `surfaceSunken` radius 16 min 56, `person-add-outline`, "Friend requests", a white count badge (`textPrimary` fill, `bg` text, "99+" cap), chevron.
  3. `FlatList` of `PersonRow`: a 48pt round photo (or the initial on `surface`), name `bodyStrong`, "Friends since Mar 2026" `meta`, chevron.
- **Interactive elements:** row tap (`ScalePress` 0.98, no haptic); header add; RequestsRow; pull-to-refresh (friends + requests); the list reloads on every focus (so an unfriend from the profile disappears).
- **Current feedback:** no haptics; press scale only.
- **States:**
  - Loading: four skeleton rows (48pt).
  - Empty: a **bare 24pt** `people-outline` icon (not the app's 80pt glyph tile), "No friends yet", "Nobody can find you by searching. Share your link with the people you want here.", **Add friends**.
  - Failed: `LoadError` "Your friends didn't load".
  - No offline-specific state.
- **Data:** `GET /friends` → `friends[{userId,name,photo,since}]`, `count`. `useFriendRequests` → incoming/outgoing.
- **Rules to keep:** real names and photos here are fine, because both people agreed (`PersonRow.tsx:13-20`). There is no search, by design.
- **Redesign opportunities:**
  - The empty state is off-pattern: a bare icon where the app's `LoadState` uses a glyph tile. This is the place to sell the invite link visually.
  - Rows are plain list rows with chevrons.
  - Friends have no presence, recency or shared-events context (no data backs it today; flag it before drawing it).
  - The header add icon and the RequestsRow could become glass controls.

### `app/friends/add.tsx` — Add friends

- **Files and components:** `app/friends/add.tsx` (29-159); `components/friends/InviteLinkCard`, `IncomingRequestRow`, `PersonRow`; `EmberButton`; `components/profile/ProfileSections#ProfileHeading`; `ScalePress`; `lib/useFriendInvite`, `lib/useFriendRequests`, the app sheet.
- **Job:** your invite link (the only way anyone can add you), plus requests waiting either way. **Entry/exit:**
  - Entry by push from: the Me tab "Add friends" pill; the Friends header icon or empty CTA; `f/[token]` in the self state (replace).
  - Exit: back. Share goes to the OS share sheet.
- **Primary action:** **Share my link** (`EmberButton`, accent). It becomes **Try again** when the link failed to load.
- **Content, top to bottom:**
  1. `AppHeader` "Add friends".
  2. Body copy (`textSecondary`): "Nobody can find you on Blend'n by searching. Share your link, and anyone you send it to can ask to be your friend."
  3. `InviteLinkCard`: `surfaceSunken` radius 16 padding 16, a `link` glyph, and the URL without `https://` (`bodyStrong`, selectable, two lines). A spinner while loading; on failure, "Your link didn't load. Check your connection and try again."
  4. **Share my link** / **Try again**.
  5. A quiet "Reset link" (`bodyStrong` `textSecondary`, centred).
  6. Requests failed block: `ProfileHeading` "Requests", "Your requests didn't load.", a "Try again" `surface` pill.
  7. **Requests**: `IncomingRequestRow`s (a 48pt photo or initial, name, then 32pt pills **Not now** (`surface`) / **Accept** (white)).
  8. **Sent**: `PersonRow` with "Requested" + a **Withdraw** `surface` pill.
- **Interactive elements:**
  - Share → `Share.share` with "Add me on Blend'n: {url}".
  - Reset → sheet "Reset your link?" ("Your old link will stop working. People who are already your friends stay your friends.") with **Reset link** (destructive) → toast "New link ready".
  - Accept / Not now (per-row busy dims both pills). Toast "You and {name} are friends"; a failure toast "That didn't go through. Try again."
  - Withdraw.
  - Pull-to-refresh.
- **Current feedback:** no haptics (all `haptic={false}`); press scale; no motion when a request is answered (the row just disappears).
- **States:**
  - Link loading (spinner in the card, Share disabled).
  - Link failed (card copy + Try again).
  - Requests failed (inline block).
  - No requests: those sections are simply absent.
- **Data:** `useFriendInvite` → `{token,url}` (`GET`, reset `POST`); `useFriendRequests` → incoming/outgoing `FriendRequest{id, person{userId,name,photo}, createdAt}`, respond (accept/dismiss), withdraw.
- **Rules to keep:**
  - No search box, on purpose.
  - "Not now" is silent: the sender is never told, and your own requests stay "Requested" whatever happened (19-28).
  - Accept is strong-neutral because Share is the screen's one accent (`IncomingRequestRow.tsx:19-23`).
  - The link is shown in full so it's plain what is handed out (`InviteLinkCard.tsx:7-14`).
- **Redesign opportunities:**
  - The link is the product's whole friend-graph growth loop, and it's a grey card with a URL.
  - A shareable invite card (your mark or photo, brand gradient, a QR for in-person at events) would fit "IRL networking".
  - No copy-to-clipboard affordance beyond the OS sheet.
  - Accept/withdraw have no motion or haptic.
  - "Reset link" is a destructive action styled as quiet text; its danger only shows in the sheet.

### `app/friends/requests.tsx` — Friend requests

- **Files and components:** `app/friends/requests.tsx` (23-70); `IncomingRequestRow`; `AppHeader`, `LoadError`, `Skeleton`; `lib/useFriendRequests`.
- **Job:** incoming friend requests only. **Entry/exit:** push from `RequestsRow` (Me tab, Friends). Exit: back.
- **Primary action:** none; Accept is strong-neutral.
- **Content:** `AppHeader` "Requests"; a list of `IncomingRequestRow`.
- **Interactive elements:** Accept / Not now; pull-to-refresh.
- **Current feedback:** none beyond pressed and busy dimming (`OPACITY.disabled` while busy, `IncomingRequestRow.tsx:57,68,93`).
- **States:**
  - Loading: skeleton.
  - Empty: a bare 24pt `person-add-outline`, "No requests", "When somebody opens your link and asks to be your friend, they'll be here." (no action).
  - Failed: `LoadError` "Your requests didn't load".
- **Data:** `useFriendRequests().incoming`.
- **Rules to keep:** Accept and Not now behave exactly as on Add friends (the shared hook). Not now is silent.
- **Redesign opportunities:**
  - It is the same rows as the Add friends Requests section, so one could absorb the other.
  - The empty state is off-pattern (bare icon).
  - Accept is a social moment and currently gets only a toast. A small success animation or haptic would help.

### `app/friends/[userId].tsx` — Friend profile

- **Files and components:** `app/friends/[userId].tsx` (39-258); `components/profile/ProfileSections` (`ProfileHero`, `ProfileHeading`, `ProfileBio`, `ProfileInterests`, `ProfileDetail`, `ProfileGallery`); `components/PhotoLightbox`; `EmberButton`; `LoadError`/`LoadState`; `lib/safetyUtils#showUserSafetyActions`; the app sheet.
- **Job:** the identified profile of a friend, with a way to message them. Deliberately not `user/[id]`, because in rooms a friend is still a pseudonym unless they turned on "Friends can see who I am in rooms" (27-38). **Entry/exit:**
  - Entry by push from: Friends list; `f/[token]` friends state (replace).
  - Exits: back; Message → push the DM; Remove → back + toast; ⋯ → block/report sheet; gallery → lightbox.
- **Primary action:** **Message** (`EmberButton`, accent).
- **Content, top to bottom:**
  1. `ProfileHero`: full-width, height = width × 751/390.
     - Photos cycle via `SceneHeroMedia`. With no photos, the generated mark is seeded on `friend.name`.
     - A bottom scrim gradient (`bgClear` → 70% → `bg`).
     - Title `display` "Name, Age"; subtitle "Occupation · Location".
  2. Floating top bar: 48pt **scrim** discs, back (left) and ⋯ (right) (`EMBER.scrim`, 284-291).
  3. Canvas (gutter 24, 32 between sections):
     - "Friends since Mar 2026" `meta` + **Message**
     - Bio
     - Interests (plain chips)
     - Occupation (filled card radius 32 on `surfaceMedia`) / Education (left-ruled block)
     - Gallery (photos after the first; two columns, 163pt tall, radius 24) with "N photos"
     - "Remove friend" quiet text
- **Interactive elements:**
  - Message: uses the existing conversation or calls `openFriendConversation`; failure toast "The conversation didn't open. Try again."
  - Remove friend → sheet "Remove {name}?" ("They won't be told. Your messages stay, and you can add each other again later.") with **Remove friend** (destructive) → back + toast "{name} is no longer a friend".
  - ⋯ → `showUserSafetyActions`: "Blocking hides you from each other. A report goes to our team, and they are not told who sent it." with **Block** → confirm "Block {name}?" ("They won't be able to see your profile or message you, and you won't see each other in rooms.") / **Report** → reasons (Harassment or threats / Inappropriate messages / Inappropriate photos / Fake profile / Spam or scam / Something else) / Cancel.
  - A gallery tile → lightbox (swipe to dismiss, pinch and double-tap zoom).
  - **The hero is not tappable** (no `onPressMedia` is passed).
- **Current feedback:** no haptics; `ScalePress` on gallery tiles (no haptic); hero auto-advance until the first manual swipe; lightbox motion.
- **States:**
  - Loading: a centred spinner + a floating back.
  - Gone (404): `LoadState` `person-outline` "You're not friends with this person any more." + accent **Go back**.
  - Failed: `LoadError` "This profile didn't load".
  - No photos: the generated-mark hero.
- **Data:** `GET /friends/:userId` → `FriendProfile{userId,name,photos[],bio,occupation,education,age,location,interests[{name}],friendsSince,conversationId}`.
- **Rules to keep:**
  - A 404 means "not friends", the same answer for everyone. Any other failure is a load failure (51-56).
  - Unfriending is silent and the DM stays.
  - Safety lives in the corner "as on every profile".
- **Redesign opportunities:**
  - The hero's top-bar discs are `scrim` (60% page colour) and should become glass controls over the photo.
  - The hero name block is the over-photo scrim layer.
  - Message is the only accent and sits below "Friends since" in the canvas, not near the hero.
  - "Remove friend" is a quiet destructive at the very bottom (fine), but there is no confirmation haptic.
  - The hero photo can't be opened full-screen; only the gallery can.

### `app/f/[token].tsx` — Invite link landing

- **Files and components:** `app/f/[token].tsx` (38-157); `LoadError`, `OptimizedImage`, `EmberButton`, `Toast`; `lib/friends` (`inviteCta`, `inviteLine`), `lib/loadFailure#isGone`. Signed-out counterpart: `components/friends/PendingInvite.tsx` on the welcome and sign-in screens.
- **Job:** someone sent you their link. See who, and ask to be friends (or open them, or share your own if it's your link). **Entry/exit:**
  - Entry by deep link: `https://www.blendn.app/f/<token>` or `blendn://f/<token>`. Signed out, the root guard holds the route until after sign-in or onboarding, while `PendingInvite` shows "Sign in to accept {name}'s invite" on welcome/sign-in.
  - Exits: close ✕ (back, or replace to `/(tabs)/events` if there is no history); CTA → replace to `/friends/[userId]` or `/friends/add`.
- **Primary action:** the footer CTA (`EmberButton`, accent), by state (`lib/friends.ts` `inviteCta`):

  | state | CTA | line under the name |
  |---|---|---|
  | none | **Send friend request** | "Wants you as a friend on Blend'n." |
  | incoming | **Accept friend request** | "They asked to be your friend." |
  | requested | **Requested** (disabled) | "Your request is waiting. You'll hear when they accept." |
  | friends | **View profile** | "You're friends." |
  | self | **Share your link** | "This is your own invite link." |

- **Content, top to bottom:**
  1. Top bar: a 48pt `surface` ✕ disc (left).
  2. A centred body: a 160pt round photo (or the initial in `display` on `surface`), name `title`, the state line `body` `textSecondary`.
  3. Footer CTA.
- **Interactive elements:**
  - Close.
  - CTA:
    - "ask" calls `sendFriendRequest({token})`. The state updates in place; becoming friends shows toast "You and {name} are friends"; a failure shows toast "That didn't go through. Try again."
    - "open" / "share" replace the route.
  - Retry in the failed state.
- **Current feedback:** no haptics; no motion between states (Send → Requested swaps the label in one frame).
- **States:**
  - Loading: a centred spinner.
  - Dead link (404): `link-outline` 24pt, "This link doesn't work", "Ask the person who sent it for a new one." (no CTA).
  - Failed (network): `LoadError` "This link didn't open" + Try again.
  - The five relationship states above.
  - Signed-out pending: `PendingInvite` pill (or "This invite link doesn't work any more. Ask for a new one once you're in.").
- **Data:** `openFriendInvite(token)` → `{person{userId,name,photo}, state}`; `sendFriendRequest({token})` → `{state}`.
- **Rules to keep:**
  - A dead link never says why: not reset, not blocked, not deleted (29-31).
  - Only a 404 is "doesn't work"; a network failure gets Try again (33-36).
  - The public preview gives first name + photo only.
- **Redesign opportunities:**
  - This is a first-impression screen (often the first thing a new user sees after sign-up) and is a plain centred avatar.
  - Candidate for the full brand treatment: the orbs backdrop, the sender's photo with a brand ring, a gradient CTA.
  - A celebratory transition (confetti exists: `ConfettiBurst`) and a success haptic on becoming friends.
  - The dead-link state uses a bare icon instead of the glyph tile.
  - ✕ as a glass control.

### `app/user/[id].tsx` — Another person's profile (attendee view)

- **Files and components:**
  - `app/user/[id].tsx` (80-678, `ProfileSkeleton` 681-698)
  - `components/profile/ProfileSections` (`ProfileHero`, `ProfileHeading`, `ProfileBio`, `ProfileInterests`, `ProfileDetail`, `ProfileGallery`, `ProfileActions`)
  - `components/grid/ConnectSheet`, `components/blendn/MatchMoment`, `components/PhotoLightbox`
  - `LoadError`/`LoadState`, `Skeleton`, `Toast`
  - Helpers: `lib/profileIdentity` (`profileIdentity`, `withheldUnlessVisible`), `lib/likeRefusal`, `lib/safetyUtils#showUserSafetyActions`
- **Job:** look at someone you met at an event. Unrevealed, you see their pseudonym, mark (or blurred derivative), age, interests, location and work field. Revealed, you see their name, photos, bio, occupation, education and gallery. From here: like them (private, event-scoped), connect (a message request that reveals you), or message. **Entry/exit:**
  - Entry by push from: Room info member (params `pseudonym`, `roomSeed`, `eventId`); the Room grid (`components/blendn`, should pass the same); a Banter request avatar/name; the DM header / ⋮ View profile (once named); notifications.
  - Exits: back; ⋯ safety; Message → DM; MatchMoment "Say hi" → DM; lightbox.
- **Primary action:** **Like** (accent) when an `eventId` is known. Once liked it drops to a `surface` "Liked". **Connect/Requested/Message** is the `surface` secondary. Without an event there is no Like, so the screen has no accent (`ProfileSections.tsx:328-335`).
- **Content, top to bottom:**
  1. `ProfileHero` (width × 751/390):
     - Revealed: photos cycling (`SceneHeroMedia`).
     - Unrevealed with a derivative: a **single still `blurPhoto` with `blurRadius={60}`** (a 40px server derivative scaled up) (`ProfileSections.tsx:96-108`).
     - Unrevealed without one: a full-bleed `LinearGradient` of the pseudonym's two hues with a **128pt animal emoji** (`ProfileSections.tsx:116-131,444`).
     - Bottom scrim gradient.
     - Title `display`: the name and age when revealed, else the room pseudonym or "Someone" (never "Attendee").
     - Subtitle `body` `textSecondary`: "work field • location".
  2. Floating top bar: 48pt `scrim` discs, back and ⋯ ("Report or block"; hidden on your own profile).
  3. Canvas (gutter 24, gap 32):
     - **Bio**
     - **Interests**: chips 48pt `surface` pill. **Shared interests get a 1pt `textPrimary` outline** (`ProfileSections.tsx:196-226,466-473`).
     - Occupation card / Education ruled (`ProfileDetail` labels "OCCUPATION" / "EDUCATION" in `label`, values in `title` 24)
     - **Gallery** (photos after the first; "N photos")
     - `ProfileActions`: a `surfaceSunken` pill tray with **Like** (accent, `onGradient` label) + **Connect** (`surface`). The hint line goes to accessibility only (the `hint` prop is the button's `accessibilityHint`, `ProfileSections.tsx:406`). Copy: "Send a request to start chatting." / "Request sent — you can chat once they accept." / "You can message each other."
     - Unrevealed only: **"Still anonymous"** heading + "{name} has not revealed who they are yet. Connect, talk, and either of you can reveal when you want to." (593-605)
  4. `ConnectSheet` (`RisingSheet`), `PhotoLightbox`, `MatchMoment`.
- **Interactive elements:**
  - Like:
    - Optimistic. A refusal rolls back with `likeRefusal` toast copy "about the room or the network, never about them".
    - If mutual → `MatchMoment` (Success haptic there; "Say hi" (accent) / "Keep looking").
  - Connect → `ConnectSheet`: the disclosure above the field that sending reveals your name and photo, placeholder "Why do you want to talk?". Send → Light haptic on success → "Requested". A 409 also becomes "Requested"; any other failure toasts "Your request didn't send. Try again." and keeps the sheet open (387-416).
  - Message → DM.
  - ⋯ → block/report sheet (as on the friend profile); block → back.
  - A gallery tile → lightbox at the right index (+1 offset).
  - **The hero is not tappable.**
- **Current feedback:**
  - Haptics: Light on Connect sent (402); MatchMoment Success.
  - Motion: the Connect→Requested crossfade (`ProfileSections.tsx:415-425`), the hero auto-advance, the sheet rise, the lightbox.
  - Like has no animation (the label swaps "Like" → "Liked"; `HeartIcon` exists but isn't used here).
- **States:**
  - Loading: a skeleton shaped like the hero + lines.
  - Gone (404): `LoadState` `person-outline` "This profile isn't available." / "It may have been removed." / **Go back**.
  - Failed: `LoadError` "This profile didn't load".
  - Unrevealed: blur / mark + "Still anonymous".
  - Revealed.
  - Self (`ctaMode 'self'`): no actions, no ⋯.
  - Connect / Requested (disabled) / Message.
  - Liked.
  - Signed out: "Sign in to connect." hint.
- **Data and source:**
  - `GET /users/:id` (`getPublicProfile`): `name`, `age`, `bio`, `location`, `occupation`, `education`, `interests[{name}]`, `photos`/`profile_photos`, `work_field`, **`blurPhoto`** (only when unrevealed, *instead of* photos), **`sharedInterests`** (server-intersected), `stats`, `memberSince`, **`identityVisible`**, `isOwnProfile`, **`connection{conversationId, request}`** (only for people you may identify).
  - Fallback `getProfile` for older servers (fails closed: `identityVisible=false`).
  - Without `connection`: CTA state from `getConversations` + `getMessageRequests`.
  - `likeAtEvent(eventId, userId)` → `mutual`, `conversationId`, `pseudonyms.you`. `createMessageRequest(userId, message)`.
- **Rules to keep:**
  - `identityVisible` is the only switch. Anything else drops photos, bio, occupation and education at the boundary (`docs/PROFILE.md:189-196`).
  - Title the page with the room pseudonym, never "Attendee".
  - `work_field` stays outside the gate: "an attribute rather than an address" (`ProfileSections.tsx:29-33`).
  - No client-side blur of real photos.
  - Like is private and symmetric and stays pseudonymous; Connect reveals. **Like holds the accent so the safe, reversible action is the loud one** (`ProfileSections.tsx:318-331`).
  - Like needs an event; without one it is absent, not broken.
  - The actions sit at the foot of the page, not floating, and why (`ProfileSections.tsx:296-317`).
  - Shared interests are the only highlighted chips, and only on someone else's profile (`docs/PROFILE.md:169-173`).
  - "Missing" and "withheld" look identical by design (`ProfileSections.tsx:35-38`).
  - No handle, no PRO badge, no "Circle presence" (nothing backs them: `docs/PROFILE.md:156-185`).
- **Redesign opportunities:**
  - The unrevealed hero is a giant emoji on a two-stop gradient. It is *the* anonymous-identity visual of the product and deserves a designed treatment (the mark as an illustrated portrait; orbs; a frosted "reveal" plate over the blurred derivative).
  - The blurred derivative is shown at `blurRadius 60` and reads as a smudge. Design what "blurred until you both reveal" looks like on purpose.
  - The hero name block = over-photo scrim. The back/⋯ discs = glass controls.
  - `ProfileActions` lives at the bottom of a long scroll. The rationale is recorded; any floating glass action bar must answer the hero collision and scroll-cost reasons in `ProfileSections.tsx:299-317`.
  - The Like button has no heart or animation and no haptic. The Connect→Requested crossfade is the only state motion.
  - The Like accent → brand gradient here, so the gradient lands on the *safe* action.
  - The "Still anonymous" explainer is a plain heading + paragraph at the very end. It could be an inline glass notice near the hero.
  - Shared-interest chips are marked only by a 1pt white outline, a subtle signal for "the reason you might talk".
  - The hero isn't tappable to open photos.

### `app/(tabs)/profile.tsx` — Me (your profile)

- **Files and components:**
  - `app/(tabs)/profile.tsx`: `Stat` 61-96, `PanelRow` 99-130, `ProfileInner` 159-648
  - `components/profile/`: `PhotoStack`, `RollingNumber`, `NightsOut`, `MemoryTile`, `ProfileSections` (`ProfileHeading`, `ProfileBio`, `ProfileInterests`, `ProfileDetail`, `ProfileGallery`)
  - `components/friends/RequestsRow`, `components/pulse/SectionHeader`, `components/motion/FadeInUp`, `ScalePress`, `PhotoLightbox`, `LoadError`, `Skeleton`
  - Helpers: `lib/meProfile` (`identityMeta`, `profileGaps`, `agoLabel`, `nightsGrid`), `lib/savedEvents#pastEventRows`
- **Job:** your profile as others see it, plus what is yours alone (what's missing, stats, nights out, recent events, settings), on one page. **Entry/exit:**
  - Entry: the Me tab (5th); a tab re-press scrolls to the top.
  - Exits by push: Edit profile; Add friends; `/friends`; `/friends/requests`; `/going` (navigate, it's a tab); `/event/[id]`; `/settings`; lightbox.
- **Primary action:** none by rule. The one accent is the **`camera-outline` icon on "Add a photo"** while that gap exists (473). The Edit profile and Add friends pills are deliberately quiet (407-412).
- **Content, top to bottom** (each block is `FadeInUp` 520ms gentle, 70ms stagger):
  1. **Identity block** (no top bar; the name is the screen's display line):
     - Left: name `display` ("You" fallback) + ", age". `meta` "Bengaluru · Joined Mar 2025". Occupation `body` `textSecondary`. Two 32pt `surface` pills **✎ Edit profile** and **👤+ Add friends** (filled glyphs).
     - Right: `PhotoStack`, a fanned pile of up to three 84×108 photo cards (2pt page-colour borders, rotations −4/7/−11°). With no photos, one tilted card with your gradient mark (seeded on 'you').
  2. `RequestsRow` (if incoming friend requests > 0).
  3. **Finish your profile** (`heading`) + `PanelRow`s (`surfaceSunken` 56 rows, icon + label + chevron): "Add a photo" (accent icon) / "Add photos · n of 6" / "Write a bio" / "Pick interests". All go to Edit profile.
  4. **Stats**: one `surfaceSunken` radius-24 card, columns split by hairlines. Each `RollingNumber` (`title` 24) over a `label` caption: ATTENDED, SAVED (→ Going), FRIENDS (→ Friends; only once loaded), HOSTED (only if >0).
  5. **Nights out**: a `surfaceSunken` radius-24 card:
     - "N nights out in the last 12 weeks" `meta`.
     - A 12×7 dot grid (12pt dots: empty `surface`, went `textSecondary`, selected `textPrimary` at 1.5×; month labels `caption`).
     - A hairline, then a caption row: "SAT 27 SEP" `label` + the event title `bodyStrong` (+ "+N more") + chevron → the event.
  6. **Bio**, **Interests** (plain chips), Occupation/Education.
  7. **Gallery** (all photos, the first included, two columns).
  8. **Recent**: `SectionHeader` "Recent" + "SEE ALL" → Going. A horizontal rail (bleeds to the edge, first tile at the gutter) of `MemoryTile`s (148×188, radius 24, cover + scrim, "3 WEEKS AGO" `label` + title).
  9. **Settings** `PanelRow` (`settings-outline`).
- **Interactive elements:**
  - Edit profile / Add friends pills.
  - PhotoStack: tap → lightbox at the top photo (no photos → Edit profile); horizontal drag or flick → the top card goes to the back (Light haptic); a VoiceOver "Next photo" action.
  - RequestsRow; gap rows; stats (Attended/Saved → Going, Friends → Friends).
  - Nights out: tap a week or scrub horizontally (selection haptic per new night); the caption → event.
  - Gallery tile → lightbox. Recent tile → event; SEE ALL → Going.
  - Settings. Pull-to-refresh (skips the cache).
- **Current feedback:**
  - Haptics: PhotoStack flick Light (`SwipeDeck.tsx:46`); Nights out selection (`NightsOut.tsx:208`). All `ScalePress` here have `haptic={false}`.
  - Motion: the richest screen in the app:
    - the section cascade (`FadeInUp`, 57-58)
    - the PhotoStack deal and throw
    - the odometer stats (900ms, plays when a number first arrives or changes)
    - the Nights-out reveal, dot pop and caption slide
    - press scales
- **States:**
  - Loading: skeleton (the name block, a pill, a 120×120 stack, one block) (330-344).
  - Failed with nothing cached: `LoadError` "Your profile didn't load".
  - First-run / sparse: the mark card instead of photos; "Finish your profile" rows; Nights out hidden when no night falls in 12 weeks ("an empty grid reads as something you failed at", `NightsOut.tsx:155-156`); Recent hidden when empty; HOSTED hidden at 0; Friends hidden until loaded.
  - Attendance failed: Recent and Nights out are left out (one retry after 1.5s).
- **Data and source:**
  - `getPublicProfile(self)` (2-minute cache): name, age, bio, location, occupation, education, interests, photos, stats{eventsAttended, eventsFavorited, eventsOrganized}, memberSince.
  - `getMyAttendance(50)` → `pastEventRows` (10-minute cache) feeds Nights out and Recent.
  - `getFriends().count`, `getFriendRequests().incoming.length`.
  - The page refreshes on every focus.
- **Rules to keep:**
  - One merged page with no Preview: the owner's call (`tasks/lessons.md:20`; `profile.tsx:319-329`).
  - The page's single way into Edit is the pill. Sections carry no EDIT links (407-412).
  - Gaps are rows, never a meter or a percentage. Staying photo-less is legitimate (459-464).
  - Nights out counts nights not events, has no streaks or goals, uses no accent, and is hidden when empty (`NightsOut.tsx:124-157`).
  - "0 Hosted" is hidden (482-486).
  - The PhotoStack order is local only and resets (`PhotoStack.tsx:28-41`).
  - Your own interests are plain chips (no "shared").
  - The no-photo mark is seeded on 'you', never your id (346-351).
- **Redesign opportunities:**
  - There is no top bar or glass chrome; Settings is buried as the last row of a long scroll. A glass top-right gear (and maybe the Add friends action) fits the control layer.
  - The identity block puts a big `display` name next to a small fanned pile. The fan is charming but small (84×108). This is the natural home for the orbs, with the PhotoStack as the hero.
  - Your **pseudonym and mark** (how you appear in rooms) never appear on your own profile unless you have no photos. A "how rooms see you" card is a candidate, but there's no per-event pseudonym on this screen. Flag the data first.
  - The Gallery repeats the PhotoStack's photos. Recent (memories) sits below the Gallery at the bottom.
  - The stats card is flat hairline columns. The "Add a photo" accent on an *icon* is an odd home for the one accent. Under the redesign that's the brand-gradient primary, if anything.
  - Edit profile and Add friends use filled glyphs (§0.3).
  - The `FadeInUp` cascade plays whenever the content mounts (skeleton → content, i.e. the first load per session). A focus refresh does not replay it.

### `app/edit-profile.tsx` — Edit profile

- **Files and components:**
  - `app/edit-profile.tsx` (84-832)
  - `components/PhotoManager`, `components/InterestPicker`, `components/profile/MatchingFields`
  - `components/AppHeader` (rightTextButton Save), `components/ActionTray` (discard), RN `Modal` (tag input), `Skeleton`, `Toast`
  - Helpers: `lib/dating#mayDate`, `lib/intents`, `lib/onboarding#profileFormErrors`
- **Job:** the one editor for everything others see *and* everything matching reads. **Entry/exit:**
  - Entry by push from: the Me tab Edit pill; "Finish your profile" rows; the no-photo PhotoStack.
  - Exits: back. Guarded: while dirty, any exit opens the "Discard changes?" tray. Saving leaves automatically after the baseline moves (193-196).
- **Primary action:** **Save** (the accent pill in the header, `AppHeader.tsx:91-107,154`). The tag modal's **Add** is accent within that modal.
- **Content, top to bottom** (`ScrollView`, gutter 24; each card is `surfaceSunken` radius 32 padding 24 with an uppercase `label` title):
  1. **PHOTOS**: `PhotoManager`:
     - The caption "n/6 · blurred until you both reveal".
     - A three-column grid of square tiles (radius 8). Each has a **Main** scrim badge top-left (primary) or a **Make main** scrim pill bottom-left, and a red `close-circle` on a white disc top-right.
     - A dashed "Add photo" tile on **its own row below the grid**.
  2. **BASIC INFORMATION**: NAME * / AGE / LOCATION / OCCUPATION / EDUCATION / PHONE. `label` field labels; 56pt **pill** inputs on `surfaceMedia` (darker than the card) with a `separator` border; error border and `meta` in `destructive`.
  3. **ABOUT YOU**: BIO (100pt box, radius 24, 500 max) + "n/500" `caption`.
  4. **INTERESTS**: `InterestPicker`: "Selected: n/10" `meta`, then grouped chips (group heading `label`). Chips are 48pt pills, `surface` + border; selected = white fill, `bg` text; an optional emoji icon prefix.
  5. **YOU AND MATCHING**: `MatchingFields`:
     - WHAT ARE YOU OPEN TO? (Networking / Friendship / Dating / "Just here · no matching")
     - Only while Dating is ticked and age-allowed: YOU ARE (gender) / YOU IDENTIFY AS ("Select all that apply — up to three.") / INTERESTED IN (only when it can't be derived)
     - WHAT DO YOU DO? (work fields)
  6. **GOALS**: free-text tag chips (tap = remove, with a ✕ glyph) + a dashed "Add Goal".
  7. **LOOKING FOR**: the same, with "Add Preference".
  8. A tag `Modal` (centred card, fade): title "Add goal"/"Add preference", a pill input (60 max), Cancel (`surface`) / **Add** (accent).
  9. `ActionTray` "Discard changes?" ("You have edits that aren't saved. Leave now and they're gone.") with Keep editing / **Discard** (destructive).
- **Interactive elements:**
  - Save validates name/age, scrolls to Basic info, announces the error and focuses the field. It sends only changed fields:
    - the intent diff
    - dating fields only while Dating is ticked
    - interests as add/remove diffs
  - Toast "Profile saved" → back. On failure: "Couldn't save your profile. Try again."
  - Age is numeric-only. Live age gates the Dating chip (141-142).
  - Photos (§2 `PhotoManager`) **save immediately**, independent of Save.
  - Chips toggle. Interest cap warning haptic. Tags add and remove.
  - Back/swipe/Android back are intercepted while dirty.
- **Current feedback:**
  - Haptics: interest selection/warning (`InterestPicker.tsx:110-118`); Make main Light (`PhotoManager.tsx:234`). **None on Save, add/remove tag, or MatchingFields chips.**
  - Motion: photo tile reflow and remove fade (`PhotoManager.tsx:43,319-320`); the modal fade; the tray rise. Nothing else.
- **States:**
  - Loading: skeletons per card (photo block, four pill inputs, bio box, chip rows).
  - Saving: a spinner in the header Save.
  - Field errors.
  - Dirty-leave guard.
  - Photos: "Loading photos..." spinner, uploading spinner in the add tile, per-write busy.
  - Interests: "Loading interests…" / "Couldn't load interests. You can add them later from your profile."
  - Dating hidden for ages that may not date.
  - **No load-failure state for the profile itself.** On failure it logs and fills the form with blanks or auth-user defaults (213-220), so you can edit, and save, against an empty form.
- **Data and source:**
  - `GET profile(self)` → `{name, profile{age, location, phone, occupation, education, bio, photos, goals, looking_for, intent_default, work_field, gender, orientations, interested_in}, interests[{id}]}`.
  - `getWorkFields`; `getCategories` (a tree, `lib/categories`).
  - `updateProfile` (diff); `add/removeProfileInterests`.
  - `PhotoManager`: `getUserPhotos`, `selectAndUploadPhoto` (5MB message), `reorderPhotos` (the server returns sealed URLs), `deletePhoto`.
- **Rules to keep:**
  - Save sends only what moved. A blanket send would wipe matching (`docs/PROFILE.md:70-74`).
  - Dating fields are written only while Dating is ticked. A networking user is never asked their gender.
  - Interests are structured category ids (max 10, enforced by the server too), never free text (`InterestPicker.tsx:39-50`).
  - `photos[0]` **is** the primary everywhere ("Make main" is a reorder) (`PhotoManager.tsx:208-219`).
  - One photo write at a time (SCRUM-497).
  - The profile write happens before the storage delete.
  - The orientation cap dims chips rather than hiding them.
  - A selected chip is a white fill, never the accent.
  - The leave guard (157-180).
- **Redesign opportunities:**
  - Seven identical stacked cards with uppercase labels: a long, form-like scroll with no in-page navigation.
  - **Two save models on one screen**: photos autosave, everything else waits for Save. Nothing tells the user. Design needs to make this legible (photo writes confirm themselves; or move photos out to their own flow).
  - Inputs are **pills** for single lines on a darker-than-card fill. Labels sit outside; there are no inline icons.
  - The tag modal is a centred RN `Modal` with a fade: the only non-sheet modal in scope, which breaks the "one sheet" rule. It should be a glass sheet.
  - GOALS / LOOKING FOR are free-text tags. Confirm with product that anything reads them (`lib/interest-coverage` warns about unread free text for interests) before giving them prominence.
  - `PhotoManager`'s add tile sits on a separate row, not in the next free grid slot. The remove control is a **red-on-white filled** `close-circle` (off-palette). There is no drag-to-reorder, only "Make main". Image placeholders use the app icon. Dead styles remain (`header`, `hint`, `dragHandle`, `dragText`, `PhotoManager.tsx:478-548`).
  - `InterestPicker` is labelled "Design is a placeholder" (`InterestPicker.tsx:32-37`): 13 groups of chips with a counter, and no visual state at the cap.
  - `MatchingFields` styles were copied from onboarding and are the same chip as interests. Good consistency, but there is no explanation of *why* matching needs these, beyond the card title.
  - The page background is `'transparent'` (836) rather than `EMBER.bg`. Under an orbs backdrop this suddenly matters.

### `app/blocked-users.tsx` — Blocked users

- **Files and components:** `app/blocked-users.tsx` (55-179, `blockedDetail` 34-45); `components/friends/PersonRow`; `AppHeader`, `LoadError`/`LoadState`, `Skeleton`; `lib/safetyUtils` (`unblockUser`, `getReportTypeLabel`); the app sheet.
- **Job:** the people you blocked, and an undo for each. **Entry/exit:** push from Settings → Safety → Blocked users. Exit: back.
- **Primary action:** none.
- **Content:** `AppHeader` "Blocked users"; `PersonRow` rows (a 48pt photo or initial, name, "Blocked Sep 12 · Harassment" `meta`) with a trailing 32pt `surface` **Unblock** pill.
- **Interactive elements:** Unblock → sheet "Unblock {name}?" ("They can see your profile and message you again. They are not told.") with **Unblock** (`destructive` red) → toast "{name} is unblocked". Pull-to-refresh.
- **Current feedback:** none (no haptic; the pressed pill dims).
- **States:**
  - Loading: three skeleton rows.
  - Empty: `LoadState` `shield-checkmark-outline` "No blocked users" / "People you block show up here, and you can unblock them any time." (no action).
  - Failed: `LoadError` "Blocked users didn't load" (never a false "nobody", 61-66).
- **Data:** `GET blocked users` → `users[{blocked_id, blocked_user_name, blocked_user_photo, blocked_at, reason}]`. The reason is shown only if it's a known report type.
- **Rules to keep:** a failure is never shown as empty. The reason is a human label, never an enum. Unblocking is silent. The date uses the en-US short format (37-42).
- **Redesign opportunities:**
  - Unblock is styled `destructive` red in the sheet although it restores contact. Either it's the risky choice (keep red, say so) or it isn't (neutral). Decide deliberately.
  - Showing blocked people's **faces** may be unwelcome. Consider initials or a neutral mark (a product call).
  - Plain list; fine as a solid-content screen.

---

## 2. Components

Format: **path** · role · used by · variants/states · interactions · motion/haptics · material layer in the glass redesign · notes.

### components/chat/

- **`components/chat/ChatBubble.tsx`** · one message, in a room or a DM.
  - Used by: `app/chat/[id].tsx`, `app/private-chat/[conversationId].tsx`, `app/preview/chat`.
  - Variants: `room` / `direct`; `mine`; states `removed`, `failed`, `edited`, `replyTo`, `reactions`, `receipt` (sent/delivered/read, DM only), `animateIn`.
  - Interactions: long-press (250ms) → menu; tap when failed → retry.
  - Motion/haptics: sent rise 150ms (fade only under Reduce Motion). The haptics are the screen's.
  - **Layer: solid content** (bubbles must stay opaque for contrast over orbs).
  - Notes:
    - Avatar flat for cost (179-183).
    - Corners in the code (16/8) disagree with the docs (24/4) and its own header (16/4).
    - The name is `bodyStrong` like the text.
    - No grouping props exist. Add `groupPosition` (first/middle/last/single) for the redesign.
    - No media slot.
    - The receipt renders in the meta row above the bubble.
- **`components/chat/ChatComposer.tsx`** · message input + send.
  - Used by: room and DM.
  - Locks (`ComposerLock`): `muted` "You're muted in this room." / `locked` "You can read this room, but not post in it." / `closed` "This room is closed." / `rate_limited` "Slow down a moment — too many messages."
  - Deliberately **no sending state** (37-50).
  - Placeholder "Share your thoughts…" / "Can't send right now". Multiline to 132pt, max 1000.
  - Interactions: type, focus (scrolls the feed), send.
  - Motion/haptics: none (send dims to 0.45 when idle).
  - **Layer: glass control** (the floating pill), with the send button as the screen's single brand-gradient primary.
  - Notes:
    - Not actually floating today (in flow).
    - No character counter at the 1000 limit.
    - Needs states for banned, not-checked-in, auto-mute with expiry, left, and ended (§0.7).
    - No `+` and no emoji button, by decision.
- **`components/chat/BroadcastNotice.tsx`** · organiser announcement or sponsored message in the room feed.
  - Used by: room.
  - Variants: `announcement` (white rail, label "ANNOUNCEMENT · ORG"), `sponsored` (grey rail, "SPONSORED", dimmer label).
  - Interactions: none. Motion/haptics: none.
  - **Layer: solid content**, full width (maybe a distinct material from bubbles; never the room's brand voice for sponsored).
  - Notes:
    - Strips the server's emoji label prefix.
    - No media, no CTA, no organiser avatar.
    - "Derived, not designed" (`docs/CHAT.md:209-210`).
- **`components/chat/SystemNotice.tsx`** · centred pill for day separators, system messages, and the DM unread divider.
  - Used by: room, DM.
  - Variants: none (one shape by design). `maxWidth` 86%.
  - **Layer: solid content** (a small chip; could be a light glass chip if day headers become sticky).
  - Notes: the unread divider reusing this shape makes "N unread messages" read like a date.
- **`components/chat/TypingIndicator.tsx`** (+ `typingLabel`) · "X is typing…" at the end of the feed.
  - Used by: room, DM.
  - Variants: one name / "N people are typing…"; Reduce Motion still dots.
  - Motion: RN `Animated` dot loop, row opacity 0.6.
  - **Layer: solid content** (feed footer).
  - Notes:
    - The 56pt indent is wrong in DMs (no avatar).
    - Names are never uppercased.
    - Could adopt the inbound bubble shape.
- **`components/chat/ReactionPicker.tsx`** · the six server emoji as a row.
  - Used by: the room message menu (`content` slot of the sheet).
  - States: per-emoji selected (white fill).
  - Interactions: tap toggles and closes the sheet.
  - Motion/haptics: none.
  - **Layer: glass sheet** (or a glass contextual bar anchored to the bubble).
  - Notes: six only (anything else is a 400). No haptic on pick.
- **`components/chat/ReplyBar.tsx`** · "Replying to {name}" above the composer.
  - Used by: room, DM.
  - Interactions: ✕ cancels.
  - Motion: fade in 150 / out 120.
  - **Layer: glass control** (attached to the composer).
  - Notes: a full-bleed sunken strip today, mismatched with the inset pill.
- **`components/chat/SwipeToReply.tsx`** · horizontal drag-to-reply wrapper.
  - Used by: room, DM.
  - `enabled` false for removed or failed bubbles.
  - Interactions: pan right (claims at 12pt, fails at 10pt vertical); trigger 56, max 88 (`lib/swipeReply.ts`).
  - Motion/haptics: arrow fade/scale, spring home; Light haptic at the trigger.
  - **Layer: n/a** (gesture). The arrow glyph should go outline.
  - Notes: the arrow is `textSecondary`, filled `arrow-undo`.
- **`components/chat/RoomGuidelinesBanner.tsx`** · once-per-room anonymity and safety notice.
  - Used by: room.
  - States: hidden until the dismissal flag is read (no flash).
  - Interactions: COMMUNITY GUIDELINES (link), GOT IT (persists).
  - **Layer: glass control** (a dismissible notice under the header) or solid content in-column. It must not cover messages.
  - Notes: both actions are text so Send stays the one accent.
- **`components/chat/RoomLeftState.tsx`** · replaces the feed and composer when you're not in the room.
  - Used by: room.
  - Variants: `left` ("You left this room" / "You won't get its messages or notifications. Rejoin to read and post again, or check in at the event.") / `out` ("You're not in this room" / "If you left it, you can rejoin. Otherwise, check in at the event to join its room."); `rejoining` spinner.
  - Interactions: Rejoin (accent).
  - Motion/haptics: `ScalePress` with its default selection haptic.
  - **Layer: solid content**, with Rejoin as the state's brand-gradient primary.
  - Notes: an 80pt glyph tile with a 36pt `exit-outline`.
- **`components/chat/ChatLoadFailed.tsx`** · "Couldn't load {what}" + Try again (wraps `LoadError`).
  - Used by: room, DM, Room info.
  - **Layer: solid content**; Try again = primary.
  - Notes: never shown when messages are already on screen.

### components/banter/

- **`components/banter/BanterSections.tsx`** · the inbox pieces. Used by `app/(tabs)/chat.tsx`, `app/preview/banter`, and `components/board/BoardRequestsSection` (`BanterRequest` with `markSeed`).
  - `BanterSearch`:
    - A 48pt pill input with a static variant for the preview.
    - **Layer: glass control.**
  - `BanterHeading` / `BanterBucketHeading`:
    - Section heading + count; bucket heading + "MARK ALL READ".
    - **Layer: solid content** (type only).
  - `BanterLiveRoom`:
    - The checked-in room row: sunken panel, square cover, still success dot, muted mark.
    - **Layer: solid content card** (a hero candidate with a cover + over-photo scrim). Presence stays still unless the rule changes.
  - `BanterConversation`:
    - The fixed-height row. Kinds: `direct` (photo / initials / `PseudonymDisc`), `event`/`group` (square cover). States: unread (three changes), muted, `previewEmphasis` ("Asked to reveal names").
    - Interaction: tap. Pressed = 0.85.
    - **Layer: solid content** (rows on the page; with orbs behind, rows likely need their own solid fill or a solid page band).
  - `BanterRequest`:
    - A request row: photo, generated mark (board), or person glyph; name + time; two-line message; optional `note`; Decline / Accept (white) / More; `pending` dims all.
    - **Layer: solid content card.**
  - `PseudonymDisc`:
    - A `LinearGradient` disc with a 26pt emoji.
    - **Layer: identity art** (the one gradient allowed today).
  - `RoomCover`:
    - Cover or a MaterialIcons `groups` fallback.
  - `MutedMark`:
    - `notifications-off-outline` 16 `textTertiary`.
  - Constants: `ROW_AVATAR 56`, `ROW_HEIGHT 80`, `REQUEST_HIT_SLOP`.
  - Notes:
    - No motion inside any piece. The screen adds the request exit.
    - Mixed icon families.
- **`components/banter/inbox.ts`** · pure helpers.
  - `inboxTimeLabel`: "now/5m/3h/Yesterday/Tue/Oct 4/Oct 4, 2025", never locale.
  - `activityBucket` / `bucketRows`: Today / This week / Earlier; never-used = Earlier.
  - `previewWithSender`: "You: " / "Name: ".
  - `liveRoomMeta`: "You're here · N in the room".
  - **Layer: n/a.** Notes: keep the formats; they're tested.

### components/friends/

- **`components/friends/PersonRow.tsx`** · one person with real name and photo.
  - Used by: Friends, Add friends (Sent), Blocked users.
  - Variants: tappable (`ScalePress` 0.98, no haptic) or static; `detail` line; `trailing` slot. Avatar 48 photo or initial.
  - **Layer: solid content.**
  - Notes: "Never used in a room" (17-19).
- **`components/friends/IncomingRequestRow.tsx`** · a friend request with Not now / Accept.
  - Used by: Add friends, Requests.
  - States: `busy` (both pills dimmed to 0.45).
  - Interactions: two 32pt pills (hitSlop to 44).
  - Motion/haptics: none.
  - **Layer: solid content.**
  - Notes: mirrors `BanterRequest`'s layout; Accept is strong-neutral.
- **`components/friends/InviteLinkCard.tsx`** · your invite URL as text.
  - Used by: Add friends.
  - States: URL / loading spinner / failed copy.
  - Interactions: text is selectable.
  - **Layer: solid content card** (a shareable "ticket" card candidate).
  - Notes: the `link` glyph is filled.
- **`components/friends/PendingInvite.tsx`** (+ `pendingInviteLine`) · on welcome/sign-in, "Sign in to accept {name}'s invite" pill, or the dead-link `meta` line.
  - Used by: the welcome and sign-in screens (signed out).
  - States: from (a 32pt photo or initial) / dead / nothing (on any other failure).
  - **Layer: glass control chip** over the welcome screen's orbs.
  - Notes: shows a first name + photo only.
- **`components/friends/RequestsRow.tsx`** · "Friend requests [n] ›" entry row.
  - Used by: Me tab, Friends.
  - Count badge white-on-`bg`, "99+" cap. `ScalePress` 0.98, no haptic.
  - **Layer: solid content** (or a glass chip if hoisted into a header).

### components/profile/

- **`components/profile/ProfileSections.tsx`** · profile pieces (presentational).
  - `ProfileHero`:
    - Used by: `user/[id]`, `friends/[userId]`. Width × 751/390.
    - Variants: photos cycling (`SceneHeroMedia`; auto-advance until the first swipe) / blurred still (`blurRadius 60` on the 40px derivative) / generated gradient mark with a 128pt emoji.
    - A bottom scrim gradient; `display` title + subtitle; `onPressMedia` (unused by both callers).
    - **Layer: over-photo scrim** (name block).
  - `ProfileHeading`:
    - Used by: Me, `user/[id]`, `friends/[userId]`, Room info, Add friends.
    - `heading` + optional trailing `meta`.
    - **Layer: solid content.**
  - `ProfileBio`:
    - `body` `textSecondary`.
  - `ProfileInterests`:
    - Chips, 48pt `surface`; shared get a 1pt white outline.
    - **Layer: solid content.**
  - `ProfileDetail`:
    - `card` (`surfaceMedia`, radius 32, padding 24; label + `title` value) / `ruled` (left hairline). Deliberately asymmetric.
    - **Layer: solid content.**
  - `ProfileGallery`:
    - Two columns, 163pt tiles, radius 24, `ScalePress` (no haptic), opens the lightbox.
    - **Layer: solid content.**
  - `ProfileActions`:
    - Like (accent → "Liked" `surface`) + Connect/Requested/Message (`surface`) in a `surfaceSunken` pill tray; the label crossfades on change.
    - **Layer: solid content tray at the page foot** (by recorded rationale), or a glass action bar if the designer resolves the hero-collision and scroll-cost reasons (296-317). Like is the gradient primary.
  - Notes: "missing" and "withheld" must look identical.
- **`components/profile/PhotoStack.tsx`** · your fanned photo pile (Me tab).
  - Variants: photos (`SwipeDeck`, fan −4/7/−11°, 84×108, 2pt page-colour border) / no photos (one tilted card with your gradient mark at `display` size).
  - Interactions: tap → lightbox (no photos: Edit profile); flick → to the back.
  - Motion/haptics: deal + throw; Light haptic per flick.
  - **Layer: solid content** (photo cards); a hero candidate over the orbs.
  - Notes: the order is local only.
- **`components/profile/RollingNumber.tsx`** · odometer count.
  - Used by: Me stats (and the Room headcount elsewhere).
  - Variants: `variant`, `duration` (900ms default; short roll for live counts), `stagger`, `color`.
  - Motion: digits slide on the UI thread. Rolls on first appearance and on change. Reduce Motion = set. Tabular figures.
  - **Layer: inherits.**
  - Notes: not an accessibility element; the caller labels it. Satoshi needs tabular figures too.
- **`components/profile/NightsOut.tsx`** · a 12-week dot calendar of nights you went out.
  - Used by: Me tab.
  - States: hidden with no nights; a selected night (default newest); "+N more" for multi-event nights.
  - Interactions: tap or horizontal scrub (vertical scroll still works); caption → event; accessibility: each night is a button.
  - Motion/haptics: column reveal, dot pop 1.5× with overshoot, caption slide, selection haptic per new night.
  - **Layer: solid content card.**
  - Notes: no accent and no streaks/goals by rule. Empty `surface` dots on a `surfaceSunken` card.
- **`components/profile/MemoryTile.tsx`** · a past-event photo tile for the Recent rail.
  - Used by: Me tab.
  - Variants: cover / no-cover (calendar glyph on `surface`).
  - Interactions: tap → event (`ScalePress`, no haptic).
  - **Layer: over-photo scrim** (text on the cover).
  - Notes: 148×188, radius 24, uppercase "3 WEEKS AGO" eyebrow.
- **`components/profile/MatchingFields.tsx`** · the five matching fields (intent, work field; gender/orientation/interested-in only while Dating).
  - Used by: `app/edit-profile.tsx` and onboarding (`app/about-you.tsx`).
  - States: Dating offered or not (`offerDating`); the orientation cap dims (`OPACITY.disabled`); `afterIntents` slot.
  - Interactions: chip toggles (single for gender/work field, multi for intents/orientation/interested-in).
  - Motion/haptics: none.
  - **Layer: solid content** (inside a card).
  - Notes: copy is uppercase `label` questions. Selected = white fill. Special-category data handling is a rule.

### Other in-scope components

- **`components/PhotoManager.tsx`** · the edit-profile photo grid.
  - Used by: Edit profile.
  - States: loading ("Loading photos..."), uploading (spinner in the add tile), saving (`busy` disables everything), max 6, the caption "n/6 · blurred until you both reveal".
  - Interactions:
    - Add (picker + upload + profile write; toasts with the picker's own "Photo must be…" copy or "Couldn't upload that photo. Try again.")
    - Make main (optimistic reorder + Light haptic; rollback + server sentence)
    - Remove (sheet "Remove this photo?" / "It comes off your profile. You can add it again later." → **Remove photo**)
  - Motion: tile reflow 250ms, remove fade.
  - **Layer: solid content** (tiles), with **over-photo scrim** badges/buttons.
  - Notes: the add tile sits on its own row; the red-on-white remove glyph; no drag reorder; dead styles; app-icon placeholder.
- **`components/InterestPicker.tsx`** · grouped interest chips from the server taxonomy, max 10.
  - Used by: Edit profile, onboarding.
  - States: loading / failed-or-empty copy / counter.
  - Interactions: chip toggle.
  - Haptics: selection per toggle; Warning at the cap.
  - **Layer: solid content.**
  - Notes: self-declared placeholder design. No visual cap state. An emoji `icon` prefix from the server.

### components/motion/

- **`components/motion/presence.ts`** · `fadeInFast` (150) / `fadeOutFast` (120) (ignore Reduce Motion: a fade *is* the reduced form) and `popIn`/`popOut` (0.9↔1 scale; skipped under Reduce Motion).
  - Used by: chat screens, `ReplyBar`, `ChatBubble`, `PhotoManager`, `ProfileSections`, banners, the tab layout.
  - **Layer: n/a.** Notes: the house curve is `bezier(0.23,1,0.32,1)`.
- **`components/motion/ScalePress.tsx`** · press-in scale (0.97; rows 0.98) via a 120ms CSS transition, with an optional `selectionAsync` haptic (default **on**). Reduce Motion: no scale.
  - Used by: almost every tappable here (mostly with `haptic={false}`).
  - **Layer: n/a.**
  - Notes: in practice the redesign's haptic policy lives here. Today it's opted out nearly everywhere.
- **`components/motion/FadeInUp.tsx`** · shared-value entrance (opacity + rise), configurable delay/distance/duration/easing.
  - Used by: Me tab (and Pulse, Going, Event, Blend'n).
  - **Layer: n/a.** Notes: replays on every mount.
- **`components/motion/HeartIcon.tsx`** · heart outline→solid with a 1→1.2→1 swell on fill only.
  - Used by: Pulse/Event cards (**not** by profile Like).
  - **Layer: n/a.** Notes: a candidate for the profile Like.
- **`components/motion/ConfettiBurst.tsx`** · a physics confetti overlay, triggered by a counter.
  - Used by: check-in (Event, Blend'n). Not used in social screens.
  - Nothing drawn under Reduce Motion.
  - **Layer: overlay above everything.**
  - Notes: candidates are friends-accepted, both-revealed and the match moment (keep it rare, given the "AI-generated effects" rejection).
- **`components/motion/RisingSheet.tsx`** (`RisingSheet`, `SheetModal`, `SheetScrollView`, `SheetFlatList`) · bottom sheet:
  - rise 300 / sink 240 on the iOS curve
  - drag to dismiss (30% or 800pt/s)
  - shared list/drag finger
  - scrim `backdrop` that thins with the drag
  - Used by: `ActionTray` (and so the app's one sheet), `ConnectSheet`, `NotificationBell`, `FilterControl`, `PersonCard`, Pulse.
  - **Layer: glass sheet** (this is where sheet glass would be implemented).
  - Notes: the inner layer owns the look (`tasks/lessons.md:10`). A blur here must avoid layout transitions.
- **`components/motion/SwipeDeck.tsx`** · a reusable fanned card pile (deal, drag, throw, settle; Light haptic per swap; a VoiceOver increment action).
  - Used by: `PhotoStack`, Blend'n Tonight deck.
  - **Layer: solid content.**
- **`components/motion/SwipeToDismiss.tsx`** · throw-away full-screen media (follows the finger, dismisses at 120pt or 800pt/s, otherwise springs home; open = 0.92→1 scale).
  - Used by: `PhotoLightbox`, `SceneLightbox`, `ActionTray`.
  - **Layer: full-screen opaque** (lightbox backdrop is `EMBER.bg` on purpose: "a full-screen dark room, not a dimmed sheet").
- **`components/motion/ZoomableImage.tsx`** · pinch (to 4×) / double-tap (2×) / pan with decay and rubber band.
  - Used by: `PhotoLightbox`, `SceneLightbox`.
  - **Layer: full-screen opaque.**

### lib/

- **`lib/pseudonymAvatar.ts`** (`pseudonymAvatar`, `markSeed`, `avatarStack`) · the generated identity mark.
  - Two hue stops from eight palette pairs, plus a creature: from the pseudonym's noun when it's an animal (Cosmic **Panda** → 🐼; birds share 🐦), else a hashed 16-emoji cast. Colour and creature are decorrelated (128 combos).
  - `markSeed` falls back to a per-room-per-person seed for placeholder names ("attendee", "someone", "you", …).
  - Used by: `BanterSections` (`PseudonymDisc`), `ChatBubble`, Room info, DM header, `ProfileSections#ProfileHero`, `PhotoStack` fallback (Me), Room grid, board.
  - Rendered as a gradient disc in the inbox and profile hero, and as a **flat** first-stop disc in chat and Room info (for cost).
  - **Layer: identity art** (not a surface).
  - Notes:
    - Never seed with a user id.
    - Emoji glyphs (no assets).
    - Re-tune `HUES` against the brand violet (§0.2).
    - The 26/20/128pt emoji sizes are design exceptions.
    - `avatarStack` (shown + remainder) exists for "+121"-style stacks.

---

## 3. Adjacent shared pieces these screens depend on (not in scope, but they set the look)

| Piece | What it is today | Layer in redesign |
|---|---|---|
| `components/pulse/PulseTopBar.tsx` | absolute, opaque `bg`, 64pt, title + actions (Banter) | glass control |
| `components/AppHeader.tsx` | back + title + optional right icon or **accent Save pill** (Room info, Friends, Add, Requests, Edit profile, Blocked) | glass control |
| `components/ActionTray.tsx` + `components/SheetHost.tsx` + `lib/sheet.ts` | the app's one sheet: `surfaceSunken` tray, hairline, grabber, `title` + `body` message, buttons primary = accent / destructive = red fill / secondary = `surface`. Steps replace in place. A failed `run` turns the button into "Try again". **No haptics** | glass sheet |
| `components/LoadError.tsx` (`LoadState`, `LoadError`) | 80pt glyph tile (36pt icon `textTertiary` on `surface`), `title`, `body`, accent pill action | solid content; action = gradient primary |
| `components/RealtimeStatusBanner.tsx` | offline (destructive tint) / "Reconnecting…" / "Live updates paused." + RETRY (warning tint) | glass control (toast-like) |
| `components/onboarding/EmberControls.tsx#EmberButton` | flat accent primary (56pt), no haptic | gradient primary |
| `components/grid/ConnectSheet.tsx` | `RisingSheet` with the reveal disclosure above a message field | glass sheet |
| `components/blendn/MatchMoment.tsx` | mutual-like moment, Success haptic, "Say hi" (accent) / "Keep looking" | glass sheet over orbs; celebration |
| `components/PhotoLightbox.tsx` | full-screen pager + zoom + swipe-to-dismiss | opaque |
| `components/Toast.tsx` | success/error/info toasts (used for most outcomes here) | glass control |
| `app/(tabs)/_layout.tsx` | tab bar `Pulse · Going · [Blend'n] · Banter · Me`, 92pt clearance; the Blend'n disc carries the live-room unread badge (pop in/out) | glass navigation; the Blend'n disc is the brand-gradient mark |

---

## 4. Open questions to settle before drawing

1. **Glass vs the recorded rejection** (`tasks/lessons.md:16`): confirm that glass on chrome, a solid gradient primary with no bloom, and still status marks is the intended reading.
2. **Presence motion**: does the live dot or headcount move now? The rule today is "a still mark".
3. **The gradient label colour**: no text colour passes AA across orange→violet at 16px (§0.2).
4. **Pseudonym palette** vs brand violet (§0.2).
5. **Bubble grouping and timestamps**: adopt grouping (a component prop change) and pick one time format (locale vs fixed).
6. **Composer state system**: design all states in §0.7 and file the plumbing gaps (no `memberMuted` listener, no pre-lock, banned isn't a lock, the ended DM keeps the composer).
7. **Broadcasts**: real design, including sponsored media (allowed) and organiser identity.
8. **DM media**: the API supports image/video and the client ignores it. Build or remove.
9. **The reveal moment** in DMs, including an "Asked" state.
10. **Where total chat unread lives** (not the bell; the bell counts notifications).
11. **Edit profile save model** (photos autosave vs Save) and whether GOALS/LOOKING FOR are read by anything.
12. **Event context banner** for rooms (CHAT.md open ask 1).
13. **Doc drift** (§0.6): update `docs/CHAT.md` and `docs/PROFILE.md` with the redesign so the designer isn't reading stale specs.
