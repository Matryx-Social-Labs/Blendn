# The event room chat

Frame `1141:5498` — "Event Community Chat", 390 wide, in the **Updates** canvas
of `HO0UnAEV5djzo0h4q7Y2vi`.

**Route:** `app/chat/[id].tsx`. **Presentation components:** `components/chat/`.

Reached from The Room's `Grid | Join Chat` toggle, which navigates here rather
than swapping a pane — the chat is one place you are standing in, not a tab.

---

## Composition

```
GroupChatHeader     back · room name · subtitle
RealtimeStatusBanner
FlatList
  SystemNotice      day separators AND system messages — same shape on purpose
  ChatBubble        inbound (tail bottom-left) / outbound (tail bottom-right)
  BroadcastNotice   announcement / sponsored — full width, no tail
  TypingIndicator   ListFooterComponent, at the end of the feed
reply bar           when replying
ChatComposer        floating pill
message menu        long-press
ActionTray
```

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

`pseudonymAvatar(senderId)` gives a colour and a creature, stable for as long as
somebody is that pseudonym — the same treatment the Grid's discs get. When
somebody *has* revealed, the name is simply their real one; **the server decides
that, not the component.**

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
