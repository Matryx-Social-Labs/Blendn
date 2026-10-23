import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'

import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { monoCaption } from './MonoFamily'
import { CONTROL_FONT_CAP, font, minTarget, useBoldText, useIncreaseContrast } from './shared'

/*
 * One field everywhere (ROUND3 B4, the R3 ruling): the sign-in form's solid
 * surface capsule and its multi-line sibling. Never on glass. The pieces below
 * are shared with <DateField>.
 */

/** TextArea's counter turns amber in the last 40 characters. */
const COUNTER_WARN_AT = 40
const AREA_MIN_HEIGHT = 160

/** Characters as a person (and Postgres `char_length`) counts them: an emoji is one. */
const count = (value: string) => [...value].length

/** One ref callback that keeps the field's own ref and hands the node to the caller's. */
function joinRefs(own: { current: TextInput | null }, theirs?: Ref<TextInput>) {
  return (node: TextInput | null) => {
    own.current = node
    if (typeof theirs === 'function') theirs(node)
    else if (theirs) (theirs as { current: TextInput | null }).current = node
  }
}

/** The label above a field: Geist Mono, uppercase, textSecondary (white under Increase Contrast), 4 pt in like the field's text (`inputs.js textField`). Every label has this one inset. */
export function FieldLabel({ text, bold, contrast }: { text: string; bold: boolean; contrast: boolean }) {
  // A field's name grows to its role's cap (MAX_FONT_SCALE.label): uncapped, EMAIL drew at 3.1x over a 1.3x input (RC drive 2 D-8).
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.label, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
      {text}
    </Text>
  )
}

/**
 * The one error sentence, with its glyph, and the hint, under the field. An
 * error is assertive (§14): spoken as it arrives, queued behind another when
 * a form refuses several at once (iOS), a live region on Android.
 */
export function FieldNotes({ error, hint, bold }: { error?: string; hint?: string; bold: boolean }) {
  useEffect(() => {
    if (error && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(error, { queue: true })
  }, [error])
  return (
    <>
      {error ? (
        <View style={styles.note}>
          <Icon name="circle-alert" size={ICON.inline} color={COLOR.destructive} />
          <Text accessibilityLiveRegion="assertive" style={[font('meta', bold), styles.noteText, { color: COLOR.destructive }]}>
            {error}
          </Text>
        </View>
      ) : null}
      {hint ? <Text style={[font('meta', bold), styles.hint]}>{hint}</Text> : null}
    </>
  )
}

/**
 * The field's edge, drawn over it so a focus change never moves the text: 1 pt
 * inputBorder at rest (50% under Increase Contrast), a 2 pt white ring while
 * focused, destructive while in error, until the value changes.
 */
export function FieldBorder({ focused, error, contrast, radius, testID }: { focused: boolean; error: boolean; contrast: boolean; radius: number; testID?: string }) {
  const color = error ? COLOR.destructive : focused ? COLOR.focusRing : contrast ? MATERIAL.hairlineIncreaseContrast : COLOR.inputBorder
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: focused ? SPACE.xxs : 1, borderColor: color }]}
    />
  )
}

/** Focus as the TextInput reports it, chained to the caller's own handlers. */
function useFocus({ onFocus, onBlur }: Pick<TextInputProps, 'onFocus' | 'onBlur'>) {
  const [focused, setFocused] = useState(false)
  return {
    focused,
    onFocus: ((e) => {
      setFocused(true)
      onFocus?.(e)
    }) as TextInputProps['onFocus'],
    onBlur: ((e) => {
      setFocused(false)
      onBlur?.(e)
    }) as TextInputProps['onBlur'],
  }
}

type FieldProps = Omit<
  TextInputProps,
  'style' | 'editable' | 'secureTextEntry' | 'placeholderTextColor' | 'maxLength' | 'multiline' | 'accessibilityLabel' | 'accessibilityHint'
> & {
  value: string
  onChangeText: (text: string) => void
  /** Geist Mono, above the field. Also its name for a screen reader (else the placeholder). */
  label?: string
  /** One sentence. The ring stays until the value changes; `H.error` is the submit button's (its `refused`), once. */
  error?: string
  hint?: string
  disabled?: boolean
  /** A counter (`n/max`). Never enforced by truncation: the Save button refuses instead. */
  limit?: number
  /** The design gallery only: draws focus with no keyboard. */
  previewState?: 'focused'
  /** The text input itself, for a form that moves focus from one field to the next. */
  inputRef?: Ref<TextInput>
  testID?: string
}

