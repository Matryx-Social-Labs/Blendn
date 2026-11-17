import { useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Glyph } from '../ui/Glyph'
import { type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, PRESS, RADIUS, SIZE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { OPACITY } from '../../lib/theme'
import { LitFill } from './LitFill'
import { chipRest, focusRing, IC_HAIRLINE, PRESSED_WASH, useGround, useIncreaseContrast } from './shared'


export type IconButtonProps = {
  icon: IconName
  /** The consequence, not the glyph: "Back", "Share", "Saved". */
  accessibilityLabel: string
  onPress?: () => void
  /** `control` on the backdrop; `media` over a hero photo, which must carry its ≥45% dim gradient. */
  tier?: 'control' | 'media'
  /** `sm`: the 40 pt circle of a header row (the Pulse's search, board `.ib`), its target kept at 44 / 48 by slop. */
  size?: 'md' | 'sm'
  /** Set only on a toggle (save, mute): it then plays `H.select` and reads "selected". */
  selected?: boolean
  disabled?: boolean
  accessibilityHint?: string
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/**
 * The glass circle (DESIGN-BRIEF §12, guidelines/components/IconButton.html):
 * 44 pt on iOS, 48 dp on Android, a 24 pt outlined glyph. Navigation (back,
 * close, share) is silent; a toggle plays `H.select` and, when selected, is lit as every positive is (buttons board C, owner
 * 2026-11-17): the tinted gradient disc inside the 1.5 pt gradient rim, a white glyph, playing its verb once (DS #15: Like pops).
 * Over a photo (`media`) the selected disc stays white with an ink glyph: a hue on a photo is not legible (§4.7). Never two
 * touching: 8 pt apart.
 *
 * Press: iOS scales 0.97; Android ripples and squares to a 12 dp corner.
 * Disabled dims the glyph, not the circle: glass never fades (§5.2 rule 6).
 * The circle and its glyph never scale with text.
 *
 * ponytail: Android's corner change is a re-render on press, not a spring
 * (Material is not an animated component); spring it if it reads as a jump.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  tier = 'control',
  size: sizeName = 'md',
  selected,
  disabled = false,
  accessibilityHint,
  previewState,
  testID,
}: IconButtonProps) {
  const android = Platform.OS === 'android'
  const contrast = useIncreaseContrast()
  const [down, setDown] = useState(false)
  const [focused, setFocused] = useState(false)
  const pressed = down || previewState === 'pressed'

  const full = android ? SIZE.circleButtonAndroid : SIZE.circleButton
  const size = sizeName === 'sm' ? SIZE.circleButtonSm : full
  const round = sizeName === 'sm' ? SIZE.circleButtonSm / 2 : android ? RADIUS.circleButtonAndroid : RADIUS.circleButton
  const slop = (full - size) / 2
  const radius = android && pressed ? RADIUS.pressedAndroid : round
  const shape = { width: size, height: size, borderRadius: radius }
  const white = tier === 'media'
  // On a surface card (`GroundProvider value="surface"`) glass has nothing to refract and drew no disc (C20, the request
  // card's "…" on iOS): the circle is solid there, in the card's chip tone, on both platforms.
  const onCard = useGround() === 'surface' && tier === 'control'
  const glyphColor = selected && white ? COLOR.selectionInk : COLOR.textPrimary

  const glyph = (
    <View testID={testID && `${testID}-glyph`} style={disabled && { opacity: OPACITY.disabled }}>
      <Glyph name={icon} color={glyphColor} play={selected} />
    </View>
  )

  return (
    <View style={[shape, pressed && !android ? styles.pressedIos : null]}>
      <ScalePress
        testID={testID}
        onPress={() => {
          if (selected !== undefined) H.select()
          onPress?.()
        }}
        disabled={disabled}
        hitSlop={slop ? { top: slop, bottom: slop, left: slop, right: slop } : undefined}
        pressedScale={android ? 1 : PRESS.scale}
        onPressIn={() => android && setDown(true)}
        onPressOut={() => setDown(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, selected }}
        style={[shape, styles.clip]}
      >
        {/* The disc and the glass swap under the glyph, which stays one mounted node: a glyph remounted by the swap could
            never see `selected` rise, and so never pop. */}
        {selected ? (
          white ? (
            <View testID={testID && `${testID}-selected`} style={[StyleSheet.absoluteFill, styles.selected]} />
          ) : (
            <LitFill radius={radius} testID={testID && `${testID}-selected`} />
          )
        ) : onCard ? (
          <View testID={testID && `${testID}-disc`} style={[StyleSheet.absoluteFill, { backgroundColor: chipRest('surface'), borderRadius: radius }]} />
        ) : (
          <Material role={tier} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />
        )}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          {glyph}
        </View>
        {/* Android's live press is the ripple; the wash stands in for it only in the gallery. */}
        {previewState === 'pressed' && android ? <View style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
        {contrast ? (
          <View
            testID={testID && `${testID}-contrast`}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, IC_HAIRLINE, { borderRadius: radius }]}
          />
        ) : null}
      </ScalePress>
      {focused || previewState === 'focused'
        ? focusRing(round).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  pressedIos: { transform: [{ scale: PRESS.scale }] },
  clip: { overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: COLOR.selectionFill },
  wash: { backgroundColor: PRESSED_WASH.android },
})
