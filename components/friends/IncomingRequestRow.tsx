import { Pressable, StyleSheet, View } from 'react-native'

import { Text } from '../ui/Text'
import type { FriendRequest } from '../../lib/friends'
import { CONTROL, EMBER, EMBER_RADIUS, OPACITY, SPACE } from '../../lib/theme'
import { PersonAvatar } from './PersonRow'

/** The two 32 pt pills reach a 44 pt target. */
const REQUEST_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 }

/**
 * Somebody asking to be your friend: Not now, or Accept.
 *
 * The request layout the Banter used before Flow 5's redesign: face, name, and the two
 * answers as 32pt pills *under* the name. They used to sit at the row's right
 * edge, where two pills and a long name shared one line and the name lost.
 *
 * Accept is a `textPrimary` fill with `bg` text, the design system's
 * strong-neutral — not the accent. On Add friends, "Share my link" is the
 * screen's one accent; a column of orange Accepts under it made two.
 * Both answers dim while this row's answer is in flight (`busy`), and only
 * this row's.
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
  const { person } = request
  return (
    <View style={styles.row}>
      {/* `PersonRow`'s avatar, so the two lists line up. */}
      <PersonAvatar person={person} />
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={1} maxFontSizeMultiplier={1.4}>{person.name}</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => onRespond('dismiss')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Not now, ${person.name}`}
            accessibilityState={{ disabled: busy }}
            hitSlop={REQUEST_HIT_SLOP}
            style={({ pressed }) => [styles.pill, (pressed || busy) && styles.dim]}
          >
            <Text variant="button" color={EMBER.textSecondary} maxFontSizeMultiplier={1.3}>Not now</Text>
          </Pressable>
          <Pressable
            onPress={() => onRespond('accept')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Accept ${person.name}`}
            accessibilityState={{ disabled: busy }}
            hitSlop={REQUEST_HIT_SLOP}
            style={({ pressed }) => [styles.pill, styles.accept, (pressed || busy) && styles.dim]}
          >
            <Text variant="button" color={EMBER.bg} maxFontSizeMultiplier={1.3}>Accept</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, paddingVertical: SPACE.md },
  body: { flex: 1, gap: SPACE.sm },
  actions: { flexDirection: 'row', gap: SPACE.md },
  pill: {
    height: CONTROL.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accept: { backgroundColor: EMBER.textPrimary },
  dim: { opacity: OPACITY.disabled },
})
