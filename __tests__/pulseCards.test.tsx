/*
 * The home cards (BUILD-SPEC A2/A3/A5): the "here now" pill and its floor, the
 * Promoted label (a paid placement only, read first), the distance-led row, and
 * the Tonight set list's grammar. Pure helpers carry the rules; the components
 * only draw what they are given.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { EventCard, eventLabel } from '../components/ds/EventCard'
import { SetList, setRowLabel, splitClock } from '../components/pulse/SetList'
import type { BlendnEvent } from '../lib/api'
import { cardTime, homeCardProps } from '../lib/pulse'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const NOW = new Date(2026, 9, 20, 21, 41).getTime()
const at = (h: number, m = 0, day = 0) => new Date(2026, 9, 20 + day, h, m).toISOString()
const ev = (over: Partial<BlendnEvent> = {}) =>
  ({ id: 'e1', title: 'Vinyl Night', start_time: at(21), end_time: at(23), venue_name: 'Toit', city: 'Bengaluru', distance: 0.35, here_count: 23, going_count: 41, cover_image_url: null, ...over }) as unknown as BlendnEvent

describe('the time on a card', () => {
  it('Live, a clock, a weekday and a clock, then a date', () => {
    expect(cardTime(ev(), NOW)).toBe('Live')
    expect(cardTime(ev({ start_time: at(22, 30), end_time: at(23) }), NOW)).toBe('10:30 PM')
    expect(cardTime(ev({ start_time: at(21, 0, 4), end_time: at(23, 0, 4) }), NOW)).toMatch(/^Sat · 9 PM$/)
    expect(cardTime(ev({ start_time: at(21, 0, 12), end_time: at(23, 0, 12) }), NOW)).toBe('Sun 1 Nov · 9 PM')
  })
})

describe('what a compact card draws', () => {
  it('live: the here-now pill at five and up, never "going"; under five says nothing', () => {
    expect(homeCardProps(ev(), NOW, true)).toMatchObject({ time: 'Live', here: 23, going: undefined, distance: '350 m', venue: 'Toit' })
    expect(homeCardProps(ev({ here_count: 4 }), NOW, true)).toMatchObject({ here: undefined, going: undefined })
  })

  it('not yet on: the going count at five and up, nothing under; no distance without a fix', () => {
    const later = ev({ start_time: at(22), end_time: at(23, 30) })
    expect(homeCardProps(later, NOW, false)).toMatchObject({ here: undefined, going: 41, distance: undefined })
    expect(homeCardProps({ ...later, going_count: 4 } as BlendnEvent, NOW, false).going).toBeUndefined()
  })

  it('the venue falls back to the linked venue, then the city', () => {
    expect(homeCardProps(ev({ venue: { id: 'v', name: 'Linked' } as never }), NOW, true).venue).toBe('Linked')
    expect(homeCardProps(ev({ venue_name: '', venue: null }), NOW, true).venue).toBe('Bengaluru')
  })
})

describe('<EventCard> on the Pulse', () => {
  it('a Promoted card is read "Promoted" first, and draws the pill top-right; a card without it draws none', async () => {
    const base = { kind: 'compact' as const, title: 'Midnight Bass', time: 'Sat · 10:30 PM', venue: 'Pebble', distance: '4.8 km', going: 86 }
    const view = await render(<EventCard {...base} promoted testID="c" />)
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Promoted. Midnight Bass, Sat · 10:30 PM, at Pebble, 4.8 km, 86 going')
    expect(screen.getByTestId('c-promoted')).toBeTruthy()
    expect(screen.getByText('PROMOTED', { includeHiddenElements: true })).toBeTruthy()
    await view.rerender(<EventCard {...base} testID="c" />)
    expect(screen.queryByTestId('c-promoted')).toBeNull()
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Midnight Bass, Sat · 10:30 PM, at Pebble, 4.8 km, 86 going')
  })

  it('live: "Live." leads the label and the here-now pill replaces going', async () => {
    await render(<EventCard kind="compact" title="Vinyl Night" time="Live" venue="Toit" distance="350 m" here={23} going={41} testID="c" />)
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Live. Vinyl Night, at Toit, 350 m, 23 here now')
    expect(screen.getByTestId('c-here')).toBeTruthy()
    expect(screen.queryByText('41 going')).toBeNull()
    expect(eventLabel({ title: 'T', time: 'Live', venue: 'V', promoted: true })).toBe('Promoted. Live. T, at V')
  })

  it('the Nearby row is the design system’s own row: venue · distance · time, no column of its own', async () => {
    await render(<EventCard kind="row" title="Vinyl Night" time="Live" venue="Toit" distance="350 m" testID="r" />)
    expect(screen.getByText('Toit · 350 m')).toBeTruthy()
    expect(screen.getByText('Live')).toBeTruthy()
  })
})

describe('Tonight’s set list', () => {
  it('splits a clock into a time and its meridiem, in Geist Mono over a label', () => {
    expect(splitClock(new Date(2026, 9, 20, 22, 0).getTime())).toEqual({ time: '10:00', meridiem: 'PM' })
    expect(splitClock(new Date(2026, 9, 20, 9, 30).getTime())).toEqual({ time: '9:30', meridiem: 'PM'.replace('PM', 'AM') })
  })

  it('a row is read “10 PM. Title, at Venue, 2.9 km, 64 going”; a count under five and no fix say nothing', () => {
    const e = ev({ start_time: at(22), end_time: at(23, 30), going_count: 64, distance: 2.9 })
    expect(setRowLabel(e, true)).toBe('10 PM. Vinyl Night, at Toit, 2.9 km, 64 going')
    expect(setRowLabel({ ...e, going_count: 4 } as BlendnEvent, false)).toBe('10 PM. Vinyl Night, at Toit')
  })

  it('draws the NOW tick (hidden from a screen reader) and one pressable row per event', async () => {
    const list = [ev({ id: 'a', start_time: at(22), end_time: at(23) }), ev({ id: 'b', start_time: at(23), end_time: at(23, 59) })]
    await render(<SetList events={list} now={NOW} withDistance onPress={jest.fn()} />)
    expect(screen.getByTestId('set-now', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants')
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
