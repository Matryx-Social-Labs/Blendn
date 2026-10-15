import { useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, PRESS, RADIUS, SIZE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { OPACITY } from '../../lib/theme'
import { focusRing, IC_HAIRLINE, PRESSED_WASH, useIncreaseContrast } from './shared'

export type IconButtonProps = {
  icon: IconName
  /** The consequence, not the glyph: "Back", "Share", "Saved". */
  accessibilityLabel: string
  onPress?: () => void
  /** `control` on the backdrop; `media` over a hero photo, which must carry its ≥45% dim gradient. */
  tier?: 'control' | 'media'
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
 * close, share) is silent; a toggle plays `H.select` and, when selected, flips
 * to a white disc with an ink glyph (§4.7). Never two touching: 8 pt apart.
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

  const size = android ? SIZE.circleButtonAndroid : SIZE.circleButton
  const round = android ? RADIUS.circleButtonAndroid : RADIUS.circleButton
  const radius = android && pressed ? RADIUS.pressedAndroid : round
  const shape = { width: size, height: size, borderRadius: radius }

  const glyph = (
    <View testID={testID && `${testID}-glyph`} style={disabled && { opacity: OPACITY.disabled }}>
      <Icon name={icon} color={selected ? COLOR.selectionInk : COLOR.textPrimary} />
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
        {selected ? (
          <View testID={testID && `${testID}-selected`} style={[StyleSheet.absoluteFill, styles.center, styles.selected]}>
            {glyph}
          </View>
        ) : (
          <Material role={tier} style={[StyleSheet.absoluteFill, styles.center, { borderRadius: radius }]}>
            {glyph}
          </Material>
        )}
        {pressed && android ? <View style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
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
