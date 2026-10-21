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

/**
 * A 1 to 5 scale (Flow 3 `scale`): five equal pills, 48 pt, the digit in Geist Mono 500, and the two ends named under the first
 * and the last. The chosen pill is lit in the screen's hue as a Chip is (fill and rim, the label unchanged), never white.
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
      <View style={styles.row}>
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
              accessibilityRole="button"
              accessibilityLabel={`${subject}: ${n} out of 5${n === 1 ? `, ${low}` : n === 5 ? `, ${high}` : ''}`}
              accessibilityState={{ selected, disabled }}
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
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('button', bold, FONT_FAMILY.mono[500]), styles.digit]}>
                {n}
              </Text>
            </ScalePress>
          )
        })}
      </View>
      <View style={styles.ends} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={[font('meta', bold), styles.end]}>{low}</Text>
        <Text style={[font('meta', bold), styles.end]}>{high}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  column: { gap: SPACE.sm },
  row: { flexDirection: 'row', gap: SPACE.sm },
  step: {
    flex: 1,
    height: SIZE.control,
    borderRadius: RADIUS.capsule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { color: COLOR.textPrimary, fontVariant: ['tabular-nums'] },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  end: { color: COLOR.textTertiary },
})
