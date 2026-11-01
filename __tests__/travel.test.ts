import {
  awayNotice,
  browseCountry,
  cityDemand,
  cityOnResume,
  hereCity,
  homeAfterChoice,
  homeCity,
  isServedCity,
  isTravelling,
  isVisiting,
  parseStoredCity,
  pickerGroups,
  resolveBrowseCity,
  shouldOfferSwitch,
  storedAt,
  travelBanner,
  type CityCatalogue,
  type CityOption,
} from '../lib/city'

/**
 * Travel mode, phase 2 (plan §1.1, §4): the catalogue the server sends since P1 (admin #898), read on the device.
 *
 * The fixture is staging's own shape on 2026-11-01, trimmed: busiest first, so `cities[0]` is Mysuru — the row the
 * old fallback opened for everyone the server could not place (SCRUM-997, "Showing Mysuru").
 */
const box = (minLat: number, minLon: number, maxLat: number, maxLon: number) => ({ minLat, minLon, maxLat, maxLon })
const row = (o: Partial<CityOption> & { city: string }): CityOption => ({ eventCount: 0, placeCount: 0, access: 'full', isDefault: false, ...o })

const MYSURU = row({ city: 'Mysuru', slug: 'mysuru', country: 'IN', timezone: 'Asia/Kolkata', eventCount: 55, bounds: box(12.22, 76.55, 12.4, 76.75) })
const BENGALURU = row({ city: 'Bengaluru', slug: 'bengaluru', country: 'IN', timezone: 'Asia/Kolkata', eventCount: 48, placeCount: 1542, isDefault: true, bounds: box(12.83, 77.45, 13.14, 77.78) })
const MUMBAI = row({ city: 'Mumbai', slug: 'mumbai', country: 'IN', timezone: 'Asia/Kolkata', placeCount: 1206, bounds: box(18.89, 72.77, 19.28, 73.03) })
const THANE = row({ city: 'Thane', slug: 'thane', country: 'IN', timezone: 'Asia/Kolkata', placeCount: 115, bounds: box(19.15, 72.93, 19.32, 73.1) })
const TORONTO = row({ city: 'Toronto', slug: 'toronto', country: 'CA', timezone: 'America/Toronto', access: 'comingSoon', launchState: 'preview', bounds: box(43.58, -79.64, 43.86, -79.11) })
const VANCOUVER = row({ city: 'Vancouver', slug: 'vancouver', country: 'CA', timezone: 'America/Vancouver', access: 'comingSoon', launchState: 'preview', bounds: box(49.2, -123.27, 49.32, -123.02) })
const ELSEWHERE = row({ city: 'Hosur', slug: null, country: null, timezone: null, eventCount: 2 })

const CITIES = [MYSURU, BENGALURU, MUMBAI, THANE, TORONTO, VANCOUVER, ELSEWHERE]
const COUNTRIES = [
  { code: 'IN', name: 'India', launchState: 'live', defaultCitySlug: 'bengaluru' },
  { code: 'CA', name: 'Canada', launchState: 'preview', defaultCitySlug: 'toronto' },
]
const catalogue = (device: CityCatalogue['device'], cities: CityOption[] = CITIES): CityCatalogue => ({
  cities,
  countries: COUNTRIES,
  defaultCitySlug: 'bengaluru',
  device,
})

/** What `resolveBrowseCity` reads off a catalogue. */
const scope = (c: CityCatalogue) => ({ available: c.cities, device: c.device, defaultCitySlug: c.defaultCitySlug })

const AT = {
  indiranagar: { latitude: 12.9719, longitude: 77.6412 },
  thane: { latitude: 19.2, longitude: 72.98 },
  goa: { latitude: 15.49, longitude: 73.82 },
  toronto: { latitude: 43.6532, longitude: -79.3832 },
  montreal: { latitude: 45.5019, longitude: -73.5674 },
  saarbrucken: { latitude: 49.2402, longitude: 6.9969 },
}

/** A Toronto preview opened to this person (`market_previewers`): the same rows, Canada full. */
const previewer = CITIES.map((c) => (c.country === 'CA' ? { ...c, access: 'full' as const } : c))

