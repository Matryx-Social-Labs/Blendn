# Chat

Frame `1141:5498` — "Event Community Chat", 390 wide, in the **Updates** canvas
of `HO0UnAEV5djzo0h4q7Y2vi`.

**Routes:** `app/chat/[id].tsx` (the room) and
`app/private-chat/[conversationId].tsx` (direct messages).
**Presentation components:** `components/chat/`. **Harness:**
`exp+blendn:///preview/chat`, fixtures only, dev-only.

Both screens draw the same bubble. Everything below is about the room unless it
says otherwise; the DM's differences are in *Direct messages* at the end.

Reached from The Room's `Grid | Join Chat` toggle, which navigates here rather
than swapping a pane — the chat is one place you are standing in, not a tab.

---

## Composition

```
GroupChatHeader     back · room name (+ bell-slash if you muted it) · subtitle · options (→ Room info)
RoomLeftState       instead of everything below, while you are not in the room
RealtimeStatusBanner
RoomGuidelinesBanner  once per room until "Got it" — in the column, never over a message
FlatList
  SystemNotice      day separators AND system messages — same shape on purpose
  ChatBubble        inbound (tail bottom-left) / outbound (tail bottom-right)
  BroadcastNotice   announcement / sponsored — full width, no tail
  TypingIndicator   ListFooterComponent, at the end of the feed
reply bar           when replying
ChatComposer        floating pill
message menu        long-press — a step of the app's one sheet (lib/sheet.ts)
ActionTray
```

**Room info** (`app/chat-info/[id].tsx`): the room, its members as the room
shows them (pseudonym + the bubble's own mark; tap opens the same gated profile
the Grid opens), then four rows:

- **Mute notifications** — 1 hour, 8 hours, until tomorrow (8am), or until you
  turn it back on (`POST/DELETE /chat/groups/:id/mute`). Silences the room's
  pushes to you and nothing else; nobody is told. The row says until when, and
  the sheet offers Unmute. Not the organiser's mute (`room_state: 'muted'`,
  which stops you posting), so the chat header and the Banter row show a
  bell-slash glyph rather than the word.
- **Community guidelines**.
- **Report this room** (`POST /chat/groups/:id/report`) — for what no single
  message shows: a pile-on, a host letting it happen. *Report this event* moved
  out: the event page has its own, and two report rows here made a moderator
  guess which one was meant.
- **Leave room** — a confirmation that says you stop getting its messages and
  can rejoin by checking in again; then back out to the Banter with a toast.

Mute and left state live in `lib/roomMembership.ts`, a small store every
screen reads: the Banter list and `GET /events/:id/chat` write the server's
`mute`, Room info writes what it changes, and a room left on this phone drops
out of the Banter at once.

**Somebody not in the room.** Leaving is enforced by the server: history is
refused (403), posts and reactions answer `LEFT_ROOM`, the socket join is
refused, and `GET /events/:id/chat` answers `LEFT_ROOM` with the `chatGroupId`
instead of rejoining you. The room draws `RoomLeftState` in place of the feed
and composer — *You left this room* when the app knows you did, *You're not in
this room* for a plain 403 (which is also what a leave made on another phone
looks like) — with **Rejoin** (`DELETE /chat/groups/:id/leave`). The server's
refusal (banned, closed, locked) is the toast when a rejoin is refused. A send
or reaction refused with `LEFT_ROOM` turns the screen into the same state.
The Room's chat dock says "You left this room's chat. Open it to rejoin."

**The header's subtitle** is the event's title when the room is named
something else. Most rooms are named after their event, and repeating the
title said nothing, so then it is "38 in the room" (from the room list's
`memberCount`, less anyone who leaves while you watch — `chat:memberLeft`), or
nothing until that is known. Room info's member list drops people on the same
event.

**The message menu** offers a reaction row (the six `CHAT_REACTIONS` the
server accepts — optimistic, rolled back with a toast if refused), Reply, Copy,
and Report on other people's messages only. A message still sending offers Copy
only; it has no id to reply or react to yet.

**A send that fails stays.** The bubble is marked *Not sent · Tap to retry*
under it, in `destructive`; tap resends, long-press offers Try again, Copy and
Delete. The server's reason is a toast. Both screens do this, and a refresh
keeps these local messages rather than replacing the list whole.

**History that fails to load** says *Couldn't load this chat* with Try again —
never the "start the conversation" empty state, which is an invitation to talk
into a thread that may hold a month of messages.

---

## The tail is the whole idea

Every bubble corner is 24 except one, which is 4: **bottom-left inbound,
bottom-right outbound**. That single square corner points the bubble at its
sender, and it is why the two directions do not need a colour difference to be
told apart — though they have one anyway (`#1B1919` in, `EMBER.surface` out).

Backwards, it reads as *wrong* rather than as *different*: the message appears
to point at the wrong person.

---

## Four places the build departs from the frame

The frame was drawn for a **named, public, media-rich community chat**. What was
built is an **anonymous, text-only room**. Every delta below is that one
difference showing up somewhere.

### 1. Avatars are marks, never faces

The frame draws photographs — "Julian Ember", "Sarah Chen". This room is
pseudonymous until you reveal yourself (`app/room.tsx`, `setMatchPreferences`),
so a photo would undo the thing that screen exists to protect.

