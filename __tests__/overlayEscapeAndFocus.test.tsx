/**
 * Audit L5 and L6 (a11y-motion 2026-10-24).
 * L5: VoiceOver's two-finger Z ("escape") closes the Sheet, the Scene's lightbox (SwipeToDismiss) and the Blend'n
 * stage, as ContextMenu, ImageViewer and PhotoViewer already did.
 * L6: focus moves to a Sheet's title on open and, once it has gone, back to the control that opened it (WCAG 2.4.3).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React, { useState } from 'react'
import { AccessibilityInfo, Text } from 'react-native'

import { Sheet } from '../components/ds/Sheet'
import { IconButton } from '../components/ds/IconButton'
import { SwipeToDismiss } from '../components/motion/SwipeToDismiss'
import { RoomStage } from '../components/blendn/RoomStage'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => true) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: View, isLiquidGlassAvailable: () => false }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: View }
})

const sheet = (props: Partial<React.ComponentProps<typeof Sheet>> = {}) => (
  <Sheet visible onClose={jest.fn()} title="Mute this room?" actions={[{ label: 'Cancel', kind: 'tertiary', onPress: jest.fn() }]} testID="s" {...props} />
)

describe('L5: two-finger Z', () => {
  it('closes a Sheet as its scrim does', async () => {
    const onClose = jest.fn()
    await render(sheet({ onClose }))
    await fireEvent(screen.getByTestId('s-place', { includeHiddenElements: true }), 'accessibilityEscape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close a Sheet that has to be answered', async () => {
    const onClose = jest.fn()
    await render(sheet({ onClose, dismissible: false }))
    await fireEvent(screen.getByTestId('s-place', { includeHiddenElements: true }), 'accessibilityEscape')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('dismisses a swipe-to-dismiss overlay (the lightbox)', async () => {
    const onDismiss = jest.fn()
    await render(
      <SwipeToDismiss onDismiss={onDismiss}>
        <Text>Photo</Text>
      </SwipeToDismiss>
    )
    await fireEvent(screen.getByTestId('swipe-to-dismiss'), 'accessibilityEscape')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('closes the Blend’n stage', async () => {
    const onClosed = jest.fn()
    await render(
      <RoomStage onClosed={onClosed}>
        <Text>Room</Text>
      </RoomStage>
    )
    await act(async () => {
      fireEvent(screen.getByTestId('room-stage-page'), 'accessibilityEscape')
    })
    await act(async () => new Promise((r) => setTimeout(r, 400)))
    expect(onClosed).toHaveBeenCalledTimes(1)
  })
})

describe('L6: focus goes back to the opener', () => {
  function Opener() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <IconButton icon="bell-off" accessibilityLabel="Mute" onPress={() => setOpen(true)} testID="opener" />
        {sheet({ visible: open, onClose: () => setOpen(false) })}
      </>
    )
  }

  it('the control pressed to open it gets focus once the sheet has gone', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {})
    const node = { opener: true }
    await render(<Opener />)
    await fireEvent.press(screen.getByTestId('opener'), { currentTarget: node })
    const theOpener = expect.objectContaining({ opener: true })
    expect(focus).not.toHaveBeenCalledWith(theOpener, 'focus')
    await act(async () => screen.getByTestId('s-modal', { includeHiddenElements: true }).props.onDismiss())
    expect(focus).toHaveBeenLastCalledWith(theOpener, 'focus')
  })

  it('a sheet nobody pressed for gets no opener', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {})
    // Long after the last test's press.
    const later = Date.now() + 60_000
    jest.spyOn(Date, 'now').mockReturnValue(later)
    await render(sheet())
    focus.mockClear()
    await act(async () => screen.getByTestId('s-modal', { includeHiddenElements: true }).props.onDismiss())
    expect(focus).not.toHaveBeenCalled()
  })
})
