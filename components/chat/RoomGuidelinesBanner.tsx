import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'

import {
  COMMUNITY_GUIDELINES_URL,
  dismissRoomGuidelines,
  hasDismissedRoomGuidelines,
  roomGuidelinesKey,
} from '../../lib/communityGuidelines'
import { Logger } from '../../lib/logger'
import { EMBER, EMBER_RADIUS, GUTTER, ICON, OPACITY, SPACE, TYPE } from '../../lib/theme'
import { Text } from '../ui/Text'

/**
 * The ask at the top of an event room's chat: this room is anonymous, the
 * people in it are not.
 *
 * Shown until "Got it", once per room (`lib/communityGuidelines.ts`). It sits
 * in the column above the list rather than over it, so it pushes the
 * conversation down and never covers a message.
 *
 * Nothing renders until the flag has been read, so a room you already
 * dismissed in does not flash the banner on the way in.
 */
export function RoomGuidelinesBanner({ userId, chatRoomId }: { userId?: string; chatRoomId?: string }) {
  // The room it is showing for: a different room is hidden until its own read lands.
  const [shownFor, setShownFor] = useState<string | null>(null)

  useEffect(() => {
    if (!userId || !chatRoomId) return
    let cancelled = false
    hasDismissedRoomGuidelines(userId, chatRoomId).then((dismissed) => {
      if (!cancelled && !dismissed) setShownFor(roomGuidelinesKey(userId, chatRoomId))
    })
    return () => {
      cancelled = true
    }
  }, [userId, chatRoomId])

  if (!userId || !chatRoomId || shownFor !== roomGuidelinesKey(userId, chatRoomId)) return null

  const dismiss = () => {
    setShownFor(null)
    void dismissRoomGuidelines(userId, chatRoomId)
  }

  const openGuidelines = () => {
    Linking.openURL(COMMUNITY_GUIDELINES_URL).catch((error) =>
      Logger.warn('chat', 'Could not open the community guidelines', { error })
    )
  }

  return (
    <View style={styles.root} testID="room-guidelines-banner" accessibilityRole="summary">
      <Ionicons name="shield-checkmark-outline" size={ICON.md} color={EMBER.textSecondary} />
      <View style={styles.copy}>
        <Text variant="meta" color={EMBER.textPrimary}>
          This room is anonymous. Be kind, keep it safe — people here are real.
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={openGuidelines}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Community guidelines"
            accessibilityHint="Opens the guidelines in your browser"
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Text style={styles.action}>COMMUNITY GUIDELINES</Text>
          </Pressable>
          <Pressable
            onPress={dismiss}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            accessibilityHint="Hides this for this room"
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Text style={styles.action}>GOT IT</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // The info banner of the design system: `surface`, a `separator` hairline.
  root: {
    flexDirection: 'row',
    gap: SPACE.md,
    marginHorizontal: GUTTER,
    marginTop: SPACE.sm,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EMBER.separator,
  },
  copy: { flex: 1, gap: SPACE.sm },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  // Text actions, not buttons: the composer's send is this screen's one accent.
  action: { ...TYPE.label, color: EMBER.textPrimary },
  pressed: { opacity: OPACITY.pressed },
})
