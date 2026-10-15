import { useRef, useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'

import { COLOR, FONT_FAMILY, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { FieldBorder, FieldLabel, FieldNotes } from './TextField'
import { CONTROL_FONT_CAP, font, useBoldText, useIncreaseContrast } from './shared'

/** Day, month and year as typed: digits only, not yet a date. The form decides what they mean. */
export type DateParts = readonly [string, string, string]

/** Day-first everywhere (India), never a locale switch; the year box is half as wide again. */
const BOXES = [
  { name: 'Day', placeholder: 'DD', length: 2, flex: 1 },
  { name: 'Month', placeholder: 'MM', length: 2, flex: 1 },
  { name: 'Year', placeholder: 'YYYY', length: 4, flex: 1.5 },
] as const
/** Digits 1 pt apart, as the page sets them. */
const DIGIT_TRACKING = 1

/**
 * The date of birth (guidelines/components/DateField.html): three capsules,
 * DD · MM · YYYY at 1 : 1 : 1.5, Geist Mono tabular so the digits never jump.
 * Focus moves to the next box when one is full, and back from an empty box on
 * backspace. No wheel picker: typing a birth date is faster than scrolling 30
 * years.
 *
 * `invalid` (an impossible date) rings all three; `error` (refused on submit,
 * under 18) rings them and adds the one sentence, which each box reads as its
 * hint. No haptic while typing; `H.error` is the submit button's, once. Digits
 * cap at 1.3× inside the 56 pt boxes; Bold Text steps them to 700.
 */
export function DateField({
  label,
  value,
  onChange,
  invalid = false,
  error,
  hint,
  disabled = false,
  previewFocus,
  testID,
}: {
  label: string
  value: DateParts
  onChange: (next: DateParts) => void
  invalid?: boolean
  error?: string
  hint?: string
  disabled?: boolean
  /** The design gallery only: draws one box focused with no keyboard. */
  previewFocus?: 0 | 1 | 2
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [focused, setFocused] = useState<number | null>(null)
  const refs = useRef<(TextInput | null)[]>([])
  const bad = invalid || !!error

  const change = (i: number, text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, BOXES[i].length)
    onChange(value.map((v, j) => (j === i ? digits : v)) as unknown as DateParts)
    if (digits.length === BOXES[i].length && i < BOXES.length - 1) refs.current[i + 1]?.focus()
  }

  return (
    <View testID={testID} style={[styles.field, disabled && { opacity: OPACITY.disabled }]}>
      <View style={styles.labelRow}>
        <FieldLabel text={label} bold={bold} contrast={contrast} />
      </View>
      <View style={styles.row}>
        {BOXES.map((box, i) => (
          <View key={box.name} testID={testID && `${testID}-${i}`} style={[styles.box, { flex: box.flex }]}>
            <TextInput
              ref={(r) => {
                refs.current[i] = r
              }}
              value={value[i]}
              onChangeText={(t) => change(i, t)}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus()
              }}
              onFocus={() => setFocused(i)}
              onBlur={() => setFocused((f) => (f === i ? null : f))}
              editable={!disabled}
              keyboardType="number-pad"
              maxLength={box.length}
              placeholder={box.placeholder}
              placeholderTextColor={COLOR.textTertiary}
              selectionColor={COLOR.textPrimary}
              cursorColor={COLOR.textPrimary}
              maxFontSizeMultiplier={CONTROL_FONT_CAP}
              accessibilityLabel={box.name}
              accessibilityHint={error}
              accessibilityState={{ disabled }}
              style={[font('heading', bold, FONT_FAMILY.mono[500]), styles.digits]}
            />
            <FieldBorder
              testID={testID && `${testID}-${i}-border`}
              focused={focused === i || previewFocus === i}
              error={bad}
              contrast={contrast}
              radius={RADIUS.capsule}
            />
          </View>
        ))}
      </View>
      <FieldNotes error={error} hint={hint} bold={bold} />
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: SPACE.sm },
  labelRow: { paddingHorizontal: SPACE.xs },
  row: { flexDirection: 'row', gap: SPACE.sm },
  box: { height: SIZE.input, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface, justifyContent: 'center' },
  digits: {
    color: COLOR.textPrimary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    letterSpacing: DIGIT_TRACKING,
    padding: 0,
  },
})
