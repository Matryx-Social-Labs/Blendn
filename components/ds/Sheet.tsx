import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, EASING, MATERIAL, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { KEYBOARD_BEHAVIOR } from '../../lib/keyboard'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { Button, type ButtonKind } from './Button'
import { font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from './shared'

export type Detent = 'short' | 'medium' | 'tall'

/** Fractions of the screen (the Sheet page). */
const DETENT: Record<Detent, number> = { short: 0.34, medium: 0.56, tall: 0.92 }
/** The fixed order, app-wide: primary · strong · secondary · destructive · text. */
const ORDER: ButtonKind[] = ['primary', 'strong', 'secondary', 'destructive', 'tertiary']
/** #5: dismiss past 30% of the lowest detent or at 800 pt/s; a fling that fast steps one detent. */
const DISMISS_FRACTION = 0.3
const FLING_VELOCITY = 800
/** Above the top detent the sheet follows the finger at half speed. ponytail: #18's pull resistance; the brief names none for sheets. */
const RUBBER_BAND = 0.5
/** Android's scrim (§13); iOS uses `COLOR.backdrop`, 60%. */
const ANDROID_SCRIM = 0.5
const HANDLE = { ios: { width: 36, height: 5 }, android: { width: 32, height: 4 } } as const
const HANDLE_ALPHA = 0.3

/**
 * Where a released drag settles: a detent's index, or 'dismiss'. `height` is
 * how tall the sheet was dragged to; `drop`, how far below the lowest detent.
 */
export function settleDetent(heights: number[], from: number, height: number, drop: number, velocity: number): number | 'dismiss' {
  'worklet'
  if (drop > heights[0] * DISMISS_FRACTION) return 'dismiss'
  if (Math.abs(velocity) > FLING_VELOCITY) {
    const to = from + (velocity < 0 ? 1 : -1)
    return to < 0 ? 'dismiss' : Math.min(to, heights.length - 1)
  }
  let nearest = 0
  heights.forEach((h, i) => {
    if (Math.abs(h - height) < Math.abs(heights[nearest] - height)) nearest = i
  })
  return nearest
}

export type SheetAction = { label: string; onPress: () => void; kind?: ButtonKind; loading?: boolean; disabled?: boolean }

export type SheetProps = {
  visible: boolean
  /** Asked for by the handle, the scrim, a drag or system back. Set `visible` false; the sheet animates out. */
  onClose: () => void
  title: string
  /** The consequence, above the buttons. */
  body?: string
  /** A decorative glyph well above the title. */
  icon?: IconName
  /** Named with the verb, never "OK"; sorted into the fixed order. `kind` defaults to `secondary`. */
  actions?: SheetAction[]
  /** The detents a drag may settle on, opening at the first. Omit for a tray as tall as its content. */
  detents?: readonly Detent[]
  /** Between the body and the actions: a reason list, a form. Scroll it yourself if it can outgrow the detent. */
  children?: ReactNode
  testID?: string
}

/**
 * The sheet's motion (#5): mounted while open or leaving, the rise and the
 * scrim, and the drag between detents (`heights`, or the sheet's own height
 * when it has none).
 */
function useSheetMotion({ visible, heights, busy, requestClose }: { visible: boolean; heights: number[]; busy: boolean; requestClose: () => void }) {
  const window = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const [mounted, setMounted] = useState(visible)
  // Mounts as it opens (state adjusted in render); unmounts once the exit has played.
  if (visible && !mounted) setMounted(true)

  const offset = useSharedValue(reduceMotion ? 0 : window.height)
  const scrim = useSharedValue(0)
  const height = useSharedValue(heights[0] ?? 0)
  const at = useSharedValue(0)
  const natural = useSharedValue(0)

  useEffect(() => {
    const fade = motionTokens(reduceMotion).duration.base
    if (visible) {
      at.set(0)
      height.set(heights[0] ?? 0)
      if (!reduceMotion) {
        offset.set(window.height)
        offset.set(withSpring(0, SPRING.travel))
      }
      scrim.set(withTiming(1, { duration: fade, easing: Easing.bezier(...EASING.standard) }))
      return
    }
    const out = { duration: fade, easing: Easing.bezier(...EASING.sheet) }
    if (!reduceMotion) offset.set(withTiming(window.height, out))
    scrim.set(withTiming(0, out))
    const timer = setTimeout(() => setMounted(false), fade)
    return () => clearTimeout(timer)
    // On `visible` only: the rest is read as it stood when the sheet opened or closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const playDetent = useCallback(() => H.detent(), [])
  const levels = heights.length ? heights : null
  const drag = Gesture.Pan()
    .enabled(!busy)
    .activeOffsetY([-SPACE.sm, SPACE.sm])
    .onUpdate((e) => {
      const stops = levels ?? [natural.get()]
      const max = stops[stops.length - 1]
      const h = stops[at.get()] - e.translationY
      height.set(h <= max ? Math.max(h, stops[0]) : max + (h - max) * RUBBER_BAND)
      offset.set(Math.max(0, stops[0] - h))
    })
    .onEnd((e) => {
      const stops = levels ?? [natural.get()]
      const to = settleDetent(stops, at.get(), height.get(), offset.get(), e.velocityY)
      if (to === 'dismiss') {
        scheduleOnRN(requestClose)
        return
      }
      if (to !== at.get()) scheduleOnRN(playDetent)
      at.set(to)
      height.set(withSpring(stops[to], { ...SPRING.fling, velocity: -e.velocityY }))
      offset.set(withSpring(0, { ...SPRING.fling, velocity: e.velocityY }))
    })

  const placeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
    ...(levels ? { height: height.get() } : null),
  }))
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }))
  return { mounted, drag, placeStyle, scrimStyle, natural, fixedHeight: !!levels }
}

