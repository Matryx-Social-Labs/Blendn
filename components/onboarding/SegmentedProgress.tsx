import { StyleSheet, View } from 'react-native'

import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'

/**
 * Five segments for five questions (direction A): the ones reached are lit white, the rest a hairline. Said, not printed:
 * a screen reader hears "Step 2 of 5". No numeric value: both platforms read one as a percentage ("25 percent").
 */
export function SegmentedProgress({ current, total, testID }: { current: number; total: number; testID?: string }) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current} of ${total}`}
      style={styles.row}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          testID={testID && `${testID}-segment-${i}`}
          style={[styles.segment, { backgroundColor: i < current ? COLOR.textPrimary : COLOR.hairlineStrong }]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACE.xs },
  segment: { flex: 1, height: SPACE.xxs, borderRadius: RADIUS.capsule },
})
