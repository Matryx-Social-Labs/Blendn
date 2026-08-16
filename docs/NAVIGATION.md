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

| Your state | Button | Glow | Tap |
|---|---|---|---|
| Checked in | gradient, unread badge | **steady ring** + slow breath | The Room |
| Inside a running event's fence, not checked in | gradient | slow breath only | that event |
| Saved event today, not there yet | gradient | none | that event |
| Nothing on | gradient | none | nearby events |

All four are live. The states, their precedence and the event selection are in
`lib/roomButton.ts` with tests.

**Gradient in every state**, as the frame draws it. It used to be gradient only
when something was live, on the reasoning that a permanently glowing button is
one people stop seeing. That was right while this was a *status light*. It is the
Blend'n mark now — the brand's one fixed point in the app — and a logo that
changes colour depending on whether you are near an event is not a logo. The
status it used to carry is in the badge, the glow, and where the tap goes.

### The ring is the checked-in state, and it is not decoration

The Pulse used to carry a **"You're checked in"** strip: a section header, a
carousel of full-width cards and a Check out pill. About a third of the first
screen, permanently, to say one bit of information. It is gone, and this button
is where that bit went.

Which puts a requirement on the glow that did not exist before. `roomButtonPulses`
is true for **both** `live` and `checkin`, so as long as the glow was only a
breath the button looked identical whether you were in a room or merely standing
outside one. Fine while the strip named the event. Not fine once this is the only
signal. So `roomButtonGlow` splits them:

```
invite   a breath                        "there is a room here, come in"
live     a breath around a steady ring   "you are in it"
```

**The ring is static on purpose, and the reason generalises: motion cannot carry
a state.** It is invisible in a screenshot, invisible to anybody who has turned
motion off at the OS level, and invisible to anybody not looking at the instant
it swells. A ring that is simply always there is legible at a glance and survives
all three. The breath is the invitation; the ring is the status.

Drawn as a separate absolute view rather than a border on the button, because RN
grows borders **inward** — a border on `centreButton` would shrink the gradient
and the mark sitting on it, the same arithmetic that made the Banter's unread dot
an 8pt core inside a 12pt footprint. It is `accent`, not `gradientFrom`: the halo
behind it is `gradientFrom`, and a ring the colour of its own glow disappears
into it at the top of every breath.

**Check out is in the Room's top bar.** The strip held the only one-tap check
out, so it moved with the signal rather than being dropped — one tap from the
ringed button. The Pulse's long-press tray also offers it now; it used to offer a
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

## The Room — what the centre button opens

Frame `1141:4951` draws a `Grid | Join Chat` segmented toggle, and that is the
screen:

| Segment | What | Built |
|---|---|---|
| **Grid** | ranked roster, filters, cards → View Dossier, **like** | `MatchScreen.tsx` |
| **Chat** | the event's anonymous room chat | `chat/[id].tsx` |

Matchmaking is not a third segment. It **is** the Grid: the ranking, the
shared-interest chips and the "both open to dating" tag are the matchmaking
output, computed server-side and already rendered.

`RoomVisibilityBanner` mounts here, above the toggle so it shows in both
segments. `event-preferences/[eventId]` is the room's own settings, reachable
from the Grid.

The presence monitor is **not** here — it mounts at the root, because leaving a
venue should be noticed whether or not the room is the screen you have open.

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

Today it is the old `app/interested.tsx`, moved into the tab and stripped of the
back chevron it carried as a pushed route. Attending and past-with-rating are
the next two sections, and **`rate/[eventId]` — built, linked from nowhere —
belongs in the third.**

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
