import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, PRESS, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { OPACITY } from '../../lib/theme'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The number holds at least two digits' width, so the discs never shift between 9 and 10. */
const NUMBER_MIN_WIDTH = 24

type Side = 'minus' | 'plus'

export type StepperProps = {
  /** What is counted, read before the value: "Spaces". */
  label: string
  value: number
  onChange: (next: number) => void
  min?: number
  /** Past ~20 it is a field, not a stepper. */
  max?: number
  /** On an iOS glass sheet: 8% white discs. Otherwise surfaceSunken (Android's solid sheet). */
  onGlass?: boolean
  /** While posting: 45%, nothing steps. */
  disabled?: boolean
  /** The design gallery only: draws one disc pressed with no finger. */
  previewState?: 'pressed-minus' | 'pressed-plus'
  testID?: string
}

/**
 * A small integer with a floor and a ceiling
 * (guidelines/components/Stepper.html): minus, the number in Geist Mono 20
 * tabular, plus, on 48 pt discs. A disc at its bound dims to 45% and does
 * nothing; the number never goes red.
 *
 * `H.select` per step, none at a bound. iOS presses scale 0.97; Android
 * ripples and squares the disc to 12 dp. One adjustable element for a screen
 * reader ("Spaces, 2"), swiped up and down; the discs are not separate
 * buttons. The number caps at 1.3×; the discs are fixed. Increase Contrast:
 * the 50% hairline on the discs.
 */
export function Stepper({ label, value, onChange, min = 1, max = 20, onGlass = false, disabled = false, previewState, testID }: StepperProps) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [down, setDown] = useState<Side | null>(null)

  const step = (delta: number) => {
    const next = value + delta
    if (disabled || next < min || next > max) return
    H.select()
    onChange(next)
  }

  const disc = (side: Side) => {
    const atBound = side === 'minus' ? value <= min : value >= max
    const pressed = down === side || previewState === `pressed-${side}`
    return (
      // Not separate elements for a screen reader: iOS groups them under the adjustable row, Android needs telling.
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={pressed && !android ? styles.pressedIos : null}
      >
        <ScalePress
          testID={testID && `${testID}-${side}`}
          onPress={() => step(side === 'minus' ? -1 : 1)}
          disabled={disabled || atBound}
          pressedScale={android ? 1 : PRESS.scale}
          onPressIn={() => android && setDown(side)}
          onPressOut={() => setDown(null)}
          android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
          style={[
            styles.disc,
            { backgroundColor: onGlass ? MATERIAL.fillOnGlass : COLOR.surfaceSunken },
            android && pressed && { borderRadius: RADIUS.pressedAndroid },
            contrast && IC_HAIRLINE,
            atBound && { opacity: OPACITY.disabled },
          ]}
        >
          {/* Android's live press is the ripple; the wash stands in for it only in the gallery. */}
          {android && previewState === `pressed-${side}` ? <View style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
          <Icon name={side} size={ICON.control} color={COLOR.textPrimary} />
        </ScalePress>
      </View>
    )
  }

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: String(value) }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => step(nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={[styles.row, disabled && { opacity: OPACITY.disabled }]}
    >
      {disc('minus')}
      <Text style={[font('heading', bold, FONT_FAMILY.mono[700]), styles.number]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
        {String(value)}
      </Text>
      {disc('plus')}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  pressedIos: { transform: [{ scale: PRESS.scale }] },
  disc: {
    width: SIZE.control,
    height: SIZE.control,
    borderRadius: RADIUS.capsule,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wash: { backgroundColor: PRESSED_WASH.android },
  number: { minWidth: NUMBER_MIN_WIDTH, textAlign: 'center', color: COLOR.textPrimary, fontVariant: ['tabular-nums'] },
})
