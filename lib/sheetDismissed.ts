import { Platform } from 'react-native'

/*
 * iOS cannot present a native modal (a router modal: the paywall) while an RN Modal is still leaving: the push silently
 * does nothing. Whoever closes a sheet and then opens such a screen waits for this first. Android has no such rule, so
 * there it resolves at once; on iOS it resolves on the leaving Modal's own `onDismiss` (the DS Sheet reports it through
 * `notifySheetDismissed`), or after `fallbackMs` if no sheet was showing.
 */
const dismissWaiters = new Set<() => void>()
export function afterSheetDismissed(fallbackMs = 600): Promise<void> {
  if (Platform.OS !== 'ios') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      dismissWaiters.delete(done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, fallbackMs)
    dismissWaiters.add(done)
  })
}

/** A sheet's Modal has finished leaving (iOS): whoever waited on it may present now. */
export function notifySheetDismissed(): void {
  for (const done of [...dismissWaiters]) done()
}
