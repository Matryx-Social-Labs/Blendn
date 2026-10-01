# The Banter — designer notes

Frame `1141:5247` on the **Updates** canvas. The screen the app shipped before
this was a different design entirely; it was deleted rather than adapted.

Components live in `components/banter/BanterSections.tsx`, pure helpers in
`components/banter/inbox.ts`. The screen is
`app/(tabs)/chat.tsx`. `app/preview/banter.tsx` renders the pieces
against fixtures — deep-link `exp+blendn:///preview/banter` — so layout can be
looked at without a login, a socket or a conversation that exists.

---

## What the screen is for

Two kinds of conversation, and they are not the same kind of thing:

1. **Matches.** A direct message with someone you met. Permanent, named, with a
   face.
2. **Event rooms.** The temporary, anonymous room for an event. It exists while
   the event does. Everyone in it is a pseudonym and an animal (see
   `lib/pseudonymAvatar.ts`), which is the point — you can talk to the room
   before you have decided to talk to a person.

A room you are **checked into right now** is the live one. That distinction
drives the layout.

---

## Layout, top to bottom

| Section | Shown when | Built |
|---|---|---|
| Top bar | always | `PulseTopBar` "The Banter" + the notification bell. No menu button, no compose. |
| Search | always | `BanterSearch`, a `surface` pill. Filters titles, previews and a room's last sender in place. |
| **Live now** | you are checked into a room | One full-width row per room: `surfaceSunken`, radius `md`, padding 16. 56pt square event cover (radius `sm`; a glyph on `surface` when there is none), title, and a still 8pt `success` dot + "You're here · N in the room" (count left off when 0). Rows 12 apart. Tapping opens the room. |
| **Requests** | a request is pending | Heading + count in `meta`. Each request is a conversation row — sender's photo (or a glyph disc on `surface`), name, time, two lines of message — with **Decline** (`surface`) and **Accept** (`textPrimary` fill, `bg` text) 32pt pills under it, then a 32pt `surface` **More** disc (Block, or Report — which also declines). The photo and name open the sender's profile. |
| **The Board** | you have a live board ask, either way | `components/board/BoardRequestsSection.tsx`, **placeholder design** (docs/PLACEHOLDER_SCREENS.md §6). Asks waiting on you as request rows with the asker's generated mark (never a photo), Decline / Accept — Accept opens the conversation it made. Your own asks under "YOU ASKED", quieter: *Waiting on them* + Withdraw, *They said yes*, or *Closed* — never "declined". |
| **Conversations** | always (headings hidden when empty) | Bucketed **Today / This week / Earlier** by last activity with `DayHeading`. "MARK ALL READ" on the right of the first heading. |

Checked-in rooms are **lifted out** of the conversations rather than repeated.

### A conversation row

Fixed height — 56pt avatar, 12 above and below, 16 to the text, **no
hairlines**. A person is round (photo, or the generated mark before they
reveal); a room is its event's cover in a square, radius `sm`.

- Line 1: name `bodyStrong`, time `meta` on the right.
- Line 2: one line of preview, `body` `textSecondary`, prefixed "You: " for your
  own message and "Name: " for someone else's in a room (their room
  pseudonym).
- **Unread** is three changes and never a height change: the preview goes
  `bodyStrong` `textPrimary`, the time goes `textPrimary`, and a 10pt
  `textPrimary` dot appears under the time. The dot's slot is reserved on read
  rows so nothing shifts when a row is read. No counts on rows — the total is
  on the bell.
- Someone asked you to reveal: the preview reads **"Asked to reveal names"** in
  `textPrimary` until you open the thread (this session; the server keeps the
  flag until you answer, so it returns after a relaunch).

### Timestamps

`components/banter/inbox.ts`, pure and tested: `now`, `5m`, `3h` (earlier
today), `Yesterday`, a weekday (`Tue`) within the week, `Oct 4` this year,
`Oct 4, 2025` before. Never the device locale's date format.

### States

- **Loading** — four skeleton rows at the row's geometry, round and square.
- **Empty** — no bucket headings; the glyph tile, "No conversations yet", and
  an "Explore events" accent button. Not shown when Live now or Requests has
  something in it.
- **Failed** — "Couldn't load your chats" + Retry. If one of the two lists
  failed and the other loaded, a `meta` line above says so.

### Colour

No accent on a populated inbox. **Accept** is the strong-neutral
(`textPrimary` fill, `bg` text): as the accent, a list of three requests was a
column of orange. The empty state's "Explore events" is that state's one
accent action. Unread is `textPrimary`, presence is `success`.

### Unread in rooms, and "Mark all read"

Room unread comes from `GET /chat/groups`' `unreadCount`, plus one locally for
each message someone else sends to a room you are not reading.

**Mark all read covers DMs only.** No endpoint marks a room read: the only
writer of `chat_group_members.last_read_message_id` is `GET
/events/[eventId]/chat`, and the room screen (`app/chat/[id].tsx`) reads
through `GET /chat/groups/[id]/messages`, which does not move it. Opening a
room clears its dot locally, but the next refresh can bring it back. **Needs
a server change**: have the messages GET (without `before`) advance the
reader's last-read, and add a group equivalent of `POST /conversations/read`
if rooms should join Mark all read.

---

## Why it departs from the original frame (`1141:5247`)

- **"Live now", not "Pinned".** Nothing in the product can pin a
  conversation. What *is* pinned, by circumstance, is the event you are
  standing in — temporary, anonymous, only useful while you are there. The
  frame's horizontal rail of 64pt discs became full-width rows so the room's
  name and headcount fit.
- **No compose button.** A DM starts from a person, and every route to one
  already goes through a profile.
- **Requests exist.** The frame has no slot for them; building it exactly
  would have left the endpoint with nothing calling it.
- **No hairlines, no taller unread row.** The frame ruled read rows and gave
  the unread one extra top padding; a list that changes height as you read it
  moves under your thumb.

---

## Anonymity in the inbox

A DM that opens from a mutual like carries **the pseudonym the match card
showed**. The real name appears only when that person reveals.

The gate is entirely server-side (`lib/conversation-identity.ts` in
blendn-admin): before a reveal, `name` *is* the pseudonym and `image` is `null`,
so the inbox cannot leak a name it was never sent. Every surface that names a
participant — the list, the thread, typing indicators, push titles — resolves
through the same function.

What the inbox can still get wrong is **drawing** that state. A null photo
through the ordinary avatar is an empty grey circle, which reads as a broken row
rather than as anonymity working. So an unrevealed match gets the generated
mark: the same `pseudonymAvatar` the Scene's attendee discs and the room use,
seeded on **the pseudonym**, so one person is one colour and one creature
everywhere they appear under that name.

Three states, and the middle one is the new drawing:

| Conversation | Name shown | Avatar |
|---|---|---|
| Accepted message request — never pseudonymous | Real name | Photograph |
| Match, not yet revealed | Pseudonym | **Generated disc** |
| Match, revealed | Real name | Photograph |

> **Never seed the mark with a user id.** That is stable forever and would
> rebuild exactly the cross-surface identity the pseudonyms exist to prevent.

## Still open

- **Message-body search** needs a server endpoint; search covers what the list
  already holds.
- **Room read state** needs the server change above.