describe('resolveBrowseCity — the first launch, by where the phone is (SCRUM-997)', () => {
  it('an Indian device opens the city whose box holds it', () => {
    const c = catalogue({ country: 'IN', access: 'full', citySlug: 'bengaluru' })
    expect(resolveBrowseCity({ stored: null, deviceCity: 'Bengaluru', point: AT.indiranagar, ...scope(c) })).toEqual({
      city: 'Bengaluru',
      source: 'inferred',
      slug: 'bengaluru',
    })
  })

  it('opens the smallest box that holds the phone, not the bigger one around it', () => {
    // Thane's box sits inside Mumbai's corner; the server's rule is the smallest box wins.
    const c = catalogue({ country: 'IN', access: 'full', citySlug: 'bengaluru' })
    expect(resolveBrowseCity({ stored: null, deviceCity: 'Thane', point: AT.thane, ...scope(c) })?.city).toBe('Thane')
  })

  it('an Indian device outside every box opens the country’s city the server names, not the busiest row', () => {
    // citySlug differs from the default here, so the device branch is what answers, not the fallback.
    const c = catalogue({ country: 'IN', access: 'full', citySlug: 'mumbai' })
    expect(resolveBrowseCity({ stored: null, deviceCity: 'Panaji', point: AT.goa, ...scope(c) })?.city).toBe('Mumbai')
  })

  it('a Toronto device while Canada is in preview opens Toronto’s coming-soon city, not Mysuru', () => {
    const c = catalogue({ country: 'CA', access: 'comingSoon', citySlug: 'toronto' })
    const picked = resolveBrowseCity({ stored: null, deviceCity: 'Toronto', point: AT.toronto, ...scope(c) })
    expect(picked).toEqual({ city: 'Toronto', source: 'inferred', slug: 'toronto' })
    expect(isServedCity(picked!.city, c.cities)).toBe(false)
  })

  it('a Canadian device outside both boxes still opens Canada’s city', () => {
    const c = catalogue({ country: 'CA', access: 'comingSoon', citySlug: 'toronto' })
    expect(resolveBrowseCity({ stored: null, deviceCity: 'Montréal', point: AT.montreal, ...scope(c) })?.city).toBe('Toronto')
  })

  it('a German device browses the default city, never the first row', () => {
    const c = catalogue({ country: 'DE', access: 'none', citySlug: null })
    expect(resolveBrowseCity({ stored: null, deviceCity: 'Saarbrücken', point: AT.saarbrucken, ...scope(c) })).toEqual({
      city: 'Bengaluru',
      source: 'inferred',
      slug: 'bengaluru',
    })
  })

  it('location denied on a first launch browses the default city', () => {
    expect(resolveBrowseCity({ stored: null, deviceCity: null, ...scope(catalogue(null)) })?.city).toBe('Bengaluru')
  })

  it('a Toronto previewer opens Toronto in full', () => {
    const c = catalogue({ country: 'CA', access: 'full', citySlug: 'toronto' }, previewer)
    const picked = resolveBrowseCity({ stored: null, deviceCity: 'Toronto', point: AT.toronto, ...scope(c) })
    expect(picked?.city).toBe('Toronto')
    expect(isServedCity('Toronto', c.cities)).toBe(true)
  })

  it('still honours a stored choice over everything, and gives it the catalogue’s slug', () => {
    const c = catalogue({ country: 'CA', access: 'comingSoon', citySlug: 'toronto' })
    expect(resolveBrowseCity({ stored: { city: 'mumbai', source: 'chosen' }, deviceCity: 'Toronto', ...scope(c) })).toEqual({
      city: 'mumbai',
      source: 'chosen',
      slug: 'mumbai',
    })
  })

  it('an older server, which names no default, keeps its busiest-first fallback', () => {
    // Control for the line above: the same list with no `defaultCitySlug` is the only case that may use row 0.
    expect(resolveBrowseCity({ stored: null, deviceCity: null, available: CITIES.map(({ city, eventCount }) => ({ city, eventCount })) })?.city).toBe('Mysuru')
  })
})

describe('hereCity — where the phone is, in the catalogue’s terms', () => {
  it('reads the box before the geocoder’s name ("New Delhi" is not a row; its point is)', () => {
    expect(hereCity({ available: CITIES, point: AT.indiranagar, deviceCity: 'Bangalore Urban' })?.city).toBe('Bengaluru')
  })

  it('falls back to a name for a row with no box (Elsewhere)', () => {
    expect(hereCity({ available: CITIES, point: { latitude: 12.74, longitude: 77.83 }, deviceCity: 'hosur' })?.city).toBe('Hosur')
  })

  it('is null in a country we do not serve', () => {
    expect(hereCity({ available: CITIES, point: AT.saarbrucken, deviceCity: 'Saarbrücken' })).toBeNull()
  })
})

