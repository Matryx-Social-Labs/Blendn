import { createContext, useContext, useEffect, useState, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import { Modal, StyleSheet, type FlatListProps, type ModalProps, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  ReduceMotion,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { MOTION_DURATION } from '../../lib/motion'
import { EMBER } from '../../lib/theme'

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1)
const SHEET_MS = 300
/** Leaving is the system answering a tap, so it is quicker than arriving. */
const SHEET_OUT_MS = 240

/** Past this share of its own height, a slow drag dismisses. */
const DISMISS_FRACTION = 0.3
/** A flick this fast dismisses from any distance — `SwipeToDismiss`'s figure. */
const DISMISS_VELOCITY = 800

const rise = (values: EntryAnimationsValues) => {
  'worklet'
  return {
    initialValues: { transform: [{ translateY: values.targetHeight }] },
    animations: { transform: [{ translateY: withTiming(0, { duration: SHEET_MS, easing: EASE_SHEET }) }] },
  }
}
const sink = (values: ExitAnimationsValues) => {
  'worklet'
  return {
    initialValues: { transform: [{ translateY: 0 }] },
    animations: {
      transform: [{ translateY: withTiming(values.currentHeight, { duration: SHEET_OUT_MS, easing: EASE_SHEET }) }],
    },
  }
}
const fadeIn = FadeIn.duration(MOTION_DURATION.normal).reduceMotion(ReduceMotion.Never)
const fadeOut = FadeOut.duration(MOTION_DURATION.fast).reduceMotion(ReduceMotion.Never)
const scrimIn = FadeIn.duration(SHEET_MS).easing(EASE_SHEET).reduceMotion(ReduceMotion.Never)
const scrimOut = FadeOut.duration(SHEET_OUT_MS).easing(EASE_SHEET).reduceMotion(ReduceMotion.Never)

/** Style keys that say where the sheet sits and how tall it may get — the outer layer's. */
const PLACEMENT_KEYS = [
  'position', 'top', 'bottom', 'left', 'right', 'start', 'end', 'zIndex',
  'alignSelf', 'flex', 'flexGrow', 'flexBasis',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
] as const

/**
 * Splits a sheet's style between its two layers: placement on the outer one,
 * which rises and sinks, and everything you *see* — fill, corners, padding,
 * the arrangement of its children — on the inner one, which the drag moves.
 * Drawn on the outer layer, the fill stayed behind while the drag slid the
 * content down through it.
 */
function splitSheetStyle(style: StyleProp<ViewStyle>): [ViewStyle, ViewStyle] {
  const rest: Record<string, unknown> = { ...(StyleSheet.flatten(style) ?? {}) }
  const placement: Record<string, unknown> = {}
  for (const key of PLACEMENT_KEYS) {
    if (key in rest) {
      placement[key] = rest[key]
      delete rest[key]
    }
  }
  return [placement as ViewStyle, rest as ViewStyle]
}

/** What the layer hands its sheet: how to close, and where the drag is. */
const SheetLayerContext = createContext<{
  close: () => void
  dragY: SharedValue<number>
  sheetHeight: SharedValue<number>
} | null>(null)

/** What a sheet hands the one list inside it, so the list and the drag can share a finger. */
type SheetList = {
  native: ReturnType<typeof Gesture.Native>
  /** The list's offset, written by the list. */
  listY: SharedValue<number>
  /** How far the sheet is pulled, read by the list to hold itself at its top. */
  dragY: SharedValue<number>
  present: SharedValue<boolean>
}
const SheetListContext = createContext<SheetList | null>(null)

/**
 * The sheet half of a bottom sheet inside a `SheetModal`.
 *
 * It rises by its own height on the iOS sheet curve, and leaves the way it
 * came: back down by its own height. Timed rather than sprung: it opens and
 * closes from a tap, with no velocity to carry. Reduce Motion: it fades in and
 * out with the scrim.
 *
 * ## Dragging it away
 *
 * Grab it anywhere and pull it down. The sheet follows the finger 1:1 on the
 * UI thread and the dim thins with it. Let go past 30% of its height, or with
 * a flick, and it closes — the exit picks up from wherever the finger left it,
 * so nothing jumps back first. Short of that it springs home with the release
 * velocity (400ms, 0.8 damping, as `SwipeToDismiss`).
 *
 * A list inside (`SheetScrollView` / `SheetFlatList`) shares the finger, the
 * way an iOS sheet does:
 * - Scrolled down, a downward drag scrolls the list back up first. Once it
 *   reaches the top, the same drag carries on and takes the sheet down.
 * - While the sheet is pulled, the list is held at its top; push the sheet
 *   back up past where it rests and the list scrolls again.
 * - A flick that only scrolled the list never closes the sheet.
 * Without a list, an upward drag gives a little and resists: there is
 * nowhere to go.
 *
 * Reduce Motion: the sheet still follows the finger — that is direct
 * manipulation, not animation — and a committed drag closes with the fade.
 */
export function RisingSheet({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  const layer = useContext(SheetLayerContext)
  const fallbackY = useSharedValue(0)
  const fallbackHeight = useSharedValue(0)
  const dragY = layer?.dragY ?? fallbackY
  const sheetHeight = layer?.sheetHeight ?? fallbackHeight
  const close = layer?.close

  const listPresent = useSharedValue(false)
  const listY = useSharedValue(0)
  /** Finger travel the list used up before the sheet started to move. */
  const spent = useSharedValue(0)
  const native = Gesture.Native()

  const pan = Gesture.Pan()
    .enabled(!!close)
    .maxPointers(1)
    .activeOffsetY([-12, 12])
    .failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(native)
    .onStart(() => {
      spent.set(0)
    })
    .onUpdate((e) => {
      const t = e.translationY
      if (!listPresent.get()) {
        // Down is 1:1. Up is rubber-banded: 100pt of finger is 20pt of sheet.
        dragY.set(t >= 0 ? t : -2 * Math.sqrt(-t))
        return
      }
      // The list has the finger until it is back at its top.
      if (dragY.get() <= 0 && listY.get() > 0) {
        spent.set(t)
        return
      }
      dragY.set(Math.max(0, t - spent.get()))
    })
    .onEnd((e) => {
      const pulled = dragY.get()
      const far = pulled > Math.max(sheetHeight.get(), 1) * DISMISS_FRACTION
      const fast = e.velocityY > DISMISS_VELOCITY
      if (pulled > 0 && (far || fast) && close) {
        scheduleOnRN(close)
        return
      }
      if (pulled !== 0) dragY.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: e.velocityY }))
    })

  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.get() }] }))
  const [placement, look] = splitSheetStyle(style)

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        entering={reduceMotion ? fadeIn : rise}
        exiting={reduceMotion ? fadeOut : sink}
        style={placement}
        onLayout={(e) => sheetHeight.set(e.nativeEvent.layout.height)}
      >
        {/*
          The drag moves this inner layer, the entrance and exit the outer one —
          one view's transform can't be both. It is also why a released drag
          needs no hand-off: the exit starts from where the finger left it.
          This layer *is* the sheet you see (`splitSheetStyle`), so the fill
          and corners travel with the finger. `flexShrink` lets the outer
          layer's `maxHeight` reach the list inside, or it never scrolls.
        */}
        <Animated.View style={[styles.dragLayer, look, dragStyle]}>
          <SheetListContext.Provider
            value={{ native, listY, dragY, present: listPresent }}
          >
            {children}
          </SheetListContext.Provider>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  )
}

