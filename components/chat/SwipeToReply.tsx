import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { EMBER, ICON, SPACE } from '../../lib/theme'
import { replyDragOffset, REPLY_SWIPE_TRIGGER } from '../../lib/swipeReply'

interface SwipeToReplyProps {
  children: ReactNode
  onReply: () => void
  /** A message that cannot be replied to (not sent, removed) does not move. */
  enabled?: boolean
}

/**
 * Drag a message to the right to reply to it — the gesture WhatsApp and
 * Telegram taught everyone (SCRUM-409). Horizontal only, so the list still
 * scrolls; the reply arrow fills in and a haptic ticks once the drag has gone
 * far enough, and letting go there replies.
 */
export function SwipeToReply({ children, onReply, enabled = true }: SwipeToReplyProps) {
  const dx = useSharedValue(0)
  const armed = useSharedValue(false)

  const tick = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([12, 999])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      dx.value = replyDragOffset(e.translationX)
      const past = dx.value >= REPLY_SWIPE_TRIGGER
      if (past && !armed.value) scheduleOnRN(tick)
      armed.value = past
    })
    .onEnd(() => {
      if (armed.value) scheduleOnRN(onReply)
      armed.value = false
      dx.value = withSpring(0, { damping: 20, stiffness: 240 })
    })

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }))
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dx.value, [0, REPLY_SWIPE_TRIGGER], [0, 1]),
    transform: [{ scale: interpolate(dx.value, [0, REPLY_SWIPE_TRIGGER], [0.6, 1]) }],
  }))

  return (
    <View>
      <Animated.View style={[styles.icon, iconStyle]} pointerEvents="none">
        <Ionicons name="arrow-undo" size={ICON.md} color={EMBER.textSecondary} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  icon: { position: 'absolute', left: SPACE.sm, top: 0, bottom: 0, justifyContent: 'center' },
})
