import { LinearGradient } from 'expo-linear-gradient'
import { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native'

import {
  EMBER,
  EMBER_CONTROL_HEIGHT,
  EMBER_GLOW,
  EMBER_GRADIENT,
  EMBER_RADIUS,
  EMBER_TYPE,
} from '../../lib/theme'

/**
 * The four controls the onboarding frames are built from.
 *
 * One file rather than four, because they are small and always imported
 * together — and because they share the one rule that matters: **the gradient
 * means "chosen"**. It is on the primary button and on a selected chip, and
 * nowhere else. A gradient used decoratively would make the selected state
 * unreadable, which on a chip row is the entire information.
 */

/* -------------------------------------------------------------------------- */

interface ButtonProps {
  label: string
  onPress: () => void
  disabled?: boolean
  busy?: boolean
}

/** The primary action. Gradient, dark text, a warm glow under it. */
export function EmberButton({ label, onPress, disabled, busy }: ButtonProps) {
  const inactive = disabled || busy
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.buttonShadow,
        // Dimmed rather than greyed: the disabled state is nearly always
        // "you have not finished typing yet", and swapping the fill for a flat
        // grey reads as broken rather than as not-yet.
        inactive && styles.buttonInactive,
        pressed && !inactive && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={[...EMBER_GRADIENT.colors]}
        start={EMBER_GRADIENT.start}
        end={EMBER_GRADIENT.end}
        style={styles.button}
      >
        {busy ? (
          <ActivityIndicator color={EMBER.onGradient} />
        ) : (
          <Text style={styles.buttonLabel}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  )
}

/** The quieter second action: "Maybe later", "Skip for now". */
export function EmberSecondaryButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
    >
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  )
}

/* -------------------------------------------------------------------------- */

interface ChipProps {
  label: string
  selected: boolean
  onPress: () => void
}

/**
 * One choice in a row of them.
 *
 * `accessibilityRole` is deliberately `button` with a `selected` state rather
 * than `radio`: several of these rows are multi-select, and a screen reader
 * announcing "radio button" on a list where three answers are allowed is worse
 * than the generic role.
 */
export function EmberChip({ label, selected, onPress }: ChipProps) {
  const body = (
    <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : styles.chipLabelIdle]}>
      {label}
    </Text>
  )

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {selected ? (
        <LinearGradient
          colors={[...EMBER_GRADIENT.colors]}
          start={EMBER_GRADIENT.start}
          end={EMBER_GRADIENT.end}
          style={styles.chip}
        >
          {body}
        </LinearGradient>
      ) : (
        <View style={[styles.chip, styles.chipIdle]}>{body}</View>
      )}
    </Pressable>
  )
}

/** A row of chips that wraps. Used by four of the eight screens. */
export function EmberChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>
}

/* -------------------------------------------------------------------------- */

interface FieldProps extends TextInputProps {
  label: string
  /** Small print under the input. The design uses it for reassurance, not errors. */
  helper?: string
  /** Narrower and centred, for the DD / MM / YYYY boxes. */
  compact?: boolean
}

/**
 * A labelled input.
 *
 * The label is a real `<Text>` above the field rather than a placeholder, so it
 * survives typing — a placeholder-as-label disappears exactly when someone
 * needs to check what they are filling in, and is unreachable to a screen
 * reader once the field has a value.
 */
export function EmberField({ label, helper, compact, style, ...input }: FieldProps) {
  return (
    <View style={compact ? undefined : styles.fieldBlock}>
      {compact ? null : <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={EMBER.textPlaceholder}
        style={[styles.input, compact ? styles.inputCompact : null, style]}
        {...input}
      />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  )
}

/** A label over an arbitrary control — chips, a grid, a toggle row. */
export function EmberFieldGroup({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: ReactNode
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      {children}
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },

  buttonShadow: { borderRadius: EMBER_RADIUS.pill, ...EMBER_GLOW.button },
  buttonInactive: { opacity: 0.45 },
  button: {
    height: EMBER_CONTROL_HEIGHT,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  buttonLabel: EMBER_TYPE.button,

  secondaryButton: {
    height: EMBER_CONTROL_HEIGHT,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { ...EMBER_TYPE.button, color: EMBER.textPrimary },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // Comfortably over the 44pt floor once the 24/12 padding is applied to
    // 24pt of line height, and stated so a shorter label cannot shrink below it.
    minHeight: 48,
  },
  chipIdle: { backgroundColor: EMBER.surfaceSunken },
  chipLabel: EMBER_TYPE.chip,
  chipLabelSelected: { color: EMBER.onGradientChip },
  chipLabelIdle: { color: EMBER.textPrimary },

  fieldBlock: { gap: 12 },
  fieldLabel: EMBER_TYPE.fieldLabel,
  input: {
    height: EMBER_CONTROL_HEIGHT,
    borderRadius: EMBER_RADIUS.input,
    backgroundColor: EMBER.surface,
    paddingHorizontal: 24,
    ...EMBER_TYPE.input,
  },
  inputCompact: { paddingHorizontal: 12, ...EMBER_TYPE.inputCentered },
  helper: EMBER_TYPE.helper,
})