/**
 * The props that let a list share its sheet's drag. No top bounce: at the top,
 * a downward pull belongs to the sheet, and a bounce would move both.
 */
function useSheetList(scrollable: ReturnType<typeof useAnimatedRef<Animated.ScrollView>>) {
  const list = useContext(SheetListContext)
  const present = list?.present
  const fallbackY = useSharedValue(0)
  const listY = list?.listY ?? fallbackY
  const dragY = list?.dragY ?? fallbackY

  useEffect(() => {
    present?.set(true)
    return () => present?.set(false)
  }, [present])

  const onScroll = useAnimatedScrollHandler((e) => {
    // While the sheet is pulled the list stays at its top, or both would move.
    if (dragY.get() > 0 && e.contentOffset.y > 0) {
      scrollTo(scrollable, 0, 0, false)
      listY.set(0)
      return
    }
    listY.set(e.contentOffset.y)
  })

  return list ? { native: list.native, onScroll } : null
}

/** A `ScrollView` inside a `RisingSheet`. */
export function SheetScrollView(props: ComponentProps<typeof Animated.ScrollView>) {
  const scrollable = useAnimatedRef<Animated.ScrollView>()
  const list = useSheetList(scrollable)
  if (!list) return <Animated.ScrollView {...props} />
  return (
    <GestureDetector gesture={list.native}>
      <Animated.ScrollView {...props} ref={scrollable} onScroll={list.onScroll} scrollEventThrottle={16} bounces={false} />
    </GestureDetector>
  )
}

