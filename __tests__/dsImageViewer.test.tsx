/*
 * <ImageViewer> (guidelines/components/ImageViewer.html, ROUND3 D 5.9,
 * motion #33): a photo from a bubble, full-bleed and contained; × and ⋯ as
 * media circles and the sender's line; a tap toggles the chrome (never for a
 * screen reader); a drag down dismisses; it travels from the bubble on
 * M.travel, and fades under Reduce Motion; no haptic.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import * as Reanimated from 'react-native-reanimated'

import { clampPan, fittedSize, ImageViewer } from '../components/ds/ImageViewer'
import { SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { dismissModals } from '../lib/pendingRoute'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withSpring = Reanimated.withSpring as jest.Mock
const FROM = { x: 64, y: 300, width: 228, height: 168 }
const viewer = (props: Partial<React.ComponentProps<typeof ImageViewer>> = {}) => (
  <ImageViewer
    visible
    uri="https://x/terrace.jpg"
    sender={{ name: 'Cosmic Panda' }}
    time="9:52 PM"
    onClose={jest.fn()}
    onMore={jest.fn()}
    from={FROM}
    testID="v"
    {...props}
  />
)
const tap = () => act(async () => fireGestureHandler(getByGestureTestId('v-tap'), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]))
const dragDown = (to: number, velocityY = 0) =>
  act(async () =>
    fireGestureHandler(getByGestureTestId('v-drag'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { state: State.ACTIVE, translationY: to },
      { state: State.END, translationY: to, velocityY },
    ])
  )

beforeEach(() => {
  reduceMotion.mockReturnValue(false)
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
})

describe('the zoomed pan', () => {
  const window = { width: 390, height: 844 }

  it('a photo is fitted inside the window, the window until it loads', () => {
    expect(fittedSize({ width: 4000, height: 3000 }, window)).toEqual({ width: 390, height: 292.5 })
    expect(fittedSize(null, window)).toEqual(window)
  })

  it('pans no further than the fitted photo overhangs: a letterboxed photo stays on screen', () => {
    const fitted = fittedSize({ width: 4000, height: 3000 }, window)
    // At 2x a 4:3 landscape is still shorter than the window: no vertical pan at all.
    expect(clampPan(200, fitted.height, window.height, 2)).toBe(0)
    // At 4x it overhangs by (1170 - 844) / 2 = 163 each way.
    expect(clampPan(500, fitted.height, window.height, 4)).toBe(163)
    expect(clampPan(-900, fitted.width, window.width, 4)).toBe(-585)
  })
})

describe('<ImageViewer>', () => {
  it('the photo, read with who sent it and when; Close and More; nothing plays', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    const onClose = jest.fn()
    const onMore = jest.fn()
    await render(viewer({ onClose, onMore }))
    expect(screen.getByRole('image', { name: 'Photo from Cosmic Panda, 9:52 PM' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'More' }))
    expect(onMore).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('a tap hides the chrome and brings it back', async () => {
    await render(viewer())
    await tap()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    await tap()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('with a screen reader on, the chrome never hides', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true)
    await render(viewer())
    await act(async () => {})
    await tap()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('a drag down past the line dismisses; a short one springs back', async () => {
    const onClose = jest.fn()
    await render(viewer({ onClose }))
    await dragDown(60)
    expect(onClose).not.toHaveBeenCalled()
    await dragDown(200)
    expect(onClose).toHaveBeenCalledTimes(1)
    await dragDown(20, 1500)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('a cancelled drag (a system interrupt) never closes it', async () => {
    const onClose = jest.fn()
    await render(viewer({ onClose }))
    await act(async () =>
      fireGestureHandler(getByGestureTestId('v-drag'), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY: 300 },
        { state: State.CANCELLED, translationY: 300 },
      ])
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a screen reader zooms with the photo’s actions', async () => {
    withSpring.mockClear()
    await render(viewer())
    const photo = screen.getByRole('image', { name: 'Photo from Cosmic Panda, 9:52 PM' })
    expect(photo.props.accessibilityActions.map((a: { label: string }) => a.label)).toEqual(['Zoom in', 'Zoom out'])
    await fireEvent(photo, 'accessibilityAction', { nativeEvent: { actionName: 'zoomIn' } })
    expect(withSpring).toHaveBeenCalledWith(2, expect.objectContaining({ stiffness: SPRING.settle.stiffness }))
  })

  it('Android back closes it', async () => {
    const onClose = jest.fn()
    await render(viewer({ onClose }))
    await fireEvent(screen.getByTestId('v-modal'), 'requestClose')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('#33: travels from the bubble on M.travel; under Reduce Motion it fades', async () => {
    withSpring.mockClear()
    await render(viewer())
    expect(withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.travel.stiffness }))
    withSpring.mockClear()
    reduceMotion.mockReturnValue(true)
    await render(viewer())
    expect(withSpring).not.toHaveBeenCalled()
  })
})

it('a link closes it through its own close (RC drive 6)', async () => {
  const onClose = jest.fn()
  await render(viewer({ onClose }))
  await act(async () => dismissModals())
  expect(onClose).toHaveBeenCalledTimes(1)
})
