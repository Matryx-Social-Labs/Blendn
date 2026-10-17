import { createContext, useContext } from 'react'

/**
 * One guard for every press inside the Banter's scroll area (rows, the Live
 * now cards, requests, section actions): a lift after a hold, or under which
 * the list reordered, presses nothing (drive 2 rows; drive 6 the Live now card
 * opened its room). The screen provides it around the list; each Banter part
 * wraps its own handlers with `useBanterPress`, so a new one cannot miss it.
 * Outside a provider it is the handler itself.
 */
export type PressGuard = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void

export const BanterPressGuard = createContext<PressGuard>((fn) => fn)

export function useBanterPress<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void
export function useBanterPress<A extends unknown[]>(fn: ((...args: A) => void) | undefined): ((...args: A) => void) | undefined
export function useBanterPress<A extends unknown[]>(fn: ((...args: A) => void) | undefined) {
  const guard = useContext(BanterPressGuard)
  return fn && guard(fn)
}
