/**
 * A toast is said aloud, not only drawn.
 *
 * It appears at the top of the screen while a screen reader's focus is
 * wherever the finger was, so "Couldn't save" and "Report sent" were silent
 * to anyone not looking. iOS is told through `announceForAccessibility`;
 * Android reads the toast's live region.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { AccessibilityInfo, Pressable, StyleSheet, Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

import { ToastProvider, useToast } from '../components/Toast'

function Trigger({ message, variant, action }: { message: string; variant?: 'error' | 'success'; action?: boolean }) {
  const { showToast } = useToast()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => showToast(message, variant, action ? { action: { label: 'Undo', onPress: () => {} } } : undefined)}
    >
      <Text>show</Text>
    </Pressable>
  )
}

it('announces the message on iOS', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  await render(
    <ToastProvider>
      <Trigger message="Couldn't save that. Try again." variant="error" />
    </ToastProvider>
  )
  fireEvent.press(screen.getByRole('button'))

  expect(await screen.findByText("Couldn't save that. Try again.")).toBeTruthy()
  // Once, by the Toast itself: the provider adds none of its own.
  expect(announce).toHaveBeenCalledTimes(1)
  expect(announce).toHaveBeenCalledWith("Couldn't save that. Try again.")
})

it('says an action is there, since the toast is then a control', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  await render(
    <ToastProvider>
      <Trigger message="Removed from saved." action />
    </ToastProvider>
  )
  fireEvent.press(screen.getAllByRole('button')[0])

  await screen.findByText('Removed from saved.')
  expect(announce).toHaveBeenCalledTimes(1)
  expect(announce).toHaveBeenCalledWith('Removed from saved. Undo is available.')
})

it('marks the toast as a live region for Android, assertive for errors', async () => {
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  await render(
    <ToastProvider>
      <Trigger message="Report failed." variant="error" />
    </ToastProvider>
  )
  fireEvent.press(screen.getByRole('button'))
  const text = await screen.findByText('Report failed.')

  let node: typeof text | null = text
  while (node && !node.props.accessibilityLiveRegion) node = node.parent
  expect(node?.props.accessibilityLiveRegion).toBe('assertive')
})

describe('a long message is shown whole', () => {
  const LONG = 'Saved your badge choices. Not saved: your languages and home state. You’ve hit today’s limit of three changes.'

  it('is never clamped to a number of lines', async () => {
    await render(
      <ToastProvider>
        <Trigger message={LONG} variant="error" />
      </ToastProvider>
    )
    fireEvent.press(screen.getByRole('button'))
    expect((await screen.findByText(LONG)).props.numberOfLines).toBeUndefined()
  })

  it('stays longer the longer it is: the design’s dwell, 5 s and a second more per 8 words', () => {
    const { toastDwell } = require('../components/ds/Toast')
    expect(toastDwell('Saved', {})).toBe(5000)
    expect(toastDwell(LONG, {})).toBe(7000)
    expect(toastDwell(LONG, { action: true })).toBe(10000)
  })
})

describe('a toast with an action keeps clear of the top bar', () => {
  async function withAction() {
    await render(
      <ToastProvider>
        <Trigger message="Message deleted" action />
      </ToastProvider>
    )
    fireEvent.press(screen.getByRole('button', { name: 'show' }))
    return screen.findByText('Message deleted')
  }

  it('sits below the top bar, so it never covers the back button; a plain one does too', async () => {
    await withAction()
    // The 44 pt circle and 8 under it.
    expect(StyleSheet.flatten(screen.getByTestId('toast-lane').props.style).top).toBe(44 + 8)
    await screen.unmount()
    await render(
      <ToastProvider>
        <Trigger message="Saved" />
      </ToastProvider>
    )
    fireEvent.press(screen.getByRole('button', { name: 'show' }))
    await screen.findByText('Saved')
    expect(StyleSheet.flatten(screen.getByTestId('toast-lane').props.style).top).toBe(44 + 8)
  })

  it('its action runs the caller’s handler', async () => {
    const onPress = jest.fn()
    function Undoable() {
      const { showToast } = useToast()
      return (
        <Pressable accessibilityRole="button" onPress={() => showToast('Message deleted', 'info', { action: { label: 'Undo', onPress } })}>
          <Text>go</Text>
        </Pressable>
      )
    }
    await render(
      <ToastProvider>
        <Undoable />
      </ToastProvider>
    )
    fireEvent.press(screen.getByRole('button', { name: 'go' }))
    fireEvent.press(await screen.findByRole('button', { name: 'Undo' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
