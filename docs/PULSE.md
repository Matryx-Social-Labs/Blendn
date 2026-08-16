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
| — | ~~**You're checked in** (with check-out)~~ — removed, see below |
| — | **Interested** |
| — | **Nightlife in `<city>`** |
| — | city picker, empty states, skeletons, offline banner, long-press preview |

So this work applies Liquid Ember to working, device-tested logic rather than
building from nothing. **One thing has since been removed** — the checked-in
strip, below.

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

## One palette, and how it came to be two

The screen shipped half-restyled. `Featured` and `Upcoming` were built as new
components on Liquid Ember; `Nearby`, `Interested`, `Nightlife`, the checked-in
strip and the city-top rail were left on the previous design. The visible result
was a **`View all` with an iOS-blue `#0A84FF` chevron** sitting two sections
below an Ember heading.

Underneath it was worse than a colour: **seven hand-rolled section headers and
two using `SectionHeader`.** Two of the seven were a centred heading flanked by
divider rules — a treatment that appears in no frame at all.

All seven are gone. Every heading on this screen is now `SectionHeader`, so the
next section anybody adds inherits the design rather than copying whichever
neighbour they happened to look at.

`__tests__/pulsePalette.test.ts` greps the files that draw this screen for
`APP_COLORS.accent` and for hardcoded blues. Crude on purpose: a typecheck
cannot see this, a unit test cannot see this, and **a render test could not see
it either** — both colours are valid and both render. The only symptom is that
the screen looks like two designs.

`APP_COLORS` is not deprecated. Screens that have not been restyled still use
it, deliberately; the guard is scoped to The Pulse's own files so it stays a
guard rather than a chore.

## One surface, not three

The screen was **a homepage mounted as a screen inside a screen**, and that was
the reason nothing lined up with the frame — not the colours, which were only
the symptom.

Structurally it was:

1. a sticky top bar, absolutely positioned
2. `sectionBg` — a rounded, bordered, **elevated panel** at `top: stickyBarHeight
   + 12`, with `overflow: hidden`, its own background and its own vertical
   gradient
3. the list, inside that panel

The frame is one flat background, `#0F0E0E`, edge to edge, with content sitting
directly on it. Three surfaces where the design has one, and every card drawn on
the wrong one.

All of it is gone. `container` is `EMBER.bg` and the list is the page.

### The top bar went with it

It held three things and none survive as a bar:

| Was | Now |
|---|---|
| avatar → profile | **the Me tab**, which shows your photo |
| `Blend'n` wordmark | see below — it came back, as an overlay |
| settings gear | reached through Me → profile → settings, as it already was |

The city picker had already moved into the headline block.

### The wordmark came back, as an overlay — frame `1141:4819`

`components/pulse/PulseTopBar.tsx`. This is not the bar that was deleted. That
one **reserved 64pt of layout** above a bordered panel; this one is
`position: absolute, top: 0`, `rgba(15,14,14,0.8)` behind a 12pt backdrop blur,
and the feed scrolls under it. It occupies nothing. The only thing keeping the
headline out from behind it is `paddingTop` on the list's content — the same
mechanism the floating nav has always used at the other end.

The status bar is **added** to the frame's 64 rather than absorbed into it. The
frame is a 390pt artboard with no notch, and taking its height literally is what
put "The Pulse" underneath the clock on the device screenshot.

Values are the frame's, unadjusted: `paddingHorizontal: 24`, wordmark in Plus
Jakarta **Bold 16/24**, `#FF906D`, `letterSpacing: -0.8`. Accent rather than
white, which is what makes it read as a mark and not as a second heading above
"The Pulse" in 48pt.

**The frame's two glyphs are not rendered, and neither is a placeholder.**

| Glyph | Why it is absent |
|---|---|
| hamburger, 18×12, left | There is no drawer in this app. Inventing one to justify a glyph is the tail wagging the dog |
| bell, 16×20, right | A notifications centre is designed and **not built** — no endpoint returns a notification. A bell that opens nothing is a dead control in the most-tapped corner of the screen |

An earlier draft of this component put a **Pulse / Hotspots** feed switch in the
hamburger's place, on the reading that Hotspots is "a replica of the Pulse page
showing venues". `blendn-admin/docs/HOTSPOTS.md` exists precisely because that
reading is wrong: Hotspots is a **presence** surface, gated behind a deliberate,
time-boxed, reciprocal *Go Live* at one venue, and none of that gate is built —
the only presence endpoint today is scoped to an event you have already checked
into. A switch to it would be a third dead control, and shipping it as a venue
list would have encoded the misreading the doc was written to stop. Both glyphs
go in the moment they have a destination.

