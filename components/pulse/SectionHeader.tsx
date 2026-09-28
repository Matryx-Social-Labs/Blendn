import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'

import { CONTROL, EMBER, EMBER_RADIUS, ICON, OPACITY, SPACE, TYPE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'

/**
 * "Featured" with a VIEW ALL, or "Upcoming" with a pair of arrows.
 *
 * One component for both because the frame draws one row with the trailing slot
 * varying, and two components would drift on the heading's own metrics.
 *
 * **Arrows are optional and default to absent.** A pair of scroll buttons on a
 * touch device is decoration unless something reads them, and the failure mode
 * of shipping them unwired is a control that looks broken rather than one that
 * is missing — so the caller has to pass the handlers to get them.
 */
interface Props {
  title: string
  /** Uppercased by the caller, so the tracking lands on real glyphs. */
  actionLabel?: string
  onAction?: () => void
  onPrev?: () => void
  onNext?: () => void
  /** Disabled when the row is already at that end — dimmed, never hidden. */
  prevDisabled?: boolean
  nextDisabled?: boolean
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
}: Props) {
  const hasArrows = Boolean(onPrev || onNext)

  return (
    <View style={styles.row}>
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>

      {actionLabel && onAction ? (
        // Scales, no haptic: VIEW ALL navigates, and the arrows only scroll.
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

      {hasArrows ? (
        <View style={styles.arrows}>
          <Arrow
            direction="back"
            onPress={onPrev}
            disabled={prevDisabled}
            label={`Scroll ${title} backwards`}
          />
          <Arrow
            direction="forward"
            onPress={onNext}
            disabled={nextDisabled}
            label={`Scroll ${title} forwards`}
          />
        </View>
      ) : null}
    </View>
  )
}

function Arrow({
  direction,
  onPress,
  disabled,
  label,
}: {
  direction: 'back' | 'forward'
  onPress?: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <ScalePress
      haptic={false}
      pressedScale={0.9}
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[styles.arrow, disabled && styles.arrowDisabled]}
    >
      <Ionicons
        name={direction === 'back' ? 'chevron-back' : 'chevron-forward'}
        size={ICON.sm}
        color={EMBER.textPrimary}
      />
    </ScalePress>
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
  arrows: { flexDirection: 'row', gap: SPACE.sm },
  arrow: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Opacity, so a disabled arrow keeps its footprint and the heading beside it
  // does not shift when you reach the end of the row.
  arrowDisabled: { opacity: OPACITY.disabled },
})
