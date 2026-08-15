# The Pulse

The home screen. Frame `1141:4643` in Figma file `HO0UnAEV5djzo0h4q7Y2vi`,
canvas **🕓 Updates**. For designers, for testers, and for whoever changes it
next.

Design tokens are in [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md). The frame-by-frame
audit of all nine screens is [`HOMEPAGE_AUDIT.md`](./HOMEPAGE_AUDIT.md).

---

## The thing to know first

**The Pulse is a restyle, not a new screen.** `app/(tabs)/events.tsx` has been
the home screen for a long time and it does *more* than the frame draws:

| Frame draws | Screen already had |
|---|---|
| Featured | a featured carousel |
| Upcoming | Upcoming events |
| Nearby Experiences | Nearby Events |
| — | **You're checked in** (with check-out) |
| — | **Interested** |
| — | **Nightlife in `<city>`** |
| — | city picker, empty states, skeletons, offline banner, long-press preview |

So this work applies Liquid Ember to working, device-tested logic rather than
building from nothing. Nothing in that list was removed.

---

## What is built

| Element | Component | Backed by |
|---|---|---|
| "The **Pulse**" headline | `PulseHeader` | — |
| City + date line | `PulseHeader` | `GET /events/cities` |
| Search field | `PulseHeader` | `GET /events?search=` |
| "Featured" + VIEW ALL | `SectionHeader` | — |
| Featured cards | `FeaturedCard` | `events` with a cover image |
| "Upcoming" | `SectionHeader` | — |
| Upcoming cards | `UpcomingCard` | `events` |
| Card labels | `lib/pulse.ts` | `startTime`, `currentCapacity`, `distance` |

Every number on a card comes from a real column. The frame's `142 Joined`,
`1.2 mi` and `28` are invented values, but each has something behind it —
`currentCapacity`, `distance`, `startTime` — which is what separates these two
sections from the Nearby one below.

---

## Search: the first time this endpoint has had a caller

`GET /events` has accepted a `search` parameter since it was written, and
`EventsParams` in `lib/api.ts` has declared it. **No screen in the app had ever
sent one.** The frame's search field is therefore a missing capability, not a
restyle of an existing one.

Three things follow from it, and none are drawn:

1. **Typing hides the curated sections.** Hero, Interested, Featured, Upcoming,
   Nearby and Nightlife all disappear while a query is active, and the result is
   one flat list. Somebody who typed a venue's name knows what they want;
   scrolling them past five editorial rails to reach it is the screen ignoring
   the question it was just asked.
2. **An empty search is not an empty city.** Without a separate empty state, a
   misspelt venue name answers *"Coming soon to Bengaluru"* — telling somebody we
   have not launched in the city they are standing in, because of a typo. The
   search empty says "No matches" and offers **Clear search**; the city empty
   still offers **Change city**.
3. **350 ms of quiet before the request, and none before clearing.** Emptying the
   box is a request to see the normal screen again, and a third of a second of
   spinner to get back where you started reads as the app being slow.

---

## Where the build departs from the frame, and why

### 1. The gradient headline is a flat accent

The frame fills "Pulse" with the 135° gradient. React Native cannot gradient-fill
a glyph without `@react-native-masked-view`, which is a **native module** — every
tester would need a new dev client for one word.

The eight onboarding headlines already print their accent half in flat
`EMBER.accent` for exactly this reason, so this matches what shipped rather than
introducing a ninth treatment.

**For the designer:** if the gradient text matters more than the build cost, say
so and it becomes a dependency decision rather than a styling one.

### 2. The old top bar is gone

The screen carried `Hey Sagar! / Saarbrücken • Saturday, 15 Aug` with an avatar
and a gear — a bar that appears in no frame and did three jobs at once: greet,
choose a city, open settings.

The frame has `☰ Blend'n 🔔` and nothing else, because the screen's identity is
**"The Pulse" in 48pt underneath**. A bar that also announces itself competes
with the thing it sits above.

Replaced with avatar → profile, the wordmark, and one control on the right.
The greeting is gone. The city control moved into the headline block, where it
is larger and sits next to the content it scopes.

**The bell goes to settings.** There is no notification centre to open, and
settings is where push notifications are actually configured — a bell that opens
nothing would be the dead control this project keeps removing.

