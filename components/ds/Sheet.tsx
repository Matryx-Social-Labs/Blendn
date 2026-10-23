import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react'
import {
  AccessibilityInfo,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardController, KeyboardEvents, useKeyboardContext } from 'react-native-keyboard-controller'
import Animated, { Easing, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, DURATION, EASING, FONT_FAMILY, MATERIAL, MAX_FONT_SCALE, RADIUS, SIZE, SPACE, SPRING, TYPE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { PresentsHere, useTurnGate, useTurnWatch } from '../../lib/modalTurn'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { notifySheetDismissed } from '../../lib/sheetDismissed'
import { OPACITY, tint } from '../../lib/theme'
import { Button, type ButtonKind, type ButtonProps } from './Button'
import { CONTROL_FONT_CAP, font, GroundProvider, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast, useLargeText } from './shared'

export type Detent = 'short' | 'medium' | 'tall'

/** Fractions of the screen (the Sheet page). */
const DETENT: Record<Detent, number> = { short: 0.34, medium: 0.56, tall: 0.92 }
/** The fixed order, app-wide: primary · lit · strong · secondary · destructive · text. */
const ORDER: ButtonKind[] = ['primary', 'lit', 'strong', 'secondary', 'destructive', 'tertiary']
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
 * A pull on the header of a sheet whose scroll has more: how far it has moved the sheet, or null while the scroll still owns
 * the finger. Until the scroll is at its top, where the finger is becomes the pull's zero (`from`), so the sheet takes up
 * from there without a jump (as RoomStage does over its scroll).
 */
export function headPull(translationY: number, atTop: boolean, from: number): { travel: number | null; from: number } {
  'worklet'
  return atTop ? { travel: translationY - from, from } : { travel: null, from: translationY }
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
 * sheet's own root (the real visible height). Past it, the title, body and
 * content scroll inside it; the actions stay put.
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
} & Pick<ButtonProps, 'pressHaptic' | 'icon' | 'refused' | 'count'>

export type SheetProps = {
  visible: boolean
  /** Asked for by the handle, the scrim, a drag or system back. Set `visible` false; the sheet animates out. */
  onClose: () => void
  /** Omitted only when the content carries its own header (the PersonCard's name beside its face): pass `focusRef` then. */
  title?: string
  /** A text action right-aligned in the title row (Clear all). Additive: a sheet without one is unchanged. */
  headerAction?: { label: string; onPress: () => void; disabled?: boolean }
  /**
   * A line beside the title that is not an action ("1 of 3 · Name and vibe"): `lead` in Geist Mono white, then `text` in the
   * meta role. Two sibling Texts, never one nested in the other (Android measures a nested span in its parent's font). It
   * wraps under a long title rather than shortening it. `label` is what a screen reader gets, when more than the words.
   */
  headerNote?: { lead?: string; text: string; label?: string }
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
  /** Between the body and the actions: a reason list, a form. It scrolls with the title and body when the sheet is at its cap. */
  children?: ReactNode
  /**
   * `false`: a question that must be answered (Flow 7 "Still at the event?"). No handle, a scrim and a drag that
   * do nothing, system back ignored; only its actions close it. Default `true`.
   */
  dismissible?: boolean
  /**
   * Once it has left the screen. iOS drops a Modal presented while another is
   * still leaving, so the next sheet (Block / Report, a composer) waits for this.
   */
  onDismissed?: () => void
  /** iOS (and Android) say it is on screen: for an owner that must know it was seen, not only asked for (Go Live's once a night). */
  onShown?: () => void
  testID?: string
}

/** Under a pinned header the scroll is never shorter than this many touch targets (or its content, if less). */
const SCROLL_FLOOR_TARGETS = 2

/** How long a drag-dismiss waits for the owner's answer before it springs back to where it was (a JS round trip to `visible`). */
const DRAG_CLOSE_ASK_MS = 32

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
  dismissible,
  requestClose,
  onGone,
  lift: liftTo,
  liftMs,
  visibleHeight,
  insetTop,
  headScrolls,
}: {
  visible: boolean
  /** The header is in a scroll that has more than fits: the header drags the sheet only as a pull down from the scroll's top. */
  headScrolls: boolean
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
  /** A drag may dismiss it (`Sheet`'s `dismissible`). */
  dismissible: boolean
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
  /** Reduce Motion's way in and out (DS #5 rm: "200ms fade; drag still tracks"): the sheet does not travel, it fades. */
  const fade = useSharedValue(reduceMotion ? 0 : 1)
  /** The flick's speed (pt/s, downward) a drag-dismiss hands to the exit, so there is no seam between the finger and the slide. */
  const flingV = useSharedValue(0)
  /** `visible` as of now, for a timer that was set before it changed. */
  const visibleRef = useRef(visible)
  useLayoutEffect(() => {
    visibleRef.current = visible
  })
  /** The Modal was already on screen (open or leaving) when `visible` last turned true: a re-open mid-exit rises from where it is. */
  const wasMounted = useRef(false)
  const height = useSharedValue(heights[opening] ?? 0)
  const at = useSharedValue(opening)
  const natural = useSharedValue(0)
  const lift = useSharedValue(0)
  /** The header's scroll is at its top, on the UI thread (`useAnimatedScrollHandler`): a pull down there drags the sheet. */
  const headAtTop = useSharedValue(true)
  /** A header pull's zero, and whether it has moved the sheet at all (`headPull`). */
  const headFrom = useSharedValue(0)
  const headEngaged = useSharedValue(false)
  /*
   * The keyboard's own frame, every frame, on the UI thread (DS #34: follow it frame by frame). iOS only for now: there
   * the controller's height is the keyboard's height as the system moves it, so while it is moving the sheet's foot is
   * glued to the keys on the system's curve, not ours. The eased `lift` stays: it is the resting value (the exact
   * frame React Native reports) and the bridge across the first frame, before the controller has moved. Android waits
   * for a drive to show the controller's frames reach this Modal (see `useKeyboard`). Read from the context, not
   * `useReanimatedKeyboardAnimation`: that hook also flips Android's input mode on mount and back on unmount.
   */
  const kb = useKeyboardContext().reanimated
  const follow = Platform.OS === 'ios'
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
    const base = motionTokens(reduceMotion).duration.base
    const gentle = Easing.bezier(...EASING.gentle)
    if (visible) {
      at.set(opening)
      height.set(heights[opening] ?? 0)
      flingV.set(0)
      // A sheet opens with its scroll at the top.
      headAtTop.set(true)
      if (reduceMotion) {
        offset.set(0)
        fade.set(withTiming(1, { duration: base, easing: gentle }))
      } else {
        // From the bottom, unless it is already on its way out: then from wherever it is (DS #5: from the presentation value).
        if (!wasMounted.current) offset.set(window.height)
        offset.set(withSpring(0, SPRING.travel))
        fade.set(1)
      }
      wasMounted.current = true
      scrim.set(withTiming(1, { duration: base, easing: gentle }))
      return
    }
    const out = { duration: base, easing: Easing.bezier(...EASING.sheet) }
    // A flick down hands its speed to the slide out: a spring that carries it, clamped at the bottom, never a fresh curve from rest.
    const v = flingV.get()
    flingV.set(0)
    if (reduceMotion) fade.set(withTiming(0, { duration: base, easing: gentle }))
    else offset.set(v > 0 ? withSpring(window.height, { ...SPRING.fling, velocity: v, overshootClamping: true }) : withTiming(window.height, out))
    scrim.set(withTiming(0, { duration: base, easing: gentle }))
    // A spring has no end time: give the flick the room it needs to reach the bottom before the Modal goes.
    const timer = setTimeout(
      () => {
        wasMounted.current = false
        setMounted(false)
        onGone()
      },
      v > 0 && !reduceMotion ? DURATION.medium : base
    )
    return () => clearTimeout(timer)
    // On `visible` only: the rest is read as it stood when the sheet opened or closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const playDetent = useCallback(() => H.detent(), [])
  const levels = heights.length ? heights : null
  /*
   * A drag past the dismiss line asks to close, and does NOT spring back first: a spring toward 0 and then a slide
   * away from it was the wall a flick hit. If the owner refuses (a "discard changes?" ask leaves `visible` true), the
   * sheet springs back a beat later; if it closes, the exit carries the flick's velocity on (`flingV`).
   */
  const dragClose = useCallback(() => {
    requestClose()
    setTimeout(() => {
      if (!visibleRef.current) return
      flingV.set(0)
      offset.set(withSpring(0, SPRING.fling))
      height.set(withSpring((levels ?? [natural.get()])[at.get()], SPRING.fling))
    }, DRAG_CLOSE_ASK_MS)
  }, [requestClose, levels, offset, height, at, natural, flingV])
  // One drag, on two surfaces: the grip, always; the header too, which in a scroll that has more is a pull down from its top.
  // `downOnly`: it starts on a pull down, a push up (the scroll's) fails it at once, and it moves the sheet only from the
  // scroll's top (`headPull`).
  const pan = (enabled: boolean, downOnly = false) =>
    (downOnly ? Gesture.Pan().activeOffsetY(SPACE.sm).failOffsetY(-SPACE.sm) : Gesture.Pan().activeOffsetY([-SPACE.sm, SPACE.sm]))
      .enabled(enabled)
      .onBegin(() => {
        headFrom.set(0)
        headEngaged.set(!downOnly)
      })
      .onUpdate((e) => {
        let ty = e.translationY
        if (downOnly) {
          const pull = headPull(ty, headAtTop.get(), headFrom.get())
          headFrom.set(pull.from)
          if (pull.travel === null) return
          headEngaged.set(true)
          ty = pull.travel
        }
        const stops = levels ?? [natural.get()]
        const max = stops[stops.length - 1]
        const h = stops[at.get()] - ty
        height.set(h <= max ? Math.max(h, stops[0]) : max + (h - max) * RUBBER_BAND)
        offset.set(Math.max(0, stops[0] - h))
      })
      .onEnd((e) => {
        // The scroll had the finger the whole way: the sheet never moved, and the flick was the scroll's.
        if (!headEngaged.get()) return
        const stops = levels ?? [natural.get()]
        const to = settleDetent(stops, at.get(), height.get(), offset.get(), e.velocityY)
        if (to === 'dismiss') {
          flingV.set(e.velocityY)
          scheduleOnRN(dragClose)
          return
        }
        if (to !== at.get()) scheduleOnRN(playDetent)
        at.set(to)
        height.set(withSpring(stops[to], { ...SPRING.fling, velocity: -e.velocityY }))
        offset.set(withSpring(0, { ...SPRING.fling, velocity: e.velocityY }))
      })
  const canDrag = visible && !busy && dismissible
  // The compiler reads `dragClose` (it checks `visibleRef` inside a timer, never in render) as a ref read during render.
  // eslint-disable-next-line react-hooks/refs
  const drag = pan(canDrag)
  // In a scroll with more, only a pull down from its top: the title kept dragging the sheet before it scrolled (review HIGH-1).
  // eslint-disable-next-line react-hooks/refs
  const headDrag = pan(canDrag, headScrolls)
  /*
   * The scroll's own pan, inside RNGH (`Gesture.Native()`), recognised alongside the header's rather than racing it: on iOS the
   * ScrollView's recogniser could take the pull before the header's pan saw it (review R1). RoomStage does the same.
   */
  const scrollNative = Gesture.Native()
  headDrag.simultaneousWithExternalGesture(scrollNative)
  scrollNative.simultaneousWithExternalGesture(headDrag)

  // `marginBottom` is the one thing that lifts the sheet over the keyboard; a detent sheet's height is what is left above it, at this frame's lift.
  const placeStyle = useAnimatedStyle(() => {
    const p = kb.progress.get()
    // Moving: the keyboard's own frame. Still (progress 0 or 1): the exact resting value.
    const liftNow = follow && p > 0 && p < 1 ? Math.max(0, -kb.height.get()) : lift.get()
    return {
      opacity: fade.get(),
      transform: [{ translateY: offset.get() }],
      marginBottom: liftNow,
      ...(levels ? { height: sheetHeightAt(liftNow, room.get().visibleHeight, room.get().insetTop, height.get()) } : null),
    }
  })
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }))
  return { mounted, drag, headDrag, scrollNative, headAtTop, placeStyle, scrimStyle, natural, fixedHeight: !!levels }
}