describe('a coming-soon city is listed, but is not somewhere to switch to', () => {
  it('is not offered as a switch', () => {
    expect(shouldOfferSwitch({ selected: 'Bengaluru', deviceCity: 'Toronto', available: CITIES })).toBeNull()
  })

  it('says it is coming, instead', () => {
    expect(awayNotice({ selected: 'Bengaluru', deviceCity: 'Toronto', available: CITIES })).toEqual({
      kind: 'comingSoon',
      deviceCity: 'Toronto',
      selected: 'Bengaluru',
    })
  })

  it('a German device is told we are not there, never that anything is near it', () => {
    expect(awayNotice({ selected: 'Bengaluru', deviceCity: 'Saarbrücken', available: CITIES })).toEqual({
      kind: 'notThere',
      deviceCity: 'Saarbrücken',
      selected: 'Bengaluru',
    })
  })

  it('a guess moves to the coming-soon city the phone is in (the first launch in Canada)', () => {
    expect(cityOnResume({ stored: { city: 'Bengaluru', source: 'inferred' }, deviceCity: 'Toronto', available: CITIES })).toBe('Toronto')
  })
})

describe('cityDemand — who is waiting where', () => {
  it('records the coming-soon city being browsed, with its country', () => {
    expect(cityDemand({ away: null, selected: TORONTO })).toEqual({ city: 'Toronto', country: 'CA' })
  })

  it('records where an away phone is', () => {
    expect(cityDemand({ away: { kind: 'notThere', deviceCity: 'Saarbrücken', selected: 'Bengaluru' }, selected: BENGALURU, deviceCountry: 'DE' })).toEqual({ city: 'Saarbrücken', country: 'DE' })
  })

  it('records nothing for a served city', () => {
    expect(cityDemand({ away: null, selected: BENGALURU })).toBeNull()
  })
})

describe('home, browse country, travelling and visiting (plan §1.1)', () => {
  it('home is the profile’s city, read through the catalogue', () => {
    expect(homeCity({ homeCitySlug: 'bengaluru', available: CITIES })?.city).toBe('Bengaluru')
    expect(homeCity({ homeCitySlug: null, available: CITIES })).toBeNull()
  })

  it('a home the catalogue no longer lists (hidden, removed) reads as unset', () => {
    expect(homeCity({ homeCitySlug: 'pune', available: CITIES })).toBeNull()
  })

  it('the browse country is the city’s; an Elsewhere city has none', () => {
    expect(browseCountry('Toronto', CITIES)).toBe('CA')
    expect(browseCountry('Hosur', CITIES)).toBeNull()
  })

  it('travelling is another country, not another city', () => {
    expect(isTravelling({ homeCountry: 'IN', browseCountry: 'CA' })).toBe(true)
    expect(isTravelling({ homeCountry: 'IN', browseCountry: 'IN' })).toBe(false)
    // Home unset (a German device on its first launch): never "travelling", or it would be for ever.
    expect(isTravelling({ homeCountry: null, browseCountry: 'IN' })).toBe(false)
    expect(isTravelling({ homeCountry: 'IN', browseCountry: null })).toBe(false)
  })

  it('visiting is travelling with the phone in the browsed country', () => {
    expect(isVisiting({ homeCountry: 'IN', browseCountry: 'CA', deviceCountry: 'CA' })).toBe(true)
    expect(isVisiting({ homeCountry: 'IN', browseCountry: 'CA', deviceCountry: 'IN' })).toBe(false)
    expect(isVisiting({ homeCountry: 'IN', browseCountry: 'IN', deviceCountry: 'IN' })).toBe(false)
  })

  it('the first choice becomes home, unless the phone is in another country', () => {
    expect(homeAfterChoice({ homeCitySlug: null, chosen: BENGALURU, deviceCountry: 'IN' })).toBe('bengaluru')
    // Sharing off or the geocode not back: unknown is not India. Settings sets it instead.
    expect(homeAfterChoice({ homeCitySlug: null, chosen: BENGALURU, deviceCountry: null })).toBeNull()
    // From Germany we do not know their home: picking Bengaluru there must not make every later visit "travel".
    expect(homeAfterChoice({ homeCitySlug: null, chosen: BENGALURU, deviceCountry: 'DE' })).toBeNull()
    // A coming-soon or Elsewhere city is not a home.
    expect(homeAfterChoice({ homeCitySlug: null, chosen: TORONTO, deviceCountry: 'CA' })).toBeNull()
    expect(homeAfterChoice({ homeCitySlug: null, chosen: ELSEWHERE, deviceCountry: 'IN' })).toBeNull()
    // Set once: a later choice abroad never moves it.
    expect(homeAfterChoice({ homeCitySlug: 'bengaluru', chosen: MUMBAI, deviceCountry: 'IN' })).toBeNull()
  })
})

