import { useFocusEffect, useNavigation } from 'expo-router'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Platform } from 'react-native'

import { PresentsHere, releaseTurn, requestTurn, type Turn } from '../../lib/modalTurn'

/**
 * A router modal (the paywall, Make a crew, a friend link, event preferences) holds the screen while it is focused:
 * a sheet that comes due under it waits, rather than being refused. Ahead of anyone already waiting, because it is on
 * screen.
 */
export function useRouteModalTurn(): void {
  const [turn] = useState<Turn>(() => ({}))
  const navigation = useNavigation()
  /** Each focus; a blur's late release belongs to its own focus only. */
  const epoch = useRef(0)
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') return
      const mine = ++epoch.current
      requestTurn(turn, { front: true, screen: true })
      /*
       * Blurred, it is still on its way off the screen: it gives the screen up when its transition has ended (or after
       * the fallback), so a sheet waiting under it is not presented over a modal still leaving (review LOW).
       */
      return () => {
        let off: () => void = () => {}
        const release = () => {
          off()
          clearTimeout(timer)
          if (epoch.current === mine) releaseTurn(turn)
        }
        const timer = setTimeout(release, ROUTE_GONE_FALLBACK_MS)
        off = navigation?.addListener?.('transitionEnd' as never, release) ?? (() => {})
      }
    }, [turn, navigation])
  )
}

/** A router modal's transition off the screen, with room to spare: the release if `transitionEnd` never comes. */
const ROUTE_GONE_FALLBACK_MS = 700

/**
 * A router modal's content: while it is focused it holds the screen (`useRouteModalTurn`), and its own sheets present
 * from it (`PresentsHere`, lib/modalTurn).
 */
export function RouteModal({ children }: { children: ReactNode }) {
  useRouteModalTurn()
  return <PresentsHere.Provider value>{children}</PresentsHere.Provider>
}
