# Navigation

Settled 2026-08-15. The bar is the one component every screen embeds, so this
is written down rather than left in three disagreeing frames.

```
  Pulse      Going     [Blend'n]     Banter       Me
```

---

## Why not the frames

Three frames drew three bars: The Pulse had 4 links + a raised centre, The Grid
had 5 items starting with a share glyph, and The Banter had
`Feed · Explore · Create · Circles · Me`.

The Pulse and The Banter actually agree on the **shape** — five slots, raised
centre — so the conflict was narrower than it looked. What none of them survive
is the built app:

- **`Create` is not an attendee action.** Events are authored on the organiser
  dashboard.
- **`Circles` is the social graph**, and there is no friends model in the schema.
- **Neither bar has a slot for Chat or Match**, both of which are built and are
  the payoff of the whole product loop.

## The thing the frames miss

**The app has two modes, and they are mutually exclusive.** You are either
looking for an event, or you are in one. A static bar has to pretend the second
is always available.

That is exactly what the built app did: `components/screens/MatchScreen.tsx` —
1778 lines, the room roster — sat behind a permanent **Match** tab and rendered

> **Not Checked In Yet** — Check in to an event to unlock recommendations and
> nearby attendees.

roughly 99% of the time. A quarter of the navigation spent on a screen that says
*come back when you are somewhere else*, and the 1% when it is full is the entire
reason the product exists.

So the centre control is **not an action** (scan, create, post). It is the
**mode switch**, and because the mode is bound to time and place it doubles as
the status indicator. The screen is called The Pulse; the button is the pulse.

---

## The centre button

| Your state | Button | Mark | Tap |
|---|---|---|---|
| Checked in | gradient, unread badge | **green dot** (the badge stands in while it shows) | Blend'n → Room |
| Inside a running event's fence, not checked in | gradient | white dot | Blend'n → Tonight, with the venue pass |
| Saved event today, not there yet | gradient | none | Blend'n → Tonight |
| Nothing on | gradient | none | Blend'n → Tonight |

**Updated 2026-09-28: the tap always opens the Blend'n screen.** It used to go
to a different place per state (the Room, the event page, the nearby list), so
the centre of the app had no home until you were checked in. The screen reads
your state itself; the states still decide the dot and the badge.

All four are live. The states, their precedence and the event selection are in
`lib/roomButton.ts` with tests.

**Gradient in every state**, as the frame draws it. It used to be gradient only
when something was live, on the reasoning that a permanently glowing button is
one people stop seeing. That was right while this was a *status light*. It is the
Blend'n mark now — the brand's one fixed point in the app — and a logo that
changes colour depending on whether you are near an event is not a logo. The
status it used to carry is in the dot, the badge, and where the tap goes.

### The dot is the checked-in state, and it does not move

The Pulse used to carry a **"You're checked in"** strip: a section header, a
carousel of full-width cards and a Check out pill. About a third of the first
screen, permanently, to say one bit of information. It is gone, and this button
is where that bit went — so being in a room has to look different from standing
outside one. `roomButtonGlow` splits them:

```
invite   a white dot   "there is a room here, come in"
live     a green dot   "you are in it"
```

It was a halo breathing out to 1.42x around a steady ring, over a warm bloom
under the button. Glow on glow, and it read as generated. Live products mark
live with a still dot (Open) or a plain label (HBO Max), and so does this.
**Motion cannot carry a state:** it is invisible in a screenshot, to anybody who
has turned motion off, and to anybody not looking at the instant it swells. The
dot fades in once when the state starts and then simply stays.

It is an 8pt core in a 2pt ring of the page colour, cut out of the disc's
top-right edge, drawn as its own absolute view — RN grows borders **inward**, so
a border on `centreButton` would shrink the gradient and the mark on it.

**Check out is in the Room's top bar.** The strip held the only one-tap check
out, so it moved with the signal rather than being dropped — one tap from the
button wearing the green dot. The Pulse's long-press tray also offers it now; it used to offer a
way in and no way out.

**Every state goes somewhere real**, which is the whole reason this is a mode
switch rather than a link. A centre button that did nothing in three of its four
states would be a dead control in the most prominent position on the screen.

**Where the inputs come from.** The live room is polled every 30s — the socket
knows about messages, not check-ins, and a check-out can happen on another
device or from the presence monitor. The other two come from `lib/roomSignal.ts`,
published by The Pulse out of a fetch it was already making: that screen asks for
events with a location and gets `distance` back on every one. Same shape as
`lib/unread.ts`. Deriving them in the bar would mean a second location permission
dance and a second copy of the events list on a timer.

**Two unit systems meet here.** `distance` is kilometres and `check_in_radius` is
metres. The conversion lives in `pickInsideEvent` with a test on it, because that
exact mismatch has already shipped once in this codebase.

**No margin on the check-in offer, deliberately.** `lib/presence.ts` widens the
fence generously in the other direction because a false *eviction* is harmful. A
false *offer* is not: the server re-validates the GPS on the real check-in and
refuses. So the button asks the plain question and lets the real gate be the
gate.

## The Blend'n screen — what the centre button opens

