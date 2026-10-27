/*
 * Motion #45, the async primary's label swap: the old words exit over `quick`, the new ones enter over `base`, the width
 * follows on settle after the first swap. Reduce Motion crossfades and the width changes at once.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import * as Reanimated from 'react-native-reanimated'

import { Button } from '../components/ds/Button'
import { DURATION, RISE } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withTiming: jest.fn(actual.withTiming) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withTiming = Reanimated.withTiming as jest.Mock
const hasWidthAnimation = () => {
  for (let node = screen.getByTestId('b').parent; node; node = node.parent) if (node.props.layout !== undefined) return true
  return false
}

beforeEach(() => {
  jest.useFakeTimers()
  reduceMotion.mockReturnValue(false)
  withTiming.mockClear()
})
afterEach(() => jest.useRealTimers())

it('keeps the old label while it exits, names the new one at once, then draws the new one', async () => {
  const { rerender } = await render(<Button label="Make the crew" testID="b" />)
  await rerender(<Button label="Continue" testID="b" />)
  expect(screen.getByLabelText('Continue')).toBeTruthy()
  expect(screen.getByText('Make the crew')).toBeTruthy()
  await act(async () => jest.advanceTimersByTime(DURATION.quick))
  expect(screen.getByText('Continue')).toBeTruthy()
  expect(screen.queryByText('Make the crew')).toBeNull()
})

it('exits up by RISE.list over quick and enters over base', async () => {
  const { rerender } = await render(<Button label="Join" testID="b" />)
  withTiming.mockClear()
  await rerender(<Button label="Joined" testID="b" />)
  expect(withTiming).toHaveBeenCalledWith(-RISE.list, expect.objectContaining({ duration: DURATION.quick }))
  await act(async () => jest.advanceTimersByTime(DURATION.quick))
  expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: DURATION.base }))
})

it('Reduce Motion: no rise, a crossfade, and no width animation', async () => {
  reduceMotion.mockReturnValue(true)
  const { rerender } = await render(<Button label="Join" testID="b" />)
  withTiming.mockClear()
  await rerender(<Button label="Joined" testID="b" />)
  expect(withTiming).toHaveBeenCalledWith(-0, expect.anything())
  await act(async () => jest.advanceTimersByTime(DURATION.quick))
  expect(screen.getByText('Joined')).toBeTruthy()
  expect(hasWidthAnimation()).toBe(false)
})

it('carries no layout animation until its words have changed once', async () => {
  const { rerender } = await render(<Button label="Join" testID="b" />)
  expect(hasWidthAnimation()).toBe(false)
  await rerender(<Button label="Joined" testID="b" />)
  await act(async () => jest.advanceTimersByTime(DURATION.quick))
  expect(hasWidthAnimation()).toBe(true)
})

it('a count button is left alone: its number rolls, its words do not swap', async () => {
  await render(<Button label="Show {n} places" count={4} testID="b" />)
  expect(screen.getByText('Show')).toBeTruthy()
})
