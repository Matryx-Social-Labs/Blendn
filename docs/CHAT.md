# Chat

**Design:** Claude Design, "Blend'n Design System", `guidelines/flow-5/` — the
Flow 5 frames (`flow5.js`), the prototypes (`flow5-proto.js`: send, the reveal,
#27, #35–#37) and three deltas, newest first: **R3-D5** (`flow5-r3d5.js`),
**R3-0**, **R2-D2** (`flow5-delta.js`). Where they disagree the newest delta
wins, then the flow's frames, then the motion cards, then the component pages
(`docs/redesign/ROUND3.md`, SCREENS.md Flow 5). Built on the DS components in
`components/ds/` — nothing here draws its own bubble, composer or sheet.

**Routes:** `app/chat/[id].tsx` (the room: event rooms, crew chats and Blend
rooms by `kind`), `app/chat-info/[id].tsx` (Room info),
`app/private-chat/[conversationId].tsx` (a DM). Their pieces are in
`components/chat/`; the pure rules in `lib/chatFeed.ts` (runs, refusals,
broadcast prefixes), `lib/messageMenu.ts` (the long-press table),
`lib/roomMessages.ts`, `lib/chatOutbox.ts` (drafts and unsent messages),
`lib/useComposerLock.ts`, `lib/useWaitingSends.ts`, `lib/roomRow.ts`.
Every DS state is on `/preview/ds-p3`.

---

## The room

```
Orbs + Grain                         L0; paused while the keyboard is up (#34)
ChatHeader      glass capsule        back · square cover · name (+ bell-slash) · live dot + count · ⋮ → Room info
RealtimeStatusBanner                 under the capsule (offline / updates paused + Try again)
FlatList                             scrolls under the header and the composer
  RoomGuidelinesBanner               event rooms only, once per room until "Got it"
  LOAD OLDER MESSAGES                also on pull at the top
  DayPill · ChatBubble runs · BroadcastNotice · SystemLine · poll notice
  TypingIndicator                    at the end of the feed
NewestChip                           glass, "4 new", while you read back
JustMutedLine + Composer             floating glass; every lock in the server's words
LongPressMenu · ReactionFlight · SenderCard
```

- **Runs.** Consecutive messages from one sender run together: the name on the
  first, the creature, the time (Geist Mono, `chatClock`, never the device
  locale) and the tail on the last. A day pill, a broadcast or a five-minute
  pause ends a run (`runPlace`).
- **People are creatures.** The room is pseudonymous: every sender is the
  creature seeded on their pseudonym (`markSeed`, the rule the Grid, Room info
  and the profile share). The server sends no photo in a room.
- **Send** commits with `H.send`; the bubble rises from the composer (#12).
  History never animates. Nothing says "sending".
- **Long-press** (`lib/messageMenu.ts`, R3-D5 5.2): theirs — the six reactions,
  then their card, Reply, Copy, Report…, Block…; yours — the reactions, Reply,
  Copy; still sending — Copy; a room that refuses writes — no reactions, Copy
  (and Report… on theirs); not sent — the Not sent sheet (Try again · Copy ·
  Delete); removed, broadcasts and polls — nothing. Copy is silent (C20). Your
  reaction flies from the bar to its chip and the chip pops (#37).
- **Swipe right** replies (#35). **Tap a sender** (their creature or name)
  opens the DS PersonCard from the event's roster (5.1); somebody the roster
  doesn't list gets the thin card. Crew and Blend people are Flow 10's.
- **A send that fails stays**, marked "Not sent · Tap to retry"; the tap
  retries. Too many links is "Not sent · Two links at most". It survives
  leaving the room (`lib/chatOutbox.ts`, SCRUM-633) and shows on the Banter.
  **Offline**, a send waits ("Waiting for connection", a clock), sends itself
  when the connection is back, and is "Not sent" after two minutes (5.8).
- **Withheld by moderation** at send: the dashed placeholder in its place and a
  toast — never a modal.
- **The composer** says why it can't post, in the server's words: muted
  (organiser or automatic, never a countdown — R11), locked, closed, not open
  yet, hidden, "Slow down a moment" with the server's `retryAfter` counted down,
  and "RSVP to this event to join the chat" with **I'm going**. A mute that
  arrives while you're here (`chat:memberMuted`) flips it in place with "Just
  now · the organiser muted you".
- **Not in the room:** left / not a member (Rejoin), not live (Go live again),
  removed by the organiser (the server's sentence, no action), gone (404, Back),
  a closed crew chat or Blend (Back). Each replaces the feed and the composer.
- **Links** are tappable and open through a sheet that names the host, never
  a preview (R10). The host is the parsed URL's (`linkHost`), never the link's
  text; only http(s) opens, and only to an allowlisted authority (ASCII
  letters, digits, dots, hyphens, a numeric port, a named last label): anything
  else — userinfo, escapes, look-alike punctuation, raw IPs, non-ASCII hosts —
  stays words. `xn--` hosts show as they are. One to three
  emoji alone are drawn at 32 pt.
- **Route params** are anybody's link: ids must be one server-shaped segment
  (else "This link doesn’t work", nothing loads), names and the DM draft are
  bounded plain text (`lib/routeParams.ts`).
- **Typing** lives at the end of the feed, in the bubble's shape (#14).

## Room info

The cover as a scrimmed hero (a still Live badge, the bell-slash chip and
"Muted until …" when you muted it, the title, the count); Mute · Community
guidelines · Report this room as rows; "In the room" as a crowd of creatures
with Organiser / Moderator badges, each opening their card (5.12); Leave apart,
in the danger zone. Mute is yours alone (`H.select` on the pick); Leave says it
is undone by checking in again. A place's room (R4-D5 5-2) is "‹place› · tonight",
its size the place's bucket ("5–9"), never the exact total, and Leave says to go
live again; on the Banter its Live now row says "You’re here" (5-3). The sheets are `components/chat/RoomSheets.tsx`
(the Banter's swipe uses the same two).

## Direct messages

- **The reveal** (`revealView`): both anonymous — the two-sided RevealBar with
  Show them · Ask them; once you ask, the Asked state (there is no declined
  state); they revealed — Show them, their name and photo; you revealed — "They
  can see you", no button. The header's eye line says which. Show them is the
  strong white (Send is the primary) behind a sheet that says it can't be
  undone; on the server's yes the names resolve in (#23) and `H.success` plays.
  The photo gate's refusal is the Not yet sheet, verbatim.
- **No names, no creatures, no reactions** on a DM's bubbles. Replies, Copy and
  Report… (theirs) are in the long-press. Receipts (Sent ✓ · Delivered ✓✓ ·
  Read ✓✓ white) under your last message only; never in a room.
- **The match opener** ("You both said yes.") is a permanent header, not an
  empty state. An empty thread offers **Say hi**, which sends at once.
- **The unread divider** reads "2 UNREAD" (the DM frame's word).
- **Ended** (the server's 404): the composer goes, and it never says whether
  you were blocked.
- **Photos** (R9, 5.9): once you can both see each other (or the conversation
  never hid anyone), the composer gains Send a photo → the preview with a
  caption → the photo is re-encoded on the phone (`uploadChatPhoto`: a fresh
  JPEG keeps no location) → a determinate ring while it uploads → the bubble;
  refusals are the server's sentence on the bubble. Tapping a photo opens the
  viewer, with Report on theirs.

---

## Where the build departs from the design, and why

- **The not-live room** stays a full state ("You're not live here any more" ·
  Go live again) rather than R2-D2's readable room with a not_live composer: the
  server refuses a not-live member's read (`NOT_LIVE` on the history), so there
  is nothing to read.
- **Removed** is R2-D2's full state (no feed) for any `USER_BANNED`, live or on
  a read; the flow frame's "you can still read" is not what the server allows.
- **Archived** reads as closed: the server words them the same.
- **Polls** are a notice ("Poll: {question}"), not the PollBubble: the room's
  messages don't carry the poll's id. (Server.)
- **The pre-event countdown header** and **"Live updates off" for a refused
  socket join** are not built: the client has no signal for either. (Server.)
- **Crew and Blend Room info** (R2-D2): ⋮ in a crew chat or a Blend still opens
  the crew or the Blend (Flow 10's screens).
- **Your side of the RevealBar** reads "You · anonymous" until you reveal: the
  server doesn't send your own pseudonym in a conversation. (Server.)
- **The contact-details warning** (5.10) is not built: the server doesn't serve
  it yet. (Server.)
- **Toasts** still come from the app's toast provider; the DS Toast becomes the
  provider in its own change (it plays outcome haptics app-wide).
- **ConnectSheet** (Message, from a sender's card) is still Flow 4's
  pre-redesign sheet.
