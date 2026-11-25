import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated from 'react-native-reanimated'

import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { MapGlass } from '../ds/Banner'
import { CONTROL_FONT_CAP, font } from '../ds/shared'
import { bannerFadeIn, bannerOut } from '../motion/presence'
import ScalePress from '../motion/ScalePress'
import { Text } from '../ui/Text'

type Line = { text: string; zoomIn: boolean; label: string }

/**
 * "+130 more · Zoom in" (pulse-map sheet 16, PICKED A by the advisor 2026-11-20): one glass capsule centred under the top
 * bar when the server has more in the map's box than it drew. It is about the map, so it sits on it, clear of the place
 * line and "my location". A tap is one zoom step in; at the deepest zoom it is the count alone, nothing to press. One line:
 * past the controls' font cap "· Zoom in" goes before the count could be cut (the label still says it). The row passes
 * every touch outside the capsule's own 44 pt to the pins under it.
 */
export function MoreLine({ line, top, onZoomIn }: { line: Line | null; top: number; onZoomIn: () => void }) {
  const { fontScale } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  if (!line) return null
  const suffix = line.zoomIn && fontScale <= CONTROL_FONT_CAP
  const words = (
    <>
      <MapGlass radius={RADIUS.capsule} />
      <Text variant="caption" color={COLOR.textPrimary} numberOfLines={1}>
        {line.text}
        {suffix ? (
          <>
            {' · '}
            <Text variant="caption" color={COLOR.textPrimary} style={font('caption', true)}>
              Zoom in
            </Text>
          </>
        ) : null}
      </Text>
    </>
  )
  return (
    <Animated.View
      entering={reduceMotion ? undefined : bannerFadeIn}
      exiting={reduceMotion ? undefined : bannerOut}
      style={[styles.row, { top }]}
      pointerEvents="box-none"
      testID="map-more-row"
    >
      {line.zoomIn ? (
        <ScalePress onPress={onZoomIn} hitSlop={SPACE.sm} style={styles.pill} accessibilityRole="button" accessibilityLabel={line.label} testID="map-more">
          {words}
        </ScalePress>
      ) : (
        <View style={styles.pill} accessible accessibilityLabel={line.label} testID="map-more">
          {words}
        </View>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // As the approximate line: 28 pt drawn, 44 pt to the finger (`hitSlop`).
  pill: { maxWidth: '80%', paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs + SPACE.xxs, borderRadius: RADIUS.capsule },
})
