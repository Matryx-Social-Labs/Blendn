import { StyleSheet, View } from 'react-native'

import { COLOR, MATERIAL, RADIUS, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { useIncreaseContrast, useSelection } from './shared'

const RING = SPACE.xl - SPACE.xxs
const RING_COMPACT = SPACE.lg + SPACE.xs
const RING_ON = SPACE.sm - SPACE.xxs
const RING_OFF = 1.5
const RING_OFF_ALPHA = 0.35

/**
 * The 22 pt radio ring of the Go Live dial: the hue's 6 pt when picked, 35% at 1.5 pt when not.
 * `compact`: the 20 pt ring of a radio list on a page (Flow 4 `rate`, `.rd`), its 6 pt dot in the hue's glyph.
 */
export function RadioRing({ selected, compact = false, testID }: { selected: boolean; compact?: boolean; testID?: string }) {
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const ring = selected
    ? { borderWidth: RING_ON, borderColor: compact ? sel.glyph : sel.edge }
    : { borderWidth: RING_OFF, borderColor: contrast ? MATERIAL.hairlineIncreaseContrast : tint(COLOR.textPrimary, RING_OFF_ALPHA) }
  return <View testID={testID} style={[styles.ring, compact && styles.ringCompact, ring]} />
}

const styles = StyleSheet.create({
  ring: { width: RING, height: RING, borderRadius: RADIUS.capsule },
  ringCompact: { width: RING_COMPACT, height: RING_COMPACT },
})
