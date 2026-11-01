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
  /** The catalogue's id for it (v3); absent for an Elsewhere city and in what older builds wrote. */
  slug?: string
  /** The travel banner has been dismissed for this city; a new choice writes a new record without it, so it shows once per switch. */
  travelSeen?: boolean
  /** Where the map opens for it before the catalogue has loaded (or when it fails): kept from the catalogue's row. */
  centre?: { latitude: number; longitude: number }
}

export interface CityBounds {
  minLat: number
  minLon: number
  maxLat: number
  maxLon: number
}

type Point = { latitude: number; longitude: number }

export interface CityOption {
  city: string
  eventCount: number
  /**
   * Listed places in the city. A city can be listed with places and no events
   * (venues are seeded before organisers arrive); absent from an older server.
   */
  placeCount?: number
  /** Where the home map goes when this city is picked; null (or absent, an older server) leaves it. */
  centre?: { latitude: number; longitude: number } | null
  /*
   * The catalogue (travel P1, admin #898). All null for a city the catalogue does not know, which lists under
   * "Elsewhere"; all absent from an older server, which reads as one country-less list, as before.
   */
  slug?: string | null
  /** ISO 3166-1 alpha-2. */
  country?: string | null
  launchState?: 'live' | 'preview' | 'hidden' | null
  /** IANA: the clock this city's times are read in. */
  timezone?: string | null
  bounds?: CityBounds | null
  isDefault?: boolean
  /** `comingSoon`: listed, opens empty, says so. Absent (an older server) is `full`. */
  access?: 'full' | 'comingSoon'
}

export interface CatalogueCountry {
  code: string
  name: string
  launchState?: string
  defaultCitySlug: string | null
}

/** What the server made of the phone's `X-Country`: null when none was sent. `hidden` is read as `none`. */
export interface DeviceScope {
  country: string
  access: 'full' | 'comingSoon' | 'none' | 'hidden'
  citySlug: string | null
}

/** `GET /events/cities`. Everything past `cities` is absent from an older server. */
export interface CityCatalogue {
  cities: CityOption[]
  countries?: CatalogueCountry[]
  defaultCitySlug?: string | null
  device?: DeviceScope | null
}

const opens = (option: CityOption) => option.access !== 'comingSoon'

export function cityBySlug(available: readonly CityOption[], slug: string | null | undefined): CityOption | null {
  return slug ? available.find((option) => option.slug === slug) ?? null : null
}

export function cityNamed(available: readonly CityOption[], city: string | null | undefined): CityOption | null {
  return available.find((option) => sameCity(option.city, city)) ?? null
}

const inBox = (b: CityBounds, p: Point) => p.latitude >= b.minLat && p.latitude <= b.maxLat && p.longitude >= b.minLon && p.longitude <= b.maxLon
const areaOf = (b: CityBounds) => (b.maxLat - b.minLat) * (b.maxLon - b.minLon)

/**
 * The listed city the phone is in: the smallest box holding its point (the server's rule, so Thane inside Mumbai's
 * corner is Thane), else the geocoder's name, which is all an Elsewhere row has. The box comes first because the
 * geocoder's names are not ours: "New Delhi" and "Gurugram" are both the "Delhi NCR" row.
 */
export function hereCity(input: { available: readonly CityOption[]; point?: Point | null; deviceCity: string | null }): CityOption | null {
  const { available, point, deviceCity } = input
  if (point) {
    const holding = available.filter((option) => option.bounds && inBox(option.bounds, point))
    if (holding.length > 0) return holding.reduce((a, b) => (areaOf(b.bounds!) < areaOf(a.bounds!) ? b : a))
  }
  return cityNamed(available, deviceCity)
}

/** What a city holds: its events, or its places when it has no events; the number and its unit, apart. */
export function cityCount(option: Pick<CityOption, 'eventCount' | 'placeCount'>): { n: number; unit: string } {
  const places = option.eventCount === 0 && !!option.placeCount
  const n = places ? option.placeCount! : option.eventCount
  return { n, unit: `${places ? 'place' : 'event'}${n === 1 ? '' : 's'}` }
}

