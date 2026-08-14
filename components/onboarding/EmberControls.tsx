import { LinearGradient } from 'expo-linear-gradient'
import { forwardRef, ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native'

import {
  EMBER,
  EMBER_CONTROL_HEIGHT,
  EMBER_FONTS,
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
export const EmberField = forwardRef<TextInput, FieldProps>(function EmberField(
  { label, helper, compact, style, ...input },
  ref
) {
  return (
    <View style={compact ? undefined : styles.fieldBlock}>
      {compact ? null : <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={EMBER.textPlaceholder}
        style={[styles.input, compact ? styles.inputCompact : null, style]}
        {...input}
      />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  )
})

interface ToggleProps {
  label: string
  /** What turning it on actually does. Not decoration — see below. */
  helper: string
  value: boolean
  onValueChange: (next: boolean) => void
}

/**
 * A switch with its consequence spelled out beside it.
 *
 * `helper` is required rather than optional, which is the only opinionated
 * thing here. The one place this is used controls whether sexual orientation
 * is shown to anyone, and "Show on profile" — the label the design gives it —
 * does not say *to whom*. A privacy switch whose blast radius is not on the
 * screen is a switch people mis-set, and the cost of mis-setting this one is
 * not symmetrical.
 *
 * `Switch` from react-native, not a hand-rolled `Pressable`: the platform one
 * already announces its state to a screen reader, honours reduce-motion, and
 * has the right hit target. `trackColor` is as far as the tint goes, because
 * the gradient cannot be applied to it and a fake switch that looked right
 * would behave worse.
 */
export function EmberToggle({ label, helper, value, onValueChange }: ToggleProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.helper}>{helper}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        accessibilityHint={helper}
        trackColor={{ false: EMBER.surfaceSunken, true: EMBER.gradientFrom }}
        thumbColor={EMBER.textPrimary}
        ios_backgroundColor={EMBER.surfaceSunken}
      />
    </View>
  )
}

/**
 * A section heading, in the accent colour, with a caption and an optional
 * control on the right.
 *
 * `EmberFieldGroup` puts a small uppercase grey label over a control, which is
 * the treatment the form *fields* use. The design gives its sections something
 * louder: a 20pt accent-coloured title with a sentence under it, and room for
 * a control on the same line — the "Show on profile" pill sits there rather
 * than becoming a row of its own underneath.
 *
 * Two different jobs, so two components rather than one with a `variant`.
 */
export function EmberSection({
  title,
  caption,
  right,
  children,
}: {
  title: string
  caption?: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <View style={styles.section}>
      {/*
        The control sits on the *title* line, and the caption runs full width
        underneath both.
        
        It used to be bottom-aligned against a stacked title-and-caption, which
        put a pill next to a sentence and left the caption in a narrow column
        beside it — so a caption of any length wrapped two or three times while
        half the screen sat empty. Aligning to the heading gives the caption the
        whole width and puts the control level with the thing it modifies.
      */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
      {children}
    </View>
  )
}

/**
 * A switch that sits inline beside a section heading.
 *
 * The design draws it as a dark pill with its label inside, not as a full-width
 * row — it belongs to the section it modifies, and a row underneath would read
 * as a separate question.
 *
 * `EmberToggle` keeps its required helper text because it is used where the
 * consequence needs spelling out. This one has no room for that, so it is only
 * for switches whose section caption already carries the meaning.
 */
export function EmberInlineToggle({
  label,
  value,
  onValueChange,
  hint,
}: {
  label: string
  value: boolean
  onValueChange: (next: boolean) => void
  hint: string
}) {
  return (
    <View style={styles.inlinePill}>
      <Text style={styles.inlineLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={{ false: EMBER.surface, true: EMBER.accent }}
        thumbColor={EMBER.textPrimary}
        ios_backgroundColor={EMBER.surface}
        style={styles.inlineSwitch}
      />
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
  // `#141313` with a hairline border, per the frame — a shade below the cards
  // around it, so an unselected chip recedes rather than competing.
  chipIdle: { backgroundColor: '#141313', borderWidth: 1, borderColor: 'rgba(73,71,71,0.2)' },
  chipLabel: EMBER_TYPE.chip,
  chipLabelSelected: { color: EMBER.onGradientChip },
  chipLabelIdle: { color: EMBER.textPrimary },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.card,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  // `flex: 1` so a two-line helper wraps instead of squeezing the switch off
  // the right edge, which is what a row of three fixed children does on a
  // narrow phone.
  toggleText: { flex: 1, gap: 4 },
  toggleLabel: { ...EMBER_TYPE.subtitle, color: EMBER.textPrimary },

  // 12 between the heading block and the caption, 24 before the content —
  // so the caption reads as belonging to the heading rather than floating
  // between two things.
  section: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: {
    flex: 1,
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 20,
    lineHeight: 28,
    color: EMBER.accent,
  },
  sectionCaption: { ...EMBER_TYPE.helper, fontSize: 14, lineHeight: 20, marginBottom: 12 },

  inlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: '#141313',
  },
  inlineLabel: { ...EMBER_TYPE.helper, fontSize: 12, color: EMBER.textSecondary },
  // Scaled down: a stock switch beside 12pt text is nearly twice its height.
  inlineSwitch: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },

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
