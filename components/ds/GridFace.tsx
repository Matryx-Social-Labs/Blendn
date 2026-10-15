import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { COLOR, FONT_FAMILY, PRESS, SPACE } from '../../lib/design/tokens'
import { Avatar } from './Avatar'
import { FaceMark, type Face } from './Facepile'
import { PresenceDot } from './MonoFamily'
import { CONTROL_FONT_CAP, focusRing, font, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** Someone who checked out stays in the grid at 60% (the page). */
const AWAY = 0.6
/** The live dot sits on the rim, low right: its top at 72% of the face. */
const DOT_AT = 0.72
const DOT = 12

export type GridFaceProps = {
  face: Face
  name: string
  /** One reason ("Both into vinyl"); "Was here" replaces it when they've left. */
  reason: string
  /** The column's width; the face is 16 less. */
  width: number
  here?: boolean
  liked?: boolean
  matched?: boolean
  onPress?: () => void
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/**
 * One face in "Everyone here" (guidelines/components/GridFace.html): a face at
 * the column width less 16, the name and one reason under it. Three marks and
 * nothing else: the live dot at the rim (here now), a white heart disc (you
 * liked them), a white message disc (you matched; the dot gives way). Someone
 * who checked out stays at 60% with "Was here".
 *
 * Tap opens the PersonCard, silently (an arrival is `H.arrive` on the Room).
 * Read "{name}, {reason}, here now", then "liked" or "matched"; "{name}, was
 * here". Name and reason cap at 1.3×, one line each; the face scales with the
 * column, not the text. Increase Contrast: the reason in white.
 */
export function GridFace({ face, name, reason, width, here = true, liked = false, matched = false, onPress, previewState, testID }: GridFaceProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const android = Platform.OS === 'android'
  const [focused, setFocused] = useState(false)
  const size = width - SPACE.lg
  const mark = matched ? 'matched' : liked ? 'liked' : null
  const label = [name, here ? reason : null, here ? 'here now' : 'was here', mark].filter(Boolean).join(', ')

  return (
    <View testID={testID && `${testID}-scale`} style={[{ width }, previewState === 'pressed' && styles.pressed]}>
      <ScalePress
        testID={testID}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        pressedScale={android ? 1 : PRESS.scale}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.cell}
      >
        <View style={{ width: size, height: size }}>
          <View testID={testID && `${testID}-face-wrap`} style={!here && styles.away}>
            <Avatar size={size} testID={testID && `${testID}-face`} {...face} />
          </View>
          {here && !mark ? (
            <View style={[styles.dot, { top: Math.round(size * DOT_AT) }]}>
              <PresenceDot kind="live" size={DOT} ring={COLOR.ink} testID={testID && `${testID}-here`} />
            </View>
          ) : null}
          {focused || previewState === 'focused'
            ? focusRing(size / 2).map((ring, i) => (
                <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
              ))
            : null}
        </View>
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.name]}>
          {name}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          style={[font('caption', bold), styles.center, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}
        >
          {here ? reason : 'Was here'}
        </Text>
        {mark ? (
          <View style={styles.mark}>
            <FaceMark kind={mark} testID={testID && `${testID}-mark`} />
          </View>
        ) : null}
      </ScalePress>
    </View>
  )
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: PRESS.scale }] },
  cell: { alignItems: 'center', gap: SPACE.xs },
  away: { opacity: AWAY },
  dot: { position: 'absolute', right: 0 },
  name: { color: COLOR.textPrimary, textAlign: 'center', alignSelf: 'stretch' },
  center: { textAlign: 'center', alignSelf: 'stretch' },
  mark: { position: 'absolute', top: SPACE.xs, right: SPACE.xs },
})
