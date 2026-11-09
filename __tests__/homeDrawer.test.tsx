/*
 * The home drawer's travel (BUILD-SPEC §0, `drawer`): M.settle from the token,
 * and under Reduce Motion a short timing on the standard curve rather than an
 * instant jump.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import React from 'react'
import { Text } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { HomeDrawer } from '../components/home/HomeDrawer'
import { SHEET_ORBS } from '../components/ds/Orbs'
import { COLOR, EASING, MATERIAL, REDUCE_MOTION, SPRING } from '../lib/design/tokens'
import { DRAWER_HEADER_HEIGHT } from '../lib/home'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(() => false),
    withSpring: jest.fn(actual.withSpring),
    withTiming: jest.fn(actual.withTiming),
  }
})
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const points = { full: 100, half: 400, peek: 700 }
const drawer = (snap: 'full' | 'half' | 'peek') => {
  const y = Reanimated.makeMutable(points.half)
  return (
    <HomeDrawer y={y} points={points} snap={snap} onSnap={jest.fn()} header={<Text>header</Text>}>
      <Text>pane</Text>
    </HomeDrawer>
  )
}

beforeEach(() => {
  jest.mocked(Reanimated.withSpring).mockClear()
  jest.mocked(Reanimated.withTiming).mockClear()
})

describe('the drawer travels', () => {
  it('on M.settle, from the token', async () => {
    reduceMotion.mockReturnValue(false)
    await render(drawer('full'))
    expect(Reanimated.withSpring).toHaveBeenCalledWith(points.full, expect.objectContaining({ stiffness: SPRING.settle.stiffness, damping: SPRING.settle.damping, mass: SPRING.settle.mass }))
    expect(Reanimated.withTiming).not.toHaveBeenCalled()
  })

  it('under Reduce Motion, on a 200 ms standard-curve timing: gentler, never an instant jump', async () => {
    reduceMotion.mockReturnValue(true)
    await render(drawer('full'))
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
    expect(Reanimated.withTiming).toHaveBeenCalledWith(points.full, expect.objectContaining({ duration: REDUCE_MOTION.duration.base }))
    expect(REDUCE_MOTION.duration.base).toBe(200)
    expect(EASING.standard).toHaveLength(4)
  })
})

/*
 * Owner, 2026-11-03: the drawer must look like the approved board, "not gray". The board's `.drawer` computes to ink at 80%
 * over the dark map (96% at full), a 0.5 pt rim (10%, 18% along the top), and three brand orbs at 60% when not full
 * (kit.css `.orbs`). Its neutral reads #0F1012, within a few levels of ink; the grey (#171618 measured) was iOS 26's
 * regular glass under the old Material layer, and Android stood on the sheet's grey fill.
 */
describe('the drawer is the board’s: ink, the rim and the three orbs, on every tier', () => {
  const { Platform } = jest.requireActual('react-native')
  const original = Platform.OS
  afterEach(() => Object.defineProperty(Platform, 'OS', { value: original, configurable: true }))

  it.each([
    ['ios', 'peek'],
    ['ios', 'half'],
    ['ios', 'full'],
    ['android', 'peek'],
    ['android', 'half'],
    ['android', 'full'],
  ] as const)('%s at %s: an opaque ink drawer, with no glass and no wash over it', async (os, snap) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    reduceMotion.mockReturnValue(false)
    await render(drawer(snap))
    expect(StyleSheet.flatten(screen.getByTestId('home-drawer', { includeHiddenElements: true }).props.style).backgroundColor).toBe(COLOR.ink)
    // Control for what made it grey: the sheet glass and the fading wash are gone.
    expect(screen.queryByTestId('drawer-glass', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByTestId('drawer-opaque', { includeHiddenElements: true })).toBeNull()
  })

  it('the rim: 0.5 pt at 10% all round, 18% along the top (kit.css `.drawer` box-shadow)', async () => {
    await render(drawer('half'))
    expect(StyleSheet.flatten(screen.getByTestId('drawer-rim', { includeHiddenElements: true }).props.style)).toMatchObject({
      borderWidth: 0.5,
      borderColor: COLOR.hairline,
      borderTopColor: MATERIAL.glassSpecular,
    })
  })

  it('the orbs: 60% below full, none at full (the board’s `.full` has none)', async () => {
    await render(drawer('half'))
    expect(StyleSheet.flatten(screen.getByTestId('drawer-orbs', { includeHiddenElements: true }).props.style).opacity).toBe(0.6)
    // The drawer resting at full (its edge at `points.full`).
    await render(
      <HomeDrawer y={Reanimated.makeMutable(points.full)} points={points} snap="full" onSnap={jest.fn()} header={<Text>header</Text>}>
        <Text>pane</Text>
      </HomeDrawer>
    )
    expect(StyleSheet.flatten(screen.getByTestId('drawer-orbs', { includeHiddenElements: true }).props.style).opacity).toBe(0)
  })

  it('the three orbs are the board’s, to the percent: ember top-left, violet right, rose low', () => {
    expect(SHEET_ORBS).toEqual([
      { color: COLOR.brandOrange, alpha: 0.18, cx: 0.08, cy: 0.06, rx: 0.6, ry: 0.34 },
      { color: COLOR.brandViolet, alpha: 0.14, cx: 1, cy: 0.22, rx: 0.55, ry: 0.3 },
      { color: COLOR.brandRose, alpha: 0.1, cx: 0.3, cy: 0.7, rx: 0.5, ry: 0.3 },
    ])
    expect([COLOR.brandOrange, COLOR.brandViolet, COLOR.brandRose]).toEqual(['#F05423', '#925DA9', '#BE5C71'])
  })
})

describe('a pinned row inside the drawer is the drawer: plain ink, never a bar (rc7 D3, owner 2026-11-03)', () => {
  const { Platform } = jest.requireActual('react-native')
  const { StickyBar } = jest.requireActual('../components/pulse/StickyBar')
  const pinned = (y: number, scrolled?: boolean) => (
    <HomeDrawer y={Reanimated.makeMutable(y)} points={points} snap="full" onSnap={jest.fn()} header={<Text>header</Text>}>
      <StickyBar scrolled={scrolled}>
        <Text>chips</Text>
      </StickyBar>
    </HomeDrawer>
  )
  const original = Platform.OS
  afterEach(() => Object.defineProperty(Platform, 'OS', { value: original, configurable: true }))

  it.each([
    ['ios', false],
    ['ios', true],
    ['android', false],
    ['android', true],
  ] as const)('%s, scrolled %s: the row stands on ink, so nothing shows through and no band reads as a rail', async (os, scrolled) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    await render(pinned(points.full, scrolled))
    const ground = screen.getByTestId('sticky-search-ground', { includeHiddenElements: true })
    expect(StyleSheet.flatten(ground.props.style)).toMatchObject({ position: 'absolute', backgroundColor: COLOR.ink })
    // The drawer's own orbs, placed where this row sits in it (under the header), so there is no band: the glow runs on.
    const orbs = screen.getByTestId('sticky-search-ground-orbs', { includeHiddenElements: true })
    expect(StyleSheet.flatten(orbs.props.style).top).toBe(-DRAWER_HEADER_HEIGHT)
    expect(screen.queryByTestId('sticky-search-bar', { includeHiddenElements: true })).toBeNull()
  })

  it('outside a drawer the scrolled row keeps its bar, since no ground stands behind it', async () => {
    await render(
      <StickyBar scrolled>
        <Text>search</Text>
      </StickyBar>
    )
    expect(screen.getByTestId('sticky-search-bar', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('sticky-search-ground', { includeHiddenElements: true })).toBeNull()
  })
})
