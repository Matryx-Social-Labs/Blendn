import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, PRESS, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { OPACITY } from '../../lib/theme'
import { CONTROL_FONT_CAP, focusRing, font, minTarget, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The off chip's edge: a 0.5 pt hairline (1 pt at 50% under Increase Contrast). */
const HAIRLINE = 0.5

export type ChipProps = {
  label: string
  /** On: white with ink type, the one selection colour (§4.7). */
  selected?: boolean
  /** A pick: toggles. `H.select` plays first. */
  onPress?: () => void
  /** A filter: the chip carries × and removes itself. `H.select` plays first. */
  onRemove?: () => void
  /** A 16 pt glyph before the label. */
  icon?: IconName
  /** The set's cap is reached: 45%, the tap does nothing and plays nothing. Never hidden. */
  dimmed?: boolean
  /** Why it's dimmed, read as the hint ("Up to 10"). */
  capHint?: string
  disabled?: boolean
  /** A read-only interest you share: a 1 pt white outline, no colour, never counted. */
  shared?: boolean
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/**
 * The chip (DESIGN-BRIEF §12, guidelines/components/Chip.html): one 32 pt
 * capsule for every pick-from-a-set. Off is surface with a hairline; on is
 * white with ink type. A cap dims the rest; as a filter it carries ×.
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
  selected = false,
  onPress,
  onRemove,
  icon,
  dimmed = false,
  capHint,
  disabled = false,
  shared = false,
  previewState,
  testID,
}: ChipProps) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [down, setDown] = useState(false)
  const [focused, setFocused] = useState(false)
  const act = onRemove ?? onPress
  const pressed = down || previewState === 'pressed'
  const ink = selected ? COLOR.selectionInk : COLOR.textPrimary
  const radius = android && pressed ? RADIUS.thumb : RADIUS.capsule
  const slop = (minTarget() - SIZE.tag) / 2

  const edge = shared
    ? { borderWidth: 1, borderColor: COLOR.textPrimary }
    : selected
      ? null
      : contrast
        ? { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast }
        : { borderWidth: HAIRLINE, borderColor: COLOR.hairline }

  const body = (
    <>
      {/* Android's live press is the ripple; the wash stands in for it only in the gallery. */}
      {previewState === 'pressed' && android ? <View style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
      {icon ? <Icon name={icon} size={ICON.inline} color={ink} /> : null}
      <Text style={[font('meta', bold, FONT_FAMILY.brand[500]), { color: ink }]} maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? <Icon name="x" size={ICON.inline} color={ink} /> : null}
      {edge ? <View testID={testID && `${testID}-edge`} pointerEvents="none" style={[StyleSheet.absoluteFill, edge, { borderRadius: radius }]} /> : null}
    </>
  )
  const look = [
    styles.chip,
    { borderRadius: radius, backgroundColor: selected ? COLOR.selectionFill : COLOR.surface },
    (dimmed || disabled) && { opacity: OPACITY.disabled },
  ]

  if (!act) {
    return (
      <View testID={testID} accessible accessibilityLabel={shared ? `${label}, shared` : label} style={look}>
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
        accessibilityLabel={onRemove ? `${label}, remove filter` : label}
        accessibilityHint={dimmed ? capHint : undefined}
        accessibilityState={{ selected: onRemove ? undefined : selected, disabled: dimmed || disabled }}
        style={look}
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
  slot: { alignSelf: 'flex-start' },
  pressedIos: { transform: [{ scale: PRESS.scale }] },
  chip: {
    height: SIZE.tag,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    overflow: 'hidden',
  },
  wash: { backgroundColor: PRESSED_WASH.android },
})
