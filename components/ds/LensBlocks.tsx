import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import type { LeadPill } from '../../lib/roomLens'
import { tint } from '../../lib/theme'
import { RadialWash } from '../ui/GradientFill'
import { Chip } from './Chip'
import { font, useBoldText, useIncreaseContrast, useSelection } from './shared'

/** Tonight's card (`.xq`): rose from the top-left corner, its rim at 55%. */
const TONIGHT_WASH = [{ color: COLOR.brandRose, alpha: 0.3, at: [0, 0], size: [100, 120], reach: 0.7 }] as const
const TONIGHT_EDGE = 0.55
// design-exception: 20/27, the board's Tonight answer (`.xq p`); `heading` is 20/26, 3 pt short over three lines
const ANSWER_LINE = { lineHeight: 27 }

export type LensBlocksProps = {
  /** What this room's lens leads with (`leadFor`); the reason to meet is lit. */
  lead: readonly LeadPill[]
  /** Tonight's question and their answer (`tonightCardFor`); null draws nothing. */
  tonight: { question: string; answer: string } | null | undefined
  /** "In common" or "Things in common", and what you share (`commonFor`). */
  common: { label: string; items: readonly string[] } | undefined
  /** The parts' ids are `${testID}-lead`, `-lead-0`, `-tonight`, `-tonight-answer`, `-common`. */
  testID?: string
}

/**
 * The person through the room's lens (Flow 5 P-A): the lead pills, Tonight's question with their answer, In common.
 * One block set, drawn by the person sheet and the full profile page alike (`pA-*` and `pA-page*`), so the two never
 * drift. Renders only what it is given: no identity reaches it from here.
 */
export function LensBlocks({ lead, tonight, common, testID }: LensBlocksProps) {
  const bold = useBoldText()
  const sel = useSelection()
  const quiet = useIncreaseContrast() ? COLOR.textPrimary : COLOR.textSecondary
  const id = (part: string) => testID && `${testID}-${part}`
  return (
    <>
      {lead.length ? (
        <View testID={id('lead')} style={styles.chips}>
          {lead.map((l, i) => (
            <Chip key={l.label} label={l.label} icon={l.icon} selected={l.lit} testID={id(`lead-${i}`)} />
          ))}
        </View>
      ) : null}

      {tonight ? (
        <View testID={id('tonight')} accessible accessibilityLabel={`${tonight.question} ${tonight.answer}`} style={styles.tonight}>
          <RadialWash layers={TONIGHT_WASH} style={StyleSheet.absoluteFill} />
          {/* The rim is drawn over the card, as the board's inset shadow is: it takes no room from the answer. */}
          <View pointerEvents="none" style={[styles.tonightRim, { borderColor: tint(sel.edge, TONIGHT_EDGE) }]} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.brand[500]), { color: sel.glyph }]}>{tonight.question}</Text>
          <Text testID={id('tonight-answer')} maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('heading', bold), ANSWER_LINE, styles.ink, styles.answer]}>
            {tonight.answer}
          </Text>
        </View>
      ) : null}

      {common?.items.length ? (
        <View testID={id('common')} style={styles.common}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.brand[500]), { color: quiet }]}>{common.label}</Text>
          <View style={styles.chips}>
            {common.items.map((c) => (
              <Chip key={c} label={c} icon="check" selected accessibilityLabel={`${c}, shared`} />
            ))}
          </View>
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  ink: { color: COLOR.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  /** `.xq`: 20 radius, 14 · 16 · 16, the answer 6 under the question. */
  tonight: {
    borderRadius: RADIUS.tile,
    overflow: 'hidden',
    backgroundColor: COLOR.surface,
    paddingTop: SPACE.md + SPACE.xxs,
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.lg,
  },
  tonightRim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: RADIUS.tile, borderWidth: 1 },
  answer: { marginTop: SPACE.xs + SPACE.xxs },
  common: { gap: SPACE.sm },
})
