/* useLiveSync and motion #49: the screen in front syncs once on return after a long absence; one behind it does not. */
import { act, renderHook } from '@testing-library/react-native'
import { AppState } from 'react-native'

import { BACK_AFTER_MS } from '../lib/backFromBackground'
import { useLiveSync } from '../lib/useLiveSync'

let mockFocused = true
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect: mockUseEffect } = jest.requireActual('react')
    mockUseEffect(() => (mockFocused ? cb() : undefined), [cb])
  },
}))
jest.mock('../lib/socketClient', () => ({
  getConnectionStatus: () => ({ state: 'connected' }),
  subscribeConnectionStatus: () => () => {},
}))

let emit: (status: string) => void
beforeEach(() => {
  jest.useFakeTimers()
  mockFocused = true
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, handler: (s: string) => void) => {
    emit = handler
    return { remove: jest.fn() }
  }) as never)
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

async function awayFor(ms: number) {
  await act(async () => emit('background'))
  jest.setSystemTime(Date.now() + ms)
  await act(async () => emit('active'))
}

it('syncs once more on return after more than a minute, so counts roll once to now', async () => {
  const onSync = jest.fn()
  await renderHook(() => useLiveSync({ onSync }))
  onSync.mockClear() // the focus sync
  await awayFor(BACK_AFTER_MS + 1000)
  expect(onSync).toHaveBeenCalledTimes(1)
})

it('does not sync for a short absence, with the option off, or from a screen that is not in front', async () => {
  const onSync = jest.fn()
  await renderHook(() => useLiveSync({ onSync }))
  onSync.mockClear()
  await awayFor(10_000)
  expect(onSync).not.toHaveBeenCalled()

  const off = jest.fn()
  await renderHook(() => useLiveSync({ onSync: off, syncOnReturn: false }))
  off.mockClear()
  await awayFor(BACK_AFTER_MS + 1000)
  expect(off).not.toHaveBeenCalled()

  mockFocused = false
  const behind = jest.fn()
  await renderHook(() => useLiveSync({ onSync: behind, syncOnFocus: false }))
  await awayFor(BACK_AFTER_MS + 1000)
  expect(behind).not.toHaveBeenCalled()
})
