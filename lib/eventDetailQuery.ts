/**
 * What the event page asks `getEvent` for, in one place.
 *
 * `getEvent` builds its cache key from its parameters, so a card that warms the
 * page with any other set (it once added lat/lon, which the page never sends)
 * fills a key nobody reads: the prefetch cost a request and saved none. The
 * warmers and `EventDetailScreen` all spread this, so they cannot drift apart.
 */
export const EVENT_DETAIL_QUERY = {} as const
// ROOM-14: it once asked for the interested-users include, which the route answers with `interestedUsers: []`
// and the Rate, Board, Room and Blend screens never sent, so one event was fetched and held twice. Bare, it is the key
// every caller shares; kept as a constant so the warmers that spread it (Pulse, nearby) cannot drift from the page.
