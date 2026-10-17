import { StyleSheet, Text, View } from 'react-native'

import { EMBER, TYPE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'

/**
 * "Featured" with a VIEW ALL, or a heading on its own.
 *
 * One component because the frame draws one row with the trailing slot
 * varying, and copies would drift on the heading's own metrics.
 */
interface Props {
  title: string
  /** Uppercased by the caller, so the tracking lands on real glyphs. */
  actionLabel?: string
  onAction?: () => void
}

export function SectionHeader({ title, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>

      {actionLabel && onAction ? (
        // Scales, no haptic: VIEW ALL navigates.
        <ScalePress
          haptic={false}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Text style={styles.action}>{actionLabel}</Text>
        </ScalePress>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: { ...TYPE.heading, flexShrink: 1 },
  // Neutral, not accent: the screen's one accent is its title.
  action: { ...TYPE.label, color: EMBER.textPrimary },
})
