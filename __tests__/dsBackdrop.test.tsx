/*
 * The backdrop, L0 (guidelines/backdrop/{orbs,grain,time-of-night}.html,
 * motion #22 and #53): the pre-rendered orb sets, their slow drift (one of the
 * three loops the app allows), and the grain tile.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, AppState, Platform, StyleSheet, type AppStateStatus } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { Grain } from '../components/ds/Grain'
import { ORB_SETS, Orbs, orbTime } from '../components/ds/Orbs'
import { COLOR, DURATION, ORBS } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withRepeat: jest.fn(actual.withRepeat) }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withRepeat = Reanimated.withRepeat as jest.Mock
const HIDDEN = { includeHiddenElements: true }
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, HIDDEN).props.style)
/** The orb's centre alpha (its gradient runs 1 → ½ at 45% → 0 under it). */
const alpha = (id: string) => screen.getByTestId(`${id}-circle`, HIDDEN).props.opacity

/** Orbs measure their box before drawing: give them a phone's. */
async function lay(id = 'orbs', width = 402, height = 874) {
  await act(async () => screen.getByTestId(id, HIDDEN).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } }))
}

let appState: ((s: AppStateStatus) => void) | undefined
beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(false)
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, fn) => {
    appState = fn as (s: AppStateStatus) => void
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>
  })
})

describe('orbTime', () => {
  it.each([
    [20, 59, 'early'],
    [21, 0, 'night'],
    [0, 59, 'night'],
    [1, 0, 'late'],
    [5, 59, 'late'],
    [6, 0, 'early'],
    [12, 0, 'early'],
  ] as const)('%i:%i is %s', (h, m, time) => {
    expect(orbTime(new Date(2026, 9, 15, h, m))).toBe(time)
  })
})

describe('the orb sets are the assets’', () => {
  it('night is the tokens: brand orange 36% and violet 28%, the feed at half', () => {
    expect(ORB_SETS.brand.night.map((o) => [o.color, o.alpha])).toEqual([
      [COLOR.brandOrange, COLOR.orbOrangeAlpha],
      [COLOR.brandViolet, COLOR.orbVioletAlpha],
    ])
    expect(ORB_SETS.feed.night.map((o) => o.alpha)).toEqual([COLOR.orbOrangeAlpha * COLOR.orbFeedScale, COLOR.orbVioletAlpha * COLOR.orbFeedScale])
  })

  it('early is orange with amber, late violet with rose and no orange', () => {
    expect(ORB_SETS.brand.early.map((o) => o.color)).toEqual([COLOR.brandOrange, COLOR.warning])
    expect(ORB_SETS.brand.late.map((o) => o.color)).toEqual([COLOR.brandViolet, COLOR.brandRose])
    expect(ORB_SETS.feed.late.map((o) => o.color)).not.toContain(COLOR.brandOrange)
  })

  it('the moment set is orange and rose, one top-left and one low', () => {
    expect(ORB_SETS.moment.night.map((o) => [o.color, o.alpha, o.cy])).toEqual([
      [COLOR.brandOrange, COLOR.orbOrangeAlpha, 140],
      [COLOR.brandRose, COLOR.orbRoseAlpha, 700],
    ])
  })
})

describe('<Orbs>', () => {
  it('draws two feathered orbs, laid over the box as `cover` does, and is decorative', async () => {
    await render(<Orbs set="brand" time="night" testID="orbs" />)
    await lay('orbs', 804, 874)
    const root = screen.getByTestId('orbs', HIDDEN)
    expect(root.props.accessibilityElementsHidden).toBe(true)
    expect(root.props.pointerEvents).toBe('none')
    // 804 wide: the 402-wide board scales ×2, centred vertically (874 → 1748, so −437).
    expect(flat('orbs-0')).toMatchObject({ left: (70 - 180) * 2, top: (110 - 180) * 2 - 437, width: 720, height: 720 })
    expect(alpha('orbs-0')).toBe(COLOR.orbOrangeAlpha)
    expect(alpha('orbs-1')).toBe(COLOR.orbVioletAlpha)
  })

  it('Increase Contrast halves the orb alpha', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<Orbs set="brand" time="night" testID="orbs" />)
    await lay()
    expect(alpha('orbs-0')).toBe(COLOR.orbOrangeAlpha / 2)
  })

  it('drifts on iOS: two incommensurate periods, 28 s and 36 s, back and forth for ever', async () => {
    await render(<Orbs set="feed" time="night" testID="orbs" />)
    await lay()
    expect(withRepeat).toHaveBeenCalledTimes(2)
    expect(withRepeat.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [-1, true],
      [-1, true],
    ])
    expect(DURATION.ambientA).toBe(28000)
    expect(ORBS.drift).toBe(24)
  })

  it.each([
    ['Android', () => on('android'), {}],
    ['Reduce Motion', () => reduceMotion.mockReturnValue(true), {}],
    ['paused (keyboard, scroll, chat, unfocused)', () => {}, { paused: true }],
  ])('is still on %s', async (_, arrange, props) => {
    arrange()
    await render(<Orbs set="brand" time="night" testID="orbs" {...props} />)
    await lay()
    expect(withRepeat).not.toHaveBeenCalled()
  })

  it('stops in the background and resumes where it paused', async () => {
    await render(<Orbs set="brand" time="night" testID="orbs" />)
    await lay()
    expect(withRepeat).toHaveBeenCalledTimes(2)
    await act(async () => appState?.('background'))
    withRepeat.mockClear()
    await act(async () => appState?.('active'))
    expect(withRepeat).toHaveBeenCalledTimes(2)
  })

  it('takes the time-of-night set from the clock, and swaps on foreground across 21:00', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 15, 20, 55) })
    await render(<Orbs set="feed" testID="orbs" />)
    await lay()
    expect(screen.getByTestId('orbs-early', HIDDEN)).toBeTruthy()
    jest.setSystemTime(new Date(2026, 9, 15, 21, 10))
    await act(async () => appState?.('active'))
    expect(screen.getByTestId('orbs-night', HIDDEN)).toBeTruthy()
    // The old set stays under the crossfade for `long`, then goes.
    expect(screen.getByTestId('orbs-early', HIDDEN)).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(DURATION.long))
    expect(screen.queryByTestId('orbs-early', HIDDEN)).toBeNull()
    jest.useRealTimers()
  })
})

describe('<Grain>', () => {
  it('one static 256 tile, repeated, at the token’s opacity, over everything and seen by nobody', async () => {
    await render(<Grain testID="grain" />)
    const grain = screen.getByTestId('grain', HIDDEN)
    expect(screen.getByTestId('grain-tile', HIDDEN).props.resizeMode).toBe('repeat')
    expect(flat('grain-tile').opacity).toBe(COLOR.grainAlpha)
    expect(grain.props.accessibilityElementsHidden).toBe(true)
    expect(grain.props.pointerEvents).toBe('none')
  })
})