/** What a picker row says a city holds: "53 events", "1,362 places" (grouped, as the Places header is: audit A6). */
export function cityCountLabel(option: Pick<CityOption, 'eventCount' | 'placeCount'>): string {
  const { n, unit } = cityCount(option)
  return `${n.toLocaleString('en-US')} ${unit}`
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

/** The record for a city, as the catalogue lists it: its slug and centre carried, so the next launch need not guess again. */
export const storedAt = (option: CityOption, source: CitySource): StoredCity => ({
  city: option.city,
  source,
  ...(option.slug ? { slug: option.slug } : {}),
  ...(option.centre ? { centre: option.centre } : {}),
})
const inferredAt = (option: CityOption): StoredCity => storedAt(option, 'inferred')

/**
 * Which city to browse on this launch.
 *
 * 1. **What they chose last time.** A selection that does not survive a restart
 *    is not a selection.
 * 2. **Where the device is**, if that city opens (`hereCity`) — inferred, so a later
 *    launch somewhere else may replace it.
 * 3. **The phone's country's city**, as the server names it from `X-Country`: a served country's city, or a
 *    coming-soon one, whose own screen says so (a Toronto phone lands on "Coming soon to Toronto", not in India).
 * 4. **The catalogue's default city** for a country we do not serve, or no location at all. Browsable, and never
 *    called near the person (`awayNotice` says where they are instead).
 * 5. Only for an older server, which names no default: its busiest row. Row 0 is busiest-first, so for everyone the
 *    server could not place it was Mysuru, a city nobody there was near (SCRUM-997).
 *
 * A stored city is honoured even when it has nothing on this week: it may be
 * home, and moving someone off their own choice is worse than showing them an
 * empty city they picked, with a way out.
 */
export function resolveBrowseCity(input: {
  stored: StoredCity | null
  deviceCity: string | null
  available: readonly CityOption[]
  point?: Point | null
  device?: DeviceScope | null
  defaultCitySlug?: string | null
}): StoredCity | null {
  const { stored, available, device, defaultCitySlug } = input

  if (stored) {
    const slug = stored.slug ?? cityNamed(available, stored.city)?.slug
    return slug ? { ...stored, slug } : stored
  }

  const here = hereCity(input)
  if (here && opens(here)) return inferredAt(here)

  const theirs = device && (device.access === 'full' || device.access === 'comingSoon') ? cityBySlug(available, device.citySlug) : null
  if (theirs) return inferredAt(theirs)

  const fallback = cityBySlug(available, defaultCitySlug) ?? available.find((option) => option.isDefault && opens(option))
  if (fallback) return inferredAt(fallback)
  if (defaultCitySlug !== undefined) return null

  return available.length > 0 ? inferredAt(available[0]) : null
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
  const match = cityNamed(available, deviceCity)
  return match ? match.city : null
}

/**
 * Should we offer to switch to the city the device is in?
 *
 * Only when we know where the device is, that city is listed, and it is not
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

  // A coming-soon city is listed, but a switch there opens an empty screen: `awayNotice` says it is coming instead.
  const match = cityNamed(available, deviceCity)
  return match && opens(match) ? match.city : null
}

/**
 * Say where you are, when there is nothing to be done about it.
 *
 * `shouldOfferSwitch` only speaks when the device's city is listed — because a
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
}): AwayNotice | null {
  const { selected, deviceCity, available } = input

  if (!deviceCity || !selected) return null
  if (sameCity(selected, deviceCity)) return null
  // If the device's city opens, the switch offer is the right message and
  // this one must stay quiet. Never both.
  const listed = cityNamed(available, deviceCity)
  if (listed && opens(listed)) return null

  return { kind: listed ? 'comingSoon' : 'notThere', deviceCity: listed?.city ?? deviceCity, selected }
}

/**
 * `notThere`: a place we do not serve ("We're not in Saarbrücken yet"), never "near you". `comingSoon`: a city the
 * catalogue lists that has not opened, for someone who chose to browse another.
 */
export interface AwayNotice {
  kind: 'notThere' | 'comingSoon'
  deviceCity: string
  selected: string
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
 * v1 stored a bare city name. v2 stores `{city, source}`, because the app has (v3 adds `slug` and `travelSeen`)
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
    const parsed = JSON.parse(trimmed) as { city?: unknown; source?: unknown; slug?: unknown; travelSeen?: unknown; centre?: { latitude?: unknown; longitude?: unknown } }
    const centre = parsed.centre && typeof parsed.centre.latitude === 'number' && typeof parsed.centre.longitude === 'number' ? { latitude: parsed.centre.latitude, longitude: parsed.centre.longitude } : null
    const city = typeof parsed.city === 'string' ? parsed.city.trim() : ''
    if (!city) return null
    return {
      city,
      source: parsed.source === 'inferred' ? 'inferred' : 'chosen',
      ...(typeof parsed.slug === 'string' && parsed.slug ? { slug: parsed.slug } : {}),
      ...(parsed.travelSeen === true ? { travelSeen: true } : {}),
      ...(centre ? { centre } : {}),
    }
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
  const listed = cityNamed(available, selected)
  return !!listed && opens(listed)
}

/* -------------------------------------------------------------------------- */
/* Travel (plan §1.1): home, the browse country, travelling and visiting       */
/* -------------------------------------------------------------------------- */

/**
 * Home: the city on the profile (`homeCitySlug`), read through the catalogue. Unset until the person chooses one, and
 * unset again when the catalogue no longer lists it (hidden by an admin): the travel UI then stays quiet rather than
 * measuring "away" from a city that is not there.
 */
export function homeCity(input: { homeCitySlug: string | null | undefined; available: readonly CityOption[] }): CityOption | null {
  return cityBySlug(input.available, input.homeCitySlug)
}

/** The country of the city being browsed; null for an Elsewhere city or an older server. */
export function browseCountry(selected: string | null, available: readonly CityOption[]): string | null {
  return cityNamed(available, selected)?.country ?? null
}

/** Browsing another country than home's. Another city at home is a plain switch, not travel; no home is never travel. */
export function isTravelling(input: { homeCountry: string | null; browseCountry: string | null }): boolean {
  return !!input.homeCountry && !!input.browseCountry && input.homeCountry !== input.browseCountry
}

/** Travelling with the phone in the browsed country: the person is there, so every presence rule treats them as local. */
export function isVisiting(input: { homeCountry: string | null; browseCountry: string | null; deviceCountry: string | null }): boolean {
  return isTravelling(input) && input.deviceCountry === input.browseCountry
}

/**
 * The home to record after an explicit choice, or null to record nothing: the first city chosen becomes home (plan
 * §4.4), once. Not from a phone in another country (from Germany we cannot tell a home from a plan, and a wrong home
 * makes every later launch "travel"), and never a coming-soon or Elsewhere city. Settings can always set it.
 */
export function homeAfterChoice(input: { homeCitySlug: string | null | undefined; chosen: CityOption | null; deviceCountry: string | null }): string | null {
  const { homeCitySlug, chosen, deviceCountry } = input
  if (homeCitySlug || !chosen?.slug || !chosen.country || !opens(chosen)) return null
  // Not knowing where the phone is (sharing off, the geocode not back) is not knowing: Settings is the way to set it.
  if (!deviceCountry || deviceCountry !== chosen.country) return null
  return chosen.slug
}

/**
 * The travel banner (plan §4.2), or null. Once per switch: `seen` is the stored city's `travelSeen`, which a new choice
 * clears. Not over a coming-soon city, whose own screen is the message.
 */
export function travelBanner(input: {
  home: CityOption | null
  browse: CityOption | null
  deviceCountry: string | null
  countries: readonly CatalogueCountry[]
  seen: boolean
}): { kind: 'browsing' | 'visiting'; text: string; back: string } | null {
  const { home, browse, deviceCountry, countries, seen } = input
  if (seen || !home || !browse || !opens(browse)) return null
  const where = { homeCountry: home.country ?? null, browseCountry: browse.country ?? null }
  if (!isTravelling(where)) return null
  if (isVisiting({ ...where, deviceCountry })) return { kind: 'visiting', text: `Visiting ${browse.city}. Times are local.`, back: home.city }
  const country = countries.find((c) => c.code === browse.country)?.name ?? browse.city
  return { kind: 'browsing', text: `Browsing ${country}. Times are ${browse.city} time. Check-in opens when you’re there.`, back: home.city }
}

/**
 * Who is waiting where (`POST /events/demand`): the place an away phone is in, or a coming-soon city being browsed
 * (a Toronto phone on Toronto's coming-soon screen, or a tap on the row). Null for a served city.
 */
export function cityDemand(input: { away: AwayNotice | null; selected: CityOption | null; deviceCountry?: string | null }): { city: string; country?: string } | null {
  const { away, selected, deviceCountry } = input
  const withCountry = (city: string, country: string | null | undefined) => (country ? { city, country } : { city })
  if (selected && !opens(selected)) return withCountry(selected.city, selected.country)
  return away ? withCountry(away.deviceCity, deviceCountry) : null
}

export interface PickerGroup {
  key: string
  /** "INDIA · HOME", "CANADA", "ELSEWHERE"; null for an older server's single list. */
  label: string | null
  cities: CityOption[]
}

/**
 * The picker's rows by country (plan §4.1): home first, marked "· HOME", then the phone's country when it differs,
 * then the rest in the server's order, Elsewhere last. Search runs across all of them and keeps only the headers that
 * still have a match. Within a group the server's order stands (busiest first).
 */
export function pickerGroups(input: {
  cities: readonly CityOption[]
  countries: readonly CatalogueCountry[]
  homeCountry: string | null
  deviceCountry: string | null
  query: string
}): PickerGroup[] {
  const { cities, countries, homeCountry, deviceCountry } = input
  const needle = input.query.trim().toLowerCase()
  const shown = needle ? cities.filter((c) => c.city.toLowerCase().includes(needle)) : [...cities]
  if (countries.length === 0) return shown.length > 0 ? [{ key: 'all', label: null, cities: shown }] : []

  const rank = (code: string) => (code === homeCountry ? 0 : code === deviceCountry ? 1 : 2)
  const ordered = countries
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c.code) - rank(b.c.code) || a.i - b.i)
    .map(({ c }) => c)
  const known = new Set(ordered.map((c) => c.code))
  const groups: PickerGroup[] = ordered.map((c) => ({
    key: c.code,
    label: `${c.name.toUpperCase()}${c.code === homeCountry ? ' · HOME' : ''}`,
    cities: shown.filter((city) => city.country === c.code),
  }))
  groups.push({ key: 'elsewhere', label: 'ELSEWHERE', cities: shown.filter((city) => !city.country || !known.has(city.country)) })
  return groups.filter((g) => g.cities.length > 0)
}
