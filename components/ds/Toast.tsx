import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useKeyboardContext } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { Glyph } from '../ui/Glyph'
import { type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, MATERIAL, RADIUS, SIZE, SPACE, SPRING, TYPE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast, useScreenReader } from './shared'
import { TAB_BAR_HINT_RISE } from './TabBar'

export type ToastKind = 'success' | 'error' | 'info'

const LOOK: Record<ToastKind, { icon: IconName; tint?: string }> = {
  success: { icon: 'circle-check', tint: COLOR.liveTint },
  error: { icon: 'circle-alert', tint: COLOR.destructiveTint },
  info: { icon: 'info' },
}

/** #19: dwell ≥5 s, +1 s per 8 words, ≥10 s with Undo or a screen reader. */
const DWELL_MS = DURATION.toastDwell
const LONG_DWELL_MS = DURATION.toastDwellAction
const WORDS_PER_EXTRA_SECOND = 8
/** #19: enters from 16 pt away, leaves with an 8 pt drift; a swipe this far or this fast dismisses. */
const ENTER_DISTANCE = 16
const EXIT_DRIFT = 8
const SWIPE_DISTANCE = 24
const SWIPE_VELOCITY = 800

export function toastDwell(text: string, { action = false, screenReader = false }: { action?: boolean; screenReader?: boolean }) {
  const words = text.trim().split(/\s+/).length
  const dwell = DWELL_MS + Math.floor(words / WORDS_PER_EXTRA_SECOND) * 1000
  return action || screenReader ? Math.max(dwell, LONG_DWELL_MS) : dwell
}

/**
 * A timer that can hold: `pause` keeps what is left (once, however many
 * fingers), `resume` runs it out. A longer `ms` (a screen reader found on)
 * extends what is left; nothing else restarts it, a parent's re-render
 * included.
 */
function useDwell(ms: number, onDone: () => void) {
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  const state = useRef({ left: ms, total: ms, since: 0, paused: true, timer: undefined as ReturnType<typeof setTimeout> | undefined })
  const resume = useCallback(() => {
    const s = state.current
    if (!s.paused) return
    s.paused = false
    s.since = Date.now()
    s.timer = setTimeout(() => done.current(), s.left)
  }, [])
  const pause = useCallback(() => {
    const s = state.current
    if (s.paused) return
    s.paused = true
    clearTimeout(s.timer)
    s.left = Math.max(0, s.left - (Date.now() - s.since))
  }, [])
  useEffect(() => {
    const s = state.current
    resume()
    return () => clearTimeout(s.timer)
  }, [resume])
  useEffect(() => {
    const s = state.current
    if (ms === s.total) return
    const running = !s.paused
    pause()
    s.left = Math.max(0, s.left + ms - s.total)
    s.total = ms
    if (running) resume()
  }, [ms, pause, resume])
  return { pause, resume }
}

export type ToastProps = {
  kind?: ToastKind
  text: string
  /** One action, e.g. Undo. A toast is never the only copy of an action. */
  action?: { label: string; onPress: () => void }
  /** Called once it has left: unmount it then. */
  onDismiss: () => void
  /** Android: sit above the floating tab bar. */
  aboveTabBar?: boolean
  /** Android, off the tab roots: the height of the bottom dock or composer to sit above (0 when there is none). */
  dock?: number
  /** Told the toast's laid-out height, so a screen can leave room under it (`useToastInset`). */
  onHeight?: (height: number) => void
  /** No outcome haptic: Copy (C20), or when the action already played one. */
  silent?: boolean
  /** Which outcome haptic to play as it appears; the kind's own when omitted. */
  haptic?: 'success' | 'error'
  testID?: string
}

/**
 * #19: in from 16 pt on `M.snap`, out over `quick`, a swipe its own way to
 * dismiss. `leave` plays the exit once, then calls `onDismiss`.
 */
function useToastMotion(onDismiss: () => void) {
  // The keyboard's own frame (read from the context, not `useReanimatedKeyboardAnimation`, which flips Android's input mode).
  const kb = useKeyboardContext().reanimated
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  /** The side it comes from and leaves by: −1 the top (iOS), +1 the bottom (Android). */
  const side = android ? 1 : -1
  const offset = useSharedValue(reduceMotion ? 0 : side * ENTER_DISTANCE)
  // #19 is "translateY −16 → 0 + fade", and the Toast page "Reduce Motion: a fade in place": it fades in on both platforms.
  const opacity = useSharedValue(0)
  const height = useSharedValue(0)

  useEffect(() => {
    if (!reduceMotion) offset.set(withSpring(0, SPRING.snap))
    // The fade is quicker than the move it rides with (`quick`); under Reduce Motion it is the whole entrance, over `base` (200).
    const fade = { duration: reduceMotion ? motionTokens(true).duration.base : DURATION.quick, easing: Easing.bezier(...EASING.gentle) }
    opacity.set(withTiming(1, fade))
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exit = { duration: motionTokens(reduceMotion).duration.quick, easing: Easing.bezier(...EASING.exit) }
  const [gone, setGone] = useState(false)
  const leave = useCallback(() => {
    if (gone) return
    setGone(true)
    // Outward from wherever it is: a swipe has already moved it.
    if (!reduceMotion) offset.set(withTiming(android ? offset.get() + EXIT_DRIFT : -(height.get() + insets.top + SPACE.sm), exit))
    // Out on both platforms; under Reduce Motion it is the whole exit, in place.
    opacity.set(withTiming(0, exit))
    // `exit` is rebuilt each render from `reduceMotion`, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone, android, reduceMotion, insets.top, offset, opacity, height])

  // `onDismiss` once the exit has played, and never after an unmount.
  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  })
  const exitMs = exit.duration
  useEffect(() => {
    if (!gone) return
    const timer = setTimeout(() => dismiss.current(), exitMs)
    return () => clearTimeout(timer)
  }, [gone, exitMs])

  const swipe = Gesture.Pan()
    .activeOffsetY(side * SPACE.sm)
    .onUpdate((e) => {
      offset.set(side * Math.max(0, side * e.translationY))
    })
    .onEnd((e) => {
      if (side * e.translationY > SWIPE_DISTANCE || side * e.velocityY > SWIPE_VELOCITY) scheduleOnRN(leave)
      else offset.set(withSpring(0, SPRING.snap))
    })

  // On Android the snackbar stands on the keyboard when one is up, frame by frame; the bottom inset is already under it.
  const motion = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: offset.get() - (android ? Math.max(0, -kb.height.get() - insets.bottom) : 0) }],
  }))
  return { leave, swipe, motion, height }
}

