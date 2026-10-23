import { useFocusEffect } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { Platform } from 'react-native'

import { PresentsHere, releaseTurn, requestTurn, type Turn } from '../../lib/modalTurn'

/**
 * A router modal (the paywall, Make a crew, a friend link, event preferences) holds the screen while it is focused:
 * a sheet that comes due under it waits, rather than being refused. Ahead of anyone already waiting, because it is on
 * screen.
 */
export function useRouteModalTurn(): void {
  const [turn] = useState<Turn>(() => ({}))
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') return
      requestTurn(turn, { front: true, screen: true })
      return () => releaseTurn(turn)
    }, [turn])
  )
}

/**
 * A router modal's content: while it is focused it holds the screen (`useRouteModalTurn`), and its own sheets present
 * from it (`PresentsHere`, lib/modalTurn).
 */
export function RouteModal({ children }: { children: ReactNode }) {
  useRouteModalTurn()
  return <PresentsHere.Provider value>{children}</PresentsHere.Provider>
}
