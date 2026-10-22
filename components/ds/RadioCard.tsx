import { useState, type ReactNode } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import Animated from 'react-native-reanimated'

import ScalePress from '../motion/ScalePress'
import { Glyph } from '../ui/Glyph'
import { type IconName } from '../ui/Icon'
import { COLOR, ICON, MATERIAL, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { GlyphWell } from './StateScreen'
import { focusRing, font, quickTransition, useBoldText, useIncreaseContrast, useSelection } from './shared'

/** A blocked card dims to 60%, not 45%: its hint is the reason, and it has to stay readable (the RadioCard page). */
const BLOCKED_OPACITY = 0.6

/** The check disc in a selected card's corner: 24 pt, 10 pt in (RadioCard, LookingForCard). */
const CHECK_DISC = 24
const CHECK_INSET = SPACE.sm + SPACE.xxs

const FILL = quickTransition('background-color', 'opacity')
const RING_FADE = quickTransition('opacity')

/**
 * The selected mark the choice cards share with the chip's light: a disc in the hue's glyph colour with an ink check that
 * draws itself when the card is picked. Always mounted, so the draw can play: it fades in as the check strokes in, and
 * never plays on mount (a card that opens picked is already marked).
 */
export function CheckDisc({ selected, testID }: { selected: boolean; testID?: string }) {
  const sel = useSelection()
  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.check, { backgroundColor: sel.glyph, opacity: selected ? 1 : 0 }, RING_FADE]}
    >
      <Glyph name="check" size={ICON.inline} color={COLOR.selectionInk} active play={selected} testID={testID && `${testID}-glyph`} />
    </Animated.View>
  )
}

export type RadioCardProps = {
  title: string
  /** The consequence: what happens if you pick it. Read with the title. */
  hint?: string
  /** The glyph form (a 56 pt well) when the option has no face. */
  icon?: IconName
  /** The option's face, when it has one: an `<Avatar>`. */
  avatar?: ReactNode
  selected?: boolean
  onPress?: () => void
  /** Blocked, with the reason as `hint`. */
  disabled?: boolean
  /**
   * A tap on the selected card is a change too (it clears the choice): the caller holds a set, not exactly
   * one. It then reads as a checkbox, since "exactly one" no longer holds, and plays `H.select` both ways.
   */
  deselectable?: boolean
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/**
 * A choice between two or three things that each deserve a picture and a
 * consequence (guidelines/components/RadioCard.html): a surface card, radius
 * 24, the face or glyph, the title, the sentence. Selected is the 2 pt ring in
 * the screen's hue, the card's fill stepping to the hue's fill, and the check disc. Exactly one in a group is selected: the caller
 * holds it.
 *
 * `H.select` on a change; none on the selected card (unless `deselectable`, where tapping it clears it) or
 * a blocked one. iOS
 * presses scale 0.97; Android has no ripple and no scale (the ring is the
 * feedback, §13). The card grows with its text. Increase Contrast: the
 * unselected card takes the 50% hairline and the consequence goes white.
 */
export function RadioCard({ title, hint, icon, avatar, selected = false, onPress, disabled = false, deselectable = false, previewState, testID }: RadioCardProps) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [focused, setFocused] = useState(false)
  const sel = useSelection()
  // One ring layer, always drawn: the hue's 2 pt ring fades in with the fill; Increase Contrast keeps the 50% hairline when off.
  const ring = selected ? { borderWidth: SPACE.xxs, borderColor: sel.edge, opacity: 1 } : contrast ? { ...styles.contrast, opacity: 1 } : { borderWidth: SPACE.xxs, borderColor: sel.edge, opacity: 0 }

  return (
    <View style={[styles.slot, previewState === 'pressed' && !android ? styles.pressedIos : null]}>
      <ScalePress
        testID={testID}
        onPress={() => {
          if (selected && !deselectable) return
          H.select()
          onPress?.()
        }}
        disabled={disabled}
        // Dimmed as one layer: Android otherwise fades each child on its own, and the surface well on the surface card
        // showed as a darker disc that iOS and the design do not draw (r7 L7).
        needsOffscreenAlphaCompositing={disabled}
        pressedScale={android ? 1 : PRESS.scale}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole={deselectable ? 'checkbox' : 'radio'}
        accessibilityLabel={hint ? `${title}, ${hint}` : title}
        accessibilityState={{ checked: selected, disabled }}
        style={[styles.card, { backgroundColor: selected ? sel.fill : COLOR.surface, opacity: disabled ? BLOCKED_OPACITY : 1 }, FILL]}
      >
        {icon ? <GlyphWell icon={icon} /> : avatar}
        <Text style={[font('bodyStrong', bold), styles.title]}>{title}</Text>
        {hint ? <Text style={[font('caption', bold), styles.center, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{hint}</Text> : null}
        <CheckDisc selected={selected} testID={testID && `${testID}-check`} />
        <Animated.View testID={testID && `${testID}-ring`} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.edge, ring, RING_FADE]} />
      </ScalePress>
      {focused || previewState === 'focused'
        ? focusRing(RADIUS.sheet).map((r, i) => <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={r} />)
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  slot: { flex: 1 },
  pressedIos: { transform: [{ scale: PRESS.scale }] },
  card: {
    // Grows to the slot (the taller card in the row), never shrinks below its content: `flex: 1` gave it a zero
    // basis in an auto-height row and collapsed it to its padding, the well and words spilling out (Board drive).
    flexGrow: 1,
    borderRadius: RADIUS.sheet,
    padding: SPACE.lg,
    alignItems: 'center',
    gap: SPACE.sm,
  },
  title: { color: COLOR.textPrimary, textAlign: 'center' },
  center: { textAlign: 'center' },
  edge: { borderRadius: RADIUS.sheet },
  contrast: { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast },
  check: {
    position: 'absolute',
    top: CHECK_INSET,
    right: CHECK_INSET,
    width: CHECK_DISC,
    height: CHECK_DISC,
    borderRadius: RADIUS.capsule,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
