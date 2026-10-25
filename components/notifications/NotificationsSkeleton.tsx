import { StyleSheet, View } from 'react-native'

import { SkeletonBlock } from '../Skeleton'
import { RADIUS, SPACE } from '../../lib/design/tokens'

/** The frame's six rows at their real geometry: a 40 pt disc, a 16 pt line at 72% and a 12 pt line at 40%. */
const ROWS = 6
const DISC = 40
const TITLE_LINE = 16
const CONTEXT_LINE = 12

/** Notifications while they load (Flow 9 · 9.2 frame 01): static, announced once as loading. */
export function NotificationsSkeleton() {
  return (
    <View accessibilityLabel="Loading notifications" accessibilityState={{ busy: true }} testID="notifications-skeleton" style={styles.list}>
      {Array.from({ length: ROWS }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBlock width={DISC} height={DISC} borderRadius={RADIUS.capsule} />
          <View style={styles.lines}>
            <SkeletonBlock width="72%" height={TITLE_LINE} borderRadius={RADIUS.thumb} />
            <SkeletonBlock width="40%" height={CONTEXT_LINE} borderRadius={RADIUS.thumb - SPACE.xxs} />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // The frame spaces its rows 20 apart; design-exception: 20 is not on the scale, 16 + 4 is the nearest sum.
  list: { gap: SPACE.lg + SPACE.xs },
  row: { flexDirection: 'row', gap: SPACE.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  lines: { flex: 1, gap: SPACE.sm, paddingTop: SPACE.xs },
})
