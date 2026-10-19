import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react'
import {
  AccessibilityInfo,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, EASING, MATERIAL, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { Button, type ButtonKind, type ButtonProps } from './Button'
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

/**
 * The sheet's foot. With the keyboard up the home indicator is under the
 * keyboard, and the sheet already stands on the keyboard's top edge
 * (`sheetFrame`), so the safe-area inset would only leave a dead band between
 * the last button and the keys (Board composer drive).
 */
export function sheetBottomPadding(insetBottom: number, keyboardUp: boolean) {
  return (keyboardUp ? 0 : insetBottom) + SPACE.sm
}

/** A sheet never rises past the status bar: this far below the top safe area at most (the Board composer, drive 2). */
export const SHEET_TOP_GAP = SPACE.sm

/**
 * The tallest a sheet may be: from the top safe area and a margin down to the
 * keyboard's top edge (its `screenY`) when one is up, else to the bottom of the
 * sheet's own root (the real visible height). Past it, the sheet's content
 * scrolls inside it; the title and the actions stay put.
 *
 * The keyboard's top, not window height less keyboard height: on Android
 * edge-to-edge the translucent modal is the whole screen while the window and
 * the keyboard's height disagree about the navigation bar, and the composer's
 * top landed inside the status bar (drive 3).
 */
export function sheetMaxHeight(visibleHeight: number, insetTop: number, keyboardTop: number | null) {
  const bottom = keyboardTop === null ? visibleHeight : Math.min(visibleHeight, keyboardTop)
  return Math.max(0, bottom - insetTop - SHEET_TOP_GAP)
}

/**
 * A detent sheet's height at one instant, from how far its foot is lifted at that instant.
 *
 * Per frame, not once at the end: the sheet's top is `visibleHeight − lift − height`, and it may
 * never be above `insetTop + SHEET_TOP_GAP`. A height clamped to the final room while the lift is
 * still rising (or clamped late while it falls) puts the top off the screen for the frames in
 * between — the sheet jumped up and snapped back on every show and hide. Here the height is
 * `min(detent, room − lift)` for whatever `lift` the animation has reached, so the top holds still
 * at the clamp for the whole show and the whole hide. With no lift nothing is clamped, so a drag
 * may still rubber-band past the top detent.
 */
export function sheetHeightAt(lift: number, visibleHeight: number, insetTop: number, detentHeight: number) {
  'worklet'
  if (lift <= 0) return detentHeight
  return Math.max(0, Math.min(detentHeight, visibleHeight - insetTop - SHEET_TOP_GAP - lift))
}

/**
 * Where the sheet comes to rest over a keyboard, from the one keyboard frame.
 *
 * - `lift`: how far its foot is raised, so it stands on the keyboard's top edge.
 * - `maxHeight`: the room above that edge (`sheetMaxHeight`), a tray's cap.
 * - `height`: a detent sheet's height at that lift (`sheetHeightAt`); `null` for a tray, which is
 *   as tall as its content.
 *
 * What it does on the way there is the animation's (`sheetHeightAt` at each frame's lift).
 */
export function sheetFrame({
  visibleHeight,
  insetTop,
  keyboardTop,
  detentHeight,
}: {
  visibleHeight: number
  insetTop: number
  keyboardTop: number | null
  detentHeight: number | null
}) {
  const maxHeight = sheetMaxHeight(visibleHeight, insetTop, keyboardTop)
  const lift = keyboardTop === null ? 0 : Math.max(0, visibleHeight - keyboardTop)
  const height = detentHeight === null ? null : sheetHeightAt(lift, visibleHeight, insetTop, detentHeight)
  return { lift, maxHeight, height }
}

/**
 * Where a capped sheet scrolls to show the field being typed in (top `y`,
 * height `h`, in a `viewport` over `content`): the field's foot just above the
 * actions, or the very end when that still shows the whole field. Otherwise
 * the next row (the Board composer's Spaces stepper) peeked a sliver of its
 * circles between the text box and the pinned Post (drive 3).
 */
export function fieldScroll(y: number, h: number, viewport: number, content: number) {
  const toField = Math.max(0, y + h + SPACE.sm - viewport)
  const toEnd = Math.max(0, content - viewport)
  return toEnd >= toField && y >= toEnd ? toEnd : toField
}

type KeyboardFrame = { height: number; top: number; duration?: number }

/**
 * The keyboard while one is up (its height and its top edge on screen), null otherwise.
 *
 * - React Native's events carry the exact top edge (`screenY`): iOS on `will` (the start of the
 *   rise, with its `duration`), Android on `did` (the end of it).
 * - Android's `did` comes after the keyboard has finished, so the sheet's foot would sit under it for
 *   the whole animation. react-native-keyboard-controller's `keyboardWillShow` comes at the start with
 *   the height, so the lift can begin then. With edge-to-edge that height already includes the
 *   navigation bar the modal draws under (KeyboardAnimationCallback.kt), so it is the lift as it
 *   stands, not a figure to add the bar to. The exact frame replaces it when React Native's event
 *   lands. If the controller's events do not reach this modal, nothing is lost: the exact one still
 *   drives it.
 * - A sheet opened while the keyboard is already up gets no event at all, so it reads the keyboard
 *   as it stands (`Keyboard.metrics()` on iOS, the controller's state elsewhere).
 */
function useKeyboard(visibleHeight: number): KeyboardFrame | null {
  const [exact, setExact] = useState<KeyboardFrame | null>(() => {
    const m = Keyboard.metrics?.()
    return m && m.height > 0 ? { height: m.height, top: m.screenY } : null
  })
  const [early, setEarly] = useState<{ height: number; duration?: number } | null>(() => {
    if (Platform.OS === 'ios' || !KeyboardController.isVisible()) return null
    const height = KeyboardController.state().height
    return height > 0 ? { height } : null
  })
  useEffect(() => {
    const ios = Platform.OS === 'ios'
    const clear = () => {
      setExact(null)
      setEarly(null)
    }
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
        const end = e?.endCoordinates
        if (!end || !(end.height > 0)) return clear()
        setExact({ height: end.height, top: end.screenY, duration: ios ? e?.duration : undefined })
        setEarly(null)
      }),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', clear),
      // Android only: the start of the rise, with the height, which React Native does not say until the end.
      ...(ios
        ? []
        : [
            KeyboardEvents.addListener('keyboardWillShow', (e) => e.height > 0 && setEarly({ height: e.height, duration: e.duration })),
            KeyboardEvents.addListener('keyboardWillHide', clear),
          ]),
    ]
    return () => subs.forEach((sub) => sub.remove())
  }, [])
  if (exact) return exact
  return early ? { height: early.height, top: visibleHeight - early.height, duration: early.duration || undefined } : null
}

