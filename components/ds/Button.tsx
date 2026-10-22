import { useEffect, useState, type ReactNode } from 'react'
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'

import ScalePress from '../motion/ScalePress'
import { GradientFill } from '../ui/GradientFill'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, MATERIAL, PRESS, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Logger } from '../../lib/logger'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { OPACITY } from '../../lib/theme'
import { Spinner } from './Loader'
import { RollingNumber } from './RollingNumber'
import {
  CONTROL_FONT_CAP,
  focusRing,
  font,
  IC_HAIRLINE,
  minTarget,
  PRESSED_WASH,
  pourStyles,
  quickTransition,
  SPINNER_GRACE_MS,
  useBoldText,
  useIncreaseContrast,
  useSelection,
  type Selection,
} from './shared'

export type ButtonKind = 'primary' | 'lit' | 'strong' | 'secondary' | 'tertiary' | 'destructive'
export type ButtonSize = 'lg' | 'md' | 'sm' | 'raised'

/**
 * 56 the screen primary and dock actions · 48 a secondary in a dock · 36 an
 * inline row action · 44 `raised`, a secondary on `surfaceRaised` inside a card
 * (A31: the crew strip's action). Under the 44 / 48 target, slop reaches it.
 */
export const ROW_ACTION_HEIGHT = 36
const RAISED_HEIGHT = 44
const ROW_ACTION_MIN_WIDTH = 72
const HEIGHT: Record<ButtonSize, number> = { lg: SIZE.primary, md: SIZE.control, sm: ROW_ACTION_HEIGHT, raised: RAISED_HEIGHT }

/** #20: translateX 0, −8, 8, −6, 6, −3, 0, as fractions of `SHAKE.distance`. */
const SHAKE_STEPS = [-1, 1, -0.75, 0.75, -0.375, 0]
const PRESS_SPRING = { ...SPRING.press, reduceMotion: ReduceMotion.Never }
const DISABLE_FADE = quickTransition('opacity')
/** The lit button's flare: poured in from the leading edge over `press` on `snapOut` (down, or busy), drained over `quick`. */
const FLARE = pourStyles(DURATION.press, DURATION.press, EASING.snapOut)
/** The lit button's rim, as the selected chip's: 1 pt in the hue's edge. */
const LIT_RIM = 1
/** `lg` is the primary's 56 pt; a lit action is a row action (36) or a card / dock action (44, 48). */
const LIT_LG_WARNING = 'Button kind="lit" is never size="lg": 56 pt is the primary’s'
let warnedLitLg = false

function fill(kind: ButtonKind, size: ButtonSize, onGlass: boolean, sel: Selection) {
  if (kind === 'lit') return sel.fill
  if (kind === 'strong') return COLOR.textPrimary
  if (kind === 'destructive') return COLOR.destructiveFill
  if (kind === 'secondary') return onGlass ? MATERIAL.fillOnGlass : size === 'sm' || size === 'raised' ? COLOR.surfaceRaised : COLOR.surface
  return 'transparent'
}

/** Kinds that play a haptic on press-in (§10.2): the screen's one primary, and the destructive button in a confirm. `lit` is silent: a caller that wants one names it (`pressHaptic`). */
const PRESS_HAPTIC: Partial<Record<ButtonKind, () => void>> = { primary: () => H.primary(), destructive: () => H.destructive() }

/** A value once it has stopped changing for `DURATION.medium`: what a screen reader is told of a count that is still rolling. */
function useSettled(value: number | undefined) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (value === settled) return
    const timer = setTimeout(() => setSettled(value), DURATION.medium)
    return () => clearTimeout(timer)
  }, [value, settled])
  // The first number has nothing rolling to wait for: it is spoken at once.
  return value === undefined ? undefined : (settled ?? value)
}

/** The 300 ms grace before a busy control swaps its label for a spinner. */
export function useGrace(loading: boolean) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => setShown(true), SPINNER_GRACE_MS)
    return () => {
      clearTimeout(timer)
      setShown(false)
    }
  }, [loading])
  return loading && shown
}

