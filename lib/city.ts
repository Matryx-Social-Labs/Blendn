/**
 * Which city you are browsing.
 *
 * Browse scope is **one** variable. It used to be three things pretending to be
 * one: a 10 km box around device GPS decided what was fetched, `profile.location`
 * decided what the header said, and a city-name filter ran over the result. A
 * device in Germany therefore showed a "Bengaluru" header over a query that
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
 * ## A guess is not a choice, and the difference is the whole policy
 *
 * The first version stored one string, so "Bengaluru because you tapped it" and
 * "Bengaluru because we guessed on install" were indistinguishable — which
 * forced the code to treat both as sacred and never update either.
 *
 * That produced a trap on a real device. Three guards, each sensible alone:
 * `resolveBrowseCity` fell back to the busiest city when the device's own had
 * no events; `shouldOfferSwitch` stayed quiet for a city with nothing to switch
 * to; and the picker only ever listed cities that have events. Together they
 * put a user in Germany into Bengaluru with **no way to say where they
 * actually were** — their city was absent from the list, absent from the
 * banner, and the selection that had never been theirs could not be undone.
 *
 * So: an **inferred** city may be replaced by a better inference. A **chosen**
 * one never is — it is offered a switch and left alone. And the picker offers
 * "use my current location" unconditionally, because being able to say where
 * you are must not depend on us having events there.
 *
 * ## GPS suggests. It never decides.
 */

export type CitySource = 'chosen' | 'inferred'

export interface StoredCity {
  city: string
  /** `chosen` means the user picked it — from the list, the banner, or "use my location". */
  source: CitySource
}

export interface CityOption {
  city: string
  eventCount: number
}

/**
 * Are these the same place?
 *
 * Mirrors the server's case-insensitive match so the client never offers to
 * switch to the city it is already showing.
 */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** The server's spelling for a place, when it knows it. Otherwise the input. */
function canonical(city: string, available: readonly CityOption[]): string {
  return available.find((option) => sameCity(option.city, city))?.city ?? city
}

/**
 * Which city to browse on this launch.
 *
 * 1. **What they chose last time.** A selection that does not survive a restart
 *    is not a selection.
 * 2. **Where the device is**, if that city has events — inferred, so a later
 *    launch somewhere else may replace it.
 * 3. **The busiest city**, also inferred, so a cold install with location denied
 *    still lands somewhere populated rather than on an empty screen.
 * 4. **Nothing**, only when the platform has no events anywhere.
 *
 * A stored city is honoured even when it has nothing on this week: it may be
 * home, and moving someone off their own choice is worse than showing them an
 * empty city they picked, with a way out.
 */
export function resolveBrowseCity(input: {
  stored: StoredCity | null
  deviceCity: string | null
  available: readonly CityOption[]
}): StoredCity | null {
  const { stored, deviceCity, available } = input

  if (stored) return stored

  if (deviceCity && available.some((option) => sameCity(option.city, deviceCity))) {
    return { city: canonical(deviceCity, available), source: 'inferred' }
  }

  return available.length > 0 ? { city: available[0].city, source: 'inferred' } : null
}

/**
 * Should the app move you, without asking, now that it knows where you are?
 *
 * Returns the city to switch to, or `null` to leave the selection alone.
 *
 * Only ever replaces a guess with a better guess. A city you actually picked is
 * never overridden — you get the banner instead — because a two-hour layover
 * must not silently delete the plans you were making for home.
 *
 * Deliberately **not** time-based. A home city does not go stale after thirty
 * days, and any threshold would be arbitrary; the "my trip ended" case is
 * already covered by being offered your own city when you get back to it.
 */
export function cityOnResume(input: {
  stored: StoredCity | null
  deviceCity: string | null
  available: readonly CityOption[]
}): string | null {
  const { stored, deviceCity, available } = input

  if (!deviceCity) return null
  if (stored?.source === 'chosen') return null
  if (sameCity(stored?.city, deviceCity)) return null

  // Never move someone onto an empty screen on our own initiative. If they want
  // to go there anyway, "use my current location" in the picker is explicit and
  // always available.
  const match = available.find((option) => sameCity(option.city, deviceCity))
  return match ? match.city : null
}

