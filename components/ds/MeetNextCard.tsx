import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { Icon } from '../ui/Icon'
import { RadialWash } from '../ui/GradientFill'
import { H } from '../../lib/haptics'
import { Avatar } from './Avatar'
import { type Face } from './Facepile'
import { CONTROL_FONT_CAP, focusRing, font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast, useSelection } from './shared'

/** The card's face (R-A `pick`: a 64 pt creature over the name). */
const CARD_FACE = 64
/** The like under the reason (R-A `pickLike`). */
const LIKE = 40
/** The card's light: rose from the top centre (`.xmc`). */
const WASH = [{ color: COLOR.brandRose, alpha: 0.28, at: [50, 0], size: [80, 60], reach: 0.75 }] as const

/**
 * One of three under "Meet next" (Flow 5 R-A `pick`, 109.7 wide at 393): a lit rose card, the face, the name and one
 * reason (two lines each) and a 40 pt like. The three in a row share the tallest one's height.
 *
 * Tap opens the PersonCard, silently; the heart likes (`onLike`), and a screen reader has it as the card's "Like"
 * action. Liked or matched, the heart is lit and does nothing. Read "{name}, {reason}", then "liked". Name and reason
 * cap at 1.3×. Increase Contrast: the 50% hairline and the reason in white.
 */
export function MeetNextCard({
  face,
  name,
  reason,
  overlap,
  width,
  liked = false,
  onPress,
  onLike,
  previewState,
  testID,
}: {
  face: Face
  name: string
  reason: string
  /**
   * Matching v2's one sentence (Flow 14 · 14.1): when the server sent one it is the reason, in the
   * two lines the card has. Never a score; nothing when there is none.
   */
  overlap?: string | null
  /** 109 three across at 393, 98 at 360. */
  width: number
  liked?: boolean
  onPress?: () => void
  /** The heart. Absent, it is drawn and does nothing (liked, matched, or a like on its way). */
  onLike?: () => void
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const android = Platform.OS === 'android'
  const [focused, setFocused] = useState(false)
  const said = overlap || reason
  return (
    <View testID={testID && `${testID}-scale`} style={[styles.outer, { width }, previewState === 'pressed' && styles.pressed]}>
      <ScalePress
        testID={testID}
        onPress={onPress}
        onLongPress={() => {
          H.longPress()
          onPress?.()
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        pressedScale={android ? 1 : PRESS.scale}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        accessibilityRole="button"
        accessibilityLabel={liked ? `${name}, ${said}, liked` : `${name}, ${said}`}
        accessibilityActions={onLike ? [{ name: 'activate' }, { name: 'like', label: 'Like' }] : undefined}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'like' ? onLike?.() : onPress?.())}
        style={[styles.card, { borderColor: tint(COLOR.selectionRoseGlyph, CARD_EDGE_ALPHA) }, contrast && IC_HAIRLINE]}
      >
        <RadialWash layers={WASH} style={StyleSheet.absoluteFill} />
        <Avatar size={CARD_FACE} testID={testID && `${testID}-face`} {...face} />
        <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('control', bold, FONT_FAMILY.brand[500]), styles.name]}>
          {name}
        </Text>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          style={[font('note', bold), styles.center, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}
        >
          {said}
        </Text>
        <Pressable
          onPress={onLike}
          disabled={!onLike}
          hitSlop={SPACE.xs}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={testID && `${testID}-like`}
          style={[styles.like, { backgroundColor: liked ? sel.edge : sel.fill, borderColor: sel.edge }]}
        >
          <Icon name="heart" size={ICON.control} color={liked ? COLOR.textPrimary : sel.glyph} />
        </Pressable>
      </ScalePress>
      {focused || previewState === 'focused'
        ? focusRing(RADIUS.tile).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </View>
  )
}

/** The card's rim: the rose glyph at 35% (`.xmc` inset 0.5). */
const CARD_EDGE_ALPHA = 0.35

const styles = StyleSheet.create({
  outer: { alignSelf: 'stretch' },
  pressed: { transform: [{ scale: PRESS.scale }] },
  card: {
    flexGrow: 1,
    borderRadius: RADIUS.tile,
    borderWidth: MATERIAL.glassEdge.width,
    backgroundColor: COLOR.surface,
    paddingTop: SPACE.md + SPACE.xxs,
    paddingHorizontal: SPACE.sm,
    paddingBottom: SPACE.md,
    alignItems: 'center',
    gap: SPACE.xs + SPACE.xxs,
    overflow: 'hidden',
  },
  name: { color: COLOR.textPrimary, textAlign: 'center', alignSelf: 'stretch' },
  center: { textAlign: 'center', alignSelf: 'stretch' },
  like: {
    width: LIKE,
    height: LIKE,
    borderRadius: RADIUS.capsule,
    borderWidth: 1,
    marginTop: SPACE.xxs,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
