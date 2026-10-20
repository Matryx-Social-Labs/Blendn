/*
 * The home drawer's travel (BUILD-SPEC §0, `drawer`): M.settle from the token,
 * and under Reduce Motion a short timing on the standard curve rather than an
 * instant jump.
 */
import { render } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { HomeDrawer } from '../components/home/HomeDrawer'
import { EASING, REDUCE_MOTION, SPRING } from '../lib/design/tokens'

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
