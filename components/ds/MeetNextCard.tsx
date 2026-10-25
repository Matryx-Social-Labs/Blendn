import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { COLOR, FONT_FAMILY, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Avatar } from './Avatar'
import { FaceMark, type Face } from './Facepile'
import { CONTROL_FONT_CAP, focusRing, font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The card's height (the page): it grows past it only when 1.3× text needs the room. */
const CARD_HEIGHT = 164

/**
 * One of three suggestions under "Meet next" (guidelines/components/MeetNextCard.html):
 * a 164 pt surface card at radius 16, the face at the card's width less 32, the
 * name and one reason. A liked face keeps its heart across shuffles.
 *
 * Tap opens the PersonCard, silently; the shuffle (#52) is the row's. Read
 * "{name}, {reason}", then "liked". Name and reason cap at 1.3×. Increase
 * Contrast: the 50% hairline and the reason in white.
 */
export function MeetNextCard({
  face,
  name,
  reason,
  overlap,
  width,
  liked = false,
  onPress,
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
  /** 110 three across at 402, 96 at 360. */
  width: number
  liked?: boolean
  onPress?: () => void
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const android = Platform.OS === 'android'
  const [focused, setFocused] = useState(false)
  const said = overlap || reason

  return (
    <View testID={testID && `${testID}-scale`} style={[{ width }, previewState === 'pressed' && styles.pressed]}>
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
        style={[styles.card, { width }, contrast && IC_HAIRLINE]}
      >
        <Avatar size={width - SPACE.xxl} testID={testID && `${testID}-face`} {...face} />
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.name]}>
          {name}
        </Text>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          style={[font('caption', bold), styles.center, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}
        >
          {said}
        </Text>
        {liked ? (
          <View style={styles.mark}>
            <FaceMark kind="liked" testID={testID && `${testID}-mark`} />
          </View>
        ) : null}
      </ScalePress>
      {focused || previewState === 'focused'
        ? focusRing(RADIUS.rowInCard).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: PRESS.scale }] },
  card: {
    minHeight: CARD_HEIGHT,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    padding: SPACE.sm,
    alignItems: 'center',
    gap: SPACE.xs,
    overflow: 'hidden',
  },
  name: { color: COLOR.textPrimary, textAlign: 'center', alignSelf: 'stretch' },
  center: { textAlign: 'center' },
  mark: { position: 'absolute', top: SPACE.xs, right: SPACE.xs },
})
