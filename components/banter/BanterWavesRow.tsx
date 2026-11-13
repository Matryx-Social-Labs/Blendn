import { router } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import type { ReceivedWave, WavesWaitingRoom } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { compactCount } from '../../lib/format'
import { H } from '../../lib/haptics'
import { Avatar } from '../ds/Avatar'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useSelection } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { useBanterPress } from './pressGuard'

const FACE = 32

/**
 * B-A (board 03, "Missed, shown in Banter"): ONE lit row per room with waves you have not answered, pinned above the
 * chats: the latest face, "{n} waved at you" and "In the room · {room}". A 12k room is still one row. It opens the room's
 * "Waved at you" list, where each wave answers in place, until the room closes.
 *
 * Holding the row offers Block and Report for the face it shows (anti-spam W7); a screen reader has it as an action.
 */
export function BanterWavesRow({ room, title, onSafety }: { room: WavesWaitingRoom; title: string | null; onSafety: (wave: ReceivedWave) => void }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const open = useBanterPress(() => router.push({ pathname: '/waves/[eventId]', params: { eventId: room.eventId, ...(title ? { title } : {}) } } as never))
  const heading = `${compactCount(room.waiting)} waved at you`
  const where = title ? `In the room · ${title}` : 'In the room'
  const safety = () => {
    H.longPress()
    onSafety(room.latest)
  }
  return (
    <ScalePress
      testID={`banter-waves-${room.eventId}`}
      onPress={open}
      onLongPress={safety}
      accessibilityRole="button"
      accessibilityLabel={`${room.waiting} waved at you. ${where}`}
      accessibilityActions={[{ name: 'activate' }, { name: 'block', label: `Block or report ${room.latest.displayName}` }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'block' ? safety() : open())}
      style={[styles.row, { backgroundColor: sel.fill, borderColor: sel.edge }, contrast && IC_HAIRLINE]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Avatar size={FACE} kind="creature" pseudonym={room.latest.displayName} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>
          {heading}
        </Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
          {where}
        </Text>
      </View>
      <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} />
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: SIZE.primary,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.rowInCard,
    borderWidth: 1,
  },
  text: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  ink: { color: COLOR.textPrimary },
})