export type SheetAction = {
  label: string
  onPress: () => void
  kind?: ButtonKind
  loading?: boolean
  disabled?: boolean
  testID?: string
} & Pick<ButtonProps, 'pressHaptic' | 'icon' | 'refused'>

export type SheetProps = {
  visible: boolean
  /** Asked for by the handle, the scrim, a drag or system back. Set `visible` false; the sheet animates out. */
  onClose: () => void
  /** Omitted only when the content carries its own header (the PersonCard's name beside its face): pass `focusRef` then. */
  title?: string
  /** What a screen reader lands on as it opens, when there is no title: the content's own header. */
  focusRef?: RefObject<ComponentRef<typeof View> | null>
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
  /**
   * Once it has left the screen. iOS drops a Modal presented while another is
   * still leaving, so the next sheet (Block / Report, a composer) waits for this.
   */
  onDismissed?: () => void
  testID?: string
}

/**
 * The sheet's motion (#5): mounted while open or leaving, the rise and the
 * scrim, and the drag between detents (`heights`, or the sheet's own height
 * when it has none).
 */
function useSheetMotion({
  visible,
  heights,
  opening,
  busy,
  requestClose,
  onGone,
  lift: liftTo,
  liftMs,
  visibleHeight,
  insetTop,
}: {
  visible: boolean
  /** Lowest first. */
  heights: number[]
  /** How far the foot is raised onto the keyboard (`sheetFrame`); eased in step with it. */
  lift: number
  /** How long the keyboard takes (its own, when it says); `base` otherwise. */
  liftMs?: number
  /** The modal root's height and the top inset: what a detent sheet's height is derived from, per frame. */
  visibleHeight: number
  insetTop: number
  /** The index it opens at. */
  opening: number
  busy: boolean
  requestClose: () => void
  /** It has unmounted (Android); iOS reports through the Modal's own `onDismiss`. */
  onGone: () => void
}) {
  const window = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const [mounted, setMounted] = useState(visible)
  // Mounts as it opens (state adjusted in render); unmounts once the exit has played.
  if (visible && !mounted) setMounted(true)

  const offset = useSharedValue(reduceMotion ? 0 : window.height)
  const scrim = useSharedValue(0)
  const height = useSharedValue(heights[opening] ?? 0)
  const at = useSharedValue(opening)
  const natural = useSharedValue(0)
  const lift = useSharedValue(0)
  const room = useSharedValue({ visibleHeight, insetTop })
  const first = useRef(true)

  useEffect(() => {
    room.set({ visibleHeight, insetTop })
  }, [visibleHeight, insetTop, room])

  // The keyboard coming or going: the foot rises with it; a detent sheet's height follows the foot (below).
  useEffect(() => {
    if (first.current || reduceMotion) {
      first.current = false
      lift.set(liftTo)
      return
    }
    lift.set(withTiming(liftTo, { duration: liftMs ?? motionTokens(false).duration.base, easing: Easing.bezier(...EASING.standard) }))
  }, [liftTo, liftMs, reduceMotion, lift])

  useEffect(() => {
    const fade = motionTokens(reduceMotion).duration.base
    if (visible) {
      at.set(opening)
      height.set(heights[opening] ?? 0)
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
    const timer = setTimeout(() => {
      setMounted(false)
      onGone()
    }, fade)
    return () => clearTimeout(timer)
    // On `visible` only: the rest is read as it stood when the sheet opened or closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const playDetent = useCallback(() => H.detent(), [])
  const levels = heights.length ? heights : null
  const drag = Gesture.Pan()
    .enabled(visible && !busy)
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
      // A dismiss the owner refuses (a "discard changes?" ask) springs back to where it was.
      const next = to === 'dismiss' ? at.get() : to
      if (to === 'dismiss') scheduleOnRN(requestClose)
      else if (to !== at.get()) scheduleOnRN(playDetent)
      at.set(next)
      height.set(withSpring(stops[next], { ...SPRING.fling, velocity: -e.velocityY }))
      offset.set(withSpring(0, { ...SPRING.fling, velocity: e.velocityY }))
    })

  // `marginBottom` is the one thing that lifts the sheet over the keyboard; a detent sheet's height is what is left above it, at this frame's lift.
  const placeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
    marginBottom: lift.get(),
    ...(levels ? { height: sheetHeightAt(lift.get(), room.get().visibleHeight, room.get().insetTop, height.get()) } : null),
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
export function Sheet({ visible, onClose, title, body, icon, actions = [], detents, children, focusRef, onDismissed, testID }: SheetProps) {
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const titleRef = useRef<ComponentRef<typeof Text>>(null)
  /** The modal root's height: the real visible area (the whole screen on Android, translucent bars). */
  const [rootHeight, setRootHeight] = useState<number | null>(null)
  const visibleHeight = rootHeight ?? window.height
  const keyboard = useKeyboard(visibleHeight)
  const keyboardUp = keyboard !== null
  const keyboardHeight = keyboard?.height ?? 0
  /*
   * With the keyboard up a capped sheet scrolls its content: bring the field
   * being typed in into view (the Board composer's text box sits under the
   * kind cards). The avoiding view has lifted the sheet a frame later, hence
   * the frame's wait.
   *
   * Every control stays reachable while it is up, not only the one being typed in: the Board composer's
   * Spaces stepper sits under the text box, and a capped sheet that looked finished (cards, field, Post)
   * gave no sign it went on. So the scroll says so (`overflowing`: an indicator while the keyboard is up
   * and there is more), and the field is brought into view once, not against a hand that has already
   * taken the scroll over (`handScrolled`).
   */
  const content = useRef<ScrollView>(null)
  const contentHeight = useRef(0)
  const contentSize = useRef(0)
  const handScrolled = useRef(false)
  const [overflowing, setOverflowing] = useState(false)
  const measureOverflow = () => setOverflowing(contentSize.current > contentHeight.current + 1)
  useEffect(() => {
    // A new keyboard (or none) is a new gesture: the field may be brought into view again.
    handScrolled.current = false
  }, [keyboardUp])
  useEffect(() => {
    if (!keyboardUp) return
    const frame = requestAnimationFrame(() => {
      // Never against a scroll the person has already started: the field is theirs to place.
      if (handScrolled.current) return
      const input = TextInput.State.currentlyFocusedInput()
      const inner = content.current?.getInnerViewNode()
      if (!input || !inner) return
      input.measureLayout(
        inner,
        (_x, y, _w, h) => content.current?.scrollTo({ y: fieldScroll(y, h, contentHeight.current, contentSize.current), animated: true }),
        () => {}
      )
    })
    return () => cancelAnimationFrame(frame)
  }, [keyboardUp, keyboardHeight])

  const busy = actions.some((a) => a.loading)
  const sorted = [...actions].sort((a, b) => ORDER.indexOf(a.kind ?? 'secondary') - ORDER.indexOf(b.kind ?? 'secondary'))
  const requestClose = useCallback(() => {
    if (!busy) onClose()
  }, [busy, onClose])
  const stops = [...new Set(detents)].sort((a, b) => DETENT[a] - DETENT[b])
  const heights = stops.map((d) => Math.round(window.height * DETENT[d]))
  const frame = sheetFrame({
    visibleHeight,
    insetTop: insets.top,
    keyboardTop: keyboard?.top ?? null,
    detentHeight: heights.length ? heights[heights.length - 1] : null,
  })
  const opening = detents ? stops.indexOf(detents[0]) : 0
  const dismissed = useRef(onDismissed)
  useEffect(() => {
    dismissed.current = onDismissed
  })
  const ios = Platform.OS === 'ios'
  const { mounted, drag, placeStyle, scrimStyle, natural, fixedHeight } = useSheetMotion({
    visible,
    heights,
    opening,
    busy,
    requestClose,
    lift: frame.lift,
    liftMs: keyboard?.duration,
    visibleHeight,
    insetTop: insets.top,
    onGone: () => {
      if (!ios) dismissed.current?.()
    },
  })
  if (testID) drag.withTestId(`${testID}-drag`)
  // Once the modal is on screen: iOS presents it a frame after mount and drops a focus sent earlier.
  const focusTitle = () => {
    const target = titleRef.current ?? focusRef?.current
    if (target) AccessibilityInfo.sendAccessibilityEvent(target, 'focus')
  }
  // The same sheet turning into another (a session into its confirm, a dial into a refusal): its new title takes focus.
  const shownTitle = useRef(title)
  useEffect(() => {
    if (shownTitle.current === title) return
    shownTitle.current = title
    if (visible && titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus')
  }, [title, visible])

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
      onShow={focusTitle}
      onDismiss={ios ? () => dismissed.current?.() : undefined}
    >
      {/* A Modal is its own native root: gestures inside it need their own root view. */}
      <GestureHandlerRootView
        testID={testID && `${testID}-root`}
        pointerEvents={visible ? 'auto' : 'none'}
        style={styles.fill}
        onLayout={(e) => setRootHeight(e.nativeEvent.layout.height)}
      >
        {/*
         * No KeyboardAvoidingView. This is the one thing that lifts the sheet: the place view's `marginBottom`,
         * from the keyboard's top edge (`screenY`), the same frame that shortens a detent sheet. The avoiding
         * view measured its own overlap from its own events and layout, a second answer that on Android
         * edge-to-edge (react-native-keyboard-controller's KeyboardProvider at the root; the Modal is the whole
         * screen but the window is not) disagreed with the cap, and on iOS lifted a fixed-height detent sheet
         * clean off the top. One frame cannot disagree with itself, on either platform.
         */}
        <View style={styles.end}>
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
              style={[
                styles.sheet,
                fixedHeight && styles.fill,
                { paddingBottom: sheetBottomPadding(insets.bottom, keyboardUp), ...(fixedHeight ? null : { maxHeight: frame.maxHeight }) },
                contrast && IC_HAIRLINE,
              ]}
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
                  {title ? (
                    <Text ref={titleRef} accessibilityRole="header" style={[font('title', bold), styles.title]}>
                      {title}
                    </Text>
                  ) : null}
                  {body ? <Text style={[font('body', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{body}</Text> : null}
                </View>
              </GestureDetector>
              {children ? (
                // Scrolls only when the sheet is at its cap; otherwise it is exactly its content.
                <ScrollView
                  ref={content}
                  onLayout={(e) => {
                    contentHeight.current = e.nativeEvent.layout.height
                    measureOverflow()
                  }}
                  onContentSizeChange={(_w, h) => {
                    contentSize.current = h
                    measureOverflow()
                  }}
                  onScrollBeginDrag={() => (handScrolled.current = true)}
                  testID={testID && `${testID}-content`}
                  style={styles.content}
                  contentContainerStyle={styles.contentInner}
                  keyboardShouldPersistTaps="handled"
                  // Capped by the keyboard with more below: say so (the indicator), and let the hand scroll it on both platforms.
                  showsVerticalScrollIndicator={keyboardUp && overflowing}
                  persistentScrollbar={keyboardUp && overflowing}
                  nestedScrollEnabled
                  scrollEnabled
                  bounces={false}
                >
                  {children}
                </ScrollView>
              ) : null}
              {sorted.length ? (
                <View style={[styles.actions, fixedHeight && styles.pinned]}>
                  {sorted.map(({ kind = 'secondary', disabled, loading, ...action }) => (
                    <Button
                      key={`${kind}-${action.label}`}
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
        </View>
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
    paddingHorizontal: SPACE.gutter,
    gap: SPACE.md,
  },
  /** The top padding is the head's, so the handle above the title is inside the drag's bounds (Android checks them). */
  head: { gap: SPACE.md, paddingTop: SPACE.xl },
  handleHit: {
    position: 'absolute',
    top: 0,
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
  content: { flexGrow: 0, flexShrink: 1 },
  contentInner: { gap: SPACE.md },
  pinned: { marginTop: 'auto' },
})
