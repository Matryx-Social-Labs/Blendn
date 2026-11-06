import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'

import { Logger } from './logger'

/*
 * expo-brightness's native module as Expo installs it (`globalThis.expo.modules`, where `requireOptionalNativeModule`
 * looks first), read when asked: not the package's entry, which throws at import on a binary built before it was added,
 * so a JS bundle swapped into an older build keeps the screen as it is instead of dying (the pattern of `lib/time.ts`).
 */
type Brightness = {
  getBrightnessAsync(): Promise<number>
  setBrightnessAsync(level: number): Promise<void>
  /** Android: this window follows the system's level again. */
  restoreSystemBrightnessAsync?(): Promise<void>
}
const brightness = (): Brightness | undefined =>
  (globalThis as { expo?: { modules?: { ExpoBrightness?: Brightness } } }).expo?.modules?.ExpoBrightness

const FULL = 1
const warn = (what: string) => (error: unknown) => Logger.warn('general', `brightness ${what}`, { error: String(error) })

/** One native call at a time, in order: a raise just after a restore must read the level that restore put back, not full. */
let queue: Promise<void> = Promise.resolve()
const inTurn = (what: string, op: () => Promise<void>) => {
  queue = queue.then(op).catch(warn(what))
}

/**
 * Full brightness now; the returned call puts it back. iOS sets the system's level, which outlives the app until the
 * phone locks, so the level it found is written back (and one it could not read is never raised). Android sets this
 * window's own, handed back to the system.
 */
function brighten(native: Brightness): () => void {
  if (Platform.OS === 'android') {
    inTurn('raise failed', () => native.setBrightnessAsync(FULL))
    return () => inTurn('restore failed', async () => native.restoreSystemBrightnessAsync?.())
  }
  let found: number | null = null
  inTurn('raise failed', async () => {
    found = await native.getBrightnessAsync()
    await native.setBrightnessAsync(FULL)
  })
  return () => inTurn('restore failed', async () => (found === null ? undefined : native.setBrightnessAsync(found)))
}

/**
 * The screen at full brightness while `on` and the app is in front (a pass's code being shown at a counter): put back
 * when `on` goes false, on unmount, and in the background; raised again on the way back. A no-op without the module.
 */
export function useBrightScreen(on: boolean): void {
  useEffect(() => {
    const native = brightness()
    if (!on || !native) return
    let restore: (() => void) | null = null
    const raise = () => {
      if (!restore) restore = brighten(native)
    }
    const lower = () => {
      restore?.()
      restore = null
    }
    // Not 'active' alone: the state can be unknown in the first moments after launch, and the screen is in front then.
    if (AppState.currentState !== 'background') raise()
    const sub = AppState.addEventListener('change', (state) => (state === 'active' ? raise() : lower()))
    return () => {
      sub.remove()
      lower()
    }
  }, [on])
}
