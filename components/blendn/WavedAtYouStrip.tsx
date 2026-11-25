import { StyleSheet, Text, View } from 'react-native'

import type { ReceivedWavesPage } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { othersLine, waitingStrip, wavedAtYouLine, waveId, waveName, type AnyWave } from '../../lib/receivedWaves'
import { Facepile } from '../ds/Facepile'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useSelection } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { Button } from '../ds/Button'
import { waveFace, WaveFace } from '../ds/WaveFace'
import { WavingHand } from '../ds/PersonCard'

/** Board 03 `.strip`: a 36 face for one wave, a 30 pile (the DS's 32) for several. */
const FACE = 36

/**
 * S-A (board 03, "Missed, shown in the room"): under your room name, above Meet next, the waves you have not answered.
 * One wave answers in place (Wave back); several are the newest three faces, "{name} / and N others waved at you" and
 * See all, which opens the list paged 20. Nothing waiting, nothing drawn.
 *
 * Crews are in it too, first while unanswered (advisor T-A 2026-11-25): the square emblem, and Wave back as yourself.
 *
 * Holding the row offers Block and Report for the person or crew it names (anti-spam W7); a screen reader has it as an action.
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
  /** The wave (`waveId`) whose wave back is on its way: the hand swings. */
  sending?: string | null
  onWaveBack: (wave: AnyWave) => void
  onSeeAll: () => void
  onSafety: (wave: AnyWave) => void
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const strip = waitingStrip(page)
  if (strip.kind === 'none') return null
  const lead = strip.kind === 'one' ? strip.wave : strip.lead
  const leadName = waveName(lead)
  const leadId = waveId(lead)
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
      accessibilityLabel={several ? `${leadName} ${second}. See all` : `${leadName}, ${second}`}
      // The row is one element to a screen reader (iOS hides a button inside it), so Wave back is an action too.
      accessibilityActions={[...(several ? [] : [{ name: 'waveBack', label: 'Wave back' }]), { name: 'block', label: `Block or report ${leadName}` }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'block') return safety()
        if (e.nativeEvent.actionName === 'waveBack' && sending !== leadId) {
          H.select()
          onWaveBack(lead)
        }
      }}
      style={[styles.row, { backgroundColor: sel.fill, borderColor: sel.edge }, contrast && IC_HAIRLINE]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {several ? (
          <Facepile faces={strip.faces.map(waveFace)} total={strip.faces.length} size={32} ring={sel.fill} />
        ) : (
          <WaveFace size={FACE} wave={lead} />
        )}
      </View>
      <View style={styles.text} accessibilityElementsHidden={several} importantForAccessibility={several ? 'no-hide-descendants' : 'auto'}>
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>
          {leadName}
        </Text>
        <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
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
        <Button
          kind="lit"
          size="pill"
          icon="hand"
          label="Wave back"
          leading={sending === leadId ? <WavingHand size={ICON.inline} /> : undefined}
          pressHaptic={sending === leadId ? false : H.select}
          onPress={() => {
            if (sending !== leadId) onWaveBack(lead)
          }}
          accessibilityLabel={`Wave back at ${leadName}`}
          testID="waved-strip-wave"
        />
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
