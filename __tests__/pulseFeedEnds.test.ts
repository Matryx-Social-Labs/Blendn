import { pulseEmptyCopy, quietWeekEnd, whereWeAre } from '../lib/pulseFeed'
import { leadPeekLine } from '../lib/pulseSections'
import { withFocus, type Pin } from '../lib/homeMap'
import type { CityOption } from '../lib/city'

/**
 * Flow 3 · Pulse, any country (Option C): a city we are not in yet says so and shows where Blend'n is on; a quiet week
 * ends with a sentence and a way on; the peek line is the lead's name and time; swiping the lead lights its venue.
 */

const NOW = Date.parse('2026-11-04T12:00:00Z')
const DAY = 86_400_000
const at = (ms: number) => ({ start_time: new Date(ms).toISOString(), end_time: null })

describe('quietWeekEnd', () => {
  const soon = [at(NOW + DAY), at(NOW + 3 * DAY)]
  it('says so when the whole list is loaded and it all starts this week', () => {
    expect(quietWeekEnd(soon, { hasMore: false, now: NOW })).toBe(true)
  })
  it('not while more pages may come', () => {
    expect(quietWeekEnd(soon, { hasMore: true, now: NOW })).toBe(false)
  })
  it('not when an event is past this week: "this week" would not be true', () => {
    expect(quietWeekEnd([...soon, at(NOW + 9 * DAY)], { hasMore: false, now: NOW })).toBe(false)
  })
  it('not over an empty list, which has its own state', () => {
    expect(quietWeekEnd([], { hasMore: false, now: NOW })).toBe(false)
  })
})

describe('whereWeAre', () => {
  const city = (name: string, eventCount: number, extra: Partial<CityOption> = {}): CityOption => ({ city: name, eventCount, country: 'IN', ...extra })
  const options = [city('Mysuru', 46), city('Bengaluru', 1240), city('Toronto', 0, { country: 'CA', access: 'comingSoon' }), city('Mumbai', 312), city('Pune', 3), city('Goa', 0)]

  it('the open cities with events, busiest first, with the count grouped', () => {
    expect(whereWeAre(options)).toEqual([
      { city: options[1], count: '1,240 events' },
      { city: options[3], count: '312 events' },
      { city: options[0], count: '46 events' },
      // Under five events: listed, the number not said.
      { city: options[4], count: null },
    ])
  })
  it('caps the list', () => {
    expect(whereWeAre(options, 2).map((r) => r.city.city)).toEqual(['Bengaluru', 'Mumbai'])
  })
})

describe('the not-here copy', () => {
  it('names the city and says we counted them, in plain words', () => {
    expect(pulseEmptyCopy('notLive', { city: 'Toronto', term: '' })).toEqual({
      title: 'We’re not in Toronto yet',
      message: 'You’re early, and we’ve counted you in. The more people ask, the sooner we open here.',
    })
  })
})

describe('leadPeekLine', () => {
  it('the lead’s name and its time, or nothing', () => {
    expect(leadPeekLine({ title: 'Midnight Bass', time: 'Sat · 10:30 PM' })).toBe('Midnight Bass · Sat · 10:30 PM')
    expect(leadPeekLine(null)).toBeNull()
  })
})

describe('withFocus', () => {
  const pin = (id: string, glow = 1): Pin => ({ id, kind: 'event', latitude: 12.97, longitude: 77.59, title: id, live: false, glow, startsAt: null, endsAt: null, bucket: null })
  it('lights the focused pin brightest and leaves the others at their own level', () => {
    const out = withFocus([pin('a'), pin('b', 3)], pin('a'))
    // Brighter, never "live": a lit venue for a Tuesday-noon event must not read LIVE on its map chip (drive, Android).
    expect(out.find((p) => p.id === 'a')).toMatchObject({ live: false, glow: 4 })
    expect(out.find((p) => p.id === 'b')).toMatchObject({ glow: 3 })
  })
  it('adds the focused venue when the map has not loaded its pin yet', () => {
    expect(withFocus([pin('b')], pin('a')).map((p) => p.id)).toEqual(['b', 'a'])
  })
  it('no focus: the same pins, untouched', () => {
    const pins = [pin('a')]
    expect(withFocus(pins, null)).toBe(pins)
  })
})
