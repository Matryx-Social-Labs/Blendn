/**
 * Which city you are browsing.
 *
 * Browse scope is **one** variable. It used to be three things pretending to be
 * one: a 10 km box around device GPS decided what was fetched, `profile.location`
 * decided what the header said, and a city-name filter ran over the result. A
 * device in Germany therefore showed a "Bengaluru" header above a query that
 * could only ever return German events — of which there were none, so the whole
 * screen went blank.
 *
 * ## The rules, and why they are here rather than in the screen
 *
 * All of this is decided by pure functions over plain data, because the app has
 * no component tests by construction (`jest-expo` on `testEnvironment: node`).
 * Anything worth pinning has to leave the screen first — the same move
 * `lib/geo.ts`, `lib/reveal.ts` and `lib/activeRoom.ts` already made.
 *
 * ## GPS suggests. It never decides.
 *
 * The device's own city is used for exactly two things: ordering the Nearby
 * section, and offering *"you're in Munich — switch?"*. It is never applied on
 * the user's behalf, because a two-hour layover must not delete the plans
 * someone was making for home.
 */

export interface CityOption {
  city: string
  eventCount: number
}

/**
 * Are these the same place?
 *
 * Mirrors the server's case-insensitive match so the client never shows a
 * "switch?" prompt for a city it is already browsing.
 */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Which city to browse on this launch.
 *
 * Order matters and each step is a fallback for a real failure:
 *
 * 1. **What they chose last time.** A selection that does not survive a restart
 *    is not a selection.
 * 2. **Where the device says it is**, if that city actually has events. Guarded
 *    on the list because suggesting a city that opens empty is worse than not
 *    suggesting one.
 * 3. **The busiest city.** So a cold install with location denied still lands
 *    on a populated screen rather than an empty one with a prompt.
 * 4. **Nothing**, only when the platform genuinely has no events anywhere.
 *
 * The stored city is honoured even when it is absent from `available` — it may
 * simply have nothing on this week, and silently moving someone to a different
 * city is worse than showing them an empty one they chose, with a picker.
 */
export function resolveBrowseCity(input: {
  stored: string | null
  deviceCity: string | null
  available: readonly CityOption[]
}): string | null {
  const { stored, deviceCity, available } = input

  if (stored) return stored

  if (deviceCity && available.some((option) => sameCity(option.city, deviceCity))) {
    // Return the server's spelling, not the geocoder's, so the value sent back
    // as a filter is one the server will match.
    return available.find((option) => sameCity(option.city, deviceCity))!.city
  }

  return available.length > 0 ? available[0].city : null
}

/**
 * Should we offer to switch to the city the device is in?
 *
 * Only when all three are true: we know where the device is, that city has
 * events, and it is not already the one being browsed. Offering a switch to a
 * city with nothing in it would be a prompt whose only outcome is an empty
 * screen.
 */
export function shouldOfferSwitch(input: {
  selected: string | null
  deviceCity: string | null
  available: readonly CityOption[]
}): string | null {
  const { selected, deviceCity, available } = input
  if (!deviceCity) return null
  if (sameCity(selected, deviceCity)) return null

  const match = available.find((option) => sameCity(option.city, deviceCity))
  return match ? match.city : null
}

/**
 * Is the device in the city being browsed?
 *
 * Decides whether the Nearby section shows distances. When someone is browsing
 * a city they are not in, "2.4 km away" would be measured from wherever they
 * actually are and would be noise — so the section is **relabelled, not
 * hidden**. Hiding it would change the page's shape for a reason the user
 * cannot see, and would flicker for someone who *is* in the city but whose GPS
 * has not resolved yet.
 */
export function isBrowsingHere(selected: string | null, deviceCity: string | null): boolean {
  return sameCity(selected, deviceCity)
}
