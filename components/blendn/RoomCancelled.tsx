import { useEffect } from 'react'
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'

import { COLOR, DURATION, RADIUS, SPACE } from '../../lib/design/tokens'
import { Grain } from '../ds/Grain'
import { Orbs } from '../ds/Orbs'
import { StateScreen } from '../ds/StateScreen'

/** The card sits 30% down, as the frame draws it (260 pt on an 874 pt screen). */
const CARD_TOP = 0.3

/**
 * The event was cancelled while you were inside (Flow 4 R4.1 4.6, #25): the
 * Room crossfades to a calm solid card on the brand orbs. The server has
 * already checked you out, so the card says so and offers the one useful
 * thing, what else is on tonight; Close leaves. No haptic: it is unsolicited,
 * like the auto-checkout notice. Screen readers hear it once, as it arrives.
 *
 * Motion: a crossfade over `base`, and nothing else (Reduce Motion is the same).
 */
export function RoomCancelled({
  title,
  onSeeTonight,
  onClose,
  testID,
}: {
  title: string
  onSeeTonight: () => void
  onClose: () => void
  testID?: string
}) {
  const { height } = useWindowDimensions()
  const said = `${title} was cancelled`
  useEffect(() => {
    // Unsolicited: heard once, politely, as it arrives.
    AccessibilityInfo.announceForAccessibilityWithOptions(`${said}. You’re checked out.`, { queue: true })
  }, [said])
  return (
    <Animated.View testID={testID} style={styles.page} entering={FadeIn.duration(DURATION.base)} exiting={FadeOut.duration(DURATION.quick)}>
      <Orbs set="brand" />
      <Grain />
      <View style={[styles.card, { marginTop: Math.round(height * CARD_TOP) }]}>
        <StateScreen
          icon="calendar-x"
          title={said}
          body="The organiser called it off. You’re checked out."
          actions={[
            { label: 'See what’s on tonight', kind: 'primary', onPress: onSeeTonight },
            { label: 'Close', kind: 'tertiary', onPress: onClose },
          ]}
          testID={testID && `${testID}-state`}
        />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  page: { ...StyleSheet.absoluteFillObject, backgroundColor: COLOR.ink },
  card: { marginHorizontal: SPACE.gutter, padding: SPACE.xl, borderRadius: RADIUS.card, backgroundColor: COLOR.surface },
})
