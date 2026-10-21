import { Image, type ImageProps } from 'expo-image'
import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { COLOR, MATERIAL, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { OPACITY, tint } from '../../lib/theme'
import { CheckDisc } from './RadioCard'
import { CONTROL_FONT_CAP, focusRing, font, useBoldText, useIncreaseContrast, useSelection } from './shared'

/** The tile is fixed at 112 pt (the page); its word caps at 1.3× inside it. */
const TILE_HEIGHT = 112
/** The word sits 14 pt in and 12 up, on a scrim from clear at 30% to 78% ink at the foot. */
const WORD_INSET = { left: SPACE.md + SPACE.xxs, bottom: SPACE.md }
const SCRIM_FOOT_ALPHA = 0.78
const SCRIM = `linear-gradient(180deg, ${tint(COLOR.ink, 0)} 30%, ${tint(COLOR.ink, SCRIM_FOOT_ALPHA)} 100%)`
/** The selected ring sits outside the tile, so the photo keeps its full frame. */
const RING_OUT = SPACE.xxs

export type LookingForCardProps = {
  /** The word, and its name for a screen reader: "Friendship". */
  label: string
  /** The photo (`assets/onboarding/looking-*.jpg`). Decorative. */
  image: ImageProps['source']
  selected?: boolean
  onPress?: () => void
  disabled?: boolean
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/**
 * "What brings you to Blend'n?" as photo tiles
 * (guidelines/components/LookingForCard.html): 112 pt, radius 24, the word
 * bottom-left on an ink scrim. Multi-select: on is the 2 pt hue ring
 * outside the tile in the screen's hue, and the check disc. Under 18 the caller does not draw the
 * Dating tile at all (not disabled: a minor never sees it).
 *
 * `H.select` on every change. iOS presses scale 0.97; Android has no ripple
 * (a photo under a ripple reads as a loading error). Increase Contrast: the
 * unselected tile takes the 50% hairline. Reduce Transparency: nothing (a
 * scrim is not glass).
 */
export function LookingForCard({ label, image, selected = false, onPress, disabled = false, previewState, testID }: LookingForCardProps) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const [focused, setFocused] = useState(false)

  return (
    <View style={[styles.slot, previewState === 'pressed' && !android ? styles.pressedIos : null]}>
      <ScalePress
        testID={testID}
        onPress={() => {
          H.select()
          onPress?.()
        }}
        disabled={disabled}
        pressedScale={android ? 1 : PRESS.scale}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        style={disabled && { opacity: OPACITY.disabled }}
      >
        <View testID={testID && `${testID}-tile`} style={styles.tile}>
          <Image source={image} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} />
          <View testID={testID && `${testID}-scrim`} style={[StyleSheet.absoluteFill, { experimental_backgroundImage: SCRIM }]} />
          <Text style={[font('button', bold), styles.word]} maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1}>
            {label}
          </Text>
          <CheckDisc selected={selected} testID={testID && `${testID}-check`} />
          {contrast && !selected ? (
            <View testID={testID && `${testID}-ring`} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.edge, styles.contrast]} />
          ) : null}
        </View>
        {selected ? <View testID={testID && `${testID}-ring`} pointerEvents="none" style={[styles.selected, { borderColor: sel.edge }]} /> : null}
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
  tile: { height: TILE_HEIGHT, borderRadius: RADIUS.sheet, overflow: 'hidden', backgroundColor: COLOR.surface },
  word: { position: 'absolute', ...WORD_INSET, right: WORD_INSET.left, color: COLOR.textPrimary },
  edge: { borderRadius: RADIUS.sheet },
  contrast: { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast },
  selected: {
    position: 'absolute',
    top: -RING_OUT,
    bottom: -RING_OUT,
    left: -RING_OUT,
    right: -RING_OUT,
    borderRadius: RADIUS.sheet + RING_OUT,
    borderWidth: RING_OUT,
  },
})