/**
 * Should we offer to switch to the city the device is in?
 *
 * Only when we know where the device is, that city has events, and it is not
 * already the one being browsed. A prompt whose only outcome is an empty screen
 * is worse than no prompt — and for that case the picker's "use my current
 * location" is the honest route, because it is a decision rather than a nudge.
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
 * Say where you are, when there is nothing to be done about it.
 *
 * `shouldOfferSwitch` only speaks when the device's city has events — because a
 * prompt whose only outcome is an empty screen is worse than no prompt. The
 * consequence, found on a device in Saarbrücken, is that someone standing in a
 * city we have not launched in gets **total silence about their own location**:
 * no banner, no mention, just a Bengaluru list and a "In Bengaluru" heading
 * they have to infer the meaning of.
 *
 * That is the population we would most want to say something to.
 *
 * So this is the other half, and the two are **mutually exclusive by
 * construction** — this fires exactly when the switch offer cannot. Passive on
 * purpose: there is nothing useful to tap, so a call to action would be a dead
 * end, and the picker in the header is already the way to move.
 *
 * Returns the pair to render, or `null` when there is nothing worth saying.
 */
export function awayNotice(input: {
  selected: string | null
  deviceCity: string | null
  available: readonly CityOption[]
}): { deviceCity: string; selected: string } | null {
  const { selected, deviceCity, available } = input

  if (!deviceCity || !selected) return null
  if (sameCity(selected, deviceCity)) return null
  // If the device's city has events, the switch offer is the right message and
  // this one must stay quiet. Never both.
  if (available.some((option) => sameCity(option.city, deviceCity))) return null

  return { deviceCity, selected }
}

/**
 * Is the device in the city being browsed?
 *
 * Decides whether distances are shown. Browsing a city you are not in makes
 * "2.4 km away" a true number and useless information, so the Nearby section is
 * **relabelled, not hidden** — hiding it would change the page's shape for a
 * reason the user cannot see, and would flicker for someone who *is* in the
 * city but whose GPS has not resolved yet.
 */
export function isBrowsingHere(selected: string | null, deviceCity: string | null): boolean {
  return sameCity(selected, deviceCity)
}

/**
 * Read whatever is in storage, including what the previous version wrote.
 *
 * v1 stored a bare city name. v2 stores `{city, source}`, because the app has
 * to tell a city you picked from one it guessed.
 *
 * **A bare string is read as `chosen`**, which is the conservative reading and
 * the deliberate one. Everyone upgrading either picked their city or accepted a
 * default; treating it as a choice means the worst case is being *asked* to
 * switch, and being *moved* without warning is the harm.
 *
 * Here rather than in `cityStorage.ts` so it can be tested — the migration is
 * the part with edge cases, and AsyncStorage does not load under
 * `testEnvironment: node`.
 */
export function parseStoredCity(raw: string | null | undefined): StoredCity | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  // Not JSON, so this is v1. Checked rather than caught, because a bare city
  // name is expected input and not an error.
  if (!trimmed.startsWith('{')) {
    return { city: trimmed, source: 'chosen' }
  }

  try {
    const parsed = JSON.parse(trimmed) as { city?: unknown; source?: unknown }
    const city = typeof parsed.city === 'string' ? parsed.city.trim() : ''
    if (!city) return null
    return { city, source: parsed.source === 'inferred' ? 'inferred' : 'chosen' }
  } catch {
    // Corrupt entry. A fresh inference beats throwing on the launch path.
    return null
  }
}

/**
 * Do we have events in the city being browsed?
 *
 * `cityOptions` is exactly the set of cities with something on, so a selection
 * outside it is a place the product does not serve yet — which is a different
 * message from "nothing on this week" and deserves one. It is reachable on
 * purpose: someone choosing their own empty city is telling us where to launch.
 */
export function isServedCity(selected: string | null, available: readonly CityOption[]): boolean {
  if (!selected) return false
  return available.some((option) => sameCity(option.city, selected))
}