### The undesigned rows moved into the feed's header

The offline banner, the switch-city offer, the away notice and the
location/network errors have behaviour and no frame. They used to be a
**sibling** of the list, statically laid out at the top of the screen — which the
overlay now covers — and they cost a 10pt spacer on every render where none of
them had anything to say. They render into `ListHeaderComponent` instead, above
the headline, so there is one scroll surface and they clear the bar with the same
padding as everything else.

### The checked-in strip is gone — it is a ring on the Blend'n button now

It was the fifth of those rows, and the only one that never earned its space. A
section header, a horizontal list of **full-width** cards and a Check out pill:
roughly a third of the first screen, permanently, to say one bit of information —
*you are checked in somewhere*. It was the most expensive square footage on the
screen, and it pushed the hero card the Pulse exists for below the fold.

That bit lives on the centre button now, which already reads the same active
check-in and is on **every** screen rather than only this one. It draws a steady
ring when you are in a room. The full reasoning — including why the ring is
static rather than animated — is in `NAVIGATION.md`.

**For the designer.** This creates two asks, and neither is drawn anywhere yet:

1. **The ring.** Currently a 2pt `accent` ring, 4pt clear of the 52pt disc, with
   the existing breath behind it. It works and it was not designed — worth a
   frame, since it is now the app's only permanent statement of a state.
2. **Where check-out belongs.** It is in the Room's top bar (a quiet
   `surfaceSunken` pill beside the bell) and on the Pulse's long-press tray.
   Neither is in a frame. The constraint is that it must stay reachable in one
   tap from the ring, because the three-tap version through the event detail
   screen is what the strip was originally built to fix.

**Your photo is the Me tab's icon.** That is where a profile picture belongs: the
tab that *is* you, rather than a third control in a header. It reads
`profile.photos[0]` through the cache-first `getProfile`, so on the common path
it costs nothing and draws with a face on first paint. It falls back to the
person glyph — a broken image where a face should be is worse than no face — and
deliberately never uses the OAuth avatar, which 404s often enough that the rest
of the app already refuses it.

Removing the bar also deleted four scroll interpolations (`topBarTranslateY`,
`topBarScale`, `topBarOpacity`, `sectionBgTop`) that existed only to animate it,
and the local `TYPE_HEADER_*` constants it was the last consumer of.

## The stylesheet, rewritten rather than corrected

**107 keys, 49 of them with a caller.** The other 58 were two previous layouts:
an invite hero, a glass-panelled Nearby card with a sheen and an inner shadow, a
`#007AFF` iOS-blue check-in button, a `#e8f5e8` status badge. They were not
inert — they are what seven restyle PRs kept landing beside and contradicting.
It is 46 keys now and every one is used, which a test asserts by parsing the
sheet rather than by anyone remembering to check.

Two rules, and everything follows from them.

**1. The frame's numbers, unadjusted.** `Main`'s four are named once and used by
both the sheet and the render site — `paddingHorizontal: 12`, `paddingBottom:
128`, `gap: 48`, and the 96 at the top, written as `TOP_BAR_HEIGHT + 32` because
the 32 is the part that carries meaning. The only additions are the safe-area
insets, applied at the render site so that what came from the frame and what came
from the hardware never blur together. Treating the artboard's values as desktop
measurements in need of shrinking is what produced the flat screen.

The gutter is applied **once**, on the scroll content. Every child used to carry
its own 12 or 16 or 23; one gutter means a section cannot disagree with the
section above it, and the horizontal rows still start exactly where the frame
puts them.

**2. No `fontWeight`, anywhere — and this one was a bug, not a preference.**

`lib/theme.ts` has said it from the start: custom fonts on Android ignore
`fontWeight` entirely and silently render regular. So `fontWeight: '700'` on
Manrope gave bold on iOS and **regular on Android from identical code** — in
thirty places in this sheet, plus one nested `<Text>` in the Nearby subtitle.
Nothing about it is visible in a simulator screenshot or to a typecheck, which
is why it survived every design review this screen has had.

Weight comes from the family now. Every text style spreads an `EMBER_TYPE`
entry, so the three type systems that coexisted here — local `TYPE_*` constants,
raw numbers, `APP_COLORS` — are one, and the sizes are the scale's rather than
the call site's. `APP_COLORS` is gone from the file entirely; one import of the
old blue palette is enough to put a cold hairline around a warm card.

**What is undesigned is marked as such.** The banners, the empty states and the
city picker have behaviour and no frame. They are on the frame's palette and
spacing scale so they do not look foreign, but nothing in those blocks should be
read as a design decision.

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
