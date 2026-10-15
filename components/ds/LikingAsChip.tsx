import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, PRESS, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { Avatar } from './Avatar'
import { CrewEmblem } from './CrewEmblem'
import { CONTROL_FONT_CAP, focusRing, font, minTarget, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The emblem or creature inside the 32 pt capsule. */
const FACE = 24

/**
 * Who a like comes from tonight (guidelines/components/LikingAsChip.html, Flow
 * 10 · 10.7): beside "Crews here", a 32 pt raised capsule with the crew's
 * emblem and name, or your creature and "Just me", and a chevron. A tap opens
 * the sheet to switch (the caller's); it changes nothing about who sees you.
 *
 * "Liking as Nebula, button, opens a menu". Opening plays nothing; the switch
 * plays `H.select` where it happens. iOS scales 0.97; Android ripples and
 * squares to 8 dp. The words cap at 1.3× inside the capsule; the target
 * reaches 44 / 48 through slop. Increase Contrast: the 50% hairline.
 */
export function LikingAsChip({
  crew,
  pseudonym,
  onPress,
  previewState,
  testID,
}: {
  /** The crew the like is sent as, or null for "Just me". */
  crew: { name: string; emblemSeed: string } | null
  /** Your pseudonym tonight: its creature stands for "Just me". */
  pseudonym: string
  onPress: () => void
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [down, setDown] = useState(false)
  const [focused, setFocused] = useState(false)
  const pressed = down || previewState === 'pressed'
  const radius = android && pressed ? RADIUS.thumb : RADIUS.capsule
  const slop = (minTarget() - SIZE.tag) / 2
  const name = crew ? crew.name : 'Just me'

  return (
    <View style={[styles.slot, pressed && !android ? styles.pressedIos : null]}>
      <ScalePress
        testID={testID}
        onPress={onPress}
        hitSlop={{ top: slop, bottom: slop, left: 0, right: 0 }}
        pressedScale={android ? 1 : PRESS.scale}
        onPressIn={() => android && setDown(true)}
        onPressOut={() => setDown(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        accessibilityRole="button"
        accessibilityLabel={`Liking as ${name}`}
        accessibilityHint="Opens a menu"
        style={[styles.chip, { borderRadius: radius }]}
      >
        {previewState === 'pressed' && android ? <View style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
        {crew ? (
          <CrewEmblem seed={crew.emblemSeed} size={FACE} testID={testID && `${testID}-emblem`} />
        ) : (
          <Avatar kind="creature" pseudonym={pseudonym} size={FACE} />
        )}
        <Text style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]} maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1}>
          {name}
        </Text>
        <Icon name="chevron-down" size={ICON.inline} color={contrast ? COLOR.textPrimary : COLOR.textSecondary} />
        {contrast ? (
          <View testID={testID && `${testID}-contrast`} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.contrast, { borderRadius: radius }]} />
        ) : null}
      </ScalePress>
      {focused || previewState === 'focused'
        ? focusRing(RADIUS.capsule).map((r, i) => <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={r} />)
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  slot: { alignSelf: 'flex-start' },
  pressedIos: { transform: [{ scale: PRESS.scale }] },
  chip: {
    height: SIZE.tag,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingLeft: SPACE.xs,
    paddingRight: SPACE.md,
    backgroundColor: COLOR.surfaceRaised,
    overflow: 'hidden',
  },
  wash: { backgroundColor: PRESSED_WASH.android },
  ink: { color: COLOR.textPrimary },
  contrast: { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast },
})
