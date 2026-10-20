/**
 * `useToast` raises the design system's Toast (components/ds/Toast.tsx), one at a time: the dwell, the swipe and the
 * look are the Toast's. The provider only decides which is on screen, and plays no haptic of its own.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Platform, Pressable, StyleSheet, Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
let mockPath = '/events'
let mockFocused = true
jest.mock('expo-router', () => ({ usePathname: () => mockPath, useIsFocused: () => mockFocused }))

import { isTabRoot, ToastProvider, useToast, useToastDock, useToastInset } from '../components/Toast'
import { SIZE, SPACE } from '../lib/design/tokens'
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

  it('a toast without `haptic` plays nothing on mount: the caller owns its own', async () => {
    const error = jest.spyOn(H, 'error').mockImplementation(() => {})
    const success = jest.spyOn(H, 'success').mockImplementation(() => {})
    await render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    )
    await fireEvent.press(screen.getByRole('button', { name: 'error' }))
    expect(screen.getByTestId('toast')).toBeTruthy()
    expect(error).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })

  it('with `haptic` it plays once, as the toast mounts: a queued one waits for its turn', async () => {
    const error = jest.spyOn(H, 'error').mockImplementation(() => {})
    const success = jest.spyOn(H, 'success').mockImplementation(() => {})
    function Both() {
      const { showToast } = useToast()
      return (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            showToast('Couldn’t save that. Try again.', 'error', { haptic: 'error' })
            showToast('Saved', 'success', { haptic: 'success' })
          }}
        >
          <Text>both</Text>
        </Pressable>
      )
    }
    await render(
      <ToastProvider>
        <Both />
      </ToastProvider>
    )
    await fireEvent.press(screen.getByRole('button', { name: 'both' }))
    // The error is showing; the success is queued and has not played.
    expect(error).toHaveBeenCalledTimes(1)
    expect(success).not.toHaveBeenCalled()
    await advance(11000)
    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(success).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
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
    // a is showing and stays; b, the oldest waiting, went with the fourth.
    expect(screen.getByText('a')).toBeTruthy()
    await advance(10000)
    await advance(1000)
    expect(await screen.findByText('c')).toBeTruthy()
    await advance(10000)
    await advance(1000)
    expect(await screen.findByText('d')).toBeTruthy()
  })
})

describe('where it sits', () => {
  const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as { top?: number }

  it('every toast sits below the top bar, so back stays tappable while one shows', async () => {
    const back = jest.fn()
    function Screen() {
      const { showToast } = useToast()
      return (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back}>
            <Text>back</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => showToast('Saved', 'success')}>
            <Text>save</Text>
          </Pressable>
        </>
      )
    }
    await render(
      <ToastProvider>
        <Screen />
      </ToastProvider>
    )
    await fireEvent.press(screen.getByRole('button', { name: 'save' }))
    // The lane starts below the 44 pt circle and the 8 under it; it lets touches through; the toast adds the safe area on top.
    expect(flat('toast-lane').top).toBe(SIZE.circleButton + SPACE.sm)
    expect(screen.getByTestId('toast-lane').props.pointerEvents).toBe('box-none')
    expect(flat('toast').top).toBeGreaterThanOrEqual(SPACE.sm)
    await fireEvent.press(screen.getByLabelText('Back'))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('knows the tab roots, whose floating bar an Android snackbar clears', () => {
    for (const p of ['/', '/events', '/going', '/chat', '/profile']) expect(isTabRoot(p)).toBe(true)
    for (const p of ['/crews', '/chat/abc', '/settings', null, undefined]) expect(isTabRoot(p)).toBe(false)
  })
})

describe('docks and the room left under a snackbar (Android)', () => {
  const bottomOf = () => (StyleSheet.flatten(screen.getByTestId('toast').props.style) as { bottom?: number }).bottom

  function Screen({ dock, onInset }: { dock?: number; onInset?: (n: number) => void }) {
    const { showToast } = useToast()
    useToastDock(dock ?? 0)
    onInset?.(useToastInset())
    return (
      <Pressable accessibilityRole="button" onPress={() => showToast('Saved', 'success')}>
        <Text>save</Text>
      </Pressable>
    )
  }
  const android = () => Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
  afterEach(() => Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true }))

  it('a screen with a dock registers its height: the snackbar reads it, and unmounting resets it to 0', async () => {
    android()
    mockPath = '/venue/v1'
    await render(
      <ToastProvider>
        <Screen dock={80} />
      </ToastProvider>
    )
    await fireEvent.press(screen.getByRole('button', { name: 'save' }))
    expect(bottomOf()).toBe(80 + SPACE.lg)
    await screen.unmount()
    await render(
      <ToastProvider>
        <Screen />
      </ToastProvider>
    )
    await fireEvent.press(screen.getByRole('button', { name: 'save' }))
    expect(bottomOf()).toBe(SPACE.lg)
  })

  it('the last registrant wins', async () => {
    android()
    mockPath = '/chat/abc'
    await render(
      <ToastProvider>
        <Screen dock={60} />
        <Screen dock={90} />
      </ToastProvider>
    )
    await fireEvent.press(screen.getAllByRole('button', { name: 'save' })[0])
    expect(bottomOf()).toBe(90 + SPACE.lg)
  })

  it('the inset is the toast’s height plus a gutter when it stands on the bare screen, and 0 with a dock or on a tab root', async () => {
    android()
    mockPath = '/settings'
    const seen: number[] = []
    await render(
      <ToastProvider>
        <Screen onInset={(n) => seen.push(n)} />
      </ToastProvider>
    )
    expect(seen.at(-1)).toBe(0)
    await fireEvent.press(screen.getByRole('button', { name: 'save' }))
    await act(async () => fireEvent(screen.getByTestId('toast'), 'layout', { nativeEvent: { layout: { width: 300, height: 52, x: 0, y: 0 } } }))
    expect(seen.at(-1)).toBe(52 + SPACE.lg)
    mockPath = '/events'
    await screen.rerender(
      <ToastProvider>
        <Screen onInset={(n) => seen.push(n)} />
      </ToastProvider>
    )
    expect(seen.at(-1)).toBe(0)
  })

  it('iOS has no snackbar to make room for', async () => {
    mockPath = '/settings'
    const seen: number[] = []
    await render(
      <ToastProvider>
        <Screen onInset={(n) => seen.push(n)} />
      </ToastProvider>
    )
    await fireEvent.press(screen.getByRole('button', { name: 'save' }))
    expect(seen.at(-1)).toBe(0)
  })
})

describe('review fixes: focus-scoped docks and split contexts', () => {
  const android = () => Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    mockFocused = true
  })
  const bottomOf = () => (StyleSheet.flatten(screen.getByTestId('toast').props.style) as { bottom?: number }).bottom

  function Docked({ height, label }: { height: number; label: string }) {
    const { showToast } = useToast()
    useToastDock(height)
    return (
      <Pressable accessibilityRole="button" onPress={() => showToast('Saved', 'success')}>
        <Text>{label}</Text>
      </Pressable>
    )
  }

  it('a dock under a screen that is not in front (Room → Room info) is not registered: its height is dropped, and comes back on return', async () => {
    android()
    mockPath = '/chat-info/abc'
    mockFocused = false
    const tree = (
      <ToastProvider>
        <Docked height={90} label="composer" />
      </ToastProvider>
    )
    await render(tree)
    await fireEvent.press(screen.getByRole('button', { name: 'composer' }))
    expect(bottomOf()).toBe(SPACE.lg)
    mockFocused = true
    await screen.rerender(<ToastProvider><Docked height={90} label="composer" /></ToastProvider>)
    expect(bottomOf()).toBe(90 + SPACE.lg)
  })

  it('a consumer of useToast() is not re-rendered when a dock registers or a toast measures itself', async () => {
    android()
    mockPath = '/settings'
    let renders = 0
    function Raiser() {
      renders += 1
      const { showToast } = useToast()
      return (
        <Pressable accessibilityRole="button" onPress={() => showToast('Saved', 'success')}>
          <Text>raise</Text>
        </Pressable>
      )
    }
    await render(
      <ToastProvider>
        <Raiser />
        <Docked height={70} label="dock" />
      </ToastProvider>
    )
    const settled = renders
    await fireEvent.press(screen.getByRole('button', { name: 'raise' }))
    await act(async () => fireEvent(screen.getByTestId('toast'), 'layout', { nativeEvent: { layout: { width: 300, height: 52, x: 0, y: 0 } } }))
    expect(renders).toBe(settled)
  })
})
