import { useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import Animated from 'react-native-reanimated'

import ScalePress from '../motion/ScalePress'
import { Glyph } from '../ui/Glyph'
import { type IconName } from '../ui/Icon'
import { COLOR, ICON, MATERIAL, PRESS, RADIUS, SIZE, SPACE, TYPE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { tint } from '../../lib/theme'
import { GlyphWell } from './StateScreen'
import { focusRing, font, quickTransition, useBoldText, useIncreaseContrast, useSelection } from './shared'

/** A blocked card dims to 60%, not 45%: its hint is the reason, and it has to stay readable (the RadioCard page). */
const BLOCKED_OPACITY = 0.6

/** The check disc in a selected card's corner: 24 pt, 10 pt in (RadioCard, LookingForCard). */
const CHECK_DISC = 24
const CHECK_INSET = SPACE.sm + SPACE.xxs
const ROW_RADIUS = RADIUS.tile
/** A row's text stops short of the check disc in its corner. */
const ROW_CLEAR = SPACE.md + CHECK_DISC + SPACE.sm
/** The lead card's sentence on the selected fill: white at 80% (Flow 4 `.rc.on span`). */
const ON_FILL_HINT = 0.8

/** The action link's line grown to the 48 pt target, as the DS's other text links (TonightSheet). */
const LINK_SLOP = (SIZE.targetAndroid - TYPE.control.lineHeight) / 2
const FILL = quickTransition('background-color', 'opacity')
const RING_FADE = quickTransition('opacity')

/**
 * The selected mark the choice cards share with the chip's light: a disc in the hue's glyph colour with an ink check that
 * draws itself when the card is picked. Always mounted, so the draw can play: it fades in as the check strokes in, and
 * never plays on mount (a card that opens picked is already marked).
 */
export function CheckDisc({ selected, inset = CHECK_INSET, testID }: { selected: boolean; inset?: number; testID?: string }) {
  const sel = useSelection()
  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.check, { top: inset, right: inset, backgroundColor: sel.glyph, opacity: selected ? 1 : 0 }, RING_FADE]}
    >
      <Glyph name="check" size={ICON.inline} color={COLOR.selectionInk} active play={selected} testID={testID && `${testID}-glyph`} />
    </Animated.View>
  )
}

export type RadioCardProps = {
  title: string
  /**
   * `lead`: the face, title, a value and the sentence down the left edge (Flow 4 `.rc`), for options that show what you
   * would look like. `row`: no face, the title and sentence left in a short row (Flow 4 `.jr`), for the plain answer under
   * a grid of pictures. `center` (the default): the RadioCard page's stack.
   */
  layout?: 'center' | 'lead' | 'row'
  /** A variable value under the title in its own slot, one line, ellipsized: a pseudonym, a first name. Read with the title. */
  detail?: string
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
   * The way out of a blocked `lead` card (Flow 4 audit D-1: "Add a photo"): a link under the sentence, in the hue's
   * glyph colour. Its own element to a screen reader; the card is still read as the blocked radio it is.
   */
  action?: { label: string; onPress: () => void }
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
export function RadioCard({ title, layout = 'center', detail, hint, icon, avatar, selected = false, onPress, disabled = false, deselectable = false, action, previewState, testID }: RadioCardProps) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [focused, setFocused] = useState(false)
  const sel = useSelection()
  const lead = layout === 'lead'
  const row = layout === 'row'
  const hintColor = contrast ? COLOR.textPrimary : !row && lead && selected ? tint(COLOR.textPrimary, ON_FILL_HINT) : COLOR.textSecondary
  // One ring layer, always drawn: the hue's 2 pt ring fades in with the fill; Increase Contrast keeps the 50% hairline when off.
  const ring = selected ? { borderWidth: SPACE.xxs, borderColor: sel.edge, opacity: 1 } : contrast ? { ...styles.contrast, opacity: 1 } : { borderWidth: SPACE.xxs, borderColor: sel.edge, opacity: 0 }

  const choice = {
    accessibilityRole: deselectable ? ('checkbox' as const) : ('radio' as const),
    accessibilityLabel: [title, detail, hint].filter(Boolean).join(', '),
    accessibilityState: { checked: selected, disabled },
  }
  const body = (
    <>
      {icon ? <GlyphWell icon={icon} /> : avatar}
      {row ? (
        <>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.rowTitle} style={[font('rowTitle', bold), styles.ink]}>{title}</Text>
          {hint ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: hintColor }]}>{hint}</Text> : null}
        </>
      ) : lead ? (
        <>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.group} style={[font('group', bold), styles.ink, styles.leadTitle]}>{title}</Text>
          {detail ? (
            <Text testID={testID && `${testID}-detail`} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={MAX_FONT_SCALE.control} style={[font('control', bold), styles.ink, styles.detail]}>
              {detail}
            </Text>
          ) : null}
          {hint ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: hintColor }]}>{hint}</Text> : null}
        </>
      ) : (
        <>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.title]}>{title}</Text>
          {hint ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.center, { color: hintColor }]}>{hint}</Text> : null}
        </>
      )}
    </>
  )
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
        // With an action the card holds two elements, the choice and its link; without, it is the one element.
        accessible={!action}
        {...(action ? null : choice)}
        style={[styles.card, lead && styles.lead, row && styles.row, { backgroundColor: selected ? sel.fill : COLOR.surface, opacity: disabled ? BLOCKED_OPACITY : 1 }, FILL]}
      >
        {action ? (
          <>
            <View accessible {...choice} style={styles.choice}>
              {body}
            </View>
            <Pressable testID={testID && `${testID}-action`} onPress={action.onPress} hitSlop={LINK_SLOP} accessibilityRole="link" style={styles.action}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.control} style={[font('control', bold), { color: sel.glyph }]}>{action.label}</Text>
            </Pressable>
          </>
        ) : (
          body
        )}
        <CheckDisc selected={selected} inset={lead || row ? SPACE.md : CHECK_INSET} testID={testID && `${testID}-check`} />
        <Animated.View testID={testID && `${testID}-ring`} pointerEvents="none" style={[StyleSheet.absoluteFill, row ? styles.rowEdge : styles.edge, ring, RING_FADE]} />
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
  // Flow 4 `.rc`: 4 between the lines, 12 under the face (the gap and 8 more).
  lead: { alignItems: 'flex-start', gap: SPACE.xs },
  // The choice's part of a card with an action: the lead card's own column, the card's width.
  choice: { alignSelf: 'stretch', alignItems: 'flex-start', gap: SPACE.xs },
  // `.addp`: 8 under the sentence (the card's gap and 4 more).
  action: { marginTop: SPACE.xs },
  leadTitle: { marginTop: SPACE.sm },
  // The slot is the card's width (Flow 4 `.rc .ps`), so a long value ellipsizes at the card's edge, not at its own.
  detail: { alignSelf: 'stretch' },
  // Flow 4 `.jr`: 12 by 16 in, radius 20; the right keeps clear of the check disc.
  row: { alignItems: 'flex-start', gap: 0, borderRadius: ROW_RADIUS, paddingVertical: SPACE.md, paddingLeft: SPACE.lg, paddingRight: ROW_CLEAR },
  rowEdge: { borderRadius: ROW_RADIUS },
  ink: { color: COLOR.textPrimary },
  title: { color: COLOR.textPrimary, textAlign: 'center' },
  center: { textAlign: 'center' },
  edge: { borderRadius: RADIUS.sheet },
  contrast: { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast },
  check: {
    position: 'absolute',
    width: CHECK_DISC,
    height: CHECK_DISC,
    borderRadius: RADIUS.capsule,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
