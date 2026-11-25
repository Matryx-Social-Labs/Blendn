import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import ScalePress from '../motion/ScalePress'
import { Material } from '../ui/Material'
import { COLOR, EASING, FONT_FAMILY, PRESS, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { registerBannerShowing } from '../../lib/inAppBanners'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { IconButton } from './IconButton'
import { NotificationVisual, type NotificationVisualSpec } from './NotificationRow'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useScreenReader } from './shared'

/** It leaves after 4 s (the page), held while touched; never on its own with a screen reader. */
const DWELL_MS = 4000
/** R3 D · 9.1: drops 16 pt; a swipe up this far or this fast dismisses (as the toast). */
const ENTER_DISTANCE = 16
const SWIPE_DISTANCE = 24
const SWIPE_VELOCITY = 800

export type InAppBannerProps = {
  /** `wave` is the one banner with a haptic: `H.arrive` as it lands (R3 D · 9.1). */
  kind?: 'default' | 'wave'
  visual: NotificationVisualSpec
  title: string
  /** One line: "Vinyl Night · now". */
  context: string
  /** Goes where the push would (the wave: the overlay at their card). */
  onPress: () => void
  /** Called once it has left: unmount it then. */
  onDismiss: () => void
  testID?: string
}

/**
 * Drop in, leave up (#44's shape; R3 D · 9.1 for the wave): from 16 pt above,
 * on `M.settle`, the wave over `base`; out over `quick`. Glass never fades
 * (§5.2 rule 6), so iOS moves without a fade; Android's solid tier fades too.
 * Reduce Motion: no movement; Android fades in place, iOS appears and goes.
 */
function useBannerMotion(wave: boolean, onDismiss: () => void) {
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const offset = useSharedValue(reduceMotion ? 0 : -ENTER_DISTANCE)
  const opacity = useSharedValue(android ? 0 : 1)
  const height = useSharedValue(0)
  const { duration } = motionTokens(reduceMotion)

  useEffect(() => {
    if (!reduceMotion) offset.set(wave ? withTiming(0, { duration: duration.base, easing: Easing.bezier(...EASING.entrance) }) : withSpring(0, SPRING.settle))
    if (android) opacity.set(withTiming(1, { duration: duration.base, easing: Easing.bezier(...EASING.entrance) }))
    // Once, as it lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [gone, setGone] = useState(false)
  const leave = useCallback(() => {
    if (gone) return
    setGone(true)
    const exit = { duration: duration.quick, easing: Easing.bezier(...EASING.exit) }
    if (!reduceMotion) offset.set(withTiming(-(height.get() + insets.top + SPACE.sm), exit))
    if (android) opacity.set(withTiming(0, exit))
  }, [gone, reduceMotion, android, duration.quick, insets.top, offset, opacity, height])

  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  })
  const exitMs = reduceMotion && !android ? 0 : duration.quick
  useEffect(() => {
    if (!gone) return
    const timer = setTimeout(() => dismiss.current(), exitMs)
    return () => clearTimeout(timer)
  }, [gone, exitMs])

  const swipe = Gesture.Pan()
    .activeOffsetY(-SPACE.sm)
    .onUpdate((e) => {
      offset.set(Math.min(0, e.translationY))
    })
    .onEnd((e) => {
      if (-e.translationY > SWIPE_DISTANCE || -e.velocityY > SWIPE_VELOCITY) scheduleOnRN(leave)
      else offset.set(withSpring(0, SPRING.snap))
    })

  const motion = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: offset.get() }] }))
  return { leave, swipe, motion, height, gone }
}

/**
 * A notification that lands while you're in the app (guidelines/components/InAppBanner.html,
 * Flow 9 · 9.4): a 56 pt capsule on the toast tier at the top, a 32 pt leading
 * visual, two single lines, no buttons. Tapping it goes where the push would.
 * The wave kind (R3 D · 9.1, a wave while you're checked in with the overlay
 * closed) says who waved; a tap opens their card, where Wave back is.
 *
 * Silent, as the system already buzzed for the push; the wave plays `H.arrive`
 * as it lands, the one banner exception (§21.5, R3). One button, "{title},
 * {context}", announced once, politely. With a screen reader on it never
 * leaves by itself and shows Dismiss. Leaves after 4 s (held while touched) or
 * a swipe up. Text caps at 1.3×: two single lines in a capsule. Increase
 * Contrast: the 50% hairline and the context in white.
 *
 * Its haptic, announcement and entrance play once, on mount: mount one per
 * notification, keyed by it (`key={notification.id}`), so the next one lands
 * as a new banner rather than as new props on the old one.
 */
export function InAppBanner({ kind = 'default', visual, title, context, onPress, onDismiss, testID }: InAppBannerProps) {
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const screenReader = useScreenReader()
  const { leave, swipe, motion, height, gone } = useBannerMotion(kind === 'wave', onDismiss)
  const [held, setHeld] = useState(false)
  if (testID) swipe.withTestId(`${testID}-swipe`)

  // The toast's lane steps down while a banner is up (`lib/inAppBanners`).
  useEffect(() => registerBannerShowing(), [])

  useEffect(() => {
    if (kind === 'wave') H.arrive()
    if (!android) AccessibilityInfo.announceForAccessibility(`${title}, ${context}`)
    // Once, as it lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ponytail: a touch restarts the full dwell on release rather than keeping what was left.
  useEffect(() => {
    if (screenReader || held || gone) return
    const timer = setTimeout(leave, DWELL_MS)
    return () => clearTimeout(timer)
  }, [screenReader, held, gone, leave])

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        testID={testID}
        accessibilityLiveRegion="polite"
        onLayout={(e) => height.set(e.nativeEvent.layout.height)}
        onTouchStart={() => setHeld(true)}
        onTouchEnd={() => setHeld(false)}
        onTouchCancel={() => setHeld(false)}
        style={[styles.place, { top: insets.top + SPACE.sm }, motion]}
      >
        <Material testID={testID && `${testID}-body`} role="toast" style={[styles.body, contrast && IC_HAIRLINE]}>
          <ScalePress
            onPress={() => {
              onPress()
              leave()
            }}
            pressedScale={PRESS.scale}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${context}`}
            style={styles.main}
          >
            <NotificationVisual visual={visual} size={32} ground={COLOR.ink} />
            <View style={styles.text}>
              <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>
                {title}
              </Text>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={CONTROL_FONT_CAP}
                style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}
              >
                {context}
              </Text>
            </View>
          </ScalePress>
          {screenReader ? (
            <IconButton icon="x" accessibilityLabel="Close" onPress={leave} testID={testID && `${testID}-close`} />
          ) : null}
        </Material>
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: SPACE.sm, right: SPACE.sm },
  body: {
    minHeight: SIZE.primary,
    borderRadius: RADIUS.capsule,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingRight: SPACE.lg,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm, paddingLeft: SPACE.md },
  text: { flex: 1 },
  ink: { color: COLOR.textPrimary },
})
