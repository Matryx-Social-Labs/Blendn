/**
 * The can't-reach screen's own retries (Flow 15 15.13): a jittered chain of timeouts, one try at a time, paused in the
 * background.
 */
import { act, renderHook } from '@testing-library/react-native'
import { AppState } from 'react-native'

import { AUTO_RETRY_MS, jittered } from '../lib/outage'
import { useAutoRetry } from '../lib/useAutoRetry'

let appState: string
beforeEach(() => {
  jest.useFakeTimers()
  appState = 'active'
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => appState })
  jest.spyOn(Math, 'random').mockReturnValue(0.5)
})
afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))

describe('jittered', () => {
  it('is the wait within ±20%', () => {
    expect(jittered(30_000, 0)).toBe(24_000)
    expect(jittered(30_000, 0.5)).toBe(30_000)
    expect(jittered(30_000, 1)).toBe(36_000)
  })
})

describe('useAutoRetry', () => {
  it('tries once per wait, as a chain, not on a fixed interval', async () => {
    const attempt = jest.fn().mockResolvedValue(null)
    await renderHook(() => useAutoRetry(true, attempt))
    await advance(AUTO_RETRY_MS - 1)
    expect(attempt).not.toHaveBeenCalled()
    await advance(1)
    expect(attempt).toHaveBeenCalledTimes(1)
    // The next wait is drawn when the try is over, and it is again about 30 s, not a fixed beat.
    await advance(AUTO_RETRY_MS - 1)
    expect(attempt).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('waits for a try that is still running before scheduling the next', async () => {
    let finish: () => void = () => {}
    const attempt = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    await renderHook(() => useAutoRetry(true, attempt))
    await advance(AUTO_RETRY_MS)
    expect(attempt).toHaveBeenCalledTimes(1)
    await advance(AUTO_RETRY_MS * 3)
    expect(attempt).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    await advance(AUTO_RETRY_MS)
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('skips the tick while the app is not in the foreground, and resumes when it is', async () => {
    const attempt = jest.fn().mockResolvedValue(null)
    await renderHook(() => useAutoRetry(true, attempt))
    appState = 'background'
    await advance(AUTO_RETRY_MS * 2)
    expect(attempt).not.toHaveBeenCalled()
    appState = 'active'
    await advance(AUTO_RETRY_MS)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('stops when the screen goes away or the outage ends', async () => {
    const attempt = jest.fn().mockResolvedValue(null)
    const { rerender, unmount } = await renderHook(({ on }: { on: boolean }) => useAutoRetry(on, attempt), { initialProps: { on: true } })
    await rerender({ on: false })
    await advance(AUTO_RETRY_MS * 3)
    expect(attempt).not.toHaveBeenCalled()
    await rerender({ on: true })
    await unmount()
    await advance(AUTO_RETRY_MS * 3)
    expect(attempt).not.toHaveBeenCalled()
  })
})
