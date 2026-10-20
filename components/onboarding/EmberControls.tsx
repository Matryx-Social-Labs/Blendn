import { Ionicons } from '@expo/vector-icons'
import { forwardRef, ReactNode, useContext } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native'

import { RevealOnFocus } from './revealFocused'
import {
  CONTROL,
  EMBER,
  EMBER_RADIUS,
  ICON,
  MAX_FONT_SCALE,
  OPACITY,
  SPACE,
  SWITCH_COLORS,
  TYPE,
} from '../../lib/theme'

/**
 * The four controls the onboarding frames are built from.
 *
 * One file rather than four, because they are small and always imported
 * together — and because they share one rule: **a `textPrimary` fill means
 * "chosen"**. The accent belongs to `EmberButton` alone, the screen's one
 * primary action (docs/DESIGN_SYSTEM.md).
 */

/* -------------------------------------------------------------------------- */

interface ButtonProps {
  label: string
  onPress: () => void
  disabled?: boolean
  busy?: boolean
  /**
   * `primary` (the default) is the screen's one accent. `secondary` is the
   * neutral beside or instead of it — a `surface` pill with `textPrimary`
   * text — for a state whose action is not the screen's main one.
   */
  variant?: 'primary' | 'secondary'
  accessibilityHint?: string
  /** Placement only (margins, `alignSelf`), never the look. */
  style?: StyleProp<ViewStyle>
}

/** The primary action. Flat accent fill, dark text, no glow. */
export function EmberButton({
  label,
  onPress,
  disabled,
  busy,
  variant = 'primary',
  accessibilityHint,
  style,
}: ButtonProps) {
  const inactive = disabled || busy
  const secondary = variant === 'secondary'
  const ink = secondary ? EMBER.textPrimary : EMBER.onGradient
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.buttonOuter,
        // Dimmed rather than greyed: the disabled state is nearly always
        // "you have not finished typing yet", and swapping the fill for a flat
        // grey reads as broken rather than as not-yet. Busy keeps its fill:
        // a spinner on a dimmed pill reads as disabled, not as working.
        disabled && !busy && styles.buttonInactive,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      <View style={[styles.button, secondary && styles.buttonSecondary]}>
        {/*
          The label is capped because this button is a fixed
          `CONTROL.lg` box. React Native clips a glyph to its line
          height rather than letting it overflow, so at Accessibility XXXL an
          uncapped label renders as a row of sliced letterforms inside a button
          that is still 56pt tall. 1.3 is the largest step that fits.

          Text in a *growing* container is deliberately left alone — capping
          everything would defeat the setting for the people who need it.
        */}
        {busy ? (
          <ActivityIndicator color={ink} />
        ) : (
          <Text style={[styles.buttonLabel, { color: ink }]} maxFontSizeMultiplier={MAX_FONT_SCALE.button} numberOfLines={1}>
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  )
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
  { label, helper, compact, style, onFocus, ...input },
  ref
) {
  const reveal = useContext(RevealOnFocus)
  return (
    <View style={compact ? undefined : styles.fieldBlock}>
      {compact ? null : <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>}
      <TextInput
        ref={ref}
        /*
         * Capped for the same reason as the buttons: `styles.input` is a fixed
         * `CONTROL.lg` box, so scaled text is clipped rather than
         * given room. A field whose value is half-visible is worse than one
         * whose text is a size smaller — you cannot check what you typed.
         */
        maxFontSizeMultiplier={1.3}
        accessibilityLabel={label}
        placeholderTextColor={EMBER.textPlaceholder}
        style={[styles.input, compact ? styles.inputCompact : null, style]}
        onFocus={(e) => {
          // Moving on (Next to the birth date) must show where focus went.
          reveal?.()
          onFocus?.(e)
        }}
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
  /** A write in flight: the switch holds still until it settles. */
  disabled?: boolean
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
 * The drawn control is the platform `Switch` (it honours reduce-motion and
 * looks like every other switch on the phone); the row around it is the
 * target and carries the `switch` role and its `checked` state.
 */
export function EmberToggle({ label, helper, value, onValueChange, disabled }: ToggleProps) {
  // The row is the target, as in Settings: a tap anywhere on it flips the
  // switch, and it is announced once, as a switch.
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={helper}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
    >
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.helper}>{helper}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...SWITCH_COLORS}
      />
    </Pressable>
  )
}

