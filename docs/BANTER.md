# The Banter — designer notes

Frame `1141:5247` on the **Updates** canvas. The screen the app shipped before
this was a different design entirely; it was deleted rather than adapted.

Components live in `components/banter/BanterSections.tsx`. The screen is
`app/(tabs)/chat.tsx`. `app/(tabs)/__preview-banter.tsx` renders the pieces
against fixtures — deep-link `exp+blendn:///__preview-banter` — so layout can be
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

| | Frame | Built |
|---|---|---|
| Top bar | `1141:5345` | Same 64pt bar as the Pulse and the Scene. Title is now a prop, so it reads **The Banter** in `#FF906D` rather than the wordmark. |
| Search | `1141:5249` | `#211F1F`, radius 48, px 20 / py 12, gap 12. |
| Rail | `1141:5261` | 64pt discs, gap 24, bleeds the 12pt page gutter. **Heading changed** — see below. |
| Requests | *not in frame* | Added. See below. |
| Recent | `1141:5292` / `1141:5304` | One list. A person is a photograph; a room is a `#211F1F` disc with a glyph. |

### Type and colour

Taken from the frame, unchanged: row radius 32, padding 16, gap 16. Read rows
carry a `rgba(73,71,71,0.1)` hairline and the unread row does not, which is what
makes the unread one read as a card and the rest as a list.

The EVENT badge is `#F79EFF` on `#570066`, 10/15.

---

## Three places this departs from the frame

### 1. The rail says "Live now", not "Pinned"

**Nothing in the product can pin a conversation.** No column, no endpoint, no
gesture. The rail could not be built as drawn.

Filling it from "most recent" was the obvious cheat and is worse than leaving it
empty: it would duplicate the top of the list directly beneath it, under a label
that lies about why those items are there.

What *is* pinned — by circumstance rather than by a gesture — is **the event you
are standing in**. That room is temporary, anonymous, and only useful while you
are there. It is the one conversation that belongs at the top without anyone
putting it there, and the only one that stops being relevant on its own.

So the rail keeps the frame's component, its 64pt discs, its 24 gap and its
gutter bleed, and changes only the heading and the icon (`sensors`). Those rooms
are **lifted out** of Recent rather than repeated in it.

**If pinning is ever designed**, this rail is not free — it is occupied. A
pinned rail and a live rail are two rails, and the screen would need to say
which is which.

### 2. There is no compose button

The frame has a 56pt gradient FAB at `1141:5360`. Removed by decision: a DM
starts from a person, and every route to one already goes through a profile. A
floating button opening an empty picker is a second way to do something that
already has a first way.

### 3. Message requests have a card the frame does not have

A request is the one row in an inbox that **cannot be opened** — tapping it has
to mean *accept* or *decline*, not *read*. Building the frame exactly would have
left the endpoint in place with nothing calling it.

`BanterRequest` is made from the frame's own parts: same 32-radius card, same
avatar disc, same two lines of type. It adds two 44pt buttons. **Decline is on
the left, accept on the right** — the destructive one is not where your thumb
lands by default, and accept carries the gradient because it is the affirmative.

**This needs a designer pass.** It is built to be consistent, not to be
designed.

---

## Two measurements that were wrong and are worth knowing

### The unread dot's ring is outset

Frame `1141:5296` rings the accent dot with `shadow: 0 0 0 2px #0F0E0E` —
**outside** the 12pt circle, total footprint 16pt.

React Native has no outset border. `borderWidth: 2` grows *inwards*, so writing
it the obvious way gives an 8pt accent core inside a 12pt footprint — and that is
not a cosmetic difference:

The dot sits at the **bounding box's** top-right corner, and the avatar is a
circle, so that corner is empty space. From the 56pt avatar's centre the dot's
centre is `√(22² + 22²) = 31.1` away, against a radius of 28 — the dot is centred
*outside* the photograph and only its inner edge reaches back in.

| | Inner edge reaches | Against radius 28 |
|---|---|---|
| 8pt core (inset border) | 27.1 | grazes by 0.9pt — reads as floating |
| 12pt core (the frame) | 25.1 | bites 2.9pt in — reads as attached |

Built as a 16pt `#0F0E0E` ring holding a 12pt accent circle, offset `-2` on both
axes so the **accent** — not the ring — lands where the frame puts it.

### The pinned rail's presence dot is *not* the same

Frame `1141:5265` is a single 16pt "Background+Border" rectangle: the ring is
part of the 16, not outside it. So `borderWidth: 2` is correct there and wrong
three lines away in the same file. Both are pinned by tests.

---

## Still open

- **Search does nothing.** The field is drawn and is not wired to a query.
  Needs a decision on what it searches: conversation titles only, or message
  bodies too (which is a server endpoint that does not exist).
- **The top bar's menu button** (`1141:5345`, leading slot) has nowhere to go.
  Omitted.
- **No unread count anywhere on a row.** That is the frame's decision and a good
  one — the row reads as unread from across the screen instead of by finding a
  number on it, and the total that matters is on the bell. Worth keeping in mind
  if a count is ever requested.