describe('travelBanner — once per switch, with the way back', () => {
  const countries = COUNTRIES
  it('browsing another country from home', () => {
    expect(travelBanner({ home: BENGALURU, browse: previewer[4], deviceCountry: 'IN', countries, seen: false })).toEqual({
      kind: 'browsing',
      text: 'Browsing Canada. Times are Toronto time. Check-in opens when you’re there.',
      back: 'Bengaluru',
    })
  })

  it('visiting: the phone is there', () => {
    expect(travelBanner({ home: BENGALURU, browse: previewer[4], deviceCountry: 'CA', countries, seen: false })).toEqual({
      kind: 'visiting',
      text: 'Visiting Toronto. Times are local.',
      back: 'Bengaluru',
    })
  })

  it('nothing in your own country, nothing with home unset, nothing once dismissed', () => {
    expect(travelBanner({ home: BENGALURU, browse: MUMBAI, deviceCountry: 'IN', countries, seen: false })).toBeNull()
    expect(travelBanner({ home: null, browse: BENGALURU, deviceCountry: 'DE', countries, seen: false })).toBeNull()
    expect(travelBanner({ home: BENGALURU, browse: previewer[4], deviceCountry: 'IN', countries, seen: true })).toBeNull()
  })

  it('a coming-soon city has its own screen, not a travel banner over it', () => {
    expect(travelBanner({ home: BENGALURU, browse: TORONTO, deviceCountry: 'IN', countries, seen: false })).toBeNull()
  })
})

describe('pickerGroups — by country, home first (plan §4.1)', () => {
  const groups = (o: Partial<Parameters<typeof pickerGroups>[0]> = {}) =>
    pickerGroups({ cities: CITIES, countries: COUNTRIES, homeCountry: 'IN', deviceCountry: null, query: '', ...o }).map((g) => [
      g.label,
      g.cities.map((c) => c.city),
    ])

  it('home first, marked, then the rest, Elsewhere last', () => {
    expect(groups()).toEqual([
      ['INDIA · HOME', ['Mysuru', 'Bengaluru', 'Mumbai', 'Thane']],
      ['CANADA', ['Toronto', 'Vancouver']],
      ['ELSEWHERE', ['Hosur']],
    ])
  })

  it('a Canadian home puts Canada first; the phone’s country comes next when it differs', () => {
    expect(groups({ homeCountry: 'CA' }).map((g) => g[0])).toEqual(['CANADA · HOME', 'INDIA', 'ELSEWHERE'])
    expect(groups({ homeCountry: null, deviceCountry: 'CA' }).map((g) => g[0])).toEqual(['CANADA', 'INDIA', 'ELSEWHERE'])
  })

  it('search runs across groups and keeps only the headers with a match', () => {
    expect(groups({ query: 'to' })).toEqual([['CANADA', ['Toronto']]])
    expect(groups({ query: 'an' })).toEqual([
      ['INDIA · HOME', ['Thane']],
      ['CANADA', ['Vancouver']],
    ])
  })

  it('an older server (no countries) is one unlabelled group, as before', () => {
    const old = CITIES.map(({ city, eventCount }) => ({ city, eventCount }))
    expect(pickerGroups({ cities: old, countries: [], homeCountry: null, deviceCountry: null, query: '' })).toEqual([{ key: 'all', label: null, cities: old }])
  })
})

describe('storedAt — a guess keeps its slug and centre, so the next launch keeps it', () => {
  it('a guess moved by the geocode reads back as itself, not as an old build’s slugless guess', () => {
    const stored = { ...MUMBAI, centre: { latitude: 19.07, longitude: 72.87 } }
    const back = parseStoredCity(JSON.stringify(storedAt(stored, 'inferred')))
    expect(back).toEqual({ city: 'Mumbai', source: 'inferred', slug: 'mumbai', centre: { latitude: 19.07, longitude: 72.87 } })
  })
})

describe('parseStoredCity — v3 carries the slug and the banner it has shown', () => {
  it('reads the slug, and drops one that is not a string', () => {
    expect(parseStoredCity('{"city":"Toronto","source":"chosen","slug":"toronto","travelSeen":true}')).toEqual({
      city: 'Toronto',
      source: 'chosen',
      slug: 'toronto',
      travelSeen: true,
    })
    expect(parseStoredCity('{"city":"Toronto","source":"chosen","slug":7}')).toEqual({ city: 'Toronto', source: 'chosen' })
  })
})
