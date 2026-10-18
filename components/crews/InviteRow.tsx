import { StyleSheet, Text, View } from 'react-native'

import { COLOR, SIZE, SPACE } from '../../lib/design/tokens'
import { inviteSub, inviteTitle, type InviteRow as InviteRowData } from '../../lib/crewsScreens'
import { Button } from '../ds/Button'
import { CrewEmblem } from '../ds/CrewEmblem'
import { font, useBoldText, useIncreaseContrast } from '../ds/shared'

const ROW_MIN_HEIGHT = SIZE.primary
const EMBLEM = 40
/** flow10.js `crews`: a lapsed invite's row dims to 55%. */
const LAPSED_OPACITY = 0.55

/**
 * An invite on Crews (flow10.js `crews`, the Invites card): the emblem, "Aisha
 * invited you to The Usual Suspects" (it wraps; it is the whole sentence),
 * "Crew of 6 · 3 days ago", and See invite, which opens the invite and never
 * joins. A lapsed one dims, says "Expired" and has no action. No haptic on
 * See invite: it pushes a screen.
 */
export function InviteRow({ row, onSee, now }: { row: InviteRowData; onSee: () => void; now?: number }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const { invite, lapsed } = row
  const sub = inviteSub(row, now)
  return (
    <View
      accessible={lapsed}
      accessibilityLabel={lapsed ? `${inviteTitle(invite)}, ${sub}` : undefined}
      style={[styles.row, lapsed && styles.lapsed]}
    >
      <CrewEmblem seed={invite.emblemSeed} size={EMBLEM} />
      <View style={styles.text}>
        <Text style={[font('bodyStrong', bold), styles.ink]}>{inviteTitle(invite)}</Text>
        <Text style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{sub}</Text>
      </View>
      {lapsed ? null : (
        <Button
          kind="strong"
          size="sm"
          label="See invite"
          pressHaptic={false}
          accessibilityLabel={`See invite, ${invite.name}`}
          onPress={onSee}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  lapsed: { opacity: LAPSED_OPACITY },
  text: { flex: 1, minWidth: 0 },
  ink: { color: COLOR.textPrimary },
})
