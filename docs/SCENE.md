# The Scene

The event detail screen. Frame `1141:4853`, 390 wide, in the **Updates** canvas
of `HO0UnAEV5djzo0h4q7Y2vi`.

This file exists because four comments in the codebase pointed at it before it
was written. Everything here is either a number taken out of Figma with
`get_design_context`, or a decision where the build knowingly departs from the
frame — so a later reader can tell a deviation from drift.

**Route:** `app/event/[id].tsx` → `components/screens/EventDetailScreen.tsx`.
**Presentation components:** `components/scene/`.
**Harness:** `exp+blendn:///preview/scene`, fixtures only, dev-only.

---

## Composition

Both the real screen and the harness render exactly this, in this order:

```
PulseTopBar         back · Blend'n · heart · share
ScrollView
  SceneHero         media, title, date, time, scarcity pill
  SceneHeading      "The Experience"
  SceneBody         description, entity-accented
  SceneGallery      only when there is more than the cover
  SceneAttendees    label + count
  SceneLocationCard venue, area
  SceneMap          static map, tapping opens Maps
SceneCTA            floating, outside the scroll
SceneLightbox
```

A test asserts the two lists match. If they diverge, the harness stops being
evidence — which is how the rebuilt Scene sat unwired behind the old screen for
a week while its preview looked correct.

`SceneAmenity` is in the harness and **not** on the real screen: `#244` added
amenities server-side and the mobile payload does not carry them. Rendering the
frame's two tiles would be the interface asserting facts it has not been told.

---

## The screen is full-screen, never a sheet

`app/_layout.tsx` presents this route with `presentation: 'card'`.

It was `'modal'`, and that is worth recording because it looked like a small
thing and was not. A sheet insets itself from the top, rounds its corners, and
leaves the previous screen visible above it. Frame `1141:4853` is a full-bleed
artboard whose hero **dissolves into the page** — and the design deliberately
deleted a bottom-sheet panel from *inside* this screen. Presenting the whole
screen as a sheet reintroduced exactly that shape, one level up at the window.

It cost a second bug: `useSafeAreaInsets()` reads the root provider, so inside a
sheet `PulseTopBar` padded by a notch iOS had already cleared, and the wordmark
sat in a dark band.

**`topInset={0}` belongs to sheets only.** `app/room.tsx` keeps it and must; the
Scene must not. The rule is per presentation, not per screen, and a test pins
both halves.

---

## The hero starts at y=0

```
Main            x=0  y=0    390 × 1841
└─ Hero Section x=0  y=0    390 × 574
```

The hero occupies the top of the page and the bar is an **absolute overlay** on
it. So the media runs full-bleed under both the top bar and the status bar. That
is the design, not an oversight.

It reads wrong on an event with no cover, because there is nothing to see
through the translucent bar and it looks like a bar sitting on a slab. That is
data, not layout — see *The coverless case*.

**Height is an aspect, not a number:** `390 / 574`, applied to the device width.

---

## The six deltas against the frame

Each is a place the build and the frame disagree on purpose.

### 1. The CTA pill is 58, not 74

The frame's pill is 74 because it holds a **40pt** icon (`1227:2912`), and a
40pt icon beside a 28pt line of text sets the height on its own. Docked, that 74
sits on a 24pt dock gutter and an ~88pt tab bar: **186pt of permanent chrome**,
better than a fifth of an 874pt screen, on a page whose whole job is to show you
an event.

The frame measured the CTA floating over a scroll, where it was the only thing
at the bottom. It is not — the tab bar is under it. The icon drops to 26, which
is where it stops driving the height and the label does, and the pill lands at
58. The dock gutter goes 12/12 → 10/10. **Total saving 24pt; chrome ~162pt.**

### 2. No scarcity claim the product cannot back

The frame draws **LIMITED ACCESS** on every event. Nothing supports it: the only
thing an organiser is asked is `max_capacity`, whose own placeholder reads
"Unlimited if blank" — a fire-safety number, not a claim about exclusivity. A
500-person warehouse night has a capacity and is not exclusive.

`heroPillLabel` shows a real door policy or a real capacity, and otherwise
nothing. The Pulse settled the same question first and its frame's pills read
"SONIC VOID" and "EXCLUSIVE".

### 3. Location card padding is 32/32/**56**

`1141:4901` is `pt-32 px-32 pb-56`. The bottom is the gap to the map band; at 32
the address crowded it.

### 4. The venue name sits 16 below the eyebrow

`1141:4904` is `pt-16`. The build had 8, from reusing the card's own gap.

### 5. Both location lines are Plus Jakarta **Regular**

`1141:4903` and `1141:4905` are both `font-normal`, and both were built Bold —
because Regular was not loaded, and **a `fontFamily` naming an unloaded family
renders the system font without throwing or warning.** `displayRegular` is
loaded now and `cardEyebrow`/`cardValue` carry it.

### 6. Amenity tiles are a fixed 126 tall, with per-icon sizes

