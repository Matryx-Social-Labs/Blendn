import {
  isBrowsingHere,
  resolveBrowseCity,
  sameCity,
  shouldOfferSwitch,
  type CityOption,
} from '../lib/city'

/**
 * Which city you are browsing.
 *
 * The bug these rules replace: three different notions of "where you are" in
 * one screen — a 10 km GPS box deciding what was fetched, `profile.location`
 * deciding what the header said, and a city-name filter over the result. A
 * device in Germany showed a Bengaluru header above a query that could only
 * return German events, found none, and blanked the page.
 *
 * The property worth protecting: **the app always has somewhere to browse.**
 * Every fallback here exists because some real failure — no stored choice,
 * location denied, a geocoder that named a city with nothing in it — would
 * otherwise end in an empty screen.
 */

const AVAILABLE: CityOption[] = [
  { city: 'Bengaluru', eventCount: 12 },
  { city: 'Mumbai', eventCount: 3 },
]

describe('sameCity', () => {
  it('matches the way the server does, ignoring case and padding', () => {
    expect(sameCity('Bengaluru', ' bengaluru ')).toBe(true)
  })

  it('does not match different cities', () => {
    expect(sameCity('Bengaluru', 'Mumbai')).toBe(false)
  })

  it('treats absent as "no answer", never as a match', () => {
    // Two unknowns are not the same place. If this returned true, a device with
    // no location fix would look like it was in whatever city you were browsing
    // and the "you're in X, switch?" prompt would never appear.
    expect(sameCity(null, null)).toBe(false)
    expect(sameCity('Bengaluru', null)).toBe(false)
  })
})

describe('resolveBrowseCity', () => {
  it('honours what the user chose last time', () => {
    expect(
      resolveBrowseCity({ stored: 'Mumbai', deviceCity: 'Bengaluru', available: AVAILABLE })
    ).toBe('Mumbai')
  })

  it('honours a stored city even when it has nothing on this week', () => {
    // Moving someone off their own choice silently is worse than showing them
    // an empty city with a picker — they at least know why it is empty.
    expect(
      resolveBrowseCity({ stored: 'Chennai', deviceCity: 'Bengaluru', available: AVAILABLE })
    ).toBe('Chennai')
  })

  it('suggests the device city on a first launch', () => {
    expect(
      resolveBrowseCity({ stored: null, deviceCity: 'Bengaluru', available: AVAILABLE })
    ).toBe('Bengaluru')
  })

  it("returns the server's spelling, not the geocoder's", () => {
    // The value is sent straight back as a filter, so it has to be one the
    // server will match rather than whatever the device's geocoder produced.
    expect(
      resolveBrowseCity({ stored: null, deviceCity: 'bengaluru', available: AVAILABLE })
    ).toBe('Bengaluru')
  })

  it('falls back to the busiest city when the device city has no events', () => {
    // Landing on an empty screen with a prompt is worse than landing on a full
    // one with a picker.
    expect(
      resolveBrowseCity({ stored: null, deviceCity: 'Reykjavík', available: AVAILABLE })
    ).toBe('Bengaluru')
  })

  it('falls back to the busiest city when location was denied', () => {
    expect(resolveBrowseCity({ stored: null, deviceCity: null, available: AVAILABLE })).toBe(
      'Bengaluru'
    )
  })

  it('is null only when the platform has no events at all', () => {
    expect(resolveBrowseCity({ stored: null, deviceCity: null, available: [] })).toBeNull()
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
    // A prompt whose only outcome is an empty screen is worse than no prompt.
    expect(
      shouldOfferSwitch({ selected: 'Bengaluru', deviceCity: 'Reykjavík', available: AVAILABLE })
    ).toBeNull()
  })

  it('stays quiet without a location fix', () => {
    expect(
      shouldOfferSwitch({ selected: 'Bengaluru', deviceCity: null, available: AVAILABLE })
    ).toBeNull()
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
