/**
 * A toast is said aloud, not only drawn.
 *
 * It appears at the top of the screen while a screen reader's focus is
 * wherever the finger was, so "Couldn't save" and "Report sent" were silent
 * to anyone not looking. iOS is told through `announceForAccessibility`;
 * Android reads the toast's live region.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { AccessibilityInfo, Pressable, Text } from 'react-native'

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

  expect(announce).toHaveBeenCalledWith("Couldn't save that. Try again.")
  expect(await screen.findByText("Couldn't save that. Try again.")).toBeTruthy()
})

it('says an action is there, since the toast is then a control', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  await render(
    <ToastProvider>
      <Trigger message="Removed from saved." action />
    </ToastProvider>
  )
  fireEvent.press(screen.getAllByRole('button')[0])

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

  it('stays longer the longer it is: a second more for every 8 words past the first 8', () => {
    const { toastDwellMs } = require('../components/Toast')
    expect(toastDwellMs('Saved', false)).toBe(3000)
    expect(toastDwellMs('one two three four five six seven eight', false)).toBe(3000)
    expect(toastDwellMs(LONG, false)).toBe(4000)
    expect(toastDwellMs(LONG, true)).toBe(6000)
  })
})