`grid-rows-[126px]`. Content-sized, the pair agreed only while their text
wrapped identically. And `1141:4919` is 18 where `1141:4925` is 20 — not a
mistake in the design: a tall narrow martini glass and a wide round camera at
the same box size do not look the same size.

---

## Two accessibility gaps the frame does not address

### Dynamic type on the 48pt hero title

React Native **clips** a glyph to its `lineHeight` where CSS lets it overflow. At
Accessibility XXXL iOS scales by ~3.1×, which asks for a 149pt glyph inside a
56pt line: two rows of sliced letterforms over a photograph. `numberOfLines`
truncates and does not rescue the line box. The title carries a
`maxFontSizeMultiplier`.

### The attendee discs carry a creature, not a letter

`pseudonymAvatar.initial` is `seed[0]` and the seed is the *event* id, so all
three discs showed the same letter — a row reading "T T T". A varied letter
would be worse: a letter reads as somebody's initial, and faces were removed
from this stack precisely because a face is identity.

Colour and creature are drawn from **different mixes of the hash**
(`h ^ 0x9e3779b9`). Taking both from `h` correlates them: with 8 hues and 16
creatures every panda would be the same blue.

---

## The CTA is one slot whose subject changes with the clock

| when | label | tap |
|---|---|---|
| before the doors, not going | I'm going | sets the RSVP |
| before the doors, going | You're going | cancels it |
| running, not checked in | Blend in | checks in |
| checked in | You're in | opens the room |
| over | This event has ended | disabled |

**"Blend in" before the event was a dead button.** A check-in needs the event to
be running — `pickInsideEvent` requires `start <= now` and the server
re-validates — so on a future event the most prominent control on the screen
offered the one action that could not succeed.

`rsvpd` and `going` are drawn quiet. The gradient is for the thing that still
needs doing; a fully lit pill that only un-does something reads as the primary
action of the screen.

**Check out is not here.** When you are in, the CTA opens the room, and the
room's top bar has it — one tap. The Pulse's long-press tray has it too. A test
asserts the room really does, so the claim cannot rot.

---

## The attendee count means two different things

Before the doors nobody has checked in, so an "Attendees" heading over a dash is
the screen reporting emptiness for a night that has not happened.

- **Before `start_time`:** *Going* with the RSVP count, or *Interested* with the
  saved count when nobody has RSVP'd. A real number beats a dash.
- **After:** *Attendees* with the check-in count.

---

## The coverless case

An event with no cover and no media renders the hero as a dark panel
(`EMBER.surfaceSunken`) with the title and gradient on it.

It previously fell back to `assets/images/icon.png` — a square app icon, drawn
with `contentFit: 'cover'` into a 440×647 box, so it filled two thirds of the
screen with a hugely enlarged logo. `expo-image` draws nothing for an undefined
source, which is why the source is now undefined rather than a placeholder.

Staging has a deliberately coverless row for this: *"The coverless card. Used to
render as an empty grey rectangle."*

---

## Media: mount means play

The hero clip **mounts only while it is the page in view**, matching
`FeedVideo`'s policy on the Pulse.

This was arrived at after three failures, all of the same shape: a player that
survives its page sits on its final frame when it ends, and every signal for
resetting it was unreliable. In particular `active` is
`i === index || i === settled`, which on a **two-item** playlist never goes
false — moving to page 1 leaves `settled` lagging at 0. An effect keyed on it
runs once and never again, so the clip froze on every lap.

`FeedVideo` never had the bug and not by being cleverer: an inactive card
unmounts, and the next mount is a new player at zero. There is no state to reset
because no player survives.

**Cost:** a clip starts buffering on arrival rather than one page early.

The hero also uses `clipFirst(feedPlaylist(...))`, not `feedPlaylist` alone.
`feedPlaylist` leads with the cover, which is right for a card in a feed and
wrong for a screen somebody committed a tap to open.

---

## Controls with no home in the frame

The frame draws one CTA. These exist and had to go somewhere:

| control | where | note |
|---|---|---|
| RSVP | the CTA, before the doors | it is the same slot at an earlier hour, not a second action |
| Check out | the room's top bar | one tap from the CTA |
| Announce / delete | a small organiser column, bottom right | shown only to an organiser; not in any frame |
| Android announcement composer | a modal | `Alert.prompt` is iOS-only, so on Android this **is** the feature |

An overflow `···` was briefly added to the top bar for RSVP. It was wrong twice:
not in the frame, and it put an undesigned control in the most prominent slot on
the screen.

---

## Open asks for the designer

1. **The pre-doors CTA has no frame.** *I'm going* / *You're going* were derived,
   not designed.
2. **The organiser column has no frame.** Two round buttons stacked bottom-right.
3. **The coverless hero has no frame.** Currently a flat dark panel.
4. **Amenities need a payload before they can be drawn**, and then a decision on
   what happens with one amenity, or five, when the frame draws exactly two.
5. **`LIMITED ACCESS` needs either a backing field or removal from the frame** —
   see delta 2.
