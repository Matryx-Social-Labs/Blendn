import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'

import { COLOR, EASING, MATERIAL, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { OPACITY } from '../../lib/theme'
import { focusRing, minTarget, useIncreaseContrast } from './shared'

/*
 * The two switch shapes (the Toggle page; §13). iOS: the 51 × 31 UISwitch,
 * a 27 pt thumb 2 pt in, widening by 5 under the finger. Android: Material's
 * 52 × 32, the thumb 16 off (8 in), 24 on (4 in), 28 pressed (2 in), so its
 * centre sits 16 dp from either end in every state.
 */
const IOS = { width: 51, height: 31, thumb: 27, pressedGrow: 5, inset: 2 } as const
const ANDROID = { width: 52, height: 32, thumbOff: 16, thumbOn: 24, thumbPressed: 28, insetOff: 8, insetOn: 4, insetPressed: 2, outline: 2 } as const

/** The thumb's box and its left edge at each end of the track. */
function geometry(android: boolean, on: boolean, pressed: boolean) {
  if (android) {
    const size = pressed ? ANDROID.thumbPressed : on ? ANDROID.thumbOn : ANDROID.thumbOff
    const x0 = pressed ? ANDROID.insetPressed : ANDROID.insetOff
    const x1 = ANDROID.width - size - (pressed ? ANDROID.insetPressed : ANDROID.insetOn)
    return { width: size, height: size, x0, x1, track: ANDROID }
  }
  const width = IOS.thumb + (pressed ? IOS.pressedGrow : 0)
  return { width, height: IOS.thumb, x0: IOS.inset, x1: IOS.width - width - IOS.inset, track: IOS }
}

const NEVER = ReduceMotion.Never
const COLOUR_EASE = Easing.bezier(...EASING.standard)

export type ToggleProps = {
  value: boolean
  /** Without it the toggle is drawn, not operated: its row (a `SettingsRow`) is the control. */
  onValueChange?: (next: boolean) => void
  /** The row's title: "Event updates". Not needed inside a `SettingsRow`, which is the element. */
  accessibilityLabel?: string
  disabled?: boolean
  /** The finger is down (a `SettingsRow` passes its own press). */
  pressed?: boolean
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/**
 * The switch (DESIGN-BRIEF §12, guidelines/components/Toggle.html; ROUND3
 * F1): on is a white track with an ink thumb, off is the #959090 track with a
 * white thumb. iOS draws the UISwitch's proportions; Android draws Material's,
 * with the outlined off track (the R3 ruling: Android reads as Material).
 *
 * The thumb travels on `M.snap` and the colours cross-fade; Reduce Motion
 * jumps the thumb and keeps the cross-fade. `H.toggle` as it changes (§10.2,
 * a custom switch). Fixed-size: text never scales it. Increase Contrast
 * outlines the iOS off track at 50%; the on track and Android's outline
 * already pass.
 *
 * It lives in a `SettingsRow`, which is the one element a screen reader
 * hears; on its own it is a switch named by `accessibilityLabel`.
 *
 * ponytail: Android's thumb changes size by re-render, not by spring.
 */
export function Toggle({ value, onValueChange, accessibilityLabel, disabled = false, pressed: held = false, previewState, testID }: ToggleProps) {
  const android = Platform.OS === 'android'
  const reduceMotion = useReducedMotion()
  const contrast = useIncreaseContrast()
  const [down, setDown] = useState(false)
  const [focused, setFocused] = useState(false)
  const pressed = held || down || previewState === 'pressed'
  const g = geometry(android, value, pressed)

  const pos = useSharedValue(value ? 1 : 0)
  const tone = useSharedValue(value ? 1 : 0)
  // The last value asked for, not the thumb mid-flight: a flip back before the first frame still lands.
  const target = useRef(value)
  useEffect(() => {
    if (target.current === value) return
    target.current = value
    const to = value ? 1 : 0
    pos.set(reduceMotion ? to : withSpring(to, { ...SPRING.snap, reduceMotion: NEVER }))
    tone.set(withTiming(to, { duration: motionTokens(reduceMotion).duration.quick, easing: COLOUR_EASE, reduceMotion: NEVER }))
  }, [value, reduceMotion, pos, tone])

  const { x0, x1 } = g
  const thumbStyle = useAnimatedStyle(() => ({ left: x0 + (x1 - x0) * pos.get() }))
  const toneStyle = useAnimatedStyle(() => ({ opacity: tone.get() }))

  const { width, height } = g.track
  const round = height / 2
  const off = android
    ? { backgroundColor: 'transparent', borderWidth: ANDROID.outline, borderColor: COLOR.switchOffTrack }
    : { backgroundColor: COLOR.switchOffTrack, ...(contrast ? { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast } : null) }
  const slop = Math.ceil((minTarget() - height) / 2)

  return (
    <View style={{ width, height }}>
      <Pressable
        testID={testID}
        onPress={() => {
          if (!onValueChange) return
          H.toggle(!value)
          onValueChange(!value)
        }}
        disabled={disabled}
        // Without a handler it is drawn by its row, which is the one element and the one focus.
        focusable={!!onValueChange}
        hitSlop={{ top: slop, bottom: slop, left: 0, right: 0 }}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ checked: value, disabled }}
        style={[{ width, height }, disabled && { opacity: OPACITY.disabled }]}
      >
        <View testID={testID && `${testID}-track`} style={[{ width, height, borderRadius: round }, off]} />
        <Animated.View
          testID={testID && `${testID}-on`}
          style={[StyleSheet.absoluteFill, { borderRadius: round, backgroundColor: COLOR.selectionFill }, toneStyle]}
        />
        <Animated.View
          testID={testID && `${testID}-thumb`}
          style={[
            styles.thumb,
            { width: g.width, height: g.height, top: (height - g.height) / 2, borderRadius: g.height / 2 },
            thumbStyle,
          ]}
        >
          <Animated.View
            testID={testID && `${testID}-thumb-ink`}
            style={[StyleSheet.absoluteFill, { borderRadius: g.height / 2, backgroundColor: COLOR.selectionInk }, toneStyle]}
          />
        </Animated.View>
      </Pressable>
      {focused || previewState === 'focused'
        ? focusRing(round).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  thumb: { position: 'absolute', backgroundColor: COLOR.textPrimary },
})
