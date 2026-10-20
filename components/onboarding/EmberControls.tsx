import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native'

import { CONTROL, EMBER, EMBER_RADIUS, MAX_FONT_SCALE, OPACITY, SPACE, TYPE } from '../../lib/theme'

/**
 * What is left of the Ember onboarding controls: the flat accent button. Entry and onboarding moved to the design system
 * (`Button`, `TextField`, `DateField`, `Toggle`, `SectionHeader`); the screens below still draw this, and the file goes with
 * the last of them (support, event preferences, an invite landing, add friends, a friend's profile, the error boundary).
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
})
