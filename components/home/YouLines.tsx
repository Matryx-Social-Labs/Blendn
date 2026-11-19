import { Marker } from '@maplibre/maplibre-react-native'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import { locateRide } from '../../lib/homeMap'
import { MAP_THEME } from '../../lib/mapTheme'
import { MapGlass } from '../ds/Banner'
import { font } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Text } from '../ui/Text'
import { annotationTitle } from './MapLitLayers'

/** The callout's bottom above your dot's centre: the dot, its ring and a gap (board 06, "STALE"). */
const ABOVE_DOT_PX = MAP_THEME.you.radiusPx + MAP_THEME.you.ringPx + SPACE.sm

/**
 * iOS Precise off, or Android's approximate grant (pulse-map 06, frame 2): one quiet glass line centred over the drawer,
 * level with "my location", "Approximate · Use precise". It never blocks the map; the tap is the way to precise.
 */
export function ApproximateLine({
  visible,
  drawerTop,
  drawer,
  lift,
  onPress,
}: {
  visible: boolean
  drawerTop: SharedValue<number>
  drawer: { half: number; full: number }
  lift?: SharedValue<number>
  onPress: () => void
}) {
  const ride = useAnimatedStyle(() => {
    const { translateY, opacity } = locateRide(drawerTop.get(), drawer, lift ? lift.get() : 0)
    return { transform: [{ translateY }], opacity }
  })
  return (
    <Animated.View
      style={[styles.row, ride]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <ScalePress
        onPress={onPress}
        hitSlop={SPACE.sm}
        style={styles.pill}
        accessibilityRole="button"
        accessibilityLabel="Your location is approximate. Use precise"
        testID="map-approximate"
      >
        <MapGlass radius={RADIUS.capsule} />
        <Text variant="caption" color={COLOR.textPrimary} numberOfLines={1}>
          Approximate ·{' '}
          <Text variant="caption" color={COLOR.textPrimary} style={font('caption', true)}>
            Use precise
          </Text>
        </Text>
      </ScalePress>
    </Animated.View>
  )
}

/**
 * A fix older than ten minutes (pulse-map 06, frame 3): the grey dot says "Last seen here 25 min ago · updating" in glass
 * just above it. It turns violet, and this goes, when a live fix lands; the camera does not chase it.
 */
export function StaleCallout({ at, text }: { at: [number, number]; text: string }) {
  return (
    <Marker id="you-stale" lngLat={at} anchor="bottom" offset={[0, -ABOVE_DOT_PX]} {...annotationTitle(text)}>
      <View style={styles.callout} accessible accessibilityLabel={text} testID="map-stale">
        <MapGlass radius={RADIUS.rowInCard} />
        <Text variant="caption" color={COLOR.textPrimary} numberOfLines={2} style={styles.calloutText}>
          {text}
        </Text>
      </View>
    </Marker>
  )
}

const styles = StyleSheet.create({
  // Level with "my location" (the same ride), centred between the screen's edges.
  row: { position: 'absolute', top: 0, left: 0, right: 0, height: MAP_THEME.locate.sizePx, alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs + SPACE.xxs, borderRadius: RADIUS.capsule },
  callout: { maxWidth: MAP_THEME.chip.maxWidthPx, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs, borderRadius: RADIUS.rowInCard },
  calloutText: { flexShrink: 1 },
})
