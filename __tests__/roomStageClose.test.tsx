/*
 * SCRUM-1001 M11: the Room stage's close was callback-only — `onClosed` came from the close animation's callback and
 * nothing else, so a close the animation never finished (interrupted, or its callback lost) left the Room up over the
 * whole screen. It now goes from the callback or a backstop, once. And toggling Reduce Motion during a close no longer
 * re-runs the open (which interrupted the close, so it never went).
 */
import { act, render } from '@testing-library/react-native'
import React, { createRef } from 'react'
import * as Reanimated from 'react-native-reanimated'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: jest.fn(() => false) }))
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, withTiming: jest.fn(actual.withTiming) }
})

/* eslint-disable import/first */
import { RoomStage, ROOM_STAGE_CLOSE_BACKSTOP_MS } from '../components/blendn/RoomStage'
import { useReducedMotion } from '../lib/motion'
/* eslint-enable import/first */

const withTiming = Reanimated.withTiming as jest.Mock
const reduceMotion = useReducedMotion as jest.Mock

beforeEach(() => {
  withTiming.mockClear()
  reduceMotion.mockReturnValue(false)
})

/** Real timers: the backstop is a few hundred ms, and fake ones left later renders in this file unmounted. */
const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

const stage = async (onClosed: () => void) => {
  const ref = createRef<{ close(): void }>()
  const view = await render(<RoomStage ref={ref} onClosed={onClosed}>{null}</RoomStage>)
  expect(ref.current).not.toBeNull()
  return { ref, view }
}

it('goes after the backstop when the close animation never calls back', async () => {
  // Arrange: a timing that never finishes, as when its callback is lost.
  withTiming.mockImplementation((to: number) => to)
  const onClosed = jest.fn()
  const { ref } = await stage(onClosed)

  // Act
  await act(async () => ref.current?.close())
  await wait(ROOM_STAGE_CLOSE_BACKSTOP_MS / 2)
  const before = onClosed.mock.calls.length
  await wait(ROOM_STAGE_CLOSE_BACKSTOP_MS)

  // Assert
  expect(before).toBe(0)
  expect(onClosed).toHaveBeenCalledTimes(1)
})

it('goes once when the callback comes and the backstop fires as well', async () => {
  // Arrange: the close finishes at once.
  withTiming.mockImplementation((to: number, _config: unknown, done?: (finished: boolean) => void) => {
    done?.(true)
    return to
  })
  const onClosed = jest.fn()
  const { ref } = await stage(onClosed)

  // Act
  await act(async () => ref.current?.close())
  await wait(ROOM_STAGE_CLOSE_BACKSTOP_MS * 1.5)

  // Assert
  expect(onClosed).toHaveBeenCalledTimes(1)
})

it('does not reopen when Reduce Motion changes during a close', async () => {
  // Arrange
  withTiming.mockImplementation((to: number) => to)
  const { ref, view } = await stage(jest.fn())
  await act(async () => ref.current?.close())
  withTiming.mockClear()

  // Act: the setting flips while the stage is leaving.
  reduceMotion.mockReturnValue(true)
  await view.rerender(<RoomStage ref={ref} onClosed={jest.fn()}>{null}</RoomStage>)

  // Assert: nothing runs `open` back to 1.
  expect(withTiming.mock.calls.filter(([to]) => to === 1)).toHaveLength(0)
})

it('does not call onClosed after it unmounts without closing', async () => {
  withTiming.mockImplementation((to: number) => to)
  const onClosed = jest.fn()
  const { view } = await stage(onClosed)
  await view.unmount()
  await wait(ROOM_STAGE_CLOSE_BACKSTOP_MS * 1.5)
  expect(onClosed).not.toHaveBeenCalled()
})
