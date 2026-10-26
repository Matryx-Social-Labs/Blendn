/**
 * What the event page asks `getEvent` for, in one place.
 *
 * `getEvent` builds its cache key from its parameters, so a card that warms the
 * page with any other set (it once added lat/lon, which the page never sends)
 * fills a key nobody reads: the prefetch cost a request and saved none. The
 * warmers and `EventDetailScreen` all spread this, so they cannot drift apart.
 */
export const EVENT_DETAIL_QUERY = { include: 'interestedUsers', interestedLimit: 6 } as const
