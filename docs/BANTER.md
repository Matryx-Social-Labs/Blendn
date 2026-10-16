# The Banter

**Design:** Claude Design, `guidelines/flow-5/` — the Banter frames
(`flow5.js` `banter`), #27 in `flow5-proto.js`, and the deltas R3-D5 (5.6,
5.7, 5.8, 5.11), R3-0 (C5, C11) and R2-D2 (crews, invites, Blends, the bell).
See `docs/CHAT.md` for the precedence.

The screen is `app/(tabs)/chat.tsx`; its pieces `components/banter/BanterParts.tsx`;
its data `lib/useBanterInbox.ts` (rooms, crew chats and Blends, DMs, requests —
loaded together, cached, kept live) and `lib/useCrewInbox.ts` (crew invites,
emblems, Blend sides); its pure helpers `components/banter/inbox.ts`.

---

## Top to bottom

| | |
|---|---|
| **Header** | Bar glass: "Banter", then the bell (Notifications), search, Mark all read (dimmed when no DM is unread). Search opens a field under it that filters in place. |
| **Live now** | The room you're standing in as the hero: its cover under a scrim, a still Live badge, a rolling "N in the room", the last line — or "Locked by the organiser · read only". An open Blend under it: the two sides' emblems, "Open now · closes 4 AM". |
| **Requests** | Solid cards that need an answer: the asker, their note verbatim (two lines), the time, ⋯ (Block · Report · Cancel), then Decline and Accept at 48 — Decline first. Accept's `H.success` comes with the server's answer and opens the DM. A crew invite is the same card with Join (the consent screen) and Decline. The Board's asks sit beside them. |
| **Crews** | Crew chats, each its emblem in a rounded square. |
| **People** | DMs, round: a photo once they're a name to you, else their creature. "Mark all read" on the heading. "Asked to reveal names" is a chip until you open the thread. |
| **Past rooms** | Rooms you're not standing in, as their covers. A locked or muted room says so as a status chip, never as speech. |

Rows are 64 tall with no hairlines. **Unread is three changes and a dot,
never a height change**: line 2 goes white and medium, the time white, and the
dot pops into a slot every row keeps. Muted is a bell-slash (rooms only — a DM
can't be muted). Line 2, in order: a status chip; "Not sent · Tap to retry"
(with a circle-alert, never colour alone); "Draft · …"; the last message ("You:
…", "Cosmic Panda: …"; a photo is "Photo", an announcement "Announcement ·
Toit: …", a sponsored message never).

**Swipes** (5.11): a room row — Mute · Leave (the confirm plays
`H.destructive`); a crew row — Mute; an unread DM — Mark read.

**Reorder** (#27): a row a message lands in moves on `M.settle`. With a finger
on the list the order holds and a glass "↑ New" pill offers the way up.

**States:** loading (four rows at the real geometry — round, square, round,
round); empty ("No conversations yet", Explore events); failed ("Couldn't load
your chats", Try again); partial failure (one line above the list); a search
with nothing ("No chats match …", Clear search); offline and paused banners.

## Anonymity in the inbox

A DM from a match carries the pseudonym the match card showed; the server
sends no name and no photo until that person reveals (`lib/conversation-identity.ts`
in blendn-admin), so the inbox can't leak one. An unrevealed match is drawn as
their creature, seeded on the pseudonym — never on an id.

## Still open (server)

- **Room read state:** no endpoint marks a room read, so Mark all read covers
  DMs only, and a DM's "Mark read" swipe reads the thread's first page (which is
  what opens it on the server).
- **Previews:** the server writes "📢 [Announcement from …]" and "[image]" into
  the content and can't say a message was a poll (SCRUM-625).
- **Crew emblems** come from `GET /crews`; `GET /chat/groups` could carry
  `emblemSeed` on its `rooms`.
- **Message-body search** needs an endpoint; search covers what the list holds.
