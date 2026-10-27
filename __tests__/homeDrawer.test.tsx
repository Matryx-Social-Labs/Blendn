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
import { COLOR, EASING, REDUCE_MOTION, SPRING } from '../lib/design/tokens'
import { tint } from '../lib/theme'

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

describe('the drawer\'s fill is the design system\'s, not a flat ember page', () => {
  it('is the sheet glass, with an ink-96% wash that is clear at half and opaque at full', async () => {
    reduceMotion.mockReturnValue(false)
    await render(drawer('half'))
    const wash = screen.getByTestId('drawer-opaque', { includeHiddenElements: true })
    expect(StyleSheet.flatten(wash.props.style).backgroundColor).toBe(tint(COLOR.ink, 0.96))
    // At the half detent (y = half) the wash is fully clear; it only fills as the drawer reaches full.
    expect(StyleSheet.flatten(wash.props.style).opacity).toBe(0)
  })
})

describe('a pinned row inside the drawer is as opaque as the drawer (rc7 D3)', () => {
  const { Platform } = jest.requireActual('react-native')
  const { StickyBar } = jest.requireActual('../components/pulse/StickyBar')
  const { SOLID } = jest.requireActual('../components/ui/Material')
  const pinned = (y: number) => (
    <HomeDrawer y={Reanimated.makeMutable(y)} points={points} snap="full" onSnap={jest.fn()} header={<Text>header</Text>}>
      <StickyBar>
        <Text>search</Text>
      </StickyBar>
    </HomeDrawer>
  )
  const original = Platform.OS
  afterEach(() => Object.defineProperty(Platform, 'OS', { value: original, configurable: true }))

  it('on the solid tier the sticky search stands on the drawer’s own ground, at rest and with no scroll flag', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    await render(pinned(points.full))
    const ground = screen.getByTestId('sticky-search-ground', { includeHiddenElements: true })
    expect(StyleSheet.flatten(ground.props.style)).toMatchObject({ position: 'absolute', backgroundColor: SOLID.sheet })
    // The same ink wash as the drawer, so the row matches it at every snap: opaque at full.
    const ink = ground.children[0] as unknown as { props: { style: unknown } }
    expect(StyleSheet.flatten(ink.props.style)).toMatchObject({ backgroundColor: tint(COLOR.ink, 0.96), opacity: 1 })
  })

  it('glass has no ground to match: the bar alone, once scrolled', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    await render(pinned(points.full))
    expect(screen.queryByTestId('sticky-search-ground', { includeHiddenElements: true })).toBeNull()
  })
})
