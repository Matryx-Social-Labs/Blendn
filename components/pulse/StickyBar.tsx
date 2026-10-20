import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { Material } from '../ui/Material'
import { SPACE } from '../../lib/design/tokens'

/** How far the list scrolls before the sticky search row takes its bar: the title block has gone under it. */
export const STICKY_BAR_AFTER = SPACE.xl

/**
 * The search row's place in a list, pinned under the title (`stickyHeaderIndices`). Once the list has scrolled
 * the row gets the design system's bar `Material` behind it. It is mounted, not faded: the Material page says
 * glass never animates opacity (§5.2 rule 6), so showing and hiding it is a mount.
 */
export function StickyBar({ scrolled, children }: { scrolled: boolean; children: ReactNode }) {
  return (
    <View style={styles.row} testID="sticky-search">
      {scrolled ? <Material role="bar" style={StyleSheet.absoluteFill} pointerEvents="none" testID="sticky-search-bar" /> : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: SPACE.sm },
})