`components/blendn/BlendnScreen.tsx`. Redesigned 2026-09-28 (research: Refero,
60fps.design — see `tasks/todo.md`).

**An overlay, not a route.** It is hosted by the tab layout, over the tabs and
the bar and *under* the root stack (`lib/blendnOverlay.ts`). As a modal route,
anything pushed from it went underneath it on iOS, so Join Chat had to replace
the room to be seen. Now a profile, a DM or the room chat push on top, and Back
returns to the room. `/room` survives as an address that opens the overlay.

**It opens out of the button** (`RoomStage`): a disc grows from the 56pt button,
turning from accent to page colour, and the content fades up. Drag down (from
the top of the scroll) or tap the chevron and it closes back into the button.

Two modes, chosen from your active check-in (`lib/useRoom.ts`):

| Mode | What |
|---|---|
| **Tonight** | A swipeable deck of what is on, yours first then nearest (the Me tab's photo stack, `SwipeDeck`). At a venue, a docked pass: **hold to check in** (`HoldToConfirm`), which runs the event screen's own flow (`lib/useCheckInFlow.ts`) and turns into the Room. A "N here share your taste" teaser with blank faces (`room-preview`, never under 3 people). |
| **Room** | LIVE, a rolling headcount, the faces who just walked in, and your time in the room set around your photo. **Meet next**: the server's top picks, three at a time, reshuffled every 15 minutes on a clock every phone agrees on. **Everyone here**: a 3-column face grid (virtualised), one reason per face; tap for the person card, double-tap to like. The room chat is docked at the bottom (last two lines + arrivals/waves/matches), pull up for the full chat. |

The person card has three verbs: **Like** (private until mutual; the accent),
**Wave** (they are told at once, as they see you; one per pair per 10 min) and
**Message** (a connection request, which reveals you). A mutual like plays the
match moment: both faces meet, three hearts arc from you to them, one haptic
when they land. Faces only where earned — theirs is a photo only if they
revealed, yours only if you did.

`RoomVisibilityBanner` still sits under the header; Check out and the room's
settings are in the top bar. The work-field filter chips of the old Grid are
gone: a face grid of one room does not need them.

The presence monitor is **not** here — it mounts at the root, because leaving a
venue should be noticed whether or not the room is open.

---

## The tabs

| Slot | Holds | Notes |
|---|---|---|
| **Pulse** | events feed, search, nearby, nightlife | `app/(tabs)/events.tsx` |
| **Going** | saved, attending, past → rate them | rehomes `interested.tsx` and `rate/[eventId]` |
| **Banter** | DMs and event rooms in one inbox | `app/(tabs)/chat.tsx` — already holds both |
| **Me** | profile, edit, settings, blocked, **your code** | `app/(tabs)/profile.tsx` |

**`Match` is deleted.** Its screen is the Grid segment of `/room`. The two
things that pointed at it — the match push notification and the Banter empty
state's "Discover People" — now open the room.

`/room` is presented as a **sheet**, not a push: it is a mode you are in for the
length of an event rather than a page in a stack, and swiping down out of it
matches the chevron the screen draws.

### Why Going and not Explore

Not a design argument, a catalogue one. A browse-by-category surface over ~20
events in one city returns three results per category and reads as broken.
Explore is a worse Pulse until there is volume, and Pulse already carries
Nearby, Nightlife and search.

Going is about **your** events rather than the catalogue, so it is useful from
the first day and grows on its own.

Top to bottom (`goingItems` in `lib/savedEvents.ts`):

- **Next up** — your soonest `going` or `waitlisted` RSVP, from
  `GET /me/rsvps`, as one large card: the photo with nothing on it, then when
  (`nextUpLabel` in `lib/pulse.ts` — "Happening now" with a still green dot,
  "Tonight · 6:30 PM", "Tomorrow · …", "Sat, Oct 4 · …"), title and place, a
  waitlist or cancelled tag, and Directions / Calendar / Share.
- **The rest of your RSVPs** — under day headings (`groupByDay`), one
  `UpcomingCard` row each, the way the Pulse's Upcoming reads; a waitlist place
  or a cancellation says so on the row. No "Going" heading: the screen's title
  is it.
- **Saved** — your hearts, minus anything RSVP'd above, as rows; the heart
  removes one (with Undo).
- **Past** — events you attended that have ended, from `GET /me/attendance`,
  each row with **Rate people you met** → `rate/[eventId]`. The event screen's
  CTA also opens it once an event you attended is over.

A populated Going has no accent; only the empty and error states' one button
is orange. A server that predates `/me/rsvps` answers 404 and the tab simply
starts at Saved.

When the catalogue justifies Explore, **Going moves into Me** — it is your data —
and Explore takes the slot. No re-drawing.

### Where scanning lives

Split by where each half is used:

- **Your code is on Me.** It is your identity; that is where people look.
- **The scanner is in the Room.** You scan someone while standing next to them,
  and standing next to someone is what being at an event means. A scanner on the
  profile tab is one you go hunting for at the exact moment you are face to face
  with a stranger.

Neither ships until the social graph does. Nothing about codes, friends or
mutual connections exists in the schema yet.
