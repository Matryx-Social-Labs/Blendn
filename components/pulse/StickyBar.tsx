import { createContext, useContext, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { DrawerGround } from '../home/HomeDrawer'
import { Material, useMaterialTier } from '../ui/Material'
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
 * The search row's place in a list, pinned under the title (`stickyHeaderIndices`). Once the list has scrolled
 * the row gets the design system's bar `Material` behind it. It is mounted, not faded: the Material page says
 * glass never animates opacity (§5.2 rule 6), so showing and hiding it is a mount.
 *
 * On the solid tier (Android, Reduce Transparency) the row also always stands on the drawer's own opaque ground
 * (`DrawerGround`), so it is invisible at rest and nothing scrolling under it can show through, whatever the flag says.
 * Glass has no ground to match, so there the bar alone does it.
 */
export function StickyBar({ scrolled, children }: { scrolled?: boolean; children: ReactNode }) {
  const fromList = useContext(StickyScrolled)
  const solid = useMaterialTier() === 'solid'
  return (
    <View style={styles.row} testID="sticky-search">
      {solid ? <DrawerGround testID="sticky-search-ground" /> : null}
      {scrolled ?? fromList ? <Material role="bar" style={StyleSheet.absoluteFill} pointerEvents="none" testID="sticky-search-bar" /> : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: SPACE.sm },
})
