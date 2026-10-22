import { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import ScalePress from '../motion/ScalePress'
import { Glyph } from '../ui/Glyph'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, MATERIAL, PRESS, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { OPACITY, tint } from '../../lib/theme'
import { monoCaption } from './MonoFamily'
import { chipRest, CONTROL_FONT_CAP, focusRing, font, LIGHT, minTarget, PRESSED_WASH, useBoldText, useGround, useIncreaseContrast, useSelection } from './shared'

/** The off chip's edge: a 0.5 pt hairline (1 pt at 50% under Increase Contrast). */
const HAIRLINE = 0.5
/** The selected chip's rim in the hue's edge colour: 1 pt, drawn as the hairline fades out. */
const RIM = 1
/** `outline`: clear, with a 1 pt edge at 22% white (A31: crew tags, overlap labels). */
const OUTLINE_EDGE = {
  borderWidth: 1,
  borderColor: tint(COLOR.textPrimary, 0.22),
} as const

/**
 * DS Flow 10, 10.2: "tag chip · H.select · fill 0 → 1 on quick". The fill crosses over `quick` on the gentle curve, as a CSS
 * transition (Reanimated 4), the way `CountTicks` does: interruptible, off the JS thread, no shared value for a two-state
 * flip. The label's ink steps at t0 (text colour does not cross-fade cleanly); the fill carries the change.
 */
const CURVE = `cubic-bezier(${EASING.gentle.join(', ')})`
// ScalePress is a Reanimated Pressable, so the transition applies; its style prop is typed as a plain ViewStyle.
// The dim at a cap crosses on the same beat (opacity rides the fill's transition).
export const FILL = {
  transition: `background-color ${DURATION.quick}ms ${CURVE}, opacity ${DURATION.quick}ms ${CURVE}`,
} as unknown as ViewStyle
const EDGE_FADE = {
  transition: `opacity ${DURATION.quick}ms ${CURVE}`,
} as unknown as ViewStyle
/**
 * The light (foundations, direction C): on select an absolute layer in the hue's fill slides in from the leading edge, where the
 * glyph is, and on deselect it drains back. Each state's style carries its own `transition`, so the pour and the drain have
 * different curves (CSS transitions, Reanimated 4: off the JS thread, retargeted from the presented value on a quick re-tap,
 * and never played on mount: a chip that mounts selected is already lit). Under Reduce Motion nothing translates: the fill
 * crossfades over the Reduce Motion `quick`.
 */
export const POUR = LIGHT.pour
export const DRAIN = LIGHT.drain
export const POUR_REDUCED = LIGHT.pourReduced
export const DRAIN_REDUCED = LIGHT.drainReduced
/** The + → ✓ slot: the plus fades out as the check fades in and draws itself (`Glyph`); the slot never changes width. */
const SLOT_FADE = {
  transition: `opacity ${DURATION.quick}ms ${CURVE}`,
} as unknown as ViewStyle

const CHEVRON_OPEN_DEG = 180

/** The fold chip's chevron: one `chevron-down` that turns over on `SPRING.snap` as the fold opens (Reduce Motion: it turns at once). */
function MoreChevron({ expanded, testID }: { expanded: boolean; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const turn = useSharedValue(expanded ? CHEVRON_OPEN_DEG : 0)
  useEffect(() => {
    const to = expanded ? CHEVRON_OPEN_DEG : 0
    turn.set(reduceMotion ? to : withSpring(to, SPRING.snap))
  }, [expanded, reduceMotion, turn])
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }))
  return (
    <Animated.View testID={testID} style={style}>
      <Icon name="chevron-down" size={ICON.inline} color={COLOR.textSecondary} />
    </Animated.View>
  )
}

export type ChipVariant = 'default' | 'outline'
/** `single` picks one of a set; `multi` is pick-any and draws the + / ✓ slot. */
export type ChipSelection = 'single' | 'multi'

