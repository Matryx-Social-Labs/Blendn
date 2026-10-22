# Places

The drawer's second pane and the place page, built to the Round 4 design.
Design source: `guidelines/places/` (`places.js`, `fullpages.js`), `guidelines/flow-11/`
(Places live), `guidelines/flow-13/` (Regulars, the venue-page delta),
`round4/r4d.js` and `r41-groups.js` (the missing states), the components
`AmenityTile`, `VenuePlates`, `EventCard`, `MapCard`, `GoLiveSheet`, `SessionSheet`.

**Routes:** `components/home/PlacesList.tsx` (HomeShell hosts it) and
`app/venue/[id].tsx`. **Parts:** `components/places/`, `components/venue/`.
**Pure parts:** `lib/placesPane.ts`, `lib/venuePage.ts`, `lib/useSessionTime.ts`.

## The pane

Three strata, ordered by what is true tonight: **Live now** (5–9, 10–19 and
20+ live; tiles, the only photos), **Open tonight** (under 5 live with an event
today; rows), and the **quiet places** folded behind one line with a count. A
chip row asks the server for a type (`venueType`); the fold opens in place.

It stays fast with thousands of venues: one virtualised list over pages of 30,
no row fetches anything, and while the quiet places are folded only the first
`EAGER_PAGES` pages are read on their own. The fold's count says "N+" while
pages remain, because the number is what has been read, not a total.

A venue an event has taken over is left out by the server, never filtered here.
Live is a bucket, never a number, never who.

## The page

Hero (tonight's cover, else the type plate at full bleed: A87), name, type ·
area · distance (the distance the list showed, handed over in the route). Then,
by state: the tiles (Open · Live · Reset · Size), or the live card, or the card
of the event that has the place. Tonight here, Coming up here, Who's here,
Regulars, the Board, About, Good to know, Where, and last the claim line.

The dock holds one slot: **Go live** (a dial, then the hold), **Go live again**
in one tap with *Pick another time*, the **live pill** with *Open the room* and
*Leave*, the hand-off **Check in to the event**, or the server's sentence. The
client never draws a check-in boundary: it asks the server.

## Where the build departs from the design, and why

| | |
|---|---|
| No bookmark on the page | There is no venue-save endpoint |
| Share is the text of the place | There are no links yet (Flow 16) |
| No "Past nights here" | Needs the venue's completed events (server) |
| The live card holds a glyph, not your creature | Today's nickname is not on the place payload |
| The Board row opens tonight's event board | A venue has no board of its own; the row shows only before the event's doors |
| No peek summary ("3 places live") | Needs counts the list cannot know (server) |
| ExpiryPrompt, NotLiveNotice not wired | They belong to `LiveAtVenue` and the chat room, not to these two screens |
| The map under the pin is the platform's | The home map's OSM credit (About › Map data) is untouched; this draws none of our tiles |

## Server fields the page reads when they arrive

Each is optional on `GET /venues/:venueId`; the page draws nothing for one that
is absent, never a guess. (`lib/apiClient.ts` `VenueDetail`.)

- `venue.venueType` (the key; the server already has it) — which plate.
- `tonight.coverImageUrl` (the server has it) — the hero.
- `venue.hours [{ day, open, close }]` (the week, wall-clock HH:MM), `venue.dayResetHour`, `venue.capacity` — the tiles.
- `venue.description`, `venue.amenities` (names), `venue.upcoming[]` — About, Good to know, Coming up.
- `live.stayUntil` — "ends 00:40 at the latest" on a stay window.
- `GET /venues`: a way to list live places first, so Live now is found without paging.
- `GET /venues/:id/regular`: `eligible`, so the offer is drawn only for people who qualify.