/**
 * A toast reports an outcome, never asks a question (guidelines/components/Toast.html).
 * iOS: a toast-tier glass capsule at the top. Android: a raised snackbar at the
 * bottom, above the tab bar when one shows. Mount it to show it; it calls
 * `onDismiss` once it has gone (dwell, swipe or its action).
 *
 * `H.success` / `H.error` as it appears, reporting the server's answer; none for
 * info or when `silent`. A polite live region (an error is assertive, §14),
 * read once; never takes focus. Dwell per #19, held while touched. Swipe up
 * (iOS) or down (Android) dismisses.
 *
 * Motion #19: enters 16 pt on `M.snap` with a fade, leaves over `quick`
 * (iOS slides out as it fades; Android drifts 8 pt). The Toast page says
 * "+ fade" and wins over the general rule that glass never fades. Reduce
 * Motion: no movement, a fade in place on both platforms.
 */
export function Toast({ kind = 'info', text, action, onDismiss, aboveTabBar = false, dock = 0, onHeight, silent = false, haptic, testID }: ToastProps) {
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const screenReader = useScreenReader()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const { leave, swipe, motion, height } = useToastMotion(onDismiss)
  const dwell = useDwell(toastDwell(text, { action: !!action, screenReader }), leave)

  // Success draws its check on the frame the haptic plays: `Glyph` plays on a false → true, so it is lit as the toast mounts.
  const [lit, setLit] = useState(false)
  useEffect(() => {
    const played = haptic ?? (kind === 'info' ? undefined : kind)
    if (!silent && played) H[played]()
    // `Glyph` plays on the edge false → true after mount, so a mounted toast is lit once, on the frame the haptic plays.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLit(true)
    if (!android) AccessibilityInfo.announceForAccessibility(action ? `${text.replace(/[.!?]$/, '')}. ${action.label} is available.` : text)
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const place = android
    ? // Above the bar and above the check-in pill that rises from it (drive 3: the pill covered the snackbar's second line).
      { bottom: insets.bottom + (aboveTabBar ? SPACE.tabBarBottomGapAndroid + SIZE.tabBar + TAB_BAR_HINT_RISE + SPACE.md : dock + SPACE.lg) }
    : { top: insets.top + SPACE.sm }
  const look = LOOK[kind]
  const radius = android ? RADIUS.pressedAndroid : RADIUS.sheet

  const content = (
    <>
      {look.tint ? <View testID={testID && `${testID}-tint`} style={[StyleSheet.absoluteFill, { backgroundColor: look.tint }]} /> : null}
      <Glyph name={look.icon} size={ICON.control} play={kind === 'success' ? lit : undefined} testID={testID && `${testID}-glyph`} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, android ? undefined : FONT_FAMILY.brand[500]), styles.text]}>{text}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
          onPress={() => {
            action.onPress()
            leave()
          }}
        >
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.action, !android && styles.underline]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </>
  )

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        testID={testID}
        accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'}
        onLayout={(e) => {
          height.set(e.nativeEvent.layout.height)
          onHeight?.(e.nativeEvent.layout.height)
        }}
        onTouchStart={dwell.pause}
        onTouchEnd={dwell.resume}
        onTouchCancel={dwell.resume}
        style={[styles.place, place, motion]}
      >
        {android ? (
          <View testID={testID && `${testID}-body`} style={[styles.body, styles.snackbar, { borderRadius: radius }, contrast && IC_HAIRLINE]}>
            {content}
          </View>
        ) : (
          <Material role="toast" style={[styles.body, { borderRadius: radius }, contrast && IC_HAIRLINE]}>
            {content}
          </Material>
        )}
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: SPACE.lg, right: SPACE.lg },
  body: {
    minHeight: SIZE.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    overflow: 'hidden',
  },
  snackbar: {
    backgroundColor: COLOR.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairlineStrong,
    borderTopWidth: 1,
    borderTopColor: MATERIAL.glassSpecular,
  },
  text: { flex: 1, color: COLOR.textPrimary },
  action: { color: COLOR.textPrimary },
  underline: { textDecorationLine: 'underline' },
})
