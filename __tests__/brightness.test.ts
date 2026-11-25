/*
 * The screen brightens while a pass's code is up (Flow 4 polish: "Brightness goes up while the pass is open"), through
 * expo-brightness's native module when the binary has it. A JS bundle swapped into an older binary has no module: the
 * screen then stays as it is, with no throw and no call. On iOS the level is the system's and outlives the app until the
 * phone locks, so it is put back on blur, unmount and background; Android's is this window's own, handed back to the system.
 */
import { act, renderHook } from '@testing-library/react-native'
import { AppState, Platform, type AppStateStatus } from 'react-native'

import { useBrightScreen } from '../lib/brightness'
import { Logger } from '../lib/logger'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

type Native = { getBrightnessAsync: jest.Mock; setBrightnessAsync: jest.Mock; restoreSystemBrightnessAsync: jest.Mock }
const modules = (globalThis as unknown as { expo: { modules: Record<string, unknown> } }).expo.modules
let native: Native
let appState: (state: AppStateStatus) => void
const os = Platform.OS
const onPlatform = (value: string) => Object.defineProperty(Platform, 'OS', { value, configurable: true })

/** Every pending promise in the chain, settled. */
const settle = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve() })

beforeEach(() => {
  native = {
    getBrightnessAsync: jest.fn(() => Promise.resolve(0.3)),
    setBrightnessAsync: jest.fn(() => Promise.resolve()),
    restoreSystemBrightnessAsync: jest.fn(() => Promise.resolve()),
  }
  modules.ExpoBrightness = native
  ;(Logger.warn as jest.Mock).mockClear()
  appState = () => {}
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appState = listener as (state: AppStateStatus) => void
    return { remove: jest.fn() }
  })
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true })
})
afterEach(() => {
  delete modules.ExpoBrightness
  onPlatform(os)
  jest.restoreAllMocks()
})

describe('with the native module (a build that has expo-brightness)', () => {
  it('iOS: full brightness while on, and the level it found put back on unmount', async () => {
    onPlatform('ios')
    const { unmount } = await renderHook(() => useBrightScreen(true))
    await settle()
    expect(native.getBrightnessAsync).toHaveBeenCalledTimes(1)
    expect(native.setBrightnessAsync.mock.calls).toEqual([[1]])
    await unmount()
    await settle()
    expect(native.setBrightnessAsync.mock.calls).toEqual([[1], [0.3]])
    expect(native.restoreSystemBrightnessAsync).not.toHaveBeenCalled()
  })

  it('Android: full brightness for this window, then the system’s again', async () => {
    onPlatform('android')
    const { unmount } = await renderHook(() => useBrightScreen(true))
    await settle()
    expect(native.setBrightnessAsync.mock.calls).toEqual([[1]])
    await unmount()
    await settle()
    expect(native.restoreSystemBrightnessAsync).toHaveBeenCalledTimes(1)
    expect(native.setBrightnessAsync.mock.calls).toEqual([[1]])
  })

  it('turned off (blur, or the code gone): put back; turned on again: raised again', async () => {
    onPlatform('ios')
    const { rerender } = await renderHook(({ on }: { on: boolean }) => useBrightScreen(on), { initialProps: { on: true } })
    await settle()
    await rerender({ on: false })
    await settle()
    expect(native.setBrightnessAsync.mock.calls).toEqual([[1], [0.3]])
    await rerender({ on: true })
    await settle()
    expect(native.setBrightnessAsync.mock.calls).toEqual([[1], [0.3], [1]])
  })

  it('off and on again before the phone has answered: the level it puts back is the one from before, never full', async () => {
    onPlatform('ios')
    let level = 0.3
    let answer: () => void = () => {}
    // The phone takes its time over the first read: it answers only when the test says.
    native.getBrightnessAsync.mockImplementationOnce(() => new Promise<number>((resolve) => { answer = () => resolve(level) }))
    native.getBrightnessAsync.mockImplementation(() => Promise.resolve(level))
    native.setBrightnessAsync.mockImplementation((to: number) => Promise.resolve().then(() => { level = to }))
    const { rerender, unmount } = await renderHook(({ on }: { on: boolean }) => useBrightScreen(on), { initialProps: { on: true } })
    // Off before the raise has landed: put back all the same.
    await rerender({ on: false })
    await act(async () => answer())
    await settle()
    expect(level).toBe(0.3)
    // Raised, then off and straight on again: the second raise reads the level the restore wrote, not full.
    await rerender({ on: true })
    await settle()
    await rerender({ on: false })
    await rerender({ on: true })
    await settle()
    expect(level).toBe(1)
    await unmount()
    await settle()
    expect(level).toBe(0.3)
  })

  it('to the background: put back (iOS keeps the level after the app); back to the front: raised again', async () => {
    onPlatform('ios')
    await renderHook(() => useBrightScreen(true))
    await settle()
    await act(async () => appState('background'))
    await settle()
    expect(native.setBrightnessAsync.mock.calls).toEqual([[1], [0.3]])
    await act(async () => appState('active'))
    await settle()
    expect(native.setBrightnessAsync.mock.calls).toEqual([[1], [0.3], [1]])
  })

  it('mounted in the background: raised only once the app is back in front', async () => {
    onPlatform('ios')
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true })
    await renderHook(() => useBrightScreen(true))
    await settle()
    expect(native.setBrightnessAsync).not.toHaveBeenCalled()
    await act(async () => appState('active'))
    await settle()
    expect(native.setBrightnessAsync.mock.calls).toEqual([[1]])
  })

  it('off from the start: nothing is read or set (control for the cases above)', async () => {
    await renderHook(() => useBrightScreen(false))
    await settle()
    expect(native.getBrightnessAsync).not.toHaveBeenCalled()
    expect(native.setBrightnessAsync).not.toHaveBeenCalled()
  })

  it('iOS: a level it cannot read is never raised (it could not be put back)', async () => {
    onPlatform('ios')
    native.getBrightnessAsync.mockRejectedValueOnce(new Error('no screen'))
    const { unmount } = await renderHook(() => useBrightScreen(true))
    await settle()
    await unmount()
    await settle()
    expect(native.setBrightnessAsync).not.toHaveBeenCalled()
    expect(Logger.warn).toHaveBeenCalled()
  })

  it('a native refusal is logged, never thrown', async () => {
    onPlatform('android')
    native.setBrightnessAsync.mockRejectedValueOnce(new Error('denied'))
    native.restoreSystemBrightnessAsync.mockRejectedValueOnce(new Error('denied'))
    const { unmount } = await renderHook(() => useBrightScreen(true))
    await settle()
    await unmount()
    await settle()
    expect(Logger.warn).toHaveBeenCalledTimes(2)
  })
})

describe('without the native module (a JS bundle in an older binary)', () => {
  it('stays as it is: no throw, no call, nothing logged', async () => {
    delete modules.ExpoBrightness
    const { unmount } = await renderHook(() => useBrightScreen(true))
    await settle()
    await act(async () => appState('background'))
    await act(async () => appState('active'))
    await unmount()
    await settle()
    expect(native.getBrightnessAsync).not.toHaveBeenCalled()
    expect(native.setBrightnessAsync).not.toHaveBeenCalled()
    expect(native.restoreSystemBrightnessAsync).not.toHaveBeenCalled()
    expect(Logger.warn).not.toHaveBeenCalled()
  })
})
