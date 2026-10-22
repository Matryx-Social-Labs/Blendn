/* Motion #49: after more than a minute away, one catch-up, and no replay of what arrived meanwhile. */
import { act, renderHook } from '@testing-library/react-native'
import { AppState } from 'react-native'

import { awayLongEnough, BACK_AFTER_MS, noteReturn, playsArrival, useBackFromBackground } from '../lib/backFromBackground'

describe('the rule', () => {
  it('is strictly more than a minute', () => {
    expect(awayLongEnough(BACK_AFTER_MS)).toBe(false)
    expect(awayLongEnough(BACK_AFTER_MS + 1)).toBe(true)
  })

  it('a long return quiets arrivals briefly; a short one changes nothing', () => {
    const t0 = 1_000_000
    expect(noteReturn(5_000, t0)).toBe(false)
    expect(playsArrival(t0)).toBe(true)
    expect(noteReturn(BACK_AFTER_MS + 1, t0)).toBe(true)
    expect(playsArrival(t0 + 1000)).toBe(false)
    expect(playsArrival(t0 + 60_000)).toBe(true)
  })
})

describe('useBackFromBackground', () => {
  let emit: (status: string) => void
  let remove: jest.Mock
  beforeEach(() => {
    jest.useFakeTimers()
    remove = jest.fn()
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, handler: (s: string) => void) => {
      emit = handler
      return { remove }
    }) as never)
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('calls back once, with the time away, only after more than a minute', async () => {
    const onBack = jest.fn()
    await renderHook(() => useBackFromBackground(onBack))
    await act(async () => emit('background'))
    jest.setSystemTime(Date.now() + 30_000)
    await act(async () => emit('active'))
    expect(onBack).not.toHaveBeenCalled()
    await act(async () => emit('background'))
    jest.setSystemTime(Date.now() + BACK_AFTER_MS + 5_000)
    await act(async () => emit('active'))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onBack.mock.calls[0][0]).toBeGreaterThan(BACK_AFTER_MS)
  })

  it('time away counts from the first leaving (inactive before background), and an active that never left is nothing', async () => {
    const onBack = jest.fn()
    await renderHook(() => useBackFromBackground(onBack))
    await act(async () => emit('active'))
    expect(onBack).not.toHaveBeenCalled()
    await act(async () => emit('inactive'))
    jest.setSystemTime(Date.now() + 10_000)
    await act(async () => emit('background'))
    jest.setSystemTime(Date.now() + BACK_AFTER_MS)
    await act(async () => emit('active'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('listens only when enabled, and lets go on unmount', async () => {
    const view = await renderHook(() => useBackFromBackground(jest.fn(), false))
    expect(AppState.addEventListener).not.toHaveBeenCalled()
    const on = await renderHook(() => useBackFromBackground(jest.fn()))
    await on.unmount()
    expect(remove).toHaveBeenCalled()
    await view.unmount()
  })
})
