import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'

import { Icon } from '../ui/Icon'
import { COLOR, ICON, MATERIAL, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { Spinner } from './Loader'
import { FieldBorder } from './TextField'
import { CONTROL_FONT_CAP, font, minTarget, useBoldText, useIncreaseContrast } from './shared'

export type SearchFieldProps = Omit<TextInputProps, 'style' | 'editable' | 'placeholderTextColor'> & {
  value: string
  onChangeText: (text: string) => void
  /** Scoped by the screen: "Search events…", "Search cities". Also its name, without the ellipsis. */
  placeholder: string
  /** Results are being fetched: the glass glyph becomes the spinner. */
  busy?: boolean
  /** "12 events": announced once when results settle (`busy` off), never while typing. */
  resultsLabel?: string
  /** Inside a sheet: on Android's solid sheet it takes surfaceSunken; iOS keeps the 8% on its glass. */
  inSheet?: boolean
  disabled?: boolean
  /** The design gallery only: draws focus with no keyboard. */
  previewState?: 'focused'
  testID?: string
}

/**
 * The search field (guidelines/components/SearchField.html; ROUND3 "off
 * glass"): 48 pt, a capsule of 8% white with a 38% hairline, never a text
 * field's solid surface and never glass. Focus, typing and a value take the
 * 2 pt white ring; while results load the glass glyph becomes the spinner; ×
 * clears and keeps focus.
 *
 * Silent: clearing and results arriving play nothing. The value caps at 1.3×
 * inside 48 pt. Increase Contrast: the hairline at 50% and the placeholder at
 * textSecondary.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  busy = false,
  resultsLabel,
  inSheet = false,
  disabled = false,
  previewState,
  testID,
  onFocus,
  onBlur,
  ...rest
}: SearchFieldProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const input = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const active = focused || previewState === 'focused' || value.length > 0

  useEffect(() => {
    if (!busy && resultsLabel) AccessibilityInfo.announceForAccessibility(resultsLabel)
  }, [busy, resultsLabel])

  const clearSlop = (minTarget() - ICON.control) / 2
  const fill = inSheet && Platform.OS === 'android' ? COLOR.surfaceSunken : MATERIAL.fillOnGlass

  return (
    <View testID={testID} style={[styles.field, { backgroundColor: fill }, disabled && { opacity: OPACITY.disabled }]}>
      {busy ? (
        <Spinner testID={testID && `${testID}-spinner`} size={20} />
      ) : (
        <Icon name="search" size={ICON.control} color={active ? COLOR.textPrimary : COLOR.textSecondary} />
      )}
      <TextInput
        {...rest}
        ref={input}
        testID={testID && `${testID}-input`}
        value={value}
        onChangeText={onChangeText}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlur?.(e)
        }}
        placeholder={placeholder}
        editable={!disabled}
        returnKeyType={rest.returnKeyType ?? 'search'}
        placeholderTextColor={contrast ? COLOR.textSecondary : COLOR.textPlaceholder}
        selectionColor={COLOR.textPrimary}
        cursorColor={COLOR.textPrimary}
        maxFontSizeMultiplier={CONTROL_FONT_CAP}
        accessibilityRole="search"
        accessibilityLabel={placeholder.replace(/…$/, '')}
        accessibilityState={{ disabled, busy }}
        style={[font('body', bold), styles.input]}
      />
      {value ? (
        <Pressable
          onPress={() => {
            onChangeText('')
            input.current?.focus()
          }}
          disabled={disabled}
          hitSlop={clearSlop}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Icon name="x" size={ICON.control} color={COLOR.textSecondary} />
        </Pressable>
      ) : null}
      <FieldBorder testID={testID && `${testID}-border`} focused={active} error={false} contrast={contrast} radius={RADIUS.capsule} />
    </View>
  )
}

const styles = StyleSheet.create({
  field: {
    height: SIZE.control,
    borderRadius: RADIUS.capsule,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
  },
  input: { flex: 1, color: COLOR.textPrimary, padding: 0 },
})
