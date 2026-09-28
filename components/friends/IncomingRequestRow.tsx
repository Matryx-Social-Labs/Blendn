import { StyleSheet, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Text } from '../ui/Text'
import { PersonRow } from './PersonRow'
import type { FriendRequest } from '../../lib/friends'
import { CONTROL, EMBER, EMBER_RADIUS, SPACE } from '../../lib/theme'

/**
 * Somebody asking to be your friend: Not now, or Accept.
 *
 * Accept is the accent — one action, repeated down the list. Both are dimmed
 * while this row's answer is in flight (`busy`), and only this row's.
 */
export function IncomingRequestRow({
  request,
  busy,
  onRespond,
}: {
  request: FriendRequest
  busy: boolean
  onRespond: (action: 'accept' | 'dismiss') => void
}) {
  return (
    <PersonRow
      person={request.person}
      trailing={
        <View style={styles.actions}>
          <ScalePress
            onPress={() => onRespond('dismiss')}
            disabled={busy}
            haptic={false}
            accessibilityRole="button"
            accessibilityLabel={`Not now, ${request.person.name}`}
            style={styles.pill}
          >
            <Text variant="bodyStrong">Not now</Text>
          </ScalePress>
          <ScalePress
            onPress={() => onRespond('accept')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Accept ${request.person.name}`}
            style={[styles.pill, styles.accept]}
          >
            <Text variant="bodyStrong" color={EMBER.onGradient}>Accept</Text>
          </ScalePress>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: SPACE.sm },
  pill: {
    height: CONTROL.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    justifyContent: 'center',
  },
  accept: { backgroundColor: EMBER.accent },
})
