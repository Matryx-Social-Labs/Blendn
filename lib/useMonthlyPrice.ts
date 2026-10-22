import { useEffect, useState } from 'react'

import { loadPlusOffers } from './purchases'

/** The store answers once per run: a price is read when Me first needs it, and every later Me has it at once. */
let known: string | null = null
let asking: Promise<void> | null = null

/** The monthly package's price string from the store (`₹199`), or null until the store answers (or when it never does). Asked only when `enabled`. */
export function useMonthlyPrice(enabled: boolean): string | null {
  const [price, setPrice] = useState<string | null>(known)
  useEffect(() => {
    if (!enabled || known) return
    let live = true
    asking ??= loadPlusOffers()
      .then((offers) => {
        known = offers?.find((o) => o.pkg.identifier === '$rc_monthly')?.price ?? null
      })
      .catch(() => {})
      .finally(() => {
        asking = null
      })
    void asking.then(() => live && setPrice(known))
    return () => {
      live = false
    }
  }, [enabled])
  return price
}
