import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  ReactNode,
  useCallback,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Dimensions,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native'

import { isCatchAll, packChips } from '../../lib/chipPacking'
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
        {/*
          The label is capped because this button is a fixed
          `EMBER_CONTROL_HEIGHT` box. React Native clips a glyph to its line
          height rather than letting it overflow, so at Accessibility XXXL an
          uncapped label renders as a row of sliced letterforms inside a button
          that is still 64pt tall. 1.3 is the largest step that fits.

          Text in a *growing* container is deliberately left alone — capping
          everything would defeat the setting for the people who need it.
        */}
        {busy ? (
          <ActivityIndicator color={EMBER.onGradient} />
        ) : (
          <Text style={styles.buttonLabel} maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {label}
          </Text>
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
      <Text style={styles.secondaryLabel} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

/* -------------------------------------------------------------------------- */

interface ChipProps {
  label: string
  selected: boolean
  onPress: () => void
  /*
   * Selectable, but not right now — a row with a cap that has been reached.
   *
   * Dimmed rather than hidden. The unreachable chips are what tell somebody the
   * limit exists; removing them makes three-of-eight look like eight-of-eight
   * that stops working, and a tap that does nothing with no explanation reads
   * as a broken screen.
   */
  disabled?: boolean
}

/**
 * One choice in a row of them.
 *
 * `accessibilityRole` is deliberately `button` with a `selected` state rather
 * than `radio`: several of these rows are multi-select, and a screen reader
 * announcing "radio button" on a list where three answers are allowed is worse
 * than the generic role.
 */
export function EmberChip({ label, selected, onPress, disabled }: ChipProps) {
  return (
    /*
     * One box, not two.
     *
     * This was a `Pressable` wrapping a styled `View`, and the wrapper did not
     * size to its child — so each chip claimed more width than its visible pill
     * and rows wrapped early, sometimes leaving half the screen empty beside a
     * gap the next chip would have fitted into.
     *
     * The padding, the radius and the border now live on the `Pressable`
     * itself, so the thing being measured and the thing being drawn are the
     * same box. The gradient becomes a background behind the label rather than
     * a container around it.
     *
     * `alignSelf: 'flex-start'` because a wrap container stretches its items on
     * the cross axis, and a chip should be as tall as its own content rather
     * than as tall as the tallest chip on its line.
     */
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        !selected && styles.chipIdle,
        disabled && styles.chipDisabled,
        pressed && styles.pressed,
      ]}
    >
      {selected ? (
        <LinearGradient
          colors={[...EMBER_GRADIENT.colors]}
          start={EMBER_GRADIENT.start}
          end={EMBER_GRADIENT.end}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : styles.chipLabelIdle]}>
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * A row of chips that wraps.
 *
 * Spacing is margins with a negative offset on the container, not `gap`.
 *
 * `gap` inside a `flexWrap` container measures the trailing gap as part of the
 * line, so Yoga wraps while there is still room for the next item — which is
 * exactly the reported symptom: rows breaking early with space to spare, and a
 * chip that would plainly have fitted pushed to the next line.
 *
 * Half the spacing on each chip, and the container pulled back by the same
 * amount so the row still starts and ends flush with everything above it. It is
 * the oldest trick in wrapped-layout and it does not depend on how any given
 * Yoga version accounts for `gap`.
 */
export function EmberChipRow({
  children,
  pack,
  width,
}: {
  children: ReactNode
  /**
   * Reorder the chips to fill the rows.
   *
   * Flexbox wraps greedily *in order*, so a long label pushes a short one to
   * the next line and leaves the gap behind it. Filling those gaps means
   * changing the order, which flexbox cannot do.
   *
   * Opt-in: only worth the churn where labels vary enough to leave real gaps.
   */
  pack?: boolean
  /** Room the row actually has. Defaults to the page width less its padding. */
  width?: number
}) {
  const items = Children.toArray(children)
  const labelOf = (child: ReactNode) =>
    isValidElement(child) ? String((child.props as { label?: unknown }).label ?? '') : ''

  /*
   * Measured, not estimated.
   *
   * Two rounds of estimating from character counts were not close enough — a
   * per-character average cannot know that "Prefer not to say" is mostly narrow
   * letters while "Web3 APIs" is mostly wide ones, and being wrong by a few
   * points is the difference between a chip fitting a row and being held back
   * from it. Every correction to the coefficient just moved which labels it was
   * wrong about.
   *
   * So the chips report their own width on layout and the order is computed
   * from the real numbers. One extra pass on mount, and the reorder is a single
   * frame before anyone has read the row — cheaper than a layout that is
   * visibly wrong for as long as the screen is open.
   *
   * Keyed by label so it survives a reorder: the same chip measured under a new
   * index is the same width, and re-measuring on every shuffle would loop.
   */
  const [measured, setMeasured] = useState<Record<string, number>>({})

  const record = useCallback((label: string, w: number) => {
    if (!label || w <= 0) return
    setMeasured((current) =>
      // Ignore a repeat of a width already known. Without this, the reorder
      // triggers a layout, which records, which reorders.
      Math.abs((current[label] ?? 0) - w) < 1 ? current : { ...current, [label]: w }
    )
  }, [])

  const withMeasurement = items.map((child, i) =>
    isValidElement(child)
      ? cloneElement(child as React.ReactElement<{ onLayout?: (e: LayoutChangeEvent) => void }>, {
          key: (child as { key?: string | null }).key ?? `chip-${i}`,
          onLayout: (e: LayoutChangeEvent) => record(labelOf(child), e.nativeEvent.layout.width),
        })
      : child
  )

  let ordered = withMeasurement
  const everyWidthKnown = items.every((c) => measured[labelOf(c)] !== undefined)

  if (pack && everyWidthKnown) {
    // Catch-alls out first so packing cannot hoist them, back on at the end.
    // "Prefer not to say" in row one is a worse list than any gap it fills.
    const isEnd = (c: ReactNode) => isCatchAll(labelOf(c))
    ordered = [
      ...packChips(
        withMeasurement.filter((c) => !isEnd(c)),
        // The measured pill, plus the margin the row spaces them with.
        (child) => measured[labelOf(child)] + CHIP_SPACING,
        width ?? Dimensions.get('window').width - 48
      ),
      ...withMeasurement.filter(isEnd),
    ]
  }

  return <View style={styles.chipRow}>{ordered}</View>
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
        /*
         * Capped for the same reason as the buttons: `styles.input` is a fixed
         * `EMBER_CONTROL_HEIGHT` box, so scaled text is clipped rather than
         * given room. A field whose value is half-visible is worse than one
         * whose text is a size smaller — you cannot check what you typed.
         */
        maxFontSizeMultiplier={1.3}
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

/**
 * A section as a card, with an icon badge — the treatment Your Journey uses.
 *
 * Distinct from `EmberSection`, which is a heading over open content. This one
 * encloses its fields in a surface, and the enclosure is the point: that screen
 * asks three unrelated questions (where you are, what you do, where you
 * studied) and without a boundary they read as one long form. The card is what
 * makes them three things.
 *
 * The badge is a circle in the accent colour at low alpha rather than a solid
 * fill, so three of them stacked do not turn the screen into a row of traffic
 * lights.
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
          <Ionicons name={icon} size={18} color={EMBER.accent} />
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

/** Space between chips. Applied as margin, halved — see `EmberChipRow`. */
const CHIP_SPACING = 12

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

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Cancels the per-chip margin at the edges, so the row lines up with the
    // heading above it rather than sitting 6pt inside it.
    marginHorizontal: -CHIP_SPACING / 2,
    marginVertical: -CHIP_SPACING / 2,
  },
  chip: {
    /*
     * A transparent border on *both* states, so selecting a chip does not
     * change its width.
     *
     * The idle style added `borderWidth: 1` and the selected gradient had
     * none, which made every unselected chip two points wider than its
     * selected self. Tapping one therefore re-flowed the whole wrapped row —
     * chips jumping to a different line the moment you chose one, which is why
     * picking "Asexual" appeared to tidy the layout up. It was not tidying; it
     * was re-packing around a chip that had just shrunk.
     *
     * 24/12 padding is the frame's 25/13 rounded to the spacing scale.
     */
    borderWidth: 1,
    borderColor: 'transparent',
    margin: CHIP_SPACING / 2,
    /*
     * A chip may shrink, and may not exceed the row.
     *
     * The `gap` fix sorted the wrap arithmetic, but two screens draw their
     * labels from the server — work fields, and category names like "Classical
     * and Carnatic" — and a chip wider than the line it is on forces its own
     * row and leaves the rest of that line empty. `flexShrink` lets an
     * oversized one give ground instead, and `maxWidth` stops any of them
     * running past the container in the first place.
     */
    flexShrink: 1,
    maxWidth: '100%',
    /*
     * 20, not the frame's 25.
     *
     * The frame lays its chips out at fixed positions on a 390pt artboard; a
     * real screen has to wrap them, and 25 each side puts "Prefer not to say"
     * at roughly half the usable width on its own. 20 keeps the pill shape and
     * fits noticeably more per line.
     */
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // The gradient is an absolute fill; without this it paints over the radius.
    overflow: 'hidden',
    // A wrap container stretches on the cross axis. A chip should be its own
    // height, not the height of the tallest one sharing its line.
    alignSelf: 'flex-start',
    // Comfortably over the 44pt floor once the 24/12 padding is applied to
    // 24pt of line height, and stated so a shorter label cannot shrink below it.
    minHeight: 48,
  },
  // `#141313` with a hairline border, per the frame — a shade below the cards
  // around it, so an unselected chip recedes rather than competing.
  chipIdle: { backgroundColor: '#141313', borderColor: 'rgba(73,71,71,0.2)' },
  // Opacity only, so the chip keeps its measured width and the row does not
  // re-pack every time the cap is reached or released.
  chipDisabled: { opacity: 0.35 },
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
  cardSection: {
    backgroundColor: EMBER.surfaceMedia,
    borderRadius: EMBER_RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(73,71,71,0.2)',
    // 16 rather than 20: the card already costs the chips inside it 40pt of
    // width against the open sections elsewhere, and work-field labels are the
    // longest in the app. Eight points back is a chip per row.
    padding: 16,
    gap: 20,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardBadge: {
    width: 40,
    height: 40,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: 'rgba(255,144,109,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeadText: { flex: 1, gap: 2 },
  cardTitle: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 18,
    lineHeight: 26,
    color: EMBER.textPrimary,
  },
  cardCaption: { ...EMBER_TYPE.helper, fontSize: 13, lineHeight: 18 },
  cardBody: { gap: 16 },

  section: { gap: 12 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    /*
     * A floor, not a fix. The real guarantee is that callers keep the control
     * mounted and hide it — see `preferences.tsx` — because `transform: scale`
     * on a switch is visual only and its layout height stays platform-dependent,
     * so any number here is a guess. This just stops a section with no control
     * at all from sitting shorter than its neighbours.
     */
    minHeight: 40,
  },
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
