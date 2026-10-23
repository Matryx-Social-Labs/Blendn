import { Platform } from 'react-native'

import { holdsTurn, onTurnRequested, releaseTurn, requestTurn, subscribeTurns, type Turn } from './modalTurn'

/*
 * iOS cannot present a native modal (a router modal: the paywall) while an RN Modal is still leaving: the push silently
 * does nothing. Whoever closes a sheet and then opens such a screen waits for this first. Android has no such rule, so
 * there it resolves at once.
 *
 * On iOS it takes its place in the Modal turn (lib/modalTurn), ahead of anyone already waiting: it resolves once every
 * Modal ahead of it has gone, and then holds the screen for what the caller presents next, until that asks for the
 * screen itself (a router modal claims it on focus; a sheet asks as it opens) or `HANDOFF_MS` passes. So a sheet that
 * comes due on the same frame waits behind the paywall instead of racing its push (review MED-1). A leaving Modal's
 * `onDismiss` (`notifySheetDismissed`) and `fallbackMs` still resolve it, as before.
 */
/** How long a waiter holds the screen for what its caller presents next, if that never asks. */
export const HANDOFF_MS = 600
const dismissWaiters = new Set<() => void>()
export function afterSheetDismissed(fallbackMs = 600): Promise<void> {
  if (Platform.OS !== 'ios') return Promise.resolve()
  return new Promise((resolve) => {
    const waiter: Turn = {}
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      dismissWaiters.delete(done)
      clearTimeout(timer)
      // Resolved before it reached the front (the fallback, or an onDismiss heard first): it leaves the line, rather
      // than turn up later as a stale waiter holding the screen for nobody (review LOW).
      if (!holding) {
        offTurns()
        releaseTurn(waiter)
      }
      resolve()
    }
    // Its turn: what the caller presents next is next; it lets go when that asks, or after the hand-off.
    let holding = false
    const offTurns = subscribeTurns(() => {
      if (holding || !holdsTurn(waiter)) return
      holding = true
      offTurns()
      done()
      const letGo = () => {
        offAsks()
        clearTimeout(handoff)
        releaseTurn(waiter)
      }
      const offAsks = onTurnRequested((turn) => turn !== waiter && letGo())
      const handoff = setTimeout(letGo, HANDOFF_MS)
    })
    const timer = setTimeout(done, fallbackMs)
    dismissWaiters.add(done)
    requestTurn(waiter, { front: true })
  })
}

/** A sheet's Modal has finished leaving (iOS): whoever waited on it may present now. */
export function notifySheetDismissed(): void {
  for (const done of [...dismissWaiters]) done()
}
