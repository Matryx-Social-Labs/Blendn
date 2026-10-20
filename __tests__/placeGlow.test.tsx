/*
 * The live tile's glow (BUILD-SPEC B2): a true cross-fade when the bucket moves while the tile is on screen,
 * two layers with distinct gradient ids, the old one dropped after `DURATION.medium`; a tile that scrolls in
 * is not a change; Reduce Motion swaps at once.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'

import type { VenueListItem } from '../lib/apiClient'

let mockReduce = false
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => mockReduce }))

/* eslint-disable import/first */
import { LiveTile } from '../components/places/PlaceCards'
import { DURATION } from '../lib/design/tokens'
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