export type ChipProps = {
  label: string
  /** On: lit in the screen's hue (`HueProvider`), the label unchanged. */
  selected?: boolean
  /** A pick: toggles. `H.select` plays first. */
  onPress?: () => void
  /** A filter: the chip carries × and removes itself. `H.select` plays first. */
  onRemove?: () => void
  /** A 16 pt glyph before the label (in a `multi` chip it is the slot's off glyph, instead of the plus). */
  icon?: IconName
  /** `multi`: a 16 pt slot that is + off and ✓ on, so the chip never changes width (Chip.html, the sweep). */
  selection?: ChipSelection
  /** After the label: a count in Geist Mono. */
  count?: number | string
  /** The fold chip of a ChipSet ("+18 more" / "Show fewer"): a chevron after the label, never selected. */
  kind?: 'more'
  /** With `kind="more"`: the fold is open. */
  expanded?: boolean
  /** The set's cap is reached: 45%, the tap does nothing and plays nothing. Never hidden. */
  dimmed?: boolean
  /** Why it's dimmed, read as the hint ("Up to 10"). */
  capHint?: string
  disabled?: boolean
  /** A read-only interest you share: a 1 pt white outline, no colour, never counted. */
  shared?: boolean
  /** `outline`: no fill, a 1 pt edge at 22% white; read-only labels on a card (A31). */
  variant?: ChipVariant
  /** Read-only only: what it is read as, when that is more than the label ("Jazz, shared"). */
  accessibilityLabel?: string
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/**
 * The chip (DESIGN-BRIEF §12, guidelines/components/Chip.html): one 32 pt
 * capsule for every pick-from-a-set. Off is surface with a hairline; on is lit
 * from behind in the screen's hue: the fill pours in from the glyph, a 1 pt rim
 * fades in, the glyph takes the hue and the label stays white. A cap dims the
 * rest; as a filter it carries ×.
 *
 * `H.select` on every change of state (on, off, × removed); none on a dimmed
 * chip. iOS presses scale 0.97; Android ripples at 12% white and squares the
 * corner to 8 dp. The label caps at 1.3× inside the 32 pt; the target reaches
 * 44 / 48 with slop. Increase Contrast: the off hairline at 1 pt, 50%.
 *
 * With neither `onPress` nor `onRemove` it is read-only: see `InterestChip`.
 */
export function Chip({
  label,
  selected: selectedProp = false,
  onPress,
  onRemove,
  icon,
  selection = 'single',
  count,
  kind,
  expanded = false,
  dimmed = false,
  capHint,
  disabled = false,
  shared = false,
  variant = 'default',
  accessibilityLabel,
  previewState,
  testID,
}: ChipProps) {
  const more = kind === 'more'
  const selected = !more && selectedProp
  const multi = selection === 'multi' && !more
  const ground = useGround()
  const reduceMotion = useReducedMotion()
  const outline = variant === 'outline' && !selected
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [down, setDown] = useState(false)
  const [focused, setFocused] = useState(false)
  const act = onRemove ?? onPress
  const pressed = down || previewState === 'pressed'
  const sel = useSelection()
  const lit = !more && !shared
  const ink = COLOR.textPrimary
  const radius = android && pressed ? RADIUS.thumb : RADIUS.capsule
  const slop = (minTarget() - SIZE.tag) / 2

  // The edge the chip has when it is off; a selected chip keeps it drawn at 0 opacity, so it fades out as the fill comes in.
  const edge = shared
    ? { borderWidth: 1, borderColor: COLOR.textPrimary }
    : contrast
      ? { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast }
      : variant === 'outline'
        ? OUTLINE_EDGE
        : { borderWidth: HAIRLINE, borderColor: COLOR.hairline }

  const body = (
    <>
      {/* Android's live press is the ripple; the wash stands in for it only in the gallery. */}
      {lit ? (
        <Animated.View
          testID={testID && `${testID}-light`}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius, backgroundColor: sel.fill },
            selected ? (reduceMotion ? POUR_REDUCED : POUR) : reduceMotion ? DRAIN_REDUCED : DRAIN,
          ]}
        />
      ) : null}
      {previewState === 'pressed' && android ? <View style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
      {multi ? (
        <View testID={testID && `${testID}-slot`} style={styles.slot16}>
          <Animated.View style={[styles.stack, { opacity: selected ? 0 : 1 }, SLOT_FADE]}>
            <Icon name={icon ?? 'plus'} size={ICON.inline} color={icon ? COLOR.textPrimary : COLOR.textSecondary} />
          </Animated.View>
          <Animated.View
            testID={testID && `${testID}-check`}
            style={[styles.stack, { opacity: selected ? 1 : 0 }, SLOT_FADE]}
          >
            <Glyph name="check" size={ICON.inline} color={sel.glyph} play={selected} testID={testID && `${testID}-check-glyph`} />
          </Animated.View>
        </View>
      ) : icon ? (
        <Glyph name={icon} size={ICON.inline} color={selected ? sel.glyph : ink} active={selected} play={selected} />
      ) : null}
      <Text
        style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.label, { color: ink }]}
        maxFontSizeMultiplier={CONTROL_FONT_CAP}
        numberOfLines={1}
      >
        {label}
      </Text>
      {count !== undefined ? (
        <Text
          testID={testID && `${testID}-count`}
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          style={[
            monoCaption(bold),
            {
              color: COLOR.textSecondary,
            },
          ]}
        >
          {count}
        </Text>
      ) : null}
      {more ? <MoreChevron expanded={expanded} testID={testID && `${testID}-chevron`} /> : null}
      {onRemove ? <Icon name="x" size={ICON.inline} color={ink} /> : null}
      <Animated.View
        testID={testID && `${testID}-edge`}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, edge, { borderRadius: radius, opacity: selected && !shared ? 0 : 1 }, EDGE_FADE]}
      />
      {lit ? (
        <Animated.View
          testID={testID && `${testID}-rim`}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderWidth: RIM, borderColor: sel.edge, borderRadius: radius, opacity: selected ? 1 : 0 },
            EDGE_FADE,
          ]}
        />
      ) : null}
    </>
  )
  const look = [
    styles.chip,
    {
      borderRadius: radius,
      backgroundColor: outline ? 'transparent' : chipRest(ground),
    },
    (dimmed || disabled) && { opacity: OPACITY.disabled },
  ]

  if (!act) {
    return (
      <View testID={testID} accessible accessibilityLabel={accessibilityLabel ?? (shared ? `${label}, shared` : label)} style={look}>
        {body}
      </View>
    )
  }

  return (
    <View style={[styles.slot, pressed && !android ? styles.pressedIos : null]}>
      <ScalePress
        testID={testID}
        onPress={() => {
          H.select()
          act()
        }}
        disabled={dimmed || disabled}
        hitSlop={{ top: slop, bottom: slop, left: 0, right: 0 }}
        pressedScale={android ? 1 : PRESS.scale}
        onPressIn={() => android && setDown(true)}
        onPressOut={() => setDown(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        accessibilityRole="button"
        accessibilityLabel={onRemove ? `${label}, remove filter` : (accessibilityLabel ?? (count !== undefined ? `${label}, ${count}` : label))}
        accessibilityHint={dimmed ? capHint : undefined}
        accessibilityState={{
          selected: onRemove || more ? undefined : selected,
          expanded: more ? expanded : undefined,
          disabled: dimmed || disabled,
        }}
        // Kept under Reduce Motion: a colour change is not movement (animate-expo §9). A read-only chip never changes.
        style={[look, FILL]}
      >
        {body}
      </ScalePress>
      {focused || previewState === 'focused'
        ? focusRing(RADIUS.capsule).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </View>
  )
}

/** A chip read-only on a profile (DESIGN-BRIEF §12 Profile); `shared` outlines an interest you have too. */
export function InterestChip({ label, shared, testID }: { label: string; shared?: boolean; testID?: string }) {
  return <Chip label={label} shared={shared} testID={testID} />
}

const styles = StyleSheet.create({
  slot: { alignSelf: 'flex-start', maxWidth: '100%' },
  slot16: { width: ICON.inline, height: ICON.inline },
  stack: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: ICON.inline,
    height: ICON.inline,
  },
  label: { flexShrink: 1 },
  pressedIos: { transform: [{ scale: PRESS.scale }] },
  chip: {
    height: SIZE.tag,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    overflow: 'hidden',
  },
  wash: { backgroundColor: PRESSED_WASH.android },
})
