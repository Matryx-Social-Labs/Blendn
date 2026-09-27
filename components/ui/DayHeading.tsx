import { StyleSheet, Text, View } from 'react-native'

import { SPACE, TYPE } from '../../lib/theme'

/**
 * The heading over a run of time-grouped rows: "Today  Saturday".
 *
 * One component for every list grouped by when — the Pulse's Upcoming, the
 * Going tab, the Banter inbox — so a day reads the same wherever it appears.
 * `detail` is the quieter word beside it (the weekday), or omitted.
 */
export function DayHeading({ title, detail }: { title: string; detail?: string | null }) {
  return (
    <View style={styles.row} accessibilityRole="header">
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm },
  title: TYPE.bodyStrong,
  detail: TYPE.meta,
})
