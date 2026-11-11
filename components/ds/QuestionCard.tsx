import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, MATERIAL, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { RadialWash } from '../ui/GradientFill'
import { font, useBoldText, useIncreaseContrast, useSelection } from './shared'

/** `.xq`: the hue from the top-left corner, its rim at 55%. */
const WASH_ALPHA = 0.3
const EDGE = 0.55
// design-exception: 20/27, the board's Tonight text (`.xq p`); `heading` is 20/26, a point short a line
const TEXT_LINE = { lineHeight: 27 }

/**
 * A question as a card (Flow 5 `.xq`): a small line in the screen's hue over the big words, lit from the top-left
 * corner. The match moment (M-A) says "Start with tonight's question" over the room's question.
 *
 * ponytail: PersonCard draws the same card inline (question over answer); fold it into this once C3b has landed there.
 */
export function QuestionCard({ label, text, testID }: { label: string; text: string; testID?: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const wash = [{ color: sel.edge, alpha: WASH_ALPHA, at: [0, 0], size: [100, 120], reach: 0.7 }] as const
  return (
    <View testID={testID} accessible accessibilityLabel={`${label}: ${text}`} style={styles.card}>
      <RadialWash layers={wash} style={StyleSheet.absoluteFill} />
      {/* The rim is drawn over the card, as the board's inset shadow is: it takes no room from the words. */}
      <View
        pointerEvents="none"
        style={[styles.rim, { borderColor: contrast ? MATERIAL.hairlineIncreaseContrast : tint(sel.edge, EDGE) }]}
      />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.brand[500]), { color: sel.glyph }]}>
        {label}
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('heading', bold), TEXT_LINE, styles.ink, styles.text]}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  /** `.xq`: 20 radius, 14 · 16 · 16, the words 6 under the line. */
  card: {
    borderRadius: RADIUS.tile,
    overflow: 'hidden',
    backgroundColor: COLOR.surface,
    paddingTop: SPACE.md + SPACE.xxs,
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.lg,
  },
  rim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: RADIUS.tile, borderWidth: 1 },
  ink: { color: COLOR.textPrimary },
  text: { marginTop: SPACE.xs + SPACE.xxs },
})
