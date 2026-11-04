import { createContext, useContext, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { DrawerGround, useInDrawer } from '../home/HomeDrawer'
import { Material } from '../ui/Material'
import { SPACE } from '../../lib/design/tokens'

/** How far the list scrolls before the sticky search row takes its bar: the title block has gone under it. */
export const STICKY_BAR_AFTER = SPACE.xl

/**
 * Whether the list has scrolled past its title, from the list's owner. Held in context, as the Pulse does, so a flip
 * reaches the pinned row without waiting on the list to re-render its cells: on Android, Places' `Animated.FlatList` never
 * mounted the bar while it was stuck (rc7 D3), though the same flag did on iOS and on the Pulse.
 */
export const StickyScrolled = createContext(false)

/**
 * A row's place in a list, pinned under the title (`stickyHeaderIndices`): the Pulse's chips, Places' search.
 *
 * Inside a drawer the row stands on the drawer's own ink (`DrawerGround`) at every snap and every tier, and never gets a
 * bar: the drawer is solid ink (owner, 2026-11-03), so the row is invisible at rest, nothing scrolling under it shows
 * through, and no band reads as a rail behind the chips. Outside a drawer, once the list has scrolled, the row gets the
 * design system's bar `Material`; it is mounted, not faded (glass never animates opacity, §5.2 rule 6).
 */
export function StickyBar({ scrolled, children }: { scrolled?: boolean; children: ReactNode }) {
  const fromList = useContext(StickyScrolled)
  const inDrawer = useInDrawer()
  return (
    <View style={styles.row} testID="sticky-search">
      {inDrawer ? <DrawerGround testID="sticky-search-ground" /> : null}
      {(scrolled ?? fromList) && !inDrawer ? <Material role="bar" style={StyleSheet.absoluteFill} pointerEvents="none" testID="sticky-search-bar" /> : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: SPACE.sm },
})
