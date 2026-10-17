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
import { OPACITY } from '../../lib/theme'
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
 *
 * Owner override of Flow 5 room #04 (2026-10-16): centred — the glyph above, the sentence and its actions centred under it.
 * Owner ruling (2026-10-16): "community guidelines" is a link in the copy itself — white, underlined (§4 links are white;
 * underlined always here, where the words around it are white too) — and it replaces the separate "Community guidelines"
 * action. It closes the copy as its own line, so it is one focusable link with a 44 pt target (a nested Text link can't take
 * a hitSlop).
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
        <Text textBreakStrategy="balanced" style={[font('meta', bold), styles.ink, styles.centre]}>This room is anonymous. Be kind, keep it safe — people here are real.</Text>
        <Pressable
          onPress={openGuidelines}
          hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
          accessibilityRole="link"
          accessibilityLabel="Community guidelines"
          accessibilityHint="Opens the guidelines in your browser"
          testID="room-guidelines-link"
        >
          {({ pressed }) => (
            <Text style={[font('meta', bold), styles.ink, styles.centre, pressed && styles.pressed]}>
              Read the <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.link]}>community guidelines</Text>.
            </Text>
          )}
        </Pressable>
        <View style={styles.actions}>
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
  // Flow 5 room #04: a surface card in the feed's column, never over a message; centred (owner override).
  root: {
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
  },
  copy: { alignSelf: 'stretch', alignItems: 'center', gap: SPACE.sm },
  centre: { textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.lg },
  ink: { color: COLOR.textPrimary },
  link: { color: COLOR.link, textDecorationLine: 'underline' },
  pressed: { opacity: OPACITY.pressed },
})