`pseudonymAvatar(markSeed(senderName, room:sender))` gives a colour and a
creature — seeded on **the pseudonym**, the one rule every surface follows
(`lib/pseudonymAvatar.ts`): the Grid's `Face`, Room info, the Banter and the
profile hero all seed on the name, so one person is one creature everywhere in
the room. A placeholder name ("Attendee") falls back to room + sender. When the
pseudonym's noun is an animal the disc draws it — Cosmic Panda is a panda.

Flat fill, where the Grid's disc is a `LinearGradient`: a gradient is a native
view, and the Grid pays for three on screen where a chat would pay for thirty.

### 2. There is no media card

`1141:5556` draws a shared photo with a caption and an expand button. Nothing
backs it: `Message` has no media field, and the decision was that **attendees
post no media** — only sponsored broadcasts may carry it.

### 3. The composer has two fewer buttons

`1141:5584` (a `+`) and `1141:5590` (an emoji face) are drawn and not built:

- **`+` attaches media** — see delta 2. A button that opens a picker whose
  result the server rejects is worse than no button.
- **The emoji face is a web control.** Every mobile keyboard already has an
  emoji key; this would open a second, worse picker over the one the platform
  gives away.

### 4. The tab bar is ours, not the frame's

The frame draws `Feed · Explore · Create · Circles · Me`. Navigation was settled
separately as `Pulse · Going · [Blend'n] · Banter · Me`. The frame's bar is not
a decision this screen gets to reopen.

---

## Two things in the build that are in no frame

### Broadcasts

`BroadcastNotice` — an organiser announcement or a sponsored message, arriving
down the same socket as a `chat_messages` row with a `message_type`.

**Full width, no tail, no avatar.** Every other thing in the feed is inset on
one side, so a bar spanning both margins reads as "not somebody talking to you"
before a word of it is read.

**Sponsored is labelled, never disguised.** A paid message styled like an
organiser's is an advert wearing the venue's voice. Announcement takes the warm
accent; sponsored takes a cooler, quieter treatment so it cannot borrow the
room's own colour.

### Reply quotes, edits, reactions

All three existed on the old screen and none is in the frame, so they were
carried across rather than redesigned:

- the **quote sits inside the bubble**, where the old screen put it above —
  outside, it read as its own message from the person being quoted, two bubbles
  for one thing said once
- **"edited"** is on the bubble, not beside the timestamp: it is a fact about
  the words, and the header is about who and when
- **reactions show the count only, never who** — who reacted is exactly the kind
  of thing this room does not disclose

---

## Typing lives in the feed, not above the composer

The old screen pinned a typing strip between the list and the input. Wrong
place: it is a thing happening *in the conversation*, and pinned it was equally
present whether you were reading the newest message or two hundred back — a note
about right now, hovering over history.

`1141:5574` puts it at the end of the feed, indented 56 (a 40pt avatar plus its
16pt gap) so it lines up with the message about to arrive.

---

## Open asks for the designer

1. **The event context banner (`1141:5504`) is not built, and needs decisions
   before it can be.** It draws three things the product cannot currently back:
   - **"STARTS IN 02:44:12"** — a countdown to the doors. There is no pre-event
     chat; the room is live-and-after only. Should this be **ENDS IN**, against
     the 24-hour window closing?
   - **A stack of three faces and "+121"** — real photographs of attendees, in a
     room whose premise is that you are anonymous until you choose not to be.
   - **"Join 124 others discussing the upcoming performance"** — framing that
     only makes sense before the event.
2. **The media card (`1141:5564`) needs a decision before a payload.** See
   delta 2.
3. **The `+` and emoji buttons** — see delta 3.
4. **Broadcasts have no frame at all.** `BroadcastNotice` was derived, not
   designed, and it is the one thing in the room that carries commercial weight.


---

## Direct messages

`app/private-chat/[conversationId].tsx`, in **no frame** — the design covers the
room and the conversation list, not the thread. It renders the same
`components/chat/` pieces with `variant="direct"`.

### Three things a DM does not need

**No avatar and no name.** A DM has exactly one other person in it. A disc and a
name on every inbound row repeat the screen's own title once per message, and
halve the width of the column to do it. The meta row is just the time.

**No broadcasts.** Nobody announces anything to a conversation of two.

**No reactions or replies.** Both exist in the room and neither is in the DM's
payload — `PrivateMessage` has no `reactions` and no `replyTo`. Not dropped;
never there.

### One thing only a DM has

**Read receipts**, on your own messages. `sent` is a grey `✓`, `read` an accent
`✓✓` — a colour change rather than a glyph you have to count.

**The room deliberately has none.** Twenty people read at twenty different
times, so a tick there would either lie or need twenty answers. A test pins
that the room passes no `receipt` at all.

### The reveal, and what it means for the bubble

A DM is pseudonymous until both people reveal, except a message request, where
real names apply throughout. The bubble does not decide any of that — it draws
`reveal.displayName`, and the server decides what that is.

### Long-press copies anything, reports only theirs

Every row opens the menu, and every message can be copied. Report is on their
messages alone: reporting your own message is not a thing. The long press used
to be report-only and `undefined` on your own rows, so nothing in a DM could be
copied and a long press on your own message opened nothing.

### The header opens their profile — once they are a name to you

The avatar and name are one target. It is live for an accepted message request
and for a match who has revealed; before that, a profile would be the server's
flat "Attendee" or more than the conversation says, so the header is not a
button. The options menu needs the conversation record (its copy turns on
whether they know who you are), so if that did not load it says so and offers
Try again rather than acting on a guess.
