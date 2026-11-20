/*
 * "Nothing near you yet" (pulse-map sheet 07 frames 3–4; the advisor's rules on SCRUM-1087): outside every served city
 * the map stays on you, the drawer shows the nearest open city the server names, and its distance is said once.
 */
import { farCity, farDistanceLine, nearYouCopy, openCitiesNearest } from '../lib/nothingNear'
import type { CityOption } from '../lib/city'

const SAAR = { latitude: 49.2402, longitude: 6.9969 }
const city = (c: Partial<CityOption> & { city: string }): CityOption => ({ eventCount: 5, access: 'full', ...c })
const BLR = city({ city: 'Bengaluru', slug: 'bengaluru', country: 'IN', centre: { latitude: 12.9716, longitude: 77.5946 } })
const MYS = city({ city: 'Mysuru', slug: 'mysuru', country: 'IN', centre: { latitude: 12.2958, longitude: 76.6394 } })
const TOR = city({ city: 'Toronto', slug: 'toronto', country: 'CA', centre: { latitude: 43.6532, longitude: -79.3832 }, access: 'comingSoon' })
const near = (over: object = {}) => ({ reachKm: 25, empty: true, nearestCity: { slug: 'bengaluru', name: 'Bengaluru', country: 'IN', distanceKm: 7518.4, centre: BLR.centre! }, ...over })

describe('farCity', () => {
  it('is the city the server names, with its distance, when nothing is within the reach', () => {
    expect(farCity({ near: near(), available: [BLR, MYS], selection: null, from: SAAR })).toEqual({ option: BLR, km: 7518.4 })
  })

  it('is none when something is near, the server sent no signal or names no city, or the city is not in the list', () => {
    expect(farCity({ near: near({ empty: false, nearestCity: null }), available: [BLR], selection: null, from: SAAR })).toBeNull()
    expect(farCity({ near: undefined, available: [BLR], selection: null, from: SAAR })).toBeNull()
    expect(farCity({ near: near({ nearestCity: null }), available: [BLR], selection: null, from: SAAR })).toBeNull()
    expect(farCity({ near: near(), available: [MYS], selection: null, from: SAAR })).toBeNull()
  })

  it('never overrides a city somebody chose: far is about the person, so their city stays, measured from the fix', () => {
    const chosen = farCity({ near: near(), available: [BLR, MYS], selection: { city: 'Mysuru', source: 'chosen' }, from: SAAR })
    expect(chosen?.option).toBe(MYS)
    expect(Math.round(chosen!.km / 100)).toBe(75)
    expect(farCity({ near: near(), available: [BLR, MYS], selection: { city: 'Mysuru', source: 'inferred' }, from: SAAR })?.option).toBe(BLR)
    // A chosen city the list does not have (or has no centre for): the server's city, as for a guess.
    expect(farCity({ near: near(), available: [BLR], selection: { city: 'Goa', source: 'chosen' }, from: SAAR })?.option).toBe(BLR)
  })
})

describe('farDistanceLine', () => {
  it('says it once, rounded as a person would: about 7,500 km, 310 km, 48 km', () => {
    expect(farDistanceLine('Bengaluru', 7518.4)).toBe('Bengaluru is about 7,500 km away')
    expect(farDistanceLine('Mysuru', 312.6)).toBe('Mysuru is about 310 km away')
    expect(farDistanceLine('Pune', 48.2)).toBe('Pune is about 48 km away')
  })
})

describe('openCitiesNearest', () => {
  it('names the open cities with something on, nearest first; never a coming-soon one', () => {
    expect(openCitiesNearest([TOR, BLR, MYS, city({ city: 'Empty', centre: SAAR, eventCount: 0 })], SAAR)).toEqual(['Mysuru', 'Bengaluru'])
  })
})

describe('nearYouCopy (frame 4, "Near you")', () => {
  it('says there is nothing within the reach and where Blend’n is on', () => {
    expect(nearYouCopy(25, ['Bengaluru', 'Mysuru', 'Pune'])).toEqual({
      title: 'Nothing within 25 km yet',
      message: 'Blend’n is on in Bengaluru, Mysuru and more. We’ll tell you the day it opens near you.',
    })
    expect(nearYouCopy(25, ['Bengaluru', 'Mysuru']).message).toBe('Blend’n is on in Bengaluru and Mysuru. We’ll tell you the day it opens near you.')
    expect(nearYouCopy(25, ['Bengaluru']).message).toBe('Blend’n is on in Bengaluru. We’ll tell you the day it opens near you.')
    expect(nearYouCopy(25, []).message).toBe('We’ll tell you the day Blend’n opens near you.')
  })
})
