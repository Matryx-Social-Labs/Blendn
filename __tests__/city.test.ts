import {
  awayNotice,
  cityOnResume,
  isBrowsingHere,
  isServedCity,
  parseStoredCity,
  resolveBrowseCity,
  sameCity,
  shouldOfferSwitch,
  type CityOption,
  type StoredCity,
} from '../lib/city'

/**
 * Which city you are browsing.
 *
 * Two bugs shaped these rules, and both were found on a real device rather than
 * by reading the code.
 *
 * **The first**: three notions of "where you are" in one screen — a 10 km GPS
 * box deciding what was fetched, `profile.location` deciding the header, and a
 * city-name filter over the result. A phone in Germany showed a Bengaluru
 * header over a query that could only return German events, found none, and
 * blanked the page.
 *
 * **The second, subtler**: the fix's own guards. Falling back to the busiest
 * city, staying quiet about a city with no events, and listing only cities that
 * have events are each defensible alone. Together they put a user in Germany
 * into Bengaluru with no way to say where they actually were.
 *
 * So the property under test is not "picks the right city" — it is **the user
 * can always express where they are, and is never silently moved off a decision
 * they made.**
 */

const AVAILABLE: CityOption[] = [
  { city: 'Bengaluru', eventCount: 12 },
  { city: 'Mumbai', eventCount: 3 },
]

const chosen = (city: string): StoredCity => ({ city, source: 'chosen' })
const inferred = (city: string): StoredCity => ({ city, source: 'inferred' })

describe('sameCity', () => {
  it('matches the way the server does, ignoring case and padding', () => {
    expect(sameCity('Bengaluru', ' bengaluru ')).toBe(true)
  })

  it('does not match different cities', () => {
    expect(sameCity('Bengaluru', 'Mumbai')).toBe(false)
  })

  it('treats absent as "no answer", never as a match', () => {
    // If two unknowns matched, a device with no fix would look like it was in
    // whatever city you were browsing and the switch offer would never appear.
    expect(sameCity(null, null)).toBe(false)
    expect(sameCity('Bengaluru', null)).toBe(false)
  })
})

describe('resolveBrowseCity', () => {
  it('honours what the user chose last time', () => {
    expect(
      resolveBrowseCity({ stored: chosen('Mumbai'), deviceCity: 'Bengaluru', available: AVAILABLE })
    ).toEqual(chosen('Mumbai'))
  })

  it('honours a stored city even when it has nothing on this week', () => {
    expect(
      resolveBrowseCity({ stored: chosen('Chennai'), deviceCity: 'Bengaluru', available: AVAILABLE })
    ).toEqual(chosen('Chennai'))
  })

  it('marks a first-launch device match as inferred, not chosen', () => {
    // The distinction the whole policy rests on: nobody picked this, so a later
    // launch somewhere else is allowed to replace it.
    expect(
      resolveBrowseCity({ stored: null, deviceCity: 'Bengaluru', available: AVAILABLE })
    ).toEqual(inferred('Bengaluru'))
  })

  it("returns the server's spelling, not the geocoder's", () => {
    // The value goes straight back as a filter, so it has to be one the server
    // will match rather than whatever the device's geocoder produced.
    expect(
      resolveBrowseCity({ stored: null, deviceCity: 'bengaluru', available: AVAILABLE })
    ).toEqual(inferred('Bengaluru'))
  })

  it('falls back to the busiest city, still inferred', () => {
    // This is the line that put a user in Germany into Bengaluru. It is correct
    // — landing on a populated screen beats landing on an empty one — but only
    // because `inferred` means it can be undone without being a decision.
    expect(
      resolveBrowseCity({ stored: null, deviceCity: 'Reykjavík', available: AVAILABLE })
    ).toEqual(inferred('Bengaluru'))
  })

  it('is null only when the platform has no events at all', () => {
    expect(resolveBrowseCity({ stored: null, deviceCity: null, available: [] })).toBeNull()
  })
})

describe('cityOnResume — replace a guess, never a choice', () => {
  it('moves an inferred city to where the device now is', () => {
    expect(
      cityOnResume({ stored: inferred('Bengaluru'), deviceCity: 'Mumbai', available: AVAILABLE })
    ).toBe('Mumbai')
  })

  it('never moves a chosen city', () => {
    // A two-hour layover in Mumbai must not delete the plans you were making
    // for home. This one gets the banner instead.
    expect(
      cityOnResume({ stored: chosen('Bengaluru'), deviceCity: 'Mumbai', available: AVAILABLE })
    ).toBeNull()
  })

  it('stays put when the device city has no events', () => {
    // Moving someone onto an empty screen on our own initiative is the one
    // thing worse than leaving them where they are. Going there anyway is what
    // "use my current location" in the picker is for — a decision, not a nudge.
    expect(
      cityOnResume({ stored: inferred('Bengaluru'), deviceCity: 'Reykjavík', available: AVAILABLE })
    ).toBeNull()
  })

  it('does nothing when already browsing where you are', () => {
    expect(
      cityOnResume({ stored: inferred('Bengaluru'), deviceCity: 'bengaluru', available: AVAILABLE })
    ).toBeNull()
  })

  it('does nothing without a location fix', () => {
    expect(
      cityOnResume({ stored: inferred('Bengaluru'), deviceCity: null, available: AVAILABLE })
    ).toBeNull()
  })

  it('is not time-based — an old choice is still a choice', () => {
    // There is no timestamp anywhere in this module, on purpose. A home city
    // does not go stale after thirty days, and any threshold would be picked
    // out of the air.
    expect(
      cityOnResume({ stored: chosen('Bengaluru'), deviceCity: 'Mumbai', available: AVAILABLE })
    ).toBeNull()
  })
})

