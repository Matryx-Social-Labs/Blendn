import React from 'react'
import { StyleSheet, View } from 'react-native'

import type { RoomRecap as Recap } from '../../lib/roomRecap'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, SPACE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'
import { Text } from '../ui/Text'
import { Face } from './Face'

/**
 * The Room once the event is over: what the night added up to, and the one
 * thing left to do about it.
 *
 * Two numbers and two buttons, because that is all a finished night asks for.
 * No confetti — `app/rate/[eventId].tsx` explains why the rating side of this
 * is a private note rather than an achievement, and the recap is its doorway.
 *
 * The primary action is the rating whether or not you matched: with nobody to
 * rate, the screen still asks how the night was (`rateEvent`), so it is never
 * a dead end.
 */
export function RoomRecap({
  recap,
  me,
  topInset,
  bottomInset,
  onRate,
  onBack,
}: {
  recap: Recap
  me: { name: string; photo: string | null }
  topInset: number
  bottomInset: number
  onRate: () => void
  onBack: () => void
}) {
  const matchedLabel = recap.matched === 1 ? 'Match' : 'Matches'
  return (
    <View style={[styles.fill, { paddingTop: topInset, paddingBottom: bottomInset + SPACE.xl }]}>
      <View style={styles.body}>
        <Face name={me.name} photo={me.photo} size={CONTROL.lg + SPACE.xl} />
        <View style={styles.heading}>
          <Text variant="label" color={EMBER.textSecondary}>
            IT&apos;S OVER
          </Text>
          <Text variant="display" accessibilityRole="header">
            That&apos;s a wrap
          </Text>
          <Text variant="meta" numberOfLines={2}>
            {recap.title}
          </Text>
        </View>

        <View style={styles.stats}>
          {recap.timeSpent ? (
            <View style={styles.stat} accessible accessibilityLabel={`You were here ${recap.timeSpent}`}>
              <Text variant="title">{recap.timeSpent}</Text>
              <Text variant="meta">In the room</Text>
            </View>
          ) : null}
          <View
            style={styles.stat}
            accessible
            accessibilityLabel={`You matched with ${recap.matched} ${recap.matched === 1 ? 'person' : 'people'}`}
          >
            <Text variant="title">{recap.matched}</Text>
            <Text variant="meta">{matchedLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <ScalePress onPress={onRate} style={styles.primary} accessibilityRole="button">
          <Text variant="button" color={EMBER.onGradient}>
            {recap.matched > 0 ? 'Rate who you met' : 'Rate the night'}
          </Text>
        </ScalePress>
        <ScalePress haptic={false} onPress={onBack} style={styles.secondary} accessibilityRole="button">
          <Text variant="button">Back to tonight</Text>
        </ScalePress>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: GUTTER, justifyContent: 'space-between' },
  body: { gap: SPACE.xl, paddingTop: SPACE.xl },
  heading: { gap: SPACE.xs },
  stats: { flexDirection: 'row', gap: SPACE.md },
  stat: {
    flex: 1,
    gap: SPACE.xxs,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surface,
  },
  actions: { gap: SPACE.md },
  primary: {
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
