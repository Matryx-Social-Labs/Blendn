import { StyleSheet, Text, View } from 'react-native'

import type { ReceivedWave, ReceivedWavesPage } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { othersLine, waitingStrip, wavedAtYouLine } from '../../lib/receivedWaves'
import { Avatar } from '../ds/Avatar'
import { Facepile } from '../ds/Facepile'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useSelection } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { WaveBackPill } from './WaveBackPill'

/** Board 03 `.strip`: a 36 face for one wave, a 30 pile (the DS's 32) for several. */
const FACE = 36

/**
 * S-A (board 03, "Missed, shown in the room"): under your room name, above Meet next, the waves you have not answered.
 * One wave answers in place (Wave back); several are the newest three faces, "{name} / and N others waved at you" and
 * See all, which opens the list paged 20. Nothing waiting, nothing drawn.
 *
 * Holding the row offers Block and Report for the person it names (anti-spam W7); a screen reader has it as an action.
 */
export function WavedAtYouStrip({
  page,
  now,
  sending,
  onWaveBack,
  onSeeAll,
  onSafety,
}: {
  page: ReceivedWavesPage | null
  now: number
  /** The handle whose wave back is on its way: the hand swings. */
  sending?: string | null
  onWaveBack: (wave: ReceivedWave) => void
  onSeeAll: () => void
  onSafety: (wave: ReceivedWave) => void
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const strip = waitingStrip(page)
  if (strip.kind === 'none') return null
  const lead = strip.kind === 'one' ? strip.wave : strip.lead
  const second = strip.kind === 'one' ? wavedAtYouLine(lead.wavedAt, now) : othersLine(strip.others)
  const several = strip.kind === 'several'
  const safety = () => {
    H.longPress()
    onSafety(lead)
  }
  return (
    <ScalePress
      testID="waved-strip"
      onPress={several ? onSeeAll : undefined}
      onLongPress={safety}
      accessibilityRole={several ? 'button' : undefined}
      accessibilityLabel={several ? `${lead.displayName} ${second}. See all` : `${lead.displayName}, ${second}`}
      // The row is one element to a screen reader (iOS hides a button inside it), so Wave back is an action too.
      accessibilityActions={[...(several ? [] : [{ name: 'waveBack', label: 'Wave back' }]), { name: 'block', label: `Block or report ${lead.displayName}` }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'block') return safety()
        if (e.nativeEvent.actionName === 'waveBack' && sending !== lead.userId) {
          H.select()
          onWaveBack(lead)
        }
      }}
      style={[styles.row, { backgroundColor: sel.fill, borderColor: sel.edge }, contrast && IC_HAIRLINE]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {several ? (
          <Facepile faces={strip.faces.map((w) => ({ kind: 'creature', pseudonym: w.displayName }))} total={strip.faces.length} size={32} ring={sel.fill} />
        ) : (
          <Avatar size={FACE} kind="creature" pseudonym={lead.displayName} />
        )}
      </View>
      <View style={styles.text} accessibilityElementsHidden={several} importantForAccessibility={several ? 'no-hide-descendants' : 'auto'}>
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>
          {lead.displayName}
        </Text>
        <Text numberOfLines={several ? 2 : 1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
          {second}
        </Text>
      </View>
      {several ? (
        <View style={styles.seeAll} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold, FONT_FAMILY.brand[500]), { color: sel.glyph }]}>
            See all
          </Text>
          <Icon name="chevron-right" size={ICON.inline} color={sel.glyph} />
        </View>
      ) : (
        <WaveBackPill name={lead.displayName} state={sending === lead.userId ? 'sending' : 'ready'} onPress={() => onWaveBack(lead)} testID="waved-strip-wave" />
      )}
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  row: {
    // On the room's gutter, as the you card above it.
    marginHorizontal: SPACE.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm + SPACE.xxs,
    minHeight: SIZE.primary,
    paddingVertical: SPACE.sm,
    paddingLeft: SPACE.md,
    paddingRight: SPACE.sm + SPACE.xxs,
    borderRadius: RADIUS.rowInCard,
    borderWidth: 1,
  },
  text: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  ink: { color: COLOR.textPrimary },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxs },
})
