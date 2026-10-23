import type { ReactNode } from 'react'

import { PresentsHere, useRouteModalTurn } from '../../lib/modalTurn'

/**
 * A router modal's content (the paywall, Make a crew, a friend link, event preferences): while it is focused it holds
 * the screen, so a sheet that comes due under it waits rather than being refused by iOS; and its own sheets present
 * from it (lib/modalTurn).
 */
export function RouteModal({ children }: { children: ReactNode }) {
  useRouteModalTurn()
  return <PresentsHere.Provider value>{children}</PresentsHere.Provider>
}
