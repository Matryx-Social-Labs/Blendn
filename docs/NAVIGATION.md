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

| Your state | Button | Tap | Built |
|---|---|---|---|
| Checked in | gradient, slow pulse, unread badge | The Room | ✅ |
| Inside the geofence, not checked in | gradient, stronger pulse | check in to that event | ⏳ needs the presence monitor |
| Event today you are going to | outline | that event | ⏳ needs `todayEventIds` |
| Nothing on | flat, logo only | "what's on tonight near you" | ⏳ opens The Room's empty state today |

The four states and their precedence live in `lib/roomButton.ts` with tests. The
two unbuilt rows are a matter of feeding it more inputs, not of changing it —
`roomButtonTarget` already takes `insideEventId` and `todayEventIds` and orders
them correctly.

**`insideEventId` stays absent until the presence monitor is mounted**, on
purpose. Feeding it a raw distance check would make the most prominent control
in the app flicker between "Check in" and "What's on" while somebody stands
still, which is worse than being slow to notice them arrive.

**The last row is the one that decides whether this works.** A centre button with
nothing behind it is a dead control in the most prominent position on the screen,
which is the failure this project has spent several PRs removing elsewhere. It
gets a real destination: the two or three nearest events starting soon.

**The geofence states must come from `lib/presence.ts`**, not from a fresh
`isInside()`. That module already carries the `max(150m, radius/2)` margin, the
three-readings-over-ten-minutes hysteresis and the 30-minute reprieve, and it is
tested. A naive distance check makes the button flicker between "check in" and
"nothing on" while somebody stands still.

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
