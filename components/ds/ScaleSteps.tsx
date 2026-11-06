import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, PRESS, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { OPACITY } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'
import { CONTROL_FONT_CAP, chipRest, font, quickTransition, useBoldText, useGround, useSelection } from './shared'

const STEPS = [1, 2, 3, 4, 5] as const
const FADE = quickTransition('backgroundColor', 'borderColor')
/** The off edge and the lit rim, as a Chip draws them. */
const HAIRLINE = 0.5
const RIM = 1
const STEP_GAP = 10
const DIGIT_LINE = 24

/**
 * A 1 to 5 scale (Flow 4 `rate`, `.sc5`): five equal 56 pt steps at radius 16, 10 apart, the digit in Geist Mono 700 20/24,
 * and the two ends named under the first and the last (13/18, `textSecondary`). The chosen pill is lit in the screen's hue as a Chip is (fill and rim, the label unchanged), never white.
 * Equal width is the point: a wrapping chip row packs left and the ends stop lining up with 1 and 5.
 */
export function ScaleSteps({
  value,
  onChoose,
  low,
  high,
  disabled = false,
  subject,
  testID,
}: {
  value: number | null
  onChoose: (n: number) => void
  low: string
  high: string
  disabled?: boolean
  /** What is being rated, read before the number ("The night: 4 out of 5, Loved it"). */
  subject: string
  testID?: string
}) {
  const bold = useBoldText()
  const ground = useGround()
  const sel = useSelection()
  return (
    <View testID={testID} style={styles.column}>
      {/* One choice of five: a radio group (as SegmentedControl's radio form), so a screen reader hears the set (audit L11). */}
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={subject}>
        {STEPS.map((n) => {
          const selected = value === n
          return (
            <ScalePress
              key={n}
              testID={testID && `${testID}-${n}`}
              onPress={() => {
                H.select()
                onChoose(n)
              }}
              disabled={disabled}
              pressedScale={PRESS.scale}
              accessibilityRole="radio"
              accessibilityLabel={`${subject}: ${n} out of 5${n === 1 ? `, ${low}` : n === 5 ? `, ${high}` : ''}`}
              accessibilityState={{ checked: selected, disabled }}
              style={[
                styles.step,
                {
                  backgroundColor: selected ? sel.fill : chipRest(ground),
                  borderWidth: selected ? RIM : HAIRLINE,
                  borderColor: selected ? sel.edge : COLOR.hairline,
                  opacity: disabled ? OPACITY.disabled : 1,
                },
                FADE,
              ]}
            >
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('heading', bold, FONT_FAMILY.mono[700]), styles.digit]}>
                {n}
              </Text>
            </ScalePress>
          )
        })}
      </View>
      <View style={styles.ends} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {/* They label a control, so they stop at its cap; each takes at most half the row and wraps rather than meet the other (B-S1). */}
        <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold), styles.end]}>
          {low}
        </Text>
        <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold), styles.end, styles.endHigh]}>
          {high}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  column: { gap: SPACE.sm },
  // design-exception: the board's steps are 10 apart (`.sc5`), between the 8 and 12 steps
  row: { flexDirection: 'row', gap: STEP_GAP },
  step: {
    flex: 1,
    height: SIZE.primary,
    borderRadius: RADIUS.rowInCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // design-exception: the digit's line is 24 (`.s5`, 20/24); heading's is 26
  digit: { color: COLOR.textPrimary, fontVariant: ['tabular-nums'], lineHeight: DIGIT_LINE },
  ends: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.sm },
  end: { color: COLOR.textSecondary, flexShrink: 1, maxWidth: '50%' },
  endHigh: { textAlign: 'right' },
})