/** `Animated.FlatList` with its item type left to the caller — its own typing fixes it at `unknown`. */
const AnimatedFlatList = Animated.FlatList as unknown as ComponentType<FlatListProps<unknown> & { ref?: unknown }>

/** A `FlatList` inside a `RisingSheet`. */
export function SheetFlatList<T>(props: FlatListProps<T>) {
  const scrollable = useAnimatedRef<Animated.ScrollView>()
  const list = useSheetList(scrollable)
  const listProps = props as FlatListProps<unknown>
  if (!list) return <AnimatedFlatList {...listProps} />
  return (
    <GestureDetector gesture={list.native}>
      <AnimatedFlatList
        {...listProps}
        ref={scrollable}
        onScroll={list.onScroll as never}
        scrollEventThrottle={16}
        bounces={false}
      />
    </GestureDetector>
  )
}

/**
 * The layer a `RisingSheet` lives in: a transparent `Modal` plus the dim.
 *
 * Not `animationType="slide"`: on a transparent Modal that slides the *whole
 * layer*, and the scrim rode up from the bottom with the sheet — a grey wall
 * arriving instead of the page darkening. Not `"fade"` either, which is what
 * this replaced: closing faded the sheet out where it stood instead of taking
 * it back down.
 *
 * So the Modal itself never animates. When `visible` goes false the content
 * unmounts *first*, which is what lets the sheet's `exiting` run, and the
 * Modal stays up until it has finished. The scrim is drawn here, behind the
 * children, so it fades on its own while the sheet moves, and thins as the
 * sheet is dragged; the caller's dismiss target is a transparent `Pressable`.
 *
 * Carries its own `GestureHandlerRootView`: a `Modal` is a separate native
 * root, and gestures inside one do nothing without it.
 */
export function SheetModal({
  visible,
  onRequestClose,
  children,
  ...modalProps
}: Omit<ModalProps, 'animationType' | 'transparent'> & { visible: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(visible)
  if (visible && !mounted) setMounted(true)
  const dragY = useSharedValue(0)
  const sheetHeight = useSharedValue(0)

  useEffect(() => {
    // Each opening starts from rest, whatever the last close left behind.
    if (visible) dragY.set(0)
  }, [visible, dragY])

  useEffect(() => {
    if (visible || !mounted) return
    const id = setTimeout(() => setMounted(false), SHEET_OUT_MS)
    return () => clearTimeout(id)
  }, [visible, mounted])

  const scrimDragStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragY.get(), [0, Math.max(sheetHeight.get(), 1)], [1, 0], Extrapolation.CLAMP),
  }))

  const close = () => onRequestClose?.(undefined as never)

  return (
    <Modal {...modalProps} onRequestClose={onRequestClose} visible={mounted} animationType="none" transparent>
      <GestureHandlerRootView style={styles.fill}>
        {visible ? (
          <SheetLayerContext.Provider value={{ close, dragY, sheetHeight }}>
            {/* Drag thins the outer layer; the inner one owns the fade in and out, so neither jumps. */}
            <Animated.View style={[StyleSheet.absoluteFill, scrimDragStyle]} pointerEvents="none">
              <Animated.View entering={scrimIn} exiting={scrimOut} style={styles.scrim} />
            </Animated.View>
            {children}
          </SheetLayerContext.Provider>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dragLayer: { flexShrink: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: EMBER.backdrop },
})
