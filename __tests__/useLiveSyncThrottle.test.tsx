/*
 * Launch gate 1 (SCRUM-1173): a dirty mark re-reads only the screen in front, at most once per 10 s (trailing), and a
 * reconnect re-reads only the screen in front, after a random 0-5 s wait. A room of N phones was N re-reads per message.
 */
import { act, renderHook } from '@testing-library/react-native'

import { clearDirtyDomains, markDomainsDirty } from '../lib/liveSyncState'
import { useLiveSync } from '../lib/useLiveSync'

/** The default window and reconnect spread, as the task names them. */
const WINDOW_MS = 10_000
const JITTER_MS = 5_000

// Focus as a screen sees it: set at mount from `mockFocused`, then moved for every mounted hook by `setFocus`.
let mockFocused = true
const mockFocusSetters = new Set<(focused: boolean) => void>()
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const R = jest.requireActual('react')
    const [focused, setFocused] = R.useState(mockFocused)
    R.useEffect(() => {
      mockFocusSetters.add(setFocused)
      return () => mockFocusSetters.delete(setFocused)
    }, [])
    R.useEffect(() => (focused ? cb() : undefined), [cb, focused])
  },
}))

let mockState = 'connected'
const mockStatusListeners = new Set<(s: { state: string }) => void>()
jest.mock('../lib/socketClient', () => ({
  getConnectionStatus: () => ({ state: mockState }),
  subscribeConnectionStatus: (l: (s: { state: string }) => void) => {
    mockStatusListeners.add(l)
    return () => mockStatusListeners.delete(l)
  },
}))

const setFocus = (focused: boolean) => act(async () => mockFocusSetters.forEach((s) => s(focused)))
const setSocket = (state: string) =>
  act(async () => {
    mockState = state
    mockStatusListeners.forEach((l) => l({ state }))
  })
const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms))
const mark = (domain: 'chat' | 'events' | 'match' = 'chat') => act(async () => markDomainsDirty([domain]))

/** A mounted hook whose focus sync is already counted out, so `onSync` counts only what follows. */
async function mounted(options: Partial<Parameters<typeof useLiveSync>[0]> = {}) {
  const onSync = jest.fn()
  const hook = await renderHook(() => useLiveSync({ onSync, domains: ['chat'], ...options }))
  onSync.mockClear()
  return { onSync, hook }
}

beforeEach(() => {
  jest.useFakeTimers()
  mockFocused = true
  mockState = 'connected'
  clearDirtyDomains(['chat', 'events', 'match'])
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('dirty marks', () => {
  it('50 chat messages in 10 s re-read the screen in front once in the window, then once more at its end', async () => {
    const { onSync } = await mounted()
    for (let i = 0; i < 50; i++) {
      await mark()
      await advance(WINDOW_MS / 50 - 1)
    }
    expect(onSync).toHaveBeenCalledTimes(1)
    await advance(WINDOW_MS)
    // Trailing: the marks after the first still produce one sync, at the window's end.
    expect(onSync).toHaveBeenCalledTimes(2)
    await advance(WINDOW_MS * 3)
    expect(onSync).toHaveBeenCalledTimes(2)
  })

  it('a mark inside the window waits for the window to end, and one after it syncs at once', async () => {
    const { onSync } = await mounted()
    await mark()
    expect(onSync).toHaveBeenCalledTimes(1)
    await advance(4_000)
    await mark()
    await advance(WINDOW_MS - 4_000 - 1)
    expect(onSync).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(onSync).toHaveBeenCalledTimes(2)
    await advance(WINDOW_MS)
    await mark()
    expect(onSync).toHaveBeenCalledTimes(3)
  })

  it('a screen behind another reads nothing on marks, and catches up once when it comes to the front', async () => {
    mockFocused = false
    const onSync = jest.fn()
    await renderHook(() => useLiveSync({ onSync, domains: ['chat'] }))
    for (let i = 0; i < 50; i++) await mark()
    await advance(WINDOW_MS * 2)
    expect(onSync).not.toHaveBeenCalled()
    await setFocus(true)
    expect(onSync).toHaveBeenCalledTimes(1)
  })

  it('a pending trailing sync is dropped if the screen leaves the front; its focus sync catches up instead', async () => {
    const { onSync } = await mounted()
    await mark()
    await mark()
    expect(onSync).toHaveBeenCalledTimes(1)
    await setFocus(false)
    await advance(WINDOW_MS * 2)
    expect(onSync).toHaveBeenCalledTimes(1)
    await setFocus(true)
    expect(onSync).toHaveBeenCalledTimes(2)
  })

  it('a mark for another domain does nothing', async () => {
    const { onSync } = await mounted({ domains: ['events'] })
    await mark('chat')
    await advance(WINDOW_MS * 2)
    expect(onSync).not.toHaveBeenCalled()
    await mark('events')
    expect(onSync).toHaveBeenCalledTimes(1)
  })

  it('syncOnDirty: false reads nothing on marks, and still syncs on focus and on reconnect', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const onSync = jest.fn()
    await renderHook(() => useLiveSync({ onSync, domains: ['chat'], syncOnDirty: false }))
    expect(onSync).toHaveBeenCalledTimes(1) // focus
    for (let i = 0; i < 50; i++) await mark()
    await advance(WINDOW_MS * 2)
    expect(onSync).toHaveBeenCalledTimes(1)
    await setSocket('disconnected')
    await setSocket('connected')
    await advance(0)
    expect(onSync).toHaveBeenCalledTimes(2)
  })
})

describe('reconnect', () => {
  it('only the screen in front re-reads, after a random wait of up to 5 s', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    const front = await mounted()
    mockFocused = false
    const behind = await mounted()
    await setSocket('disconnected')
    await setSocket('connected')
    expect(front.onSync).not.toHaveBeenCalled()
    await advance(JITTER_MS * 0.5 - 1)
    expect(front.onSync).not.toHaveBeenCalled()
    await advance(1)
    expect(front.onSync).toHaveBeenCalledTimes(1)
    await advance(JITTER_MS * 2)
    expect(front.onSync).toHaveBeenCalledTimes(1)
    expect(behind.onSync).not.toHaveBeenCalled()
  })

  it('drops the waiting re-read if the socket drops again or the screen unmounts first', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9)
    const { onSync, hook } = await mounted()
    await setSocket('disconnected')
    await setSocket('connected')
    await advance(1_000)
    await setSocket('disconnected')
    await advance(JITTER_MS)
    expect(onSync).not.toHaveBeenCalled()
    await setSocket('connected')
    await hook.unmount()
    await advance(JITTER_MS)
    expect(onSync).not.toHaveBeenCalled()
  })
})