/**
 * The one L3 surface (guidelines/components/Sheet.html): an action tray, a
 * refusal, a confirm. iOS: sheet-tier glass under a 60% backdrop, 24 pt top
 * radius, a 36×5 handle. Android: solid under a 50% scrim, a 32×4 handle;
 * system back dismisses. The body states the consequence; irreversible actions
 * sit lowest, in `destructiveFill`.
 *
 * It opens as a modal with focus on its title; the handle is "Dismiss,
 * button". No haptic on open or dismiss; `H.detent` when a drag settles on
 * another detent; each action plays its own. Busy (an action loading): the
 * rest dim and it will not close.
 *
 * Motion #5: rises on `M.travel`, the scrim fades over `base`; a drag tracks
 * the finger, rubber-banding above the top detent, and settles on `M.fling`
 * with its velocity. Reduce Motion: it does not rise; the scrim fades over
 * 200 ms. Glass never fades (§5.2 rule 6), so the sheet itself appears in
 * place. Increase Contrast: the 50% hairline and the body in white.
 *
 * ponytail: focus is not handed back to the opener on close (the opener
 * knows what it was); the material does not grow more opaque near full height.
 */
export function Sheet({ visible, onClose, title, body, icon, actions = [], detents, children, testID }: SheetProps) {
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const titleRef = useRef<ComponentRef<typeof Text>>(null)

  const busy = actions.some((a) => a.loading)
  const sorted = [...actions].sort((a, b) => ORDER.indexOf(a.kind ?? 'secondary') - ORDER.indexOf(b.kind ?? 'secondary'))
  const requestClose = useCallback(() => {
    if (!busy) onClose()
  }, [busy, onClose])
  const heights = (detents ?? []).map((d) => Math.round(window.height * DETENT[d]))
  const { mounted, drag, placeStyle, scrimStyle, natural, fixedHeight } = useSheetMotion({ visible, heights, busy, requestClose })
  if (testID) drag.withTestId(`${testID}-drag`)

  useEffect(() => {
    if (visible && mounted && titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus')
  }, [visible, mounted])

  const handle = android ? HANDLE.android : HANDLE.ios

  return (
    <Modal
      testID={testID && `${testID}-modal`}
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
    >
      {/* A Modal is its own native root: gestures inside it need their own root view. */}
      <GestureHandlerRootView style={styles.fill}>
        <KeyboardAvoidingView style={styles.end} behavior={KEYBOARD_BEHAVIOR}>
          <Animated.View
            testID={testID && `${testID}-scrim`}
            style={[StyleSheet.absoluteFill, { backgroundColor: android ? tint(COLOR.ink, ANDROID_SCRIM) : COLOR.backdrop }, scrimStyle]}
          >
            <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={requestClose} />
          </Animated.View>
          <Animated.View testID={testID && `${testID}-place`} accessibilityViewIsModal style={placeStyle}>
            <Material
              testID={testID}
              role="sheet"
              onLayout={(e) => natural.set(e.nativeEvent.layout.height)}
              style={[styles.sheet, fixedHeight && styles.fill, { paddingBottom: insets.bottom + SPACE.sm }, contrast && IC_HAIRLINE]}
            >
              <GestureDetector gesture={drag}>
                <View style={styles.head}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss"
                    onPress={requestClose}
                    hitSlop={{ bottom: minTarget() - SPACE.xl }}
                    style={styles.handleHit}
                  >
                    <View testID={testID && `${testID}-handle`} style={[styles.handle, handle]} />
                  </Pressable>
                  {icon ? (
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[styles.well, { backgroundColor: android ? COLOR.surfaceSunken : MATERIAL.fillOnGlass }]}
                    >
                      <Icon name={icon} />
                    </View>
                  ) : null}
                  <Text ref={titleRef} accessibilityRole="header" style={[font('title', bold), styles.title]}>
                    {title}
                  </Text>
                  {body ? <Text style={[font('body', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{body}</Text> : null}
                </View>
              </GestureDetector>
              {children}
              {sorted.length ? (
                <View style={[styles.actions, fixedHeight && styles.pinned]}>
                  {sorted.map(({ kind = 'secondary', disabled, loading, ...action }) => (
                    <Button
                      key={action.label}
                      kind={kind}
                      loading={loading}
                      disabled={disabled || (busy && !loading)}
                      onGlass={!android && kind === 'secondary'}
                      {...action}
                    />
                  ))}
                </View>
              ) : null}
            </Material>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  end: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    paddingTop: SPACE.xl,
    paddingHorizontal: SPACE.gutter,
    gap: SPACE.md,
  },
  head: { gap: SPACE.md },
  handleHit: {
    position: 'absolute',
    top: -SPACE.xl,
    alignSelf: 'center',
    width: SIZE.targetAndroid * 2,
    height: SPACE.xl,
    alignItems: 'center',
    paddingTop: SPACE.sm,
  },
  handle: { borderRadius: RADIUS.capsule, backgroundColor: tint(COLOR.textPrimary, HANDLE_ALPHA) },
  well: {
    width: SIZE.circleButton,
    height: SIZE.circleButton,
    borderRadius: RADIUS.capsule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: COLOR.textPrimary },
  actions: { gap: SPACE.sm },
  pinned: { marginTop: 'auto' },
})
