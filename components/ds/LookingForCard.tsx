import { Image, type ImageProps } from 'expo-image'
import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { COLOR, MATERIAL, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { OPACITY } from '../../lib/theme'
import { PhotoScrim } from '../ui/GradientFill'
import { CheckDisc } from './RadioCard'
import { CONTROL_FONT_CAP, focusRing, font, useBoldText, useIncreaseContrast, useSelection } from './shared'

/** The tile is fixed at 112 pt (the page); its word caps at 1.3× inside it. */
const TILE_HEIGHT = 112
/**
 * The word sits 14 pt in and 12 up, on a scrim from clear at 30% to 78% ink at the foot: the DS PhotoScrim over the
 * lower 70%, a LinearGradient that draws on every architecture (A35: the CSS `experimental_backgroundImage` it was, the
 * audit did not see).
 */
const WORD_INSET = { left: SPACE.md + SPACE.xxs, bottom: SPACE.md }
const SCRIM_FOOT_ALPHA = 0.78
const SCRIM_TOP = '30%'
/** The selected ring sits outside the tile, so the photo keeps its full frame. */
const RING_OUT = SPACE.xxs
/**
 * `tall`: the tile in a page's three-across grid (Flow 4 `.icd`): 132 pt, the word 12 in and 10 up on two lines, the ring
 * inside the tile (a grid has no room for it outside), the check 12 in.
 */
const TALL_HEIGHT = 132
// design-exception: Flow 4's `.icd` tile is radius 20, between rowInCard (16) and sheet (24)
const TALL_RADIUS = 20
const TALL_INSET = { left: SPACE.md, bottom: SPACE.sm + SPACE.xxs }

export type LookingForCardProps = {
  /** The word, and its name for a screen reader: "Friendship". */
  label: string
  /** The photo (`assets/onboarding/looking-*.jpg`). Decorative. */
  image: ImageProps['source']
  selected?: boolean
  /** `tall` for a page's three-across grid (event preferences); `regular` (the default) for onboarding's row. */
  size?: 'regular' | 'tall'
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
export function LookingForCard({ label, image, selected = false, size = 'regular', onPress, disabled = false, previewState, testID }: LookingForCardProps) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const [focused, setFocused] = useState(false)
  const tall = size === 'tall'
  const radius = tall ? TALL_RADIUS : RADIUS.sheet

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
        // Any of them at once, and a second tap clears one: a checkbox, as a deselectable RadioCard is.
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: selected, disabled }}
        style={disabled && { opacity: OPACITY.disabled }}
      >
        <View testID={testID && `${testID}-tile`} style={[styles.tile, tall && styles.tall]}>
          <Image source={image} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} />
          <PhotoScrim testID={testID && `${testID}-scrim`} foot={SCRIM_FOOT_ALPHA} style={styles.scrim} />
          <Text
            style={[tall ? font('control', true) /* Flow 4 `.icd b`: 700 15/20 */ : font('button', bold), styles.word, tall && styles.tallWord]}
            maxFontSizeMultiplier={CONTROL_FONT_CAP}
            numberOfLines={tall ? 2 : 1}
          >
            {label}
          </Text>
          <CheckDisc selected={selected} inset={tall ? SPACE.md : undefined} testID={testID && `${testID}-check`} />
          {contrast && !selected ? (
            <View testID={testID && `${testID}-ring`} pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius }, styles.contrast]} />
          ) : null}
          {selected && tall ? (
            <View testID={testID && `${testID}-ring`} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ringIn, { borderRadius: radius, borderColor: sel.edge }]} />
          ) : null}
        </View>
        {selected && !tall ? <View testID={testID && `${testID}-ring`} pointerEvents="none" style={[styles.selected, { borderColor: sel.edge }]} /> : null}
      </ScalePress>
      {focused || previewState === 'focused'
        ? focusRing(radius).map((r, i) => <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={r} />)
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  slot: { flex: 1 },
  pressedIos: { transform: [{ scale: PRESS.scale }] },
  tile: { height: TILE_HEIGHT, borderRadius: RADIUS.sheet, overflow: 'hidden', backgroundColor: COLOR.surface },
  scrim: { position: 'absolute', top: SCRIM_TOP, bottom: 0, left: 0, right: 0 },
  word: { position: 'absolute', ...WORD_INSET, right: WORD_INSET.left, color: COLOR.textPrimary },
  tall: { height: TALL_HEIGHT, borderRadius: TALL_RADIUS },
  tallWord: { ...TALL_INSET, right: TALL_INSET.left },
  ringIn: { borderWidth: RING_OUT },
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