/** What a screen reader hears after the label and value: the error, the count, the hint. */
const spokenHint = (error?: string, value?: string, limit?: number, hint?: string, measure: (v: string) => number = count) =>
  [error, limit ? `${measure(value ?? '')} of ${limit} characters` : undefined, hint].filter(Boolean).join('. ') || undefined

/**
 * The text field (DESIGN-BRIEF §12, guidelines/components/TextField.html): a
 * 56 pt surface capsule, the label above in Geist Mono, one error sentence
 * below. `secure` draws dots in Geist Mono with an eye that is its own 44 pt
 * button ("Show password").
 *
 * No haptic on focus or typing. No pressed state on either platform: a field
 * focuses, it isn't pressed. The value caps at 1.3× inside the fixed height;
 * the label, hint and error scale freely. Increase Contrast lifts the border
 * to 50% and the label to white; Reduce Transparency changes nothing (it is
 * solid); there is no motion to reduce (the #20 shake is the submit button's).
 */
export function TextField({
  label,
  value,
  onChangeText,
  error,
  hint,
  disabled = false,
  limit,
  measure = count,
  secure = false,
  defaultRevealed = false,
  previewState,
  inputRef,
  testID,
  onFocus,
  onBlur,
  ...rest
}: FieldProps & {
  /** How the limit counts, when the server's rule is not characters: `(v) => v.length` for a zod `max()` (UTF-16 units). */
  measure?: (value: string) => number
  /** A password: dots, and the eye. */
  secure?: boolean
  /** Start with the password shown (the eye "on"). */
  defaultRevealed?: boolean
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const focus = useFocus({ onFocus, onBlur })
  const input = useRef<TextInput>(null)
  const [revealed, setRevealed] = useState(defaultRevealed)
  /*
   * A masked field is Geist Mono whether or not it holds anything, and draws its placeholder itself, in Satoshi (r7 H3).
   * The native field used to switch family with the value (Mono for dots, Satoshi empty) and draw the placeholder in
   * whatever font it was left with: after iOS's Strong Password sheet filled it and was dismissed, that was Courier.
   * Now nothing about the native field changes as the sheet fills and empties it, and it draws no placeholder at all.
   */
  const masked = secure && !revealed
  const ownPlaceholder = secure && !value && rest.placeholder ? rest.placeholder : null
  const eye = minTarget()

  return (
    <View testID={testID} style={[styles.field, disabled && { opacity: OPACITY.disabled }]}>
      {label ? <View style={styles.labelRow}><FieldLabel text={label} bold={bold} contrast={contrast} /></View> : null}
      {/* The whole capsule is the target: a tap on its padding focuses the text. */}
      <Pressable
        testID={testID && `${testID}-box`}
        accessible={false}
        onPress={() => input.current?.focus()}
        disabled={disabled}
        style={[styles.box, secure && { paddingRight: eye + SPACE.sm }]}
      >
        <TextInput
          {...rest}
          placeholder={secure ? undefined : rest.placeholder}
          ref={joinRefs(input, inputRef)}
          testID={testID && `${testID}-input`}
          value={value}
          onChangeText={onChangeText}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          editable={!disabled}
          secureTextEntry={masked}
          placeholderTextColor={COLOR.textTertiary}
          selectionColor={COLOR.textPrimary}
          cursorColor={COLOR.textPrimary}
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          accessibilityLabel={label ?? rest.placeholder}
          accessibilityHint={spokenHint(error, value, limit, hint, measure)}
          accessibilityState={{ disabled }}
          style={[masked ? font('body', bold, FONT_FAMILY.mono[500]) : font('body', bold), styles.input, styles.line, masked && styles.dots]}
        />
        {ownPlaceholder ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.placeholder, { paddingRight: eye + SPACE.sm }]}>
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              numberOfLines={1}
              maxFontSizeMultiplier={CONTROL_FONT_CAP}
              style={[font('body', bold), { color: COLOR.textTertiary }]}
            >
              {ownPlaceholder}
            </Text>
          </View>
        ) : null}
        {limit !== undefined ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[monoCaption(bold), { color: error ? COLOR.destructive : COLOR.textTertiary }]}
            maxFontSizeMultiplier={CONTROL_FONT_CAP}
          >
            {`${measure(value)}/${limit}`}
          </Text>
        ) : null}
        {secure ? (
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            style={[styles.eye, { width: eye, height: eye, top: (SIZE.input - eye) / 2, right: (SIZE.input - eye) / 2 }]}
          >
            <Icon name={revealed ? 'eye-off' : 'eye'} size={ICON.control} color={COLOR.textSecondary} />
          </Pressable>
        ) : null}
        <FieldBorder
          testID={testID && `${testID}-border`}
          focused={focus.focused || previewState === 'focused'}
          error={!!error}
          contrast={contrast}
          radius={RADIUS.capsule}
        />
      </Pressable>
      <FieldNotes error={error} hint={hint} bold={bold} />
    </View>
  )
}

