import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { Icon, type IconName } from '../ui/Icon'
import { COLOR, ICON, RADIUS, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { font, PRESSED_WASH, useBoldText } from './shared'

/** The page's action width. */
export const SWIPE_ACTION_WIDTH = 72
/** Past the tray the row follows at half speed; a release this fast opens or closes whatever the distance. */
const RUBBER = 0.5
const FLING_VELOCITY = 800

export type SwipeAction = {
  icon: IconName
  label: string
  onPress: () => void
  /** Unmatch, Leave: on `destructiveFill`. The confirm, and its `H.destructive`, are the screen's. */
  destructive?: boolean
}

export type SwipeRowProps = {
  /** One or two: Mute · More (a room or chat), Mark read (a DM), Unmatch (a match). */
  actions: SwipeAction[]
  /** Opens the thread. */
  onPress?: () => void
  /** The row read as one element; its actions are in the rotor. */
  accessibilityLabel: string
  /** Controlled when given: the row rests where this says, sliding back if a drag's answer is not taken. A tap elsewhere closing it is the list's job. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The row as drawn (the Banter row): opaque, it covers the tray. */
  children: ReactNode
  testID?: string
}

/**
 * A Banter row that slides (guidelines/components/SwipeRow.html, ROUND3 D
 * 5.11): dragged left, one or two 72 pt actions show under it. Released past
 * halfway (or flung) it settles open, short of it it springs back, on
 * `M.snap` carrying the flick's velocity; `H.threshold` as it crosses halfway, either way, and nothing on the
 * spring back. Open, a tap on it closes it. Never swipe-to-delete.
 *
 * The same actions sit in the row's accessibility actions (and its ⋯ and the
 * thread's info screen), so nobody has to swipe; the tray is hidden from a
 * screen reader. A hold opens the same tray, with `H.longPress`. Android: the same gesture, no ripple on the tray. Reduce
 * Motion: the drag is kept (direct manipulation) and it snaps without the
 * spring. The page's shadow on the open row is not drawn: surfaces are flat.
 */
export function SwipeRow({ actions, onPress, accessibilityLabel, open, onOpenChange, children, testID }: SwipeRowProps) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const width = actions.length * SWIPE_ACTION_WIDTH
  const [isOpen, setIsOpen] = useState(open ?? false)
  const x = useSharedValue(open ? -width : 0)
  const start = useSharedValue(0)
  const past = useSharedValue(open ?? false)

  /** Where it was last sent to rest (-width or 0): the effect below re-asking for that same rest must not restart the spring. */
  const target = useSharedValue(open ? -width : 0)

  /**
   * Send it to rest, open or closed. `velocity` is a flick's, handed to the spring (no seam between the finger and the
   * settle). `force` is a release, which always springs: it may be stretched past the edge, or the owner may have refused.
   */
  const slide = (to: boolean, velocity = 0, force = false) => {
    'worklet'
    past.set(to)
    const rest = to ? -width : 0
    if (!force && target.get() === rest) return
    target.set(rest)
    x.set(reduceMotion ? rest : withSpring(rest, { ...SPRING.snap, velocity }))
  }
  // Each answer the row gives bumps `asked`, so a controlled row whose owner keeps `open` as it was slides back to it.
  const [asked, setAsked] = useState(0)
  const report = useCallback(
    (next: boolean) => {
      setIsOpen(next)
      setAsked((n) => n + 1)
      onOpenChange?.(next)
    },
    [onOpenChange]
  )
  const close = () => {
    slide(false)
    report(false)
  }
  const shownOpen = open ?? isOpen

  // Where it rests: the prop when controlled, its own state otherwise; at the current tray's width.
  useEffect(() => {
    slide(shownOpen)
    // `slide` is rebuilt each render from `width` and `reduceMotion`, both listed through their effects here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownOpen, width, asked])

  // A gesture crossing its threshold is H.threshold; H.detent is a sheet catching a detent.
  const tick = useCallback(() => H.threshold(), [])
  const swipe = Gesture.Pan()
    .activeOffsetX([-SPACE.md, SPACE.md])
    .failOffsetY([-SPACE.sm, SPACE.sm])
    .onStart(() => start.set(x.get()))
    .onUpdate((e) => {
      const raw = start.get() + e.translationX
      // Past the closed edge it stretches a little and pulls back (rubber band), never a wall.
      const next = raw > 0 ? raw * RUBBER * RUBBER : raw < -width ? -width + (raw + width) * RUBBER : raw
      x.set(next)
      const beyond = -next >= width / 2
      if (beyond === past.get()) return
      past.set(beyond)
      scheduleOnRN(tick)
    })
    .onEnd((e, success) => {
      // A cancelled drag (a system interrupt) goes back to where it began and answers nothing.
      if (!success) {
        slide(start.get() < -width / 2, 0, true)
        return
      }
      const opened = e.velocityX < -FLING_VELOCITY ? true : e.velocityX > FLING_VELOCITY ? false : -x.get() >= width / 2
      slide(opened, e.velocityX, true)
      scheduleOnRN(report, opened)
    })
  if (testID) swipe.withTestId(`${testID}-swipe`)

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }))
  const byName = (e: AccessibilityActionEvent) => actions.find((a) => a.label === e.nativeEvent.actionName)?.onPress()

  return (
    <View testID={testID} style={styles.clip}>
      <View style={styles.tray} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {actions.map((action, i) => (
          <Pressable
            key={action.label}
            testID={testID && `${testID}-action-${i}`}
            onPress={() => {
              close()
              action.onPress()
            }}
            style={[styles.action, { width: SWIPE_ACTION_WIDTH, backgroundColor: action.destructive ? COLOR.destructiveFill : COLOR.surfaceRaised }]}
          >
            <Icon name={action.icon} size={ICON.control} />
            <Text maxFontSizeMultiplier={1.3} style={[font('caption', bold), styles.white]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <GestureDetector gesture={swipe}>
        <Animated.View testID={testID && `${testID}-row`} style={[styles.row, rowStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityActions={actions.map((a) => ({ name: a.label, label: a.label }))}
            onAccessibilityAction={byName}
            onPress={() => (shownOpen ? close() : onPress?.())}
            // The same tray from a hold, for whoever does not know to swipe: H.longPress as it opens (a context menu, DS H.longPress).
            onLongPress={() => {
              if (shownOpen) return
              H.longPress()
              slide(true, 0, true)
              report(true)
            }}
            android_ripple={{ color: PRESSED_WASH.android }}
          >
            {children}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  clip: { borderRadius: RADIUS.rowInCard, overflow: 'hidden' },
  tray: { position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row' },
  action: { alignItems: 'center', justifyContent: 'center', gap: SPACE.xs },
  white: { color: COLOR.textPrimary },
  row: { backgroundColor: COLOR.ink },
})
