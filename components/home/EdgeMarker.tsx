import { type MapRef } from '@maplibre/maplibre-react-native'
import { useEffect, useState, type RefObject } from 'react'
import { Text as RNText, StyleSheet, View } from 'react-native'

import { COLOR, ICON, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { edgeMarker } from '../../lib/mapPresence'
import { MAP_THEME } from '../../lib/mapTheme'
import { MapGlass } from '../ds/Banner'
import { monoCaption, MonoRun } from '../ds/MonoFamily'
import { useBoldText } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { Text } from '../ui/Text'

/** Its size before it has laid out once: a short name and a distance (board 05, "Kitty Ko 3.1 km"). */
const FIRST_SIZE = { width: 132, height: 28 }

/**
 * The lap's venue when it is off the map you can see (pulse-map 05, frames 3 and 6): glass at the edge, on the line from
 * the map's centre to it, an ember arrow turned to it, its name and how far from you. Auto-advance never moves the camera
 * (board rule); a tap is the person asking, so it goes there. Placed when the camera stops (`settled`) and hidden while it
 * moves. A plain view over the map, so VoiceOver and TalkBack both reach it.
 */
export function EdgeMarker({
  map,
  target,
  distance,
  box,
  settled,
  moving,
  onPress,
}: {
  map: RefObject<MapRef | null>
  target: { id: string; name: string; at: [number, number] } | null
  /** "3.1 km" from your fix; null without one (never guessed). */
  distance: string | null
  box: { left: number; top: number; right: number; bottom: number }
  settled: number
  moving: boolean
  onPress: () => void
}) {
  const bold = useBoldText()
  // Where its venue projected, and for which venue: a new lap venue never borrows the last one's point.
  const [placed, setPlaced] = useState<{ key: string; xy: [number, number] } | null>(null)
  const [size, setSize] = useState(FIRST_SIZE)
  const lng = target?.at[0]
  const lat = target?.at[1]
  useEffect(() => {
    const m = map.current
    if (!m || lng === undefined || lat === undefined) return
    let stale = false
    m.project([lng, lat])
      .then((s) => {
        if (!stale) setPlaced({ key: `${lng},${lat}`, xy: s as [number, number] })
      })
      .catch((error) => Logger.warn('events', 'Edge marker could not place its venue', { error: String(error) }))
    return () => {
      stale = true
    }
  }, [map, lng, lat, settled])
  const xy = placed && placed.key === `${lng},${lat}` ? placed.xy : null
  const spot = target && xy && !moving ? edgeMarker(xy, box, size) : null
  if (!target || !spot) return null
  return (
    <ScalePress
      onPress={onPress}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        if (Math.abs(width - size.width) > 1 || Math.abs(height - size.height) > 1) setSize({ width, height })
      }}
      hitSlop={SPACE.sm}
      style={[styles.marker, { left: spot.left, top: spot.top }]}
      accessibilityRole="button"
      accessibilityLabel={`${target.name}${distance ? `, ${distance} away` : ''}, off the map. Double-tap to show it`}
      testID="map-edge-marker"
    >
      <MapGlass radius={RADIUS.capsule} />
      <View style={{ transform: [{ rotate: `${spot.angle}deg` }] }}>
        <Icon name="arrow-up" size={ICON.inline} color={MAP_THEME.event.crown} />
      </View>
      <Text variant="caption" color={COLOR.textPrimary} numberOfLines={1} style={styles.name}>
        {target.name}
      </Text>
      {distance ? (
        <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[monoCaption(bold), styles.distance]}>
          <MonoRun text={distance} />
        </RNText>
      ) : null}
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    maxWidth: MAP_THEME.chip.maxWidthPx,
    minHeight: SIZE.targetIos - SPACE.md,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.capsule,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: MAP_THEME.event.crown,
  },
  name: { flexShrink: 1 },
  distance: { color: COLOR.textSecondary },
})