/**
 * The one L3 surface (guidelines/components/Sheet.html): an action tray, a
 * refusal, a confirm. iOS: sheet-tier glass under a 60% backdrop, 24 pt top
 * radius, a 36×5 handle. Android: solid under a 50% scrim, a 32×4 handle;
 * system back dismisses. The body states the consequence; irreversible actions
 * sit lowest, in `destructiveFill`.
 *
 * It opens as a modal with focus on its title; the handle is "Dismiss,
 * button" (`dismissible={false}`, for a question that has to be answered:
 * no handle, and the scrim, a drag and system back do nothing). No haptic on open or dismiss; `H.detent` when a drag settles on
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
export function Sheet({ visible: wanted, onClose, title, headerAction, headerNote, body, icon, actions = [], detents, children, dismissible = true, focusRef, onDismissed, onShown, testID }: SheetProps) {
  const android = Platform.OS === 'android'
  /*
   * One Modal on screen at a time on iOS (`lib/modalTurn.ts`, RC drive 4 D-9): asked for, `visible` waits for the
   * screen to be free; a sheet iOS refuses anyway is taken down and asks again, and after that is closed rather than
   * hold the screen. A sheet inside another Modal (or a router modal) is drawn as asked, and so is every sheet on Android.
   */
  const gate = useTurnGate(wanted)
  const visible = gate.allowed
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
  const content = useRef<Animated.ScrollView>(null)
  const contentHeight = useRef(0)
  const contentSize = useRef(0)
  const handScrolled = useRef(false)
  const [overflowing, setOverflowing] = useState(false)
  /** The scroll's content height, for its floor under a pinned header. */
  const [contentTall, setContentTall] = useState(0)
  const measureOverflow = () => setOverflowing(contentSize.current > contentHeight.current + 1)
  useEffect(() => {
    if (overflowing) content.current?.flashScrollIndicators()
  }, [overflowing])
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
  // A lit action is never 56 pt (the primary's): a sheet with one stacks all of its actions at 48.
  const actionSize = actions.some((a) => a.kind === 'lit') ? 'md' : undefined
  const sorted = [...actions].sort((a, b) => ORDER.indexOf(a.kind ?? 'secondary') - ORDER.indexOf(b.kind ?? 'secondary'))
  const requestClose = useCallback(() => {
    if (!busy && dismissible) onClose()
  }, [busy, dismissible, onClose])
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
  const { mounted, drag, headDrag, scrollNative, headAtTop, placeStyle, scrimStyle, natural, fixedHeight } = useSheetMotion({
    visible,
    heights,
    opening,
    busy,
    dismissible,
    requestClose,
    lift: frame.lift,
    liftMs: keyboard?.duration,
    visibleHeight,
    insetTop: insets.top,
    headScrolls: overflowing,
    onGone: () => {
      if (!ios) dismissed.current?.()
    },
  })
  const watch = useTurnWatch(gate, mounted, { onGiveUp: onClose })
  /*
   * Asked for and closed before it ever reached the screen (it waited, or iOS refused it): it has "left" all the same,
   * so a chain that waits on `onDismissed` (the next card, the next step) still runs.
   */
  const unseen = useRef(false)
  useEffect(() => {
    if (watch.refused) unseen.current = true
    else if (mounted) unseen.current = false
    else if (wanted) unseen.current = true
    else if (unseen.current) {
      unseen.current = false
      dismissed.current?.()
    }
  }, [wanted, mounted, watch.refused])
  if (testID) {
    drag.withTestId(`${testID}-drag`)
    headDrag.withTestId(`${testID}-head-drag`)
    scrollNative.withTestId(`${testID}-scroll-native`)
  }
  // On the UI thread: the header's pull reads it without a render (review R2).
  const onContentScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      headAtTop.set(e.contentOffset.y <= 0)
    },
  })
  const hasHead = !!(icon || title || headerAction || headerNote || body)
  const largeText = useLargeText()
  const iconEl =
    icon ? (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.well, { backgroundColor: android ? COLOR.surfaceSunken : MATERIAL.fillOnGlass }]}
      >
        <Icon name={icon} />
      </View>
    ) : null
  const titleEl =
    title || headerAction || headerNote ? (
      <View style={styles.titleRow}>
        {title ? (
          <Text ref={titleRef} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('title', bold), styles.title, styles.titleText]}>
            {title}
          </Text>
        ) : (
          <View style={styles.titleText} />
        )}
        {headerNote ? (
          <View
            accessible
            accessibilityLabel={headerNote.label ?? `${headerNote.lead ?? ''}${headerNote.text}`}
            testID={testID && `${testID}-note`}
            style={styles.note}
          >
            {headerNote.lead ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.title]}>{headerNote.lead}</Text> : null}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{headerNote.text}</Text>
          </View>
        ) : null}
        {headerAction ? (
          <Pressable
            testID={testID && `${testID}-header-action`}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!headerAction.disabled }}
            disabled={headerAction.disabled}
            hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
            onPress={headerAction.onPress}
            style={headerAction.disabled && { opacity: OPACITY.disabled }}
          >
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.title]}>{headerAction.label}</Text>
          </Pressable>
        ) : null}
      </View>
    ) : null
  const bodyEl =
    body ? (
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{body}</Text>
    ) : null
  /*
   * The icon and title row stay put above the scroll, and the body and content scroll under them (review MEDIUM-2: "Clear
   * all", a step's "1 of 3" and "Write a post" over the keyboard had scrolled away). At the accessibility sizes a plain
   * header scrolls with its content instead: there "Sign out?" and its body were taller than the sheet (RC drive 3 D-E). A
   * row with an action or a note stays put at every size; its title stops at its cap.
   */
  // Unless the scroll under it would be left less than its floor: at the accessibility sizes with the keyboard up, the header
  // scrolls too, so the field being typed in is never squeezed out (review R5).
  const pinHead = (!!(headerAction || headerNote) || (!largeText && !!(icon || title))) && !(largeText && keyboardUp)
  const scrollHead = pinHead ? (
    bodyEl
  ) : hasHead ? (
    <>
      {iconEl}
      {titleEl}
      {bodyEl}
    </>
  ) : null
  const scrollsFromTop = hasHead && !pinHead
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
      visible={mounted && !watch.refused}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      onShow={() => {
        watch.onShow()
        focusTitle()
        onShown?.()
      }}
      onDismiss={
        ios
          ? () => {
              watch.onDismiss()
              dismissed.current?.()
              notifySheetDismissed()
            }
          : undefined
      }
    >
      <PresentsHere.Provider value>
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
            <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={dismissible ? requestClose : undefined} />
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
              {/* The grip (and a pinned title row) stays above the scroll: a sheet scrolled down to its actions can still be dragged away. */}
              <GestureDetector gesture={drag}>
                <View>
                  <View testID={testID && `${testID}-grip`} style={[styles.grip, overflowing && !pinHead && { height: minTarget() }]}>
                    {dismissible ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss"
                        onPress={requestClose}
                        hitSlop={{ bottom: minTarget() - SPACE.xl }}
                        style={styles.handleHit}
                      >
                        <View testID={testID && `${testID}-handle`} style={[styles.handle, handle]} />
                      </Pressable>
                    ) : null}
                  </View>
                  {pinHead ? (
                    <View testID={testID && `${testID}-pinned`} style={styles.head}>
                      {iconEl}
                      {titleEl}
                    </View>
                  ) : null}
                </View>
              </GestureDetector>
              {scrollHead || children ? (
                /*
                 * The title, the body and the children scroll as one under the cap; the actions below it stay put. With only
                 * `children` inside, a header taller than the cap (AX XXXL: "Sign out?" and its body) pushed Cancel and Sign
                 * out off the screen and nothing scrolled (RC drive 3 D-E). It scrolls only when it has more than fits, so
                 * the header's drag never fights a scroll with nowhere to go.
                 */
                <GestureDetector gesture={scrollNative}>
                  <Animated.ScrollView
                    ref={content}
                    onLayout={(e) => {
                      contentHeight.current = e.nativeEvent.layout.height
                      measureOverflow()
                    }}
                    onContentSizeChange={(_w, h) => {
                      contentSize.current = h
                      setContentTall(h)
                      measureOverflow()
                    }}
                    onScrollBeginDrag={() => (handScrolled.current = true)}
                    onScroll={onContentScroll}
                    scrollEventThrottle={16}
                    // No Android overscroll glow under a pull that is the sheet's (review R1).
                    overScrollMode={overflowing ? 'never' : 'auto'}
                    testID={testID && `${testID}-content`}
                    // Under a pinned header the scroll keeps a floor (its content, up to two targets): pinned rows never squeeze
                    // the form to nothing (review R5).
                    style={[styles.content, pinHead && { minHeight: Math.min(contentTall, SCROLL_FLOOR_TARGETS * minTarget()) }]}
                    // Under a pinned title, or with no header at all, the content keeps its 12 pt from what is above it (review L8).
                    contentContainerStyle={[styles.contentInner, !scrollsFromTop && styles.contentBelow]}
                    keyboardShouldPersistTaps="handled"
                    // Capped with more below, by the keyboard or by its own height: say so, and let the hand scroll it on both
                    // platforms. Make a crew stranded a section label at the fold over the dock with nothing to say it went on
                    // (r7 L6): Android keeps the bar and fades the edge; iOS flashes its indicator once when it overflows.
                    showsVerticalScrollIndicator={overflowing}
                    persistentScrollbar={overflowing}
                    fadingEdgeLength={overflowing ? SPACE.xxxl : 0}
                    nestedScrollEnabled
                    scrollEnabled={overflowing}
                    bounces={false}
                  >
                    {scrollHead ? (
                      <GestureDetector gesture={headDrag}>
                        <View style={styles.head}>{scrollHead}</View>
                      </GestureDetector>
                    ) : null}
                    <GroundProvider value={android ? 'surface' : 'glass'}>{children}</GroundProvider>
                  </Animated.ScrollView>
                </GestureDetector>
              ) : null}
              {sorted.length ? (
                <View style={[styles.actions, fixedHeight && styles.pinned]}>
                  {sorted.map(({ kind = 'secondary', disabled, loading, ...action }) => (
                    <Button
                      // Keyed by testID when there is one, so a label that changes in place ("Show 1 place" → "Show 2 places") keeps its Button.
                      key={`${kind}-${action.testID ?? action.label}`}
                      kind={kind}
                      loading={loading}
                      disabled={disabled || (busy && !loading)}
                      onGlass={!android && kind === 'secondary'}
                      size={actionSize}
                      {...action}
                    />
                  ))}
                </View>
              ) : null}
            </Material>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
      </PresentsHere.Provider>
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
  },
  /**
   * The handle's strip (the head's old top padding), so the handle is inside the drag's bounds (Android checks them). A full
   * target while the sheet scrolls, when the header drags only from the scroll's top.
   */
  grip: { height: SPACE.xl },
  head: { gap: SPACE.md },
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
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: SPACE.md, rowGap: SPACE.xs },
  // The title keeps its width (up to the row): a note or an action wraps under it instead of shortening it.
  titleText: { flexGrow: 1, flexShrink: 0, maxWidth: '100%' },
  note: { flexDirection: 'row', flexShrink: 1, minWidth: 0, justifyContent: 'flex-end' },
  title: { color: COLOR.textPrimary },
  actions: { gap: SPACE.sm, paddingTop: SPACE.md },
  content: { flexGrow: 0, flexShrink: 1 },
  contentInner: { gap: SPACE.md },
  contentBelow: { paddingTop: SPACE.md },
  pinned: { marginTop: 'auto' },
})
