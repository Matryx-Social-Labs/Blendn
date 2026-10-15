import { useEffect, useState, type ReactNode } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import type { ChatReaction } from '../../lib/chatReactions'
import { COLOR, EASING, FONT_FAMILY, ICON, MATERIAL, PRESS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import type { Rect } from './chatShared'
import { ReactionBar } from './ReactionBar'
import { font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The page's column: 220 pt wide, 20 pt corners. */
const MENU_WIDTH = 220
const MENU_RADIUS = 20
/** #36: the item lifts to 1.03 over a 55% dim; the bar and the menu spring from 0.9. */
const LIFT = 1.03
const DIM = 0.55
const SPRING_FROM = 0.9

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
  /** The pressed item's frame in the window (`measureInWindow`). */
  anchor: Rect | null
  /** The edge the bar and menu line up with: `right` for your own message. */
  side: 'left' | 'right'
  items: MenuItem[]
  /** The reaction bar above the item; omit where there are none (a DM, a room that refuses writes, still sending). */
  reactions?: { mine: readonly string[]; onPick: (emoji: ChatReaction) => void }
  /** The dim, system back, the escape gesture, or after an item or a reaction. */
  onClose: () => void
  /** The item as it lifts: the screen draws its copy (the bubble). */
  children: ReactNode
  testID?: string
}

/**
 * The long-press (ROUND3 D 5.2, motion #36): the item lifts over a 55% dim,
 * the reaction bar above it and the menu below, both springing from it. The
 * screen plays `H.longPress` as the hold completes (the bubble does); an item
 * or a reaction closes it, and so do the dim, Android's back and the escape
 * gesture. Kept on screen: near an edge the item moves in, so the bar and the
 * menu fit.
 *
 * Motion #36: the item lifts 0.97 → 1.03 on `M.settle`; the dim fades over
 * `base`; the bar and the menu spring 0.9 → 1 at their anchors on `M.snap`.
 * Reduce Motion: no lift and no spring; the dim fades. Glass never fades
 * (§5.2 rule 6), so the menu appears in place.
 *
 * ponytail: iOS's 6 pt blur behind the dim is not drawn (Material is the only
 * blur and has no backdrop role); no exit animation (it unmounts).
 */
export function LongPressMenu({ visible, anchor, side, items, reactions, onClose, children, testID }: LongPressMenuProps) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const lift = useSharedValue(1)
  const pop = useSharedValue(1)
  const dim = useSharedValue(0)
  const [menuHeight, setMenuHeight] = useState(items.length * SIZE.control)

  useEffect(() => {
    if (!visible) return
    dim.set(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: motionTokens(reduceMotion).duration.base, easing: Easing.bezier(...EASING.gentle) })))
    if (reduceMotion) return
    lift.set(withSequence(withTiming(PRESS.scale, { duration: 0 }), withSpring(LIFT, SPRING.settle)))
    pop.set(withSequence(withTiming(SPRING_FROM, { duration: 0 }), withSpring(1, SPRING.snap)))
  }, [visible, reduceMotion, dim, lift, pop])

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.get() }))
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ scale: lift.get() }] }))
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }))

  if (!anchor) return null
  const bar = reactions ? SIZE.control + SPACE.sm : 0
  const highest = insets.top + SPACE.sm + bar
  const lowest = window.height - insets.bottom - SPACE.sm - menuHeight - SPACE.md - anchor.height
  const top = Math.max(highest, Math.min(anchor.y, lowest))
  const across = side === 'left' ? { left: anchor.x } : { right: window.width - anchor.x - anchor.width }
  const close = (then: () => void) => () => {
    onClose()
    then()
  }

  return (
    <Modal
      testID={testID && `${testID}-modal`}
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
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
            style={[styles.place, { top, left: anchor.x, width: anchor.width, transformOrigin: `${side} center` }, liftStyle]}
          >
            {children}
          </Animated.View>
          {reactions ? (
            <Animated.View
              testID={testID && `${testID}-bar`}
              style={[styles.place, across, { top: top - bar, transformOrigin: `${side} bottom` }, popStyle]}
            >
              <ReactionBar side={side} mine={reactions.mine} onPick={(emoji) => close(() => reactions.onPick(emoji))()} />
            </Animated.View>
          ) : null}
          <Animated.View
            testID={testID && `${testID}-menu`}
            onLayout={(e) => setMenuHeight(e.nativeEvent.layout.height)}
            style={[styles.place, across, { top: top + anchor.height + SPACE.md, transformOrigin: `${side} top` }, popStyle]}
          >
            <ContextMenu items={items.map((item) => ({ ...item, onPress: close(item.onPress) }))} />
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
