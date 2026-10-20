import { StyleSheet, View } from 'react-native'

import { Button } from '../ds/Button'
import { Text } from '../ui/Text'
import type { FriendRequest } from '../../lib/friends'
import { SPACE } from '../../lib/theme'
import { PersonAvatar } from './PersonRow'

/**
 * Somebody asking to be your friend: Not now, or Accept.
 *
 * The request layout the Banter used before Flow 5's redesign: face, name, and the two
 * answers as 36 pt row actions (`Button size="sm"`, slop to the 44 / 48 target)
 * *under* the name. They used to sit at the row's right edge, where two pills
 * and a long name shared one line and the name lost.
 *
 * Accept is the strong-neutral button (`textPrimary` fill), not the accent. On
 * Add friends, "Share my link" is the screen's one accent; a column of orange
 * Accepts under it made two. Both answers dim while this row's answer is in
 * flight (`busy`), and only this row's. The haptic is the outcome's, when the
 * server says yes (`useFriendRequests`), never the press.
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
          <Button
            kind="tertiary"
            size="sm"
            label="Not now"
            accessibilityLabel={`Not now, ${person.name}`}
            onPress={() => onRespond('dismiss')}
            disabled={busy}
          />
          <Button
            kind="strong"
            size="sm"
            label="Accept"
            accessibilityLabel={`Accept ${person.name}`}
            onPress={() => onRespond('accept')}
            disabled={busy}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, paddingVertical: SPACE.md },
  body: { flex: 1, gap: SPACE.sm },
  actions: { flexDirection: 'row', gap: SPACE.md },
})