/**
 * The multi-line sibling (guidelines/components/TextArea.html): radius 24, a
 * 160 pt minimum (`minHeight` for a one-liner such as a crew's line), and the
 * counter in the label row in Geist Mono, amber in the last 40 characters.
 * Nothing buzzes near the cap; the amber is the signal. It grows with its
 * text, so its text stops at the body role's cap and wraps (no one-line control cap).
 */
export function TextArea({
  label,
  value,
  onChangeText,
  error,
  hint,
  disabled = false,
  limit,
  measure = count,
  minHeight = AREA_MIN_HEIGHT,
  previewState,
  inputRef,
  testID,
  onFocus,
  onBlur,
  ...rest
}: FieldProps & {
  minHeight?: number
  /** How the limit counts, when the server's rule is not characters: `(v) => v.length` for a zod `max()` (UTF-16 units). */
  measure?: (value: string) => number
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const focus = useFocus({ onFocus, onBlur })
  const input = useRef<TextInput>(null)
  const near = limit !== undefined && limit - measure(value) < COUNTER_WARN_AT
  const over = limit !== undefined && measure(value) > limit

  let counter: ReactNode = null
  if (limit !== undefined) {
    counter = (
      <Text accessibilityElementsHidden importantForAccessibility="no" maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[monoCaption(bold), { color: over ? COLOR.destructive : near ? COLOR.warning : COLOR.textTertiary }]}>
        {`${measure(value)}/${limit}`}
      </Text>
    )
  }

  return (
    <View testID={testID} style={[styles.field, disabled && { opacity: OPACITY.disabled }]}>
      {label || counter ? (
        <View style={[styles.labelRow, styles.spread]}>
          {label ? <FieldLabel text={label} bold={bold} contrast={contrast} /> : <View />}
          {counter}
        </View>
      ) : null}
      <Pressable testID={testID && `${testID}-box`} accessible={false} onPress={() => input.current?.focus()} disabled={disabled} style={[styles.area, { minHeight }]}>
        <TextInput
          {...rest}
          ref={joinRefs(input, inputRef)}
          testID={testID && `${testID}-input`}
          multiline
          value={value}
          onChangeText={onChangeText}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          editable={!disabled}
          placeholderTextColor={COLOR.textTertiary}
          selectionColor={COLOR.textPrimary}
          cursorColor={COLOR.textPrimary}
          textAlignVertical="top"
          // Reading text in a box that grows with it: the body role's cap, not the one-line control cap (RC drive 3 D-B).
          maxFontSizeMultiplier={MAX_FONT_SCALE.body}
          accessibilityLabel={label ?? rest.placeholder}
          accessibilityHint={spokenHint(error, value, limit, hint, measure)}
          accessibilityState={{ disabled }}
          style={[font('body', bold), styles.input, styles.grow]}
        />
        <FieldBorder
          testID={testID && `${testID}-border`}
          focused={focus.focused || previewState === 'focused'}
          error={!!error}
          contrast={contrast}
          radius={RADIUS.sheet}
        />
      </Pressable>
      <FieldNotes error={error} hint={hint} bold={bold} />
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: SPACE.sm },
  label: { paddingLeft: SPACE.xs },
  labelRow: { paddingRight: SPACE.xs },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  box: {
    height: SIZE.input,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.xl,
  },
  input: { color: COLOR.textPrimary, padding: 0 },
  line: { flex: 1 },
  /** Grows from its content (basis auto) past the minimum; `flex: 1` would pin it at the minimum. */
  grow: { flexGrow: 1 },
  dots: { letterSpacing: SPACE.xxs },
  /** A masked field's own placeholder, where the native one would sit: the box's left padding, centred in its height. */
  placeholder: { justifyContent: 'center', paddingLeft: SPACE.xl },
  eye: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  area: {
    borderRadius: RADIUS.sheet,
    backgroundColor: COLOR.surface,
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.xl,
  },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, paddingLeft: SPACE.xs },
  noteText: { flex: 1 },
  hint: { color: COLOR.textTertiary, paddingLeft: SPACE.xs },
})