/** #20 when `refused` turns on: `H.error` at t0 and the shake, which Reduce Motion stops. */
function useRefusal(refused: boolean) {
  const reduceMotion = useReducedMotion()
  const offset = useSharedValue(0)
  useEffect(() => {
    if (!refused) return
    H.error()
    const { distance, duration } = motionTokens(reduceMotion).shake
    if (!distance) return
    const step = { duration: duration / SHAKE_STEPS.length }
    offset.set(withSequence(...SHAKE_STEPS.map((f) => withTiming(f * distance, step))))
  }, [refused, reduceMotion, offset])
  return useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }))
}

export type ButtonProps = {
  label: string
  onPress?: () => void
  kind?: ButtonKind
  size?: ButtonSize
  /**
   * A price after the label, in Geist Mono (Flow 12: "Start Blend’n+ — ₹199 / month"). The label is the words
   * before it; pass `accessibilityLabel` with the whole thing, since the price is not part of `label`.
   */
  price?: { amount: string; per?: string }
  /**
   * A number inside the label ("Show {n} places"): `label` holds `{n}`, the words before it, the count rolling in
   * Geist Mono (grouped, "6,422"), then the words after. Read as the whole sentence, once the number has settled.
   */
  count?: number
  /** A leading glyph: 20 pt, 16 at `sm` and `raised`. */
  icon?: IconName
  /** A leading mark that is not a glyph, in its place: a crew's emblem on "Like for Nebula" (R2-D1). Decorative. */
  leading?: ReactNode
  disabled?: boolean
  /** Busy: the label stays (for width, and as the name read), a spinner covers it after 300 ms. */
  loading?: boolean
  /** The server said no (#20): a destructive border, the shake and `H.error`, when it turns on. */
  refused?: boolean
  /** A tertiary that is not the page's own voice (Remove friend, Reset link): its label in `textSecondary`, as the frames draw it. */
  muted?: boolean
  /** A secondary sitting on glass (a sheet, a dock): 8% white instead of `surface` (no glass on glass). */
  onGlass?: boolean
  /**
   * `false` when the action's own outcome haptic follows within ~1 s (I'm going, §10.2);
   * a vocabulary cue to play on press-in instead of the kind's own, where a page names one
   * (H.primary on a strong "Use at the door", H.select on Extend).
   */
  pressHaptic?: boolean | (() => void)
  /**
   * Only when the label alone is ambiguous on its screen ("Accept" on a list of requests, "Ask to join,
   * Velvet Heron"): who it is for. It must start with the label (WCAG 2.5.3).
   */
  accessibilityLabel?: string
  accessibilityHint?: string
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
  /** Placement only (`alignSelf`, `flex`); never the look. A small button hugs its label (`flex-start`) unless this sets an `alignSelf`. */
  style?: StyleProp<ViewStyle>
}

/**
 * The button (DESIGN-BRIEF §12, guidelines/components/Button.html).
 *
 * - `primary`: the gradient fill, white label. One per screen (§4.7).
 * - `lit`: a positive action inside a hue world (`HueProvider`): the hue's fill, a 1 pt rim in its edge, a white 700 label, the
 *   glyph in its light tone. Press-in pours the flare in from the leading edge, and a busy button holds it. Never `lg`.
 * - `strong`: white with an ink label, only where there is no world (system screens) and over a photo.
 * - `secondary`: `surface`, 8% white on glass. `tertiary`: text.
 * - `destructive`: `destructiveFill`, never the text red.
 *
 * Press: iOS scales to 0.97 on `M.press`; Android ripples and squares off to a
 * 12 dp corner on the same spring, without scaling (the page). Disabled dims to
 * 45%. Text caps at 1.3× inside the fixed height; past that the label wraps to
 * a second line on Android only. Increase Contrast adds the 50% hairline to
 * secondary and tertiary; Bold Text steps the label to 900.
 */