describe('shouldOfferSwitch', () => {
  it('offers when the device is somewhere else that has events', () => {
    expect(
      shouldOfferSwitch({ selected: 'Bengaluru', deviceCity: 'Mumbai', available: AVAILABLE })
    ).toBe('Mumbai')
  })

  it('stays quiet when already browsing where you are', () => {
    expect(
      shouldOfferSwitch({ selected: 'Bengaluru', deviceCity: 'bengaluru', available: AVAILABLE })
    ).toBeNull()
  })

  it('stays quiet when the device city has nothing to switch to', () => {
    expect(
      shouldOfferSwitch({ selected: 'Bengaluru', deviceCity: 'Reykjavík', available: AVAILABLE })
    ).toBeNull()
  })
})

describe('awayNotice — the half that speaks when switching is not an option', () => {
  it('says where you are when your city has no events', () => {
    // Saarbrücken, browsing Bengaluru. Before this, the app knew exactly where
    // the user was and said nothing at all — no banner, no mention, just a
    // heading they had to infer the meaning of.
    expect(
      awayNotice({ selected: 'Bengaluru', deviceCity: 'Saarbrücken', available: AVAILABLE })
    ).toEqual({ deviceCity: 'Saarbrücken', selected: 'Bengaluru' })
  })

  it('stays quiet when the switch offer will speak instead', () => {
    // The exclusivity that matters: never two messages about the same fact.
    expect(
      awayNotice({ selected: 'Bengaluru', deviceCity: 'Mumbai', available: AVAILABLE })
    ).toBeNull()
  })

  it('stays quiet when you are where you are browsing', () => {
    expect(
      awayNotice({ selected: 'Bengaluru', deviceCity: 'bengaluru', available: AVAILABLE })
    ).toBeNull()
  })

  it('stays quiet without a location fix', () => {
    expect(
      awayNotice({ selected: 'Bengaluru', deviceCity: null, available: AVAILABLE })
    ).toBeNull()
  })

  it('stays quiet before a city has been resolved', () => {
    expect(
      awayNotice({ selected: null, deviceCity: 'Saarbrücken', available: AVAILABLE })
    ).toBeNull()
  })

  it('is never shown at the same time as the switch offer', () => {
    // The property, checked across every combination rather than by inspection:
    // exactly one of these may speak, and neither may speak twice.
    const cities = ['Bengaluru', 'Mumbai', 'Saarbrücken', 'bengaluru', null]
    for (const selected of cities) {
      for (const deviceCity of cities) {
        const away = awayNotice({ selected, deviceCity, available: AVAILABLE })
        const switchTo = shouldOfferSwitch({ selected, deviceCity, available: AVAILABLE })
        expect(Boolean(away) && Boolean(switchTo)).toBe(false)
      }
    }
  })
})

describe('isServedCity — "nothing this week" is not "we are not here"', () => {
  it('is true for a city in the list', () => {
    expect(isServedCity('bengaluru', AVAILABLE)).toBe(true)
  })

  it('is false for a city we have no events in', () => {
    // Drives the empty state. A user who picked their own city should be told
    // we are not live there yet, not that the week happens to be quiet.
    expect(isServedCity('Reykjavík', AVAILABLE)).toBe(false)
  })

  it('is false when nothing is selected', () => {
    expect(isServedCity(null, AVAILABLE)).toBe(false)
  })
})

describe('parseStoredCity — reading what the last version wrote', () => {
  it('reads the current shape', () => {
    expect(parseStoredCity('{"city":"Mumbai","source":"inferred"}')).toEqual(inferred('Mumbai'))
  })

  it('reads a bare string from the old build as chosen', () => {
    // Conservative on purpose. Everyone upgrading either picked their city or
    // accepted a default; reading it as chosen means the worst case is being
    // *asked* to switch. Being *moved* without warning is the harm.
    expect(parseStoredCity('Bengaluru')).toEqual(chosen('Bengaluru'))
  })

  it('defaults an unrecognised source to chosen', () => {
    expect(parseStoredCity('{"city":"Mumbai","source":"nonsense"}')).toEqual(chosen('Mumbai'))
  })

  it('returns null for nothing, blanks, and corruption', () => {
    // All three land on a fresh inference, which beats throwing on the launch
    // path — a storage problem must not be a blank app.
    expect(parseStoredCity(null)).toBeNull()
    expect(parseStoredCity('   ')).toBeNull()
    expect(parseStoredCity('{"city":')).toBeNull()
    expect(parseStoredCity('{"source":"chosen"}')).toBeNull()
  })
})

describe('isBrowsingHere', () => {
  it('is true when the device is in the browsed city', () => {
    expect(isBrowsingHere('Bengaluru', 'bengaluru')).toBe(true)
  })

  it('is false while GPS has not resolved', () => {
    // Drives whether distances are shown. False here means the section is
    // relabelled rather than hidden, so the page keeps its shape instead of
    // flickering as the fix arrives.
    expect(isBrowsingHere('Bengaluru', null)).toBe(false)
  })
})
