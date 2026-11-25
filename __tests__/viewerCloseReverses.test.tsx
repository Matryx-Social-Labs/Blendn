/*
 * SCRUM-1001 M22: a full-screen photo viewer's close reverses its open (DS #33). Closing (×, a drag, back) keeps the Modal
 * up while `open` runs back to 0, on M.travel from a thumbnail or the base fade (Reduce Motion's 200 ms, never skipped by
 * the system setting); it goes from the animation's callback or a backstop, and takes no touches while it leaves. Opened
 * again while leaving, it stays. Both viewers: the profile's PhotoViewer and a bubble's ImageViewer.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../components/motion/ZoomableImage', () => ({
  ZoomableImage: () => null,
}))
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

/* eslint-disable import/first */
import { ImageViewer } from '../components/ds/ImageViewer'
import { CLOSE_BACKSTOP_MS } from '../components/motion/useCloseReverses'
import { PhotoViewer } from '../components/profile/PhotoViewer'
import { REDUCE_MOTION, SPRING } from '../lib/design/tokens'
/* eslint-enable import/first */

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withSpring = Reanimated.withSpring as jest.Mock
const withTiming = Reanimated.withTiming as jest.Mock
const FROM = { x: 64, y: 300, width: 228, height: 168 }

/** As every caller does: closing clears what it was showing (`setViewer(null)`), so the viewer must hold it while it leaves. */
const viewers = {
  PhotoViewer: (visible: boolean, from: typeof FROM | null) => (
    <PhotoViewer
      photos={visible ? ['https://x/a.jpg', 'https://x/b.jpg'] : []}
      visible={visible}
      onClose={jest.fn()}
      from={visible ? from : undefined}
      testID="v"
    />
  ),
  ImageViewer: (visible: boolean, from: typeof FROM | null) => (
    <ImageViewer
      visible={visible}
      uri={visible ? 'https://x/a.jpg' : ''}
      sender={{ name: visible ? 'Cosmic Panda' : '' }}
      time={visible ? '9:52 PM' : ''}
      onClose={jest.fn()}
      from={visible ? from : undefined}
      testID="v"
    />
  ),
}
/** The photo each viewer draws, by its label. */
const PHOTO = {
  PhotoViewer: 'Photo 1',
  ImageViewer: 'Photo from Cosmic Panda, 9:52 PM',
}

/** The test renderer draws a Modal's content only while it is visible. */
const modalUp = () => screen.queryByTestId('v-modal', { includeHiddenElements: true }) !== null
/** The page under the Modal's gesture root: where touches are refused while it leaves. */
const touches = () => screen.getByTestId('v-page', { includeHiddenElements: true }).props.pointerEvents

beforeEach(() => {
  jest.useFakeTimers()
  reduceMotion.mockReturnValue(false)
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
})
afterEach(() => jest.useRealTimers())

describe.each(Object.entries(viewers))('%s', (name, viewer) => {
  it('closing from a thumbnail travels back on M.travel and stays up until it has gone', async () => {
    const view = await render(viewer(true, FROM))
    withSpring.mockClear()
    await view.rerender(viewer(false, FROM))
    expect(withSpring).toHaveBeenCalledWith(0, expect.objectContaining({ stiffness: SPRING.travel.stiffness }), expect.any(Function))
    expect(modalUp()).toBe(true)
    expect(touches()).toBe('none')
    // Still the photo it showed, though its owner has already let go of it.
    expect(
      screen.getByLabelText(PHOTO[name as keyof typeof PHOTO], {
        includeHiddenElements: true,
      }),
    ).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(CLOSE_BACKSTOP_MS))
    expect(modalUp()).toBe(false)
  })

  it('under Reduce Motion it fades out over 200 ms, and the system setting cannot skip it', async () => {
    reduceMotion.mockReturnValue(true)
    const view = await render(viewer(true, FROM))
    expect(withTiming).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        duration: REDUCE_MOTION.duration.base,
        reduceMotion: Reanimated.ReduceMotion.Never,
      }),
      undefined,
    )
    withTiming.mockClear()
    await view.rerender(viewer(false, FROM))
    expect(withTiming).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        duration: REDUCE_MOTION.duration.base,
        reduceMotion: Reanimated.ReduceMotion.Never,
      }),
      expect.any(Function),
    )
    expect(modalUp()).toBe(true)
    await act(async () => jest.advanceTimersByTime(CLOSE_BACKSTOP_MS))
    expect(modalUp()).toBe(false)
  })

  it('opened again while it leaves, it stays and takes touches', async () => {
    const view = await render(viewer(true, null))
    await view.rerender(viewer(false, null))
    await view.rerender(viewer(true, null))
    await act(async () => jest.advanceTimersByTime(CLOSE_BACKSTOP_MS * 2))
    expect(modalUp()).toBe(true)
    expect(touches()).toBe('auto')
  })

  it('never opened, nothing is drawn', async () => {
    await render(viewer(false, FROM))
    expect(modalUp()).toBe(false)
  })
})
