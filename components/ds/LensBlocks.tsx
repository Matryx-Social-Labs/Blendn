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
// design-exception: 16/22, the board's bio text and empty line (`.xcm p`, option r1 C / r2 A); `lede` is 15/22, `rowTitle` 17/22
const BIO_TEXT = { fontSize: 16, lineHeight: 22 }

/** What somebody who has shown you who they are says about themselves (owner pick r1 C): their profile's words, nothing else. */
export type LensBio = { about?: string | null; interests?: readonly string[] | null; work?: string | null }

export type LensBlocksProps = {
  /** What this room's lens leads with (`leadFor`); the reason to meet is lit. */
  lead: readonly LeadPill[]
  /** Tonight's question and their answer (`tonightCardFor`); null draws nothing. */
  tonight: { question: string; answer: string } | null | undefined
  /** "In common" or "Things in common", and what you share (`commonFor`). */
  common: { label: string; items: readonly string[] } | undefined
  /** Their bio, once they have shown you who they are (the full page only); null or empty draws nothing. */
  bio?: LensBio | null
  /** The parts' ids are `${testID}-lead`, `-lead-0`, `-tonight`, `-tonight-answer`, `-common`, `-bio`, `-empty`. */
  testID?: string
}

/**
 * The person through the room's lens (Flow 5 P-A): the lead pills, Tonight's question with their answer, In common.
 * One block set, drawn by the person sheet and the full profile page alike (`pA-*` and `pA-page*`), so the two never
 * drift. Renders only what it is given: no identity reaches it from here.
 */
export function LensBlocks({ lead, tonight, common, bio, testID }: LensBlocksProps) {
  const bold = useBoldText()
  const sel = useSelection()
  const quiet = useIncreaseContrast() ? COLOR.textPrimary : COLOR.textSecondary
  const id = (part: string) => testID && `${testID}-${part}`
  const about = bio?.about?.trim()
  const interests = bio?.interests ?? []
  const work = bio?.work?.trim()
  const hasBio = !!(about || interests.length || work)
  // Nothing at all to say (a venue night where you share nothing): one quiet line, never a bare sheet (owner pick r2 A).
  const empty = !lead.length && !tonight && !common?.items.length && !hasBio
  const label = (text: string) => (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.brand[500]), { color: quiet }]}>{text}</Text>
  )
  const body = (text: string) => (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('body', bold), BIO_TEXT, styles.ink]}>{text}</Text>
  )
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

      {hasBio ? (
        <View testID={id('bio')} style={styles.bio}>
          {about ? <View style={styles.common}>{label('About')}{body(about)}</View> : null}
          {interests.length ? (
            <View style={styles.common}>
              {label('Interests')}
              <View style={styles.chips}>
                {interests.map((c) => <Chip key={c} label={c} />)}
              </View>
            </View>
          ) : null}
          {work ? <View style={styles.common}>{label('Work')}{body(work)}</View> : null}
        </View>
      ) : null}

      {empty ? (
        <View testID={id('empty')} accessible style={styles.empty}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('body', bold, FONT_FAMILY.brand[500]), BIO_TEXT, styles.ink, styles.center]}>
            Nothing on your profiles in common yet.
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: quiet }, styles.center]}>A wave is the lightest hello.</Text>
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
  /** Option r1 C: About, Interests, Work, 12 apart. */
  bio: { gap: SPACE.md },
  /** Option r2 A: the two lines, 6 apart, centred. */
  empty: { gap: SPACE.xs + SPACE.xxs, alignItems: 'center' },
  center: { textAlign: 'center' },
})
