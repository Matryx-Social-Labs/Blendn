/**
 * `useToast` raises the design system's Toast (components/ds/Toast.tsx), one at a time: the dwell, the swipe and the
 * look are the Toast's. The provider only decides which is on screen, and plays no haptic of its own.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
let mockPath = '/events'
jest.mock('expo-router', () => ({ usePathname: () => mockPath }))

import { isTabRoot, ToastProvider, useToast } from '../components/Toast'
import { H } from '../lib/haptics'
import { toast } from '../lib/toast'

function Trigger() {
  const { showToast } = useToast()
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => showToast('Couldn’t save that. Try again.', 'error')}>
        <Text>error</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => showToast('Saved', 'success')}>
        <Text>second</Text>
      </Pressable>
    </>
  )
}

const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))

beforeEach(() => {
  jest.useFakeTimers()
  mockPath = '/events'
})
afterEach(() => jest.useRealTimers())

describe('the provider', () => {
  it('raises the design system Toast: an error is an assertive live region', async () => {
    await render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    )
    await fireEvent.press(screen.getByRole('button', { name: 'error' }))
    const text = await screen.findByText('Couldn’t save that. Try again.')
    let node: typeof text | null = text
    while (node && !node.props.accessibilityLiveRegion) node = node.parent
    expect(node?.props.accessibilityLiveRegion).toBe('assertive')
    expect(screen.getByTestId('toast')).toBeTruthy()
  })

  it('shows one at a time: a second waits until the first has gone', async () => {
    await render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    )
    await fireEvent.press(screen.getByRole('button', { name: 'error' }))
    await fireEvent.press(screen.getByRole('button', { name: 'second' }))
    expect(screen.getByText('Couldn’t save that. Try again.')).toBeTruthy()
    expect(screen.queryByText('Saved')).toBeNull()
    // The first leaves after its dwell (5 s, 10 with a screen reader on) and a fade; then the second comes.
    await advance(10000)
    await advance(1000)
    expect(screen.queryByText('Couldn’t save that. Try again.')).toBeNull()
    expect(await screen.findByText('Saved')).toBeTruthy()
  })

  it('plays no haptic of its own: the caller already played the outcome', async () => {
    const error = jest.spyOn(H, 'error').mockImplementation(() => {})
    const success = jest.spyOn(H, 'success').mockImplementation(() => {})
    await render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    )
    await fireEvent.press(screen.getByRole('button', { name: 'error' }))
    expect(error).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })

  it('a toast raised from lib/ (no hook) is the same one', async () => {
    await render(<ToastProvider>{null}</ToastProvider>)
    await act(async () => toast('Photo removed', 'info'))
    expect(await screen.findByText('Photo removed')).toBeTruthy()
  })

  it('drops the oldest waiting toast past three, never the one showing', async () => {
    function Many() {
      const { showToast } = useToast()
      return (
        <Pressable accessibilityRole="button" onPress={() => ['a', 'b', 'c', 'd'].forEach((m) => showToast(m, 'info'))}>
          <Text>many</Text>
        </Pressable>
      )
    }
    await render(
      <ToastProvider>
        <Many />
      </ToastProvider>
    )
    await fireEvent.press(screen.getByRole('button', { name: 'many' }))
    // a was dropped with the fourth: b is the head.
    expect(screen.getByText('b')).toBeTruthy()
  })
})

describe('where it sits', () => {
  it('knows the tab roots, whose floating bar an Android snackbar clears', () => {
    for (const p of ['/', '/events', '/going', '/chat', '/profile']) expect(isTabRoot(p)).toBe(true)
    for (const p of ['/crews', '/chat/abc', '/settings', null, undefined]) expect(isTabRoot(p)).toBe(false)
  })
})
