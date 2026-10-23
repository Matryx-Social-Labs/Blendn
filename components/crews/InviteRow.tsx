import { StyleSheet, Text, View } from 'react-native'

import { COLOR, MAX_FONT_SCALE, SIZE, SPACE } from '../../lib/design/tokens'
import { inviteSub, inviteTitle, type InviteRow as InviteRowData } from '../../lib/crewsScreens'
import { Button } from '../ds/Button'
import { CrewEmblem } from '../ds/CrewEmblem'
import { font, useBoldText, useIncreaseContrast, useMinMeasure } from '../ds/shared'

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
 *
 * The words keep their measure and See invite wraps under them when both do not fit (`useMinMeasure`): beside it at the
 * accessibility sizes the sentence was squeezed a word a line, as the Scene's Bring someone? was (RC drive 5).
 */
export function InviteRow({ row, onSee, now }: { row: InviteRowData; onSee: () => void; now?: number }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const { invite, lapsed } = row
  const sub = inviteSub(row, now)
  const measure = useMinMeasure('bodyStrong')
  return (
    <View
      accessible={lapsed}
      accessibilityLabel={lapsed ? `${inviteTitle(invite)}, ${sub}` : undefined}
      style={[styles.row, lapsed && styles.lapsed]}
    >
      <CrewEmblem seed={invite.emblemSeed} size={EMBLEM} />
      <View testID="invite-row-body" style={styles.body}>
        <View testID="invite-row-text" style={[styles.text, measure]}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>
            {inviteTitle(invite)}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
            {sub}
          </Text>
        </View>
        {lapsed ? null : (
          <Button
            kind="lit"
            size="sm"
            icon="users"
            label="See invite"
            pressHaptic={false}
            accessibilityLabel={`See invite, ${invite.name}`}
            onPress={onSee}
          />
        )}
      </View>
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
  body: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.md },
  text: { flexGrow: 1, flexShrink: 1 },
  ink: { color: COLOR.textPrimary },
})