export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 'lg',
  icon,
  price,
  count,
  leading,
  disabled = false,
  loading = false,
  refused = false,
  onGlass = false,
  muted = false,
  pressHaptic = true,
  accessibilityLabel,
  accessibilityHint,
  previewState,
  testID,
  style,
}: ButtonProps) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const spinner = useGrace(loading)
  const reduceMotion = useReducedMotion()
  const sel = useSelection()
  const [down, setDown] = useState(false)
  const shake = useRefusal(refused)
  const [focused, setFocused] = useState(false)

  const height = HEIGHT[size]
  const round = height / 2
  const pressed = previewState === 'pressed'
  /** Android squares off while pressed and while busy (the page); iOS stays round. */
  const rest = android && (pressed || loading) ? RADIUS.pressedAndroid : round
  const radius = useSharedValue(rest)
  useEffect(() => {
    if (android) radius.set(withSpring(rest, PRESS_SPRING))
  }, [android, rest, radius])
  const shape = useAnimatedStyle(() => ({ borderRadius: radius.get() }))
  // ScalePress draws an Animated Pressable, which takes an animated style; its prop is typed as the plain one.
  const pressShape = shape as unknown as ViewStyle
  const squareOff = (to: number) => () => {
    if (android) radius.set(withSpring(to, PRESS_SPRING))
  }
  const lit = kind === 'lit'
  useEffect(() => {
    if (!lit || size !== 'lg' || warnedLitLg || !__DEV__) return
    warnedLitLg = true
    Logger.warn('general', LIT_LG_WARNING)
  }, [lit, size])
  const flareIn = down || loading || pressed
  const flare = reduceMotion ? (flareIn ? FLARE.pourReduced : FLARE.drainReduced) : flareIn ? FLARE.pour : FLARE.drain

  const ink = kind === 'strong' ? COLOR.ink : muted && kind === 'tertiary' ? COLOR.textSecondary : lit ? COLOR.textPrimary : COLOR.textOnGradient
  const glyphInk = lit ? sel.glyph : ink
  const sm = size === 'sm'
  /** Small glyphs: the row action and the raised action. */
  const compact = sm || size === 'raised'
  const slop = (minTarget() - height) / 2
  // A small text button has no fill to pad: its label sits on the gutter, and the hit area reaches out past it instead.
  const textOnly = sm && kind === 'tertiary'
  const labelFont = sm ? font('meta', bold, FONT_FAMILY.brand[700]) : font('button', bold)
  const outlined = contrast && (kind === 'secondary' || kind === 'tertiary')
  const settled = useSettled(count)
  const [before, after = ''] = count === undefined ? [label, ''] : label.split('{n}')
  // The sentence a screen reader gets: the number formatted in, and only once it has stopped changing.
  const sentence = settled === undefined ? label : label.replace('{n}', settled.toLocaleString('en-US'))

  return (
    <Animated.View style={[sm && !StyleSheet.flatten(style)?.alignSelf ? styles.inline : null, pressed && !android ? styles.pressedIos : null, shake, style]}>
      <ScalePress
        testID={testID}
        onPress={onPress}
        disabled={disabled || loading}
        // Under the 44 / 48 target, slop reaches it, above and below only (pills sit side by side).
        hitSlop={textOnly ? { top: Math.max(slop, 0), bottom: Math.max(slop, 0), left: SPACE.lg, right: SPACE.lg } : slop > 0 ? { top: slop, bottom: slop } : undefined}
        haptic={typeof pressHaptic === 'function' ? pressHaptic : pressHaptic ? PRESS_HAPTIC[kind] : undefined}
        pressedScale={android ? 1 : PRESS.scale}
        onPressIn={() => {
          setDown(true)
          squareOff(RADIUS.pressedAndroid)()
        }}
        onPressOut={() => {
          setDown(false)
          squareOff(rest)()
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? sentence}
        accessibilityLiveRegion={count === undefined ? undefined : 'polite'}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, busy: loading }}
        style={[
          styles.body,
          textOnly ? styles.bodyText : sm ? styles.bodySm : styles.bodyLg,
          { height, backgroundColor: fill(kind, size, onGlass, sel) },
          // Enabled ↔ disabled crosses over `quick` (a count arriving, a field becoming valid), never snaps.
          { opacity: disabled ? OPACITY.disabled : 1 },
          DISABLE_FADE,
          pressShape,
        ]}
      >
        {kind === 'primary' ? <GradientFill style={StyleSheet.absoluteFill} /> : null}
        {lit ? (
          // The flare sits under the label, inside the pill's own corner: the clip follows the pill as Android squares it off.
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, shape]}>
            <Animated.View testID={testID && `${testID}-flare`} style={[StyleSheet.absoluteFill, { backgroundColor: sel.flare }, flare]} />
          </Animated.View>
        ) : null}
        {pressed && android ? <View style={[StyleSheet.absoluteFill, { backgroundColor: PRESSED_WASH.android }]} /> : null}
        <View style={[styles.content, spinner && styles.hidden]}>
          {leading ?? (icon ? <Icon name={icon} size={compact ? ICON.inline : ICON.control} color={glyphInk} /> : null)}
          {count !== undefined ? (
            // A rolling number is a row of columns, not a run of text: the sentence is a row, a word space apart.
            <View style={styles.sentence}>
              {before.trim() ? (
                <Text style={[labelFont, { color: ink }]} maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1}>
                  {before.trim()}
                </Text>
              ) : null}
              <RollingNumber value={count} role="button" grouping color={ink} testID={testID && `${testID}-count`} />
              {after.trim() ? (
                <Text style={[labelFont, { color: ink }]} maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1}>
                  {after.trim()}
                </Text>
              ) : null}
            </View>
          ) : (
          <Text
            style={[labelFont, { color: ink }]}
            maxFontSizeMultiplier={CONTROL_FONT_CAP}
            numberOfLines={android ? 2 : 1}
          >
            {before}
            {price ? (
              <>
                {' '}
                <Text style={[font('button', bold, FONT_FAMILY.mono[700]), { fontVariant: ['tabular-nums'] }]}>{price.amount}</Text>
                {price.per ? <Text style={font('meta', bold, FONT_FAMILY.brand[400])}>{` ${price.per}`}</Text> : null}
              </>
            ) : null}
          </Text>
          )}
        </View>
        {spinner ? (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <Spinner testID={testID && `${testID}-spinner`} size={compact ? 16 : 20} dark={kind === 'strong'} color={lit ? sel.glyph : undefined} />
          </View>
        ) : null}
        {lit ? (
          <Animated.View
            testID={testID && `${testID}-rim`}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderWidth: LIT_RIM, borderColor: sel.edge }, shape]}
          />
        ) : null}
        {outlined || (refused && kind !== 'tertiary') ? (
          <Animated.View
            testID={testID && `${testID}-${refused ? 'refused' : 'contrast'}`}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, refused ? styles.refused : IC_HAIRLINE, shape]}
          />
        ) : null}
      </ScalePress>
      {focused || previewState === 'focused'
        ? focusRing(round).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  inline: { alignSelf: 'flex-start' },
  pressedIos: { transform: [{ scale: PRESS.scale }] },
  body: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bodyLg: { paddingHorizontal: SPACE.lg },
  bodySm: { paddingHorizontal: SPACE.lg, minWidth: ROW_ACTION_MIN_WIDTH },
  bodyText: { paddingHorizontal: 0 },
  content: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  sentence: { flexDirection: 'row', alignItems: 'center', columnGap: SPACE.xs },
  hidden: { opacity: 0 },
  clip: { overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  refused: { borderWidth: SPACE.xxs, borderColor: COLOR.destructive },
})
