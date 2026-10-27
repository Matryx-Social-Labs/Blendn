/*
 * The live tile's glow (BUILD-SPEC B2): a true cross-fade when the bucket moves while the tile is on screen,
 * two layers with distinct gradient ids, the old one dropped after `DURATION.medium`; a tile that scrolls in
 * is not a change; Reduce Motion swaps at once.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import type { VenueListItem } from '../lib/apiClient'

let mockReduce = false
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => mockReduce }))

/* eslint-disable import/first */
import { LiveTile, OpenCard } from '../components/places/PlaceCards'
import { DURATION, FONT_FAMILY } from '../lib/design/tokens'
import { textNodes } from './helpers/ax'
/* eslint-enable import/first */

const HIDDEN = { includeHiddenElements: true }
const venue = (liveNow: VenueListItem['liveNow']): VenueListItem => ({
  id: 'v1',
  name: 'Toit',
  address: '298, 100 Feet Road',
  city: 'Bengaluru',
  latitude: 12.9,
  longitude: 77.6,
  venueType: 'brewery',
  venueTypeLabel: 'Brewery',
  distance: 0.35,
  upcomingEventCount: 0,
  liveNow,
  nextEvent: null,
})

beforeEach(() => {
  mockReduce = false
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

describe('the glow', () => {
  it('a tile that scrolls in draws its bucket’s glow once, with nothing fading out', async () => {
    await render(<LiveTile venue={venue('5-9')} now={Date.now()} />)
    expect(screen.getByTestId('place-glow-5-9-now', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId(/place-glow-.*-old/, HIDDEN)).toBeNull()
  })

  it('a bucket that moves keeps the old glow under the new one, then drops it after DURATION.medium', async () => {
    const view = await render(<LiveTile venue={venue('5-9')} now={Date.now()} />)
    await view.rerender(<LiveTile venue={venue('10-19')} now={Date.now()} />)
    expect(screen.getByTestId('place-glow-5-9-old', HIDDEN)).toBeTruthy()
    expect(screen.getByTestId('place-glow-10-19-now', HIDDEN)).toBeTruthy()
    await act(async () => {
      jest.advanceTimersByTime(DURATION.medium + 1)
    })
    expect(screen.queryByTestId('place-glow-5-9-old', HIDDEN)).toBeNull()
    expect(screen.getByTestId('place-glow-10-19-now', HIDDEN)).toBeTruthy()
  })

  it('under Reduce Motion the swap is instant: no old layer at all', async () => {
    mockReduce = true
    const view = await render(<LiveTile venue={venue('5-9')} now={Date.now()} />)
    await view.rerender(<LiveTile venue={venue('20+')} now={Date.now()} />)
    expect(screen.queryByTestId('place-glow-5-9-old', HIDDEN)).toBeNull()
    expect(screen.getByTestId('place-glow-20+-now', HIDDEN)).toBeTruthy()
  })

  it('a bucket that falls to quiet fades the glow out and leaves none', async () => {
    const view = await render(<LiveTile venue={venue('10-19')} now={Date.now()} />)
    await view.rerender(<LiveTile venue={venue('quiet')} now={Date.now()} />)
    expect(screen.getByTestId('place-glow-10-19-old', HIDDEN)).toBeTruthy()
    await act(async () => {
      jest.advanceTimersByTime(DURATION.medium + 1)
    })
    expect(screen.queryByTestId(/place-glow-/, HIDDEN)).toBeNull()
  })
})

/*
 * DS-09 hand-off (Going-out's mono times): "9 PM" set whole in Geist Mono read "9  PM", a full cell for the space. The
 * Open tonight card's time goes through MonoRun, so its space is the brand face. Negative control: the bare string has
 * no brand-face space node.
 */
it('an Open tonight card sets its time in Geist Mono with the space in the brand face', async () => {
  const now = new Date(2026, 9, 24, 18, 0).getTime()
  const start = new Date(2026, 9, 24, 21, 0).toISOString()
  const end = new Date(2026, 9, 24, 23, 59).toISOString()
  await render(<OpenCard venue={{ ...venue(null as never), nextEvent: { id: 'e1', title: 'Vinyl Night', startTime: start, endTime: end, coverImageUrl: null } as never }} now={now} />)
  const face = (n: { props: { style?: unknown } }) => (StyleSheet.flatten(n.props.style as never) as { fontFamily?: string } | undefined)?.fontFamily
  const nodes = textNodes(screen.toJSON() as never)
  const time = nodes.find((n) => face(n) === FONT_FAMILY.mono[500] && JSON.stringify(n.children).includes('PM'))
  expect(time).toBeTruthy()
  const space = (time!.children ?? []).find((c) => typeof c === 'object' && JSON.stringify((c as { children: unknown }).children) === '[" "]')
  expect(space && face(space as never)).toBe(FONT_FAMILY.brand[500])
})
