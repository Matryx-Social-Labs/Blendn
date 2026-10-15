import { useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'

import {
  COMMUNITY_GUIDELINES_URL,
  dismissRoomGuidelines,
  hasDismissedRoomGuidelines,
  roomGuidelinesKey,
} from '../../lib/communityGuidelines'
import { Logger } from '../../lib/logger'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'
import { font, minTarget, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'

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

  const bold = useBoldText()
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
      <Icon name="shield" size={ICON.control} />
      <View style={styles.copy}>
        <Text style={[font('meta', bold), styles.ink]}>This room is anonymous. Be kind, keep it safe — people here are real.</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={openGuidelines}
            hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
            accessibilityRole="link"
            accessibilityLabel="Community guidelines"
            accessibilityHint="Opens the guidelines in your browser"
          >
            <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.secondary]}>Community guidelines</Text>
          </Pressable>
          <Pressable
            onPress={dismiss}
            hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            accessibilityHint="Hides this for this room"
          >
            <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Flow 5 room #04: a surface card in the feed's column, never over a message.
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
  },
  copy: { flex: 1, gap: SPACE.sm },
  actions: { flexDirection: 'row', gap: SPACE.lg },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
