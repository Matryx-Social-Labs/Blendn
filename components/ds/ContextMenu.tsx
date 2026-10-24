import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import type { ChatReaction } from '../../lib/chatReactions'
import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, MATERIAL, PRESS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { useTurnGate, useTurnWatch } from '../../lib/modalTurn'
import { onClosingForLink } from '../../lib/pendingRoute'
import { useLatest } from '../../lib/useLatest'
import { tint } from '../../lib/theme'
import type { Rect } from './chatShared'
import { ReactionBar, reactionBarWidth } from './ReactionBar'
import { font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The page's column: 220 pt wide, 20 pt corners. */
const MENU_WIDTH = 220
const MENU_RADIUS = 20
/** #36: the item lifts to 1.03 over a 55% dim; the bar and the menu spring from 0.9. */
const LIFT = 1.03
const DIM = 0.55
const SPRING_FROM = 0.9
/** The menu's drift on the way out. */
const EXIT_DROP = 8

export type MenuItem = {
  icon: IconName
  /** The verb, or the person ("Cosmic Panda" with `chevron`, to their card). */
  label: string
  onPress: () => void
  /** Last, in red: Block…, Leave room. */
  destructive?: boolean
  /** It opens something (the sender's card). */
  chevron?: boolean
}

export type ContextMenuProps = {
  items: MenuItem[]
  /** The design gallery only: draws the row at this index pressed. */
  previewPressed?: number
  testID?: string
}

/**
 * What a long-press offers (guidelines/components/ContextMenu.html): a 220 pt
 * column on the sheet glass tier (Android: solid, no blur), 48 pt rows with a
 * glyph, hairlines between, the destructive one last in red. Every item is
 * also reachable without the gesture (the bubble's accessibility actions, the
 * info screen, the PersonCard): the menu is a shortcut, never the only door.
 *
 * Rows grow with their text (48 pt is a minimum); labels cap at 1.3×. Pressed:
 * iOS a 6% wash, Android the 12% ripple. No haptic on an item: its own
 * outcome carries it (none on Copy, ROUND3 C20). Increase Contrast: 50%
 * hairlines.
 */
export function ContextMenu({ items, previewPressed, testID }: ContextMenuProps) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const separator = contrast
    ? { borderTopWidth: 1, borderTopColor: MATERIAL.hairlineIncreaseContrast }
    : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline }

  return (
    <Material testID={testID} role="sheet" accessibilityRole="menu" style={[styles.menu, contrast && IC_HAIRLINE]}>
      {items.map(({ icon, label, onPress, destructive, chevron }, i) => {
        const color = destructive ? COLOR.destructive : COLOR.textPrimary
        return (
          <Pressable
            key={label}
            testID={testID && `${testID}-row-${i}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            android_ripple={{ color: PRESSED_WASH.android }}
            style={({ pressed }) => [
              styles.row,
              i > 0 && separator,
              ((pressed && !android) || previewPressed === i) && { backgroundColor: android ? PRESSED_WASH.android : PRESSED_WASH.ios },
            ]}
          >
            <Icon name={icon} size={ICON.control} color={color} />
            <Text maxFontSizeMultiplier={1.3} style={[font('button', bold, FONT_FAMILY.brand[500]), styles.label, { color }]}>
              {label}
            </Text>
            {chevron ? <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} /> : null}
          </Pressable>
        )
      })}
    </Material>
  )
}

export type LongPressMenuProps = {
  visible: boolean
  /** The pressed item's frame in the window. Clearing it closes the menu, as `visible` does. */
  anchor: Rect | null
  /** The edge the bar and menu line up with: `right` for your own message. */
  side: 'left' | 'right'
  items: MenuItem[]
  /** The reaction bar above the item; omit where there are none (a DM, a room that refuses writes, still sending). */
  reactions?: { mine: readonly string[]; onPick: (emoji: ChatReaction) => void }
  /** The dim, system back, the escape gesture, or after an item or a reaction. It must hide the menu. */
  onClose: () => void
  /** The item as it lifts: the screen draws its copy (`<ChatBubble lifted>`) at the anchor's width. */
  children: ReactNode
  testID?: string
}

/** How close to a screen edge the overlay's pieces may come. */
const EDGE = SPACE.sm

/**
 * Where the lifted item, the bar and the menu go: the bar above the item, the
 * menu below it, all on screen. Near the bottom the item moves up so the menu
 * fits; an item too tall for both pins the menu to the bottom, over the item.
 * Each piece lines up with the item's `side` edge and is kept off the sides.
 */
export function placeLongPress({
  window,
  insets,
  anchor,
  side,
  bar,
  menu,
}: {
  window: { width: number; height: number }
  insets: { top: number; bottom: number }
  anchor: Rect
  side: 'left' | 'right'
  /** The bar's size, or null without one. */
  bar: { width: number; height: number } | null
  menu: { width: number; height: number }
}) {
  const highest = insets.top + EDGE + (bar ? bar.height + SPACE.sm : 0)
  const bottom = window.height - insets.bottom - EDGE
  const lowest = bottom - menu.height - SPACE.md - anchor.height
  const top = lowest < highest ? highest : Math.max(highest, Math.min(anchor.y, lowest))
  const left = (width: number) => {
    const at = side === 'left' ? anchor.x : anchor.x + anchor.width - width
    return Math.max(EDGE, Math.min(at, window.width - EDGE - width))
  }
  return {
    item: top,
    bar: bar ? { top: top - bar.height - SPACE.sm, left: left(bar.width) } : null,
    menu: { top: Math.min(top + anchor.height + SPACE.md, bottom - menu.height), left: left(MENU_WIDTH) },
  }
}

/**
 * The long-press (ROUND3 D 5.2, motion #36): the item lifts over a 55% dim,
 * the reaction bar above it and the menu below, both springing from it. The
 * screen plays `H.longPress` as the hold completes (the bubble does); an item
 * or a reaction closes it, and so do the dim, Android's back and the escape
 * gesture. `onClose` must hide it. On iOS an item runs once the menu has been
 * dismissed, so an item that opens a sheet presents it over the screen, not
 * over a modal on its way out.
 *
 * Motion #36: the item lifts 0.97 → 1.03 on `M.settle`; the dim fades over
 * `base`; the bar and the menu spring 0.9 → 1 at their anchors on `M.snap`
 * (the bar springs itself). Reduce Motion: no lift and no spring; the dim
 * fades. Glass never fades (§5.2 rule 6), so the menu appears in place.
 *
 * Exit (#6): the dim fades and the menu fades and drops 8 pt over `quick`; the
 * Modal stays mounted for it. Reduce Motion: the fade alone.
 *
 * ponytail: iOS's 6 pt blur behind the dim is not drawn (Material is the only
 * blur and has no backdrop role).
 */
export function LongPressMenu({ visible, anchor, side, items, reactions, onClose, children, testID }: LongPressMenuProps) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const lift = useSharedValue(reduceMotion ? 1 : PRESS.scale)
  const pop = useSharedValue(reduceMotion ? 1 : SPRING_FROM)
  const dim = useSharedValue(0)
  /** 0 while it is up, 1 as it leaves (DS #6 exit: a quick fade with an 8 pt drop). */
  const leave = useSharedValue(0)
  const estimate = items.length * SIZE.control
  const [menuHeight, setMenuHeight] = useState(estimate)
  /*
   * The frame it last opened at. A screen often closes it by clearing `anchor`
   * with `visible`; the Modal stays mounted on it until iOS has dismissed it,
   * or `onDismiss` (which runs the chosen item) would never come.
   */
  const [kept, setKept] = useState(anchor)
  if (anchor && anchor !== kept) setKept(anchor)
  // One Modal on screen at a time on iOS (lib/modalTurn): asked for, it waits for the screen, like the Sheet.
  const gate = useTurnGate(visible && !!anchor)
  const shown = gate.allowed
  // A link closes an open menu, as it does a sheet (lib/pendingRoute `onClosingForLink`): nothing it offers applies there.
  const closeForLink = useLatest(onClose)
  const open = visible && !!anchor
  useEffect(() => (open ? onClosingForLink(() => closeForLink.current()) : undefined), [open, closeForLink])
  // The Modal stays up for the exit and goes after it (state adjusted in render), like the Sheet.
  const [mounted, setMounted] = useState(shown)
  if (shown && !mounted) setMounted(true)
  const turn = useTurnWatch(gate, mounted)
  // Each open starts from this menu's own estimate, not the last one's measure (state adjusted in render).
  const [openedFor, setOpenedFor] = useState(shown)
  if (shown !== openedFor) {
    setOpenedFor(shown)
    if (shown) setMenuHeight(estimate)
  }
  // An item to run once iOS has dismissed the menu.
  const pending = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!shown) {
      // Out over `quick` on the exit curve: the dim fades, the menu fades and drops 8 pt (Reduce Motion: the fade alone).
      const out = { duration: DURATION.quick, easing: Easing.bezier(...EASING.exit) }
      dim.set(withTiming(0, out))
      leave.set(withTiming(1, out))
      const timer = setTimeout(() => {
        setMounted(false)
        // Back to where an open starts, so the next one's first frame is right.
        leave.set(0)
        lift.set(reduceMotion ? 1 : PRESS.scale)
        pop.set(reduceMotion ? 1 : SPRING_FROM)
      }, DURATION.quick)
      return () => clearTimeout(timer)
    }
    leave.set(0)
    dim.set(withTiming(1, { duration: motionTokens(reduceMotion).duration.base, easing: Easing.bezier(...EASING.gentle) }))
    if (reduceMotion) return
    lift.set(withSequence(withTiming(PRESS.scale, { duration: 0 }), withSpring(LIFT, SPRING.settle)))
    pop.set(withSequence(withTiming(SPRING_FROM, { duration: 0 }), withSpring(1, SPRING.snap)))
  }, [shown, reduceMotion, dim, leave, lift, pop])

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.get() }))
  const popStyle = useAnimatedStyle(() => ({
    opacity: 1 - leave.get(),
    transform: [{ translateY: reduceMotion ? 0 : EXIT_DROP * leave.get() }, { scale: pop.get() }],
  }))
  const itemStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.get(), transform: [{ scale: lift.get() }] }))

  const frame = anchor ?? kept
  // Never opened: nothing to keep mounted.
  if (!frame) return null
  const at = placeLongPress({
    window,
    insets,
    anchor: frame,
    side,
    bar: reactions ? { width: reactionBarWidth(), height: SIZE.control } : null,
    menu: { width: MENU_WIDTH, height: menuHeight },
  })
  const runItem = (then: () => void) => () => {
    onClose()
    if (Platform.OS === 'ios') pending.current = then
    else then()
  }
  const dismissed = () => {
    const then = pending.current
    pending.current = null
    then?.()
  }

  return (
    <Modal
      testID={testID && `${testID}-modal`}
      visible={mounted && !turn.refused}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onShow={turn.onShow}
      onDismiss={() => {
        turn.onDismiss()
        dismissed()
      }}
    >
      {/* A Modal is its own native root: the bar's scrub needs its own root view. */}
      <GestureHandlerRootView style={styles.fill}>
        <View testID={testID && `${testID}-root`} style={styles.fill} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
            <Pressable
              testID={testID && `${testID}-dim`}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onPress={onClose}
              style={[StyleSheet.absoluteFill, { backgroundColor: tint(COLOR.ink, DIM) }]}
            />
          </Animated.View>
          <Animated.View
            testID={testID && `${testID}-item`}
            style={[styles.place, { top: at.item, left: frame.x, width: frame.width, transformOrigin: `${side} center` }, itemStyle]}
          >
            {children}
          </Animated.View>
          {reactions && at.bar ? (
            <View testID={testID && `${testID}-bar`} style={[styles.place, at.bar]}>
              <ReactionBar
                side={side}
                mine={reactions.mine}
                onPick={(emoji) => {
                  onClose()
                  reactions.onPick(emoji)
                }}
              />
            </View>
          ) : null}
          <Animated.View
            testID={testID && `${testID}-menu`}
            onLayout={(e) => setMenuHeight(e.nativeEvent.layout.height)}
            style={[styles.place, at.menu, { transformOrigin: `${side} top` }, popStyle]}
          >
            <ContextMenu items={items.map((item) => ({ ...item, onPress: runItem(item.onPress) }))} />
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  menu: { width: MENU_WIDTH, borderRadius: MENU_RADIUS },
  row: {
    minHeight: SIZE.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
  label: { flex: 1 },
  place: { position: 'absolute' },
})