**For the designer:** if a notification centre is wanted, it needs a frame.

### 3. The city line is not in the frame, and it has to be

The frame has a headline and a search field, and nothing that says which city you
are looking at.

This screen filters by city, and the picker is **the only way out of an empty
state**: a city we have not launched in returns nothing, and refreshing will
never help. It now sits directly under the headline, where it reads as a subtitle
rather than a control bolted on.

**For the designer:** this needs a real treatment. It is load-bearing.

### 4. The prev/next arrows are absent, not inert

The frame puts a pair of round arrows beside "Upcoming". They belong to a
horizontal row; the frame draws Upcoming as a **vertical stack**, which they
would scroll nothing of.

`SectionHeader` only renders them when handlers are passed, so they are missing
rather than dead. A control that looks broken is worse than one that is not
there.

### 5. "VIEW ALL" only when there is more than is already shown

With four featured events and four on screen, it is a link to the same four.

### 6. The heart is added, and the frame has no place for it

The card this replaced had an interest toggle. The frame's Upcoming card has one
action — "Details".

Quietly dropping a control during a restyle is how a capability disappears
without a decision: saving an event is the whole of `event_favorites` and the
thing the "Interested" rail is built from. It sits opposite the category pill, so
the card's two actions are not adjacent — one opens a screen, the other is a
silent toggle, and a mis-tap between them is annoying both ways.

**For the designer:** where should this live?

### 6b. Featured shows only events with a cover image

The card is a photograph with words on it. Without an image it is a dark
rectangle with a headline — worse than not being featured. Those events fall
through to the Upcoming stack, which reads fine either way.

### 7. A row of one is not a row

The featured card is sized to let the next one peek, which is what tells
somebody the row scrolls. With a **single** featured event — which is every city
with a thin catalogue, so every city right now — that left a third of the screen
empty beside it, reading as a layout that failed.

One card fills the width. Two or more go back to peeking.

### 8. Card sizes are whole numbers, not the frame's arithmetic

The frame's featured card is 331.5 × 450 inside a 390 frame, which is a mask
artifact rather than a chosen size — and 450 is taller than the visible area on
the shortest phone we support once the sticky bar and tab bar are subtracted.

300 × 408 holds the ratio to within a percent and leaves the next card peeking,
which is what tells somebody the row scrolls.

### 9. Tags say the category, not a mood

The frame's pills read "SONIC VOID" and "EXCLUSIVE" — invented strings, in the
same family as the invented interest chips on the onboarding frames.
`categories[0]` is the real one and it is what every other surface groups on, so
a pill reading "Nightlife" is a filter somebody can act on where "SONIC VOID" is
a word.

### 10. Zero is not shown

"0 joined" reads as a verdict on the event, and every event is 0 for a while —
including, always, the first one anybody sees after we launch in their city. No
line reads as "this has not started filling up", which is the true statement.

Same rule for the venue: the old featured card printed *"Venue to be announced"*,
which is a **claim** — it says the organiser has not chosen one, when what
actually happened is that the response did not carry the field. Absent data gets
no sentence.

---

## Still not built

### The "Explore the Grid" card — deliberately cut

The frame's small card reads *"Discover 24 hidden gems within walking distance"*
with a **Launch Map** button. That is the venues map, which is deferred — and it
collides with The Grid, which is the post-check-in room screen. Two screens, one
name. See `HOMEPAGE_AUDIT.md`.

### The large "Nearby Experiences" card

Drawn as a restaurant with **Reserve Table** and *"+12 Friends are here"*. There
are no reservations and no social graph, so this section still renders the
existing Nearby Events list rather than the frame's card. When the social graph
lands, `+12 Friends are here` is the first thing that becomes real.

### The bottom navigation

Unchanged, and it is the open question. The frame's bar is
`Feed · Explore · [centre] · Circles · Me` — **the same five-item shape The
Banter uses**, so those two frames agree.

But that bar has no slot for **Chat** or **Match**, both of which are built and
working, and "Circles" is the social graph, which does not exist. The current
four-tab bar stays until that is decided.

### The floating action button

The frame has a contextual FAB above the nav. What it does is not drawn.