/**
 * A section heading with a caption and an optional
 * control on the right.
 *
 * `EmberFieldGroup` puts a small uppercase grey label over a control, which is
 * the treatment the form *fields* use. The design gives its sections something
 * louder: a heading-role title with a sentence under it, and room for
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
  /*
   * The whole pill is the target, not only the scaled-down switch inside it —
   * that switch is ~40×24 on screen, under the 44pt floor. The pill is one
   * accessible switch; the inner one is hidden from screen readers so the
   * control is not announced twice.
   */
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      hitSlop={SPACE.sm}
      style={({ pressed }) => [styles.inlinePill, pressed && styles.pressed]}
    >
      <Text style={styles.inlineLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...SWITCH_COLORS}
        style={styles.inlineSwitch}
      />
    </Pressable>
  )
}

/**
 * A section as a card, with an icon badge — the treatment Your Journey uses.
 *
 * Distinct from `EmberSection`, which is a heading over open content. This one
 * encloses its fields in a surface, and the enclosure is the point: that screen
 * asks three unrelated questions (where you are, what you do, where you
 * studied) and without a boundary they read as one long form. The card is what
 * makes them three things.
 *
 * The badge is a plain `surface` circle with a `textPrimary` glyph — a
 * decorative well, so three of them stacked stay quiet.
 */
export function EmberCardSection({
  icon,
  title,
  caption,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  caption?: string
  children: ReactNode
}) {
  return (
    <View style={styles.cardSection}>
      <View style={styles.cardHead}>
        <View style={styles.cardBadge}>
          <Ionicons name={icon} size={ICON.md} color={EMBER.textPrimary} />
        </View>
        <View style={styles.cardHeadText}>
          <Text style={styles.cardTitle}>{title}</Text>
          {caption ? <Text style={styles.cardCaption}>{caption}</Text> : null}
        </View>
      </View>
      <View style={styles.cardBody}>{children}</View>
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
  pressed: { opacity: OPACITY.pressed },

  buttonOuter: { borderRadius: EMBER_RADIUS.pill },
  buttonInactive: { opacity: OPACITY.disabled },
  buttonSecondary: { backgroundColor: EMBER.surface },
  button: {
    height: CONTROL.lg,
    // A caller that centres it (an empty state) gets a content-width pill: without this the label's first and last
    // letters sat on the pill's curve, clipped (Crews "Make a crew", drive). A stretched one doesn't change.
    paddingHorizontal: SPACE.xl,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SPACE.md,
  },
  buttonLabel: { ...TYPE.button, color: EMBER.onGradient },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.md,
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.xl,
  },
  // `flex: 1` so a two-line helper wraps instead of squeezing the switch off
  // the right edge, which is what a row of three fixed children does on a
  // narrow phone.
  toggleText: { flex: 1, gap: SPACE.xs },
  toggleLabel: TYPE.body,

  // The caption sits under the title inside the head; 16 before the content.
  cardSection: {
    backgroundColor: EMBER.surfaceMedia,
    borderRadius: EMBER_RADIUS.card,
    borderWidth: 1,
    borderColor: EMBER.separator,
    // 16 rather than 24: the card already costs the chips inside it width
    // against the open sections elsewhere, and work-field labels are the
    // longest in the app.
    padding: SPACE.lg,
    gap: SPACE.lg,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  cardBadge: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeadText: { flex: 1, gap: SPACE.xxs },
  cardTitle: TYPE.heading,
  cardCaption: { ...TYPE.meta, color: EMBER.textTertiary },
  cardBody: { gap: SPACE.lg },

  section: { gap: SPACE.md },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
    /*
     * A floor, not a fix. The real guarantee is that callers keep the control
     * mounted and hide it — see `preferences.tsx` — because `transform: scale`
     * on a switch is visual only and its layout height stays platform-dependent,
     * so any number here is a guess. This just stops a section with no control
     * at all from sitting shorter than its neighbours.
     */
    minHeight: CONTROL.md,
  },
  sectionTitle: { ...TYPE.heading, flex: 1 },
  sectionCaption: { ...TYPE.meta, color: EMBER.textTertiary, marginBottom: SPACE.md },

  inlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    minHeight: CONTROL.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceMedia,
  },
  inlineLabel: TYPE.meta,
  // Scaled down: a stock switch beside 13pt text is nearly twice its height.
  inlineSwitch: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },

  fieldBlock: { gap: SPACE.md },
  fieldLabel: TYPE.label,
  input: {
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    paddingHorizontal: SPACE.xl,
    ...TYPE.body,
  },
  inputCompact: { paddingHorizontal: SPACE.md, ...TYPE.body, textAlign: 'center' },
  helper: { ...TYPE.meta, color: EMBER.textTertiary },
})
