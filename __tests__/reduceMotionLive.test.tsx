/**
 * Audit M1 (a11y-motion 2026-10-24): Reduce Motion turned on mid-session applies at once, not at the next launch.
 * `lib/motion`'s `useReducedMotion` starts from Reanimated's launch value (so the first frame is right) and follows the
 * system's `reduceMotionChanged`; `ReducedMotionFollower` (once, at the root) then sets every Reanimated default too.
 * The ban on Reanimated's own hook outside lib/motion is ESLint's (`eslint.config.js`, no-restricted-imports).
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Text } from 'react-native'
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated'

import { ReducedMotionFollower, useReducedMotion } from '../lib/motion'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), ReducedMotionConfig: jest.fn(() => null) }
})

let emit: (on: boolean) => void
const remove = jest.fn()
beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (on: boolean) => void) => {
    if (name === 'reduceMotionChanged') emit = handler
    return { remove }
  }) as never)
})

function Reader() {
  return <Text testID="rm">{String(useReducedMotion())}</Text>
}

it('starts from the launch value, then follows the setting as it changes, for every reader', async () => {
  await render(
    <>
      <Reader />
      <ReducedMotionFollower />
    </>
  )
  expect(screen.getByTestId('rm')).toHaveTextContent('false')
  // Before any change Reanimated keeps its own launch value: no override, no dev warning.
  expect(ReducedMotionConfig).not.toHaveBeenCalled()
  // One listener for the whole app, however many read it.
  expect((AccessibilityInfo.addEventListener as jest.Mock).mock.calls.filter(([n]) => n === 'reduceMotionChanged')).toHaveLength(1)

  await act(async () => emit(true))
  expect(screen.getByTestId('rm')).toHaveTextContent('true')
  expect((ReducedMotionConfig as unknown as jest.Mock).mock.lastCall[0]).toEqual({ mode: ReduceMotion.Always })

  await act(async () => emit(false))
  expect(screen.getByTestId('rm')).toHaveTextContent('false')
  expect((ReducedMotionConfig as unknown as jest.Mock).mock.lastCall[0]).toEqual({ mode: ReduceMotion.Never })

  await screen.unmount()
  expect(remove).toHaveBeenCalledTimes(1)
})
