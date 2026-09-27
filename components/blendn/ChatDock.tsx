import { Ionicons } from '@expo/vector-icons'
import React, { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { MOTION_SPRING } from '../../lib/motion'
import { subscribeToChatMessage } from '../../lib/socketClient'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'
import { Text } from '../ui/Text'

/** A line in the dock: somebody's message, or something the room did. */
export interface DockLine {
  id: string
  kind: 'message' | 'system'
  who?: string
  text: string
  at: number
}

/** How far up the dock must be pulled before it opens the chat. */
const OPEN_DRAG = 48
const SHOWN = 2

function fromHistory(raw: unknown, myId?: string): DockLine[] {
  const list = Array.isArray(raw)
    ? raw
    : ((raw as { messages?: unknown[] } | null)?.messages ?? [])
  return (list as Record<string, any>[])
    .filter((m) => !m.moderation_hidden && (m.content || m.message_text))
    .map((m) => {
      const sender = m.user_id || m.userId || m.sender_id
      return {
        id: String(m.id),
        kind: 'message' as const,
        who: sender === myId ? 'You' : m.user?.name || m.sender_name || 'Attendee',
        text: String(m.content || m.message_text),
        at: Date.parse(m.created_at || m.createdAt) || 0,
      }
    })
}

/**
 * The room's chat, docked under the people — not a second screen you toggle to.
 *
 * X Spaces keeps the conversation one tap away with a count pill; TikTok LIVE
 * runs it under the people with the room's own events inline. This is both:
 * the last two lines of the chat, interleaved with what the room just did
 * ("Priya walked in", "You matched with Cosmic Panda"), over a composer-shaped
 * pill. Pull it up, or tap it, and the full chat opens on top.
 *
 * **Why the full chat is still its own screen.** `app/chat/[id]` owns the
 * socket subscription, moderation, replies, reactions and the composer, and a
 * second mount of a live room is where subscription leaks live (`app/room.tsx`
 * learned that). The dock only *reads*: history once, then new messages over
 * the same shared subscription map, so opening the chat does not join twice.
 *
 * New lines rise in from below (`FadeInDown`) and the older one slides up to
 * make room; the dock never changes height, so nothing above it moves.
 */
export function ChatDock({
  chatGroupId,
  myId,
  system,
  onOpen,
  bottomInset,
}: {
  chatGroupId: string | null
  myId?: string
  /** The room's own events, newest last. */
  system: DockLine[]
  onOpen: () => void
  bottomInset: number
}) {
  const reduceMotion = useReducedMotion()
  const [messages, setMessages] = useState<DockLine[]>([])
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!chatGroupId) return
    let cancelled = false
    apiClient
      .getChatMessages(chatGroupId, { limit: 8 })
      .then((r) => {
        if (cancelled || !r.success) return
        const lines = fromHistory(r.data, myId)
        setMessages(lines.sort((a, b) => a.at - b.at).slice(-SHOWN))
        const total = (r.data as { pagination?: { total?: number } } | null)?.pagination?.total
        setCount(typeof total === 'number' ? total : lines.length)
      })
      .catch((e) => Logger.debug('chat', 'dock history failed', { error: e }))
    const unsubscribe = subscribeToChatMessage(chatGroupId, (data) => {
      if (data.chatGroupId !== chatGroupId) return
      const m = data.message
      setMessages((prev) =>
        [
          ...prev.filter((p) => p.id !== m.id),
          {
            id: m.id,
            kind: 'message' as const,
            who: m.userId === myId ? 'You' : m.userName || 'Attendee',
            text: m.content,
            at: Date.parse(m.createdAt) || Date.now(),
          },
        ].slice(-SHOWN)
      )
      setCount((c) => c + 1)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [chatGroupId, myId])

  const lines = useMemo(
    () => [...messages, ...system].sort((a, b) => a.at - b.at).slice(-SHOWN),
    [messages, system]
  )

  // Pull up to open: the dock follows the finger a little, then hands off.
  const lift = useSharedValue(0)
  const pull = Gesture.Pan()
    .activeOffsetY(-8)
    .failOffsetY(8)
    .onUpdate((e) => {
      lift.set(Math.max(-OPEN_DRAG * 1.5, Math.min(0, e.translationY * 0.5)))
    })
    .onEnd((e) => {
      if (e.translationY < -OPEN_DRAG || e.velocityY < -700) scheduleOnRN(onOpen)
      lift.set(withSpring(0, MOTION_SPRING.snappy))
    })
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }] }))

  const label = chatGroupId ? `Room chat${count ? ` · ${count}` : ''}` : 'Room chat'

  return (
    <GestureDetector gesture={pull}>
      <Animated.View style={[styles.dock, { paddingBottom: bottomInset + SPACE.md }, liftStyle]}>
        <View style={styles.handle} />
        <View style={styles.lines} accessibilityLiveRegion="polite">
          {lines.length === 0 ? (
            <Text variant="meta" color={EMBER.textTertiary}>
              Nobody has said anything yet. Be the first.
            </Text>
          ) : (
            lines.map((l) => (
              <Animated.View
                key={l.id}
                entering={reduceMotion ? undefined : FadeInDown.duration(220)}
                exiting={FadeOut.duration(120)}
                layout={reduceMotion ? undefined : LinearTransition.duration(220)}
                style={styles.line}
              >
                {l.kind === 'system' ? (
                  <Text variant="meta" color={EMBER.textTertiary} numberOfLines={1}>
                    {l.text}
                  </Text>
                ) : (
                  <Text variant="meta" color={EMBER.textPrimary} numberOfLines={1}>
                    <Text variant="meta" color={EMBER.textSecondary}>
                      {l.who}{'  '}
                    </Text>
                    {l.text}
                  </Text>
                )}
              </Animated.View>
            ))
          )}
        </View>
        <ScalePress
          onPress={onOpen}
          haptic={false}
          style={styles.composer}
          accessibilityRole="button"
          accessibilityLabel={`Open the room chat${count ? `, ${count} messages` : ''}`}
        >
          <Ionicons name="chatbubbles-outline" size={ICON.md} color={EMBER.textSecondary} />
          <Text variant="body" color={EMBER.textPlaceholder} style={styles.placeholder} numberOfLines={1}>
            Say something to the room
          </Text>
          <Text variant="caption">{label}</Text>
        </ScalePress>
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  dock: {
    backgroundColor: EMBER.surfaceSunken,
    borderTopLeftRadius: EMBER_RADIUS.lg,
    borderTopRightRadius: EMBER_RADIUS.lg,
    paddingHorizontal: GUTTER,
    paddingTop: SPACE.sm,
    gap: SPACE.sm,
  },
  handle: {
    alignSelf: 'center',
    width: SPACE.xxl,
    height: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.separator,
    marginBottom: SPACE.xs,
  },
  // Two lines' worth, always: the dock never resizes, so the page above never moves.
  lines: { height: 2 * TYPE.meta.lineHeight + SPACE.xs, justifyContent: 'flex-end', gap: SPACE.xs },
  line: { flexDirection: 'row' },
  composer: {
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  placeholder: { flex: 1 },
})
