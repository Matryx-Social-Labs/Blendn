/*
 * FadeInUp (Going's list, the Me tab; DS #16 / #1): a rise of RISE.list (8) on base and the entrance curve. Reduce Motion
 * is "opacity only": no rise, and a fade over 200, not a cut.
 */
import { act, render, screen } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import FadeInUp from '../components/motion/FadeInUp'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withTiming: jest.fn(actual.withTiming) }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withTiming = Reanimated.withTiming as jest.Mock
/** The animated wrapper around the child: the first ancestor that carries the animated style. */
const style = () => {
  let node = screen.getByTestId('fade', { includeHiddenElements: true }).parent
  while (node && !node.props.jestAnimatedStyle) node = node.parent
  return Reanimated.getAnimatedStyle(node as never) as { opacity: number; transform: { translateY: number }[] }
}

/**
 * The wrapper's own React style, without Reanimated's animated overlay: what every React commit writes to the native view.
 * A rest that lives only in the overlay is lost when the native registry drops it (Reanimated 4 hands a settled value back
 * to React only from a 500 ms interval, and erases it unsent once it is two seconds old) — the iOS Scene's empty band (r7 H1).
 */
const reactStyle = () => {
  let node = screen.getByTestId('fade', { includeHiddenElements: true }).parent
  while (node && !node.props.jestAnimatedStyle) node = node.parent
  return StyleSheet.flatten(node!.props.style) ?? {}
}

beforeEach(() => {
  jest.useFakeTimers()
  reduceMotion.mockReturnValue(false)
  withTiming.mockClear()
})
afterEach(() => jest.useRealTimers())

const draw = () =>
  render(
    <FadeInUp>
      <Text testID="fade">Going</Text>
    </FadeInUp>
  )

it('rises 8 pt over base on the entrance curve, from nothing', async () => {
  await draw()
  expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 220 }), expect.any(Function))
  // Frame 0: invisible and 8 below its place (the token, not 10).
  expect(style().opacity).toBe(0)
  expect(style().transform[0].translateY).toBe(8)
  await act(async () => jest.advanceTimersByTime(400))
  expect(style().opacity).toBe(1)
  expect(style().transform[0].translateY).toBe(0)
})

it('Reduce Motion: a 200 ms fade with no rise, not a cut', async () => {
  reduceMotion.mockReturnValue(true)
  await draw()
  expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 200 }), expect.any(Function))
  expect(style().opacity).toBe(0)
  expect(style().transform[0].translateY).toBe(0)
  await act(async () => jest.advanceTimersByTime(400))
  expect(style().opacity).toBe(1)
})

it('a caller’s own distance and duration still win', async () => {
  await render(
    <FadeInUp distance={16} duration={400}>
      <Text testID="fade">x</Text>
    </FadeInUp>
  )
  expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 400 }), expect.any(Function))
  expect(style().transform[0].translateY).toBe(16)
})

it('comes to rest in React’s own props, so a commit after the entrance can never hide it again (r7 H1)', async () => {
  await render(
    <FadeInUp delay={0}>
      <Text testID="fade">The tiles</Text>
    </FadeInUp>
  )
  // On the way in, React holds the start: nothing flashes before the first frame.
  expect(reactStyle().opacity).toBe(0)
  await act(async () => jest.advanceTimersByTime(400))
  expect(reactStyle().opacity ?? 1).toBe(1)
  expect(reactStyle().transform ?? []).toEqual([])
})
