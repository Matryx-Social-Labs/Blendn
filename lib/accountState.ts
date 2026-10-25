import { useSyncExternalStore } from 'react'

import type { AccountRefusal } from './sessionEnd'

/**
 * The account state the landing is to show (Flow 15 #1 to #3): suspended, a staff account, a deleted one.
 *
 * A module store, not a route parameter: the server's sentence is shown as the screen's words, and a sentence that
 * travelled in a URL would be text anyone could put on this screen with a link. Set by whoever was refused (the landing's
 * Google and Apple buttons, the email form, a session the server ended); taken by the landing.
 */
export type AccountState = { kind: AccountRefusal; sentence?: string }

let current: AccountState | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function setAccountState(next: AccountState | null): void {
  current = next
  emit()
}

export function getAccountState(): AccountState | null {
  return current
}

/** The landing's read: reactive, so a refusal that arrives while it is mounted replaces it. */
export function useAccountState(): AccountState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getAccountState,
    getAccountState
  )
}
