import { router, useIsFocused } from 'expo-router'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { BackHandler, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import { KeyboardEvents, useKeyboardContext } from 'react-native-keyboard-controller'
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { IconButton } from '../ds/IconButton'
import { Material } from '../ui/Material'
import { Backdrop, ORB_LEVEL } from './Backdrop'
import { barTop } from '../../lib/barGeometry'
import { DURATION, EASING, RADIUS, SPACE } from '../../lib/design/tokens'
import { emailSheet, handover, inContent, landingUnder, NO_SHEET, revealOffset, SHEET, sheetHeight } from '../../lib/emailSheet'
import { useReducedMotion } from '../../lib/motion'

/*
 * Flow 1c, option C (owner's pick, 2026-11-04): "the landing goes on". The email screens are this one glass sheet over
 * the landing, which keeps turning behind it (the routes are transparent modals, app/_layout.tsx). It grows out of the
 * landing's Dock, or out of the sheet before it, and shrinks back into it on Back. It sits on the keyboard, its title
 * steps aside while the keys are up, and past the room under the back button its stack scrolls.
 * Geometry: lib/emailSheet.ts. Board: mockups/redesign-2026-11/email-sign-in (element-boxes.json).
 */

/** The growth out of the Dock: the board's 520 ms on the sheet curve; Back shrinks it on the exit curve. */
const GROW = { ms: DURATION.long, easing: Easing.bezier(...EASING.sheet) }
const SHRINK = { ms: DURATION.medium, easing: Easing.bezier(...EASING.exit) }
/** Sign-up's two fields open, and the sheet follows, over `base`. */
const STACK_MS = DURATION.base

type Box = { top: number; bottom: number }
const goBack = () => router.back()
const Items = createContext<((name: string, box: Box) => void) | null>(null)

/** A piece of the sheet's stack the scroll can bring into view by name (a field), or keep clear of (`switch`). */
export function SheetItem({ name, children }: { name: string; children: ReactNode }) {
  const report = useContext(Items)
  return (
    <View onLayout={(e: LayoutChangeEvent) => report?.(name, { top: e.nativeEvent.layout.y, bottom: e.nativeEvent.layout.y + e.nativeEvent.layout.height })}>
      {children}
    </View>
  )
}

export function EmailSheet({ title, children, dock, reveal, drivesLanding = false, testID }: {
  /** The heading, stepped aside while the keyboard is up. Null for a sheet whose heading is in its stack. */
  title: ReactNode
  /** The stack under the title: the switch, the fields, a card. */
  children: ReactNode
  /** The sheet's foot: the primary and what goes with it. */
  dock: ReactNode
  /** The `SheetItem` to keep in view while the keyboard is up (the focused field). */
  reveal?: string | null
  /** The first sheet over the landing: its growth is the landing's handover (its tagline and Dock leave). */
  drivesLanding?: boolean
  testID?: string
}) {
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const android = Platform.OS === 'android'
  const reduceMotion = useReducedMotion()
  const focused = useIsFocused()
  const shared = emailSheet()
  const kb = useKeyboardContext().reanimated
  const lift = useDerivedValue(() => Math.max(0, -kb.height.get()))

  // Where it grows from: the sheet before it, else the landing's Dock, else (no landing under: a link) the foot.
  const [from] = useState(() => shared.height.get() || landingUnder()?.dockHeight || 0)
  const [behind] = useState(() => landingUnder() === null)
  const grow = useSharedValue(0)
  const titleH = useSharedValue(0)
  const stackH = useSharedValue(0)
  const dockH = useSharedValue(0)
  const measuredStack = useRef(false)

  useEffect(() => {
    grow.set(withTiming(1, { duration: reduceMotion ? DURATION.base : GROW.ms, easing: reduceMotion ? Easing.linear : GROW.easing }))
  }, [grow, reduceMotion])

  const height = useDerivedValue(() => {
    const p = kb.progress.get()
    const content = (titleH.get() + (titleH.get() > 0 ? SHEET.titleGap : 0)) * (1 - p) + stackH.get()
    const target = sheetHeight({ content, dock: dockH.get(), lift: lift.get(), windowHeight: window.height, insetTop: insets.top, insetBottom: insets.bottom, android })
    // Reduce Motion: no growth, the sheet is its size and only fades in.
    return reduceMotion ? target : from + (target - from) * grow.get()
  })

  // The landing reads these: the handover's progress, the sheet's edge (its lockup steps aside), and the height a sheet over this one grows from.
  useAnimatedReaction(
    () => [grow.get(), height.get(), lift.get()] as const,
    ([g, h, l]) => {
      if (!focused) return
      if (drivesLanding) shared.progress.set(g)
      shared.top.set(window.height - l - h)
      shared.height.set(h)
    },
    [focused, drivesLanding, window.height]
  )
  useEffect(
    () => () => {
      if (!drivesLanding) return
      shared.progress.set(0)
      shared.top.set(NO_SHEET)
      shared.height.set(0)
    },
    [drivesLanding, shared]
  )

  const close = () => {
    grow.set(
      withTiming(0, { duration: reduceMotion ? DURATION.base : SHRINK.ms, easing: SHRINK.easing }, (done) => {
        if (done) scheduleOnRN(goBack)
      })
    )
  }
  useEffect(() => {
    if (!focused || !android) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close()
      return true
    })
    return () => sub.remove()
  })

  // The stack's pieces, by name, for the scroll; the scroll's own size.
  const boxes = useRef(new Map<string, Box>())
  const view = useRef({ visible: 0, content: 0 })
  const scroll = useRef<ScrollView>(null)
  const show = (name?: string | null) => {
    const box = name ? boxes.current.get(name) : undefined
    if (!box) return
    // With the keys up the title has stepped aside (its block is 0); at rest it is there.
    const titleBlock = Keyboard.isVisible() ? 0 : titleH.get() + (titleH.get() > 0 ? SHEET.titleGap : 0)
    const field = inContent(box, titleBlock)
    const floor = inContent(boxes.current.get('switch') ?? { top: 0, bottom: 0 }, titleBlock).bottom + SHEET.gap
    scroll.current?.scrollTo({ y: revealOffset(field, view.current.visible, view.current.content, floor), animated: !reduceMotion })
  }
  // On a new focus, and once the keyboard has landed (the sheet's room is known then); when it goes, back to the top,
  // so the title that steps back in is never left scrolled away (a drive: sign-up opened 54 pt down, its title gone).
  useEffect(() => {
    show(reveal)
    const shown = KeyboardEvents.addListener('keyboardDidShow', () => show(reveal))
    const hidden = KeyboardEvents.addListener('keyboardDidHide', () => scroll.current?.scrollTo({ y: 0, animated: !reduceMotion }))
    return () => {
      shown.remove()
      hidden.remove()
    }
  }, [reveal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Under a sheet over it (forgot-password over sign-in) this one steps out of sight, and comes back with Back.
  const sheetStyle = useAnimatedStyle(() => ({ height: height.get(), bottom: lift.get(), opacity: focused ? 1 : 0 }), [focused])
  const formStyle = useAnimatedStyle(() => ({ opacity: handover(grow.get()).form }))
  const actionsStyle = useAnimatedStyle(() => ({ opacity: handover(grow.get()).actions, paddingBottom: Math.max(0, insets.bottom - lift.get()) + SHEET.foot }))
  const titleStyle = useAnimatedStyle(() => {
    const p = kb.progress.get()
    if (titleH.get() === 0) return { opacity: 1 - p }
    return { height: (titleH.get() + SHEET.titleGap) * (1 - p), opacity: 1 - p }
  })
  const backStyle = useAnimatedStyle(() => ({ opacity: grow.get() }))

  return (
    <View testID={testID} style={StyleSheet.absoluteFill} pointerEvents={focused ? 'box-none' : 'none'} accessibilityViewIsModal>
      {/* A link straight to the form has no landing under it: the sky it would have been on. */}
      {behind ? <Backdrop level={ORB_LEVEL.landing} /> : null}
      {/* A tap on the sky above the sheet puts the keyboard away; it is not a control, so it is not announced. */}
      <Pressable testID={testID && `${testID}-sky`} accessible={false} onPress={Keyboard.dismiss} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.back, { top: barTop(insets.top) }, backStyle]}>
        <IconButton icon={android ? 'arrow-left' : 'chevron-left'} accessibilityLabel="Back" onPress={close} testID={testID && `${testID}-back`} />
      </Animated.View>
      <Animated.View testID={testID && `${testID}-sheet`} style={[styles.sheet, sheetStyle]}>
        <Material role="bar" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.round]} />
        <Animated.View style={[styles.flex, formStyle]}>
          <ScrollView
            ref={scroll}
            testID={testID && `${testID}-scroll`}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.stack}
            onLayout={(e) => (view.current.visible = e.nativeEvent.layout.height)}
            onContentSizeChange={(_w, h) => (view.current.content = h)}
          >
            <Items.Provider value={(name, box) => boxes.current.set(name, box)}>
              {title ? (
                <Animated.View style={[styles.clip, titleStyle]}>
                  <View onLayout={(e) => titleH.set(e.nativeEvent.layout.height)}>{title}</View>
                </Animated.View>
              ) : null}
              <View
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height
                  // The first size is taken as it is; a change after (sign-up's fields) eases, and the sheet with it.
                  stackH.set(measuredStack.current && !reduceMotion ? withTiming(h, { duration: STACK_MS }) : h)
                  measuredStack.current = true
                }}
                style={styles.rest}
              >
                {children}
              </View>
            </Items.Provider>
          </ScrollView>
        </Animated.View>
        <Animated.View style={[styles.dock, actionsStyle]}>
          <View onLayout={(e) => dockH.set(e.nativeEvent.layout.height)} style={styles.dockInner}>
            {dock}
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { position: 'absolute', left: SPACE.lg, zIndex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', borderTopLeftRadius: RADIUS.card, borderTopRightRadius: RADIUS.card },
  round: { borderTopLeftRadius: RADIUS.card, borderTopRightRadius: RADIUS.card },
  stack: { paddingTop: SHEET.padTop, paddingHorizontal: SPACE.gutter },
  clip: { overflow: 'hidden' },
  rest: { gap: SHEET.gap },
  dock: { paddingTop: SHEET.gap, paddingHorizontal: SPACE.gutter },
  dockInner: { gap: SPACE.xs },
})
