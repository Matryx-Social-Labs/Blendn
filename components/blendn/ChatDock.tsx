import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { apiClient } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, PRESS, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { useRoomMembership } from '../../lib/roomMembership'
import { subscribeToChatMessage } from '../../lib/socketClient'
import { Badge } from '../ds/MonoFamily'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'

/** The dock's last line: the room's last message, or a wave to you (a row that opens their card, R3-D4 4.2). */
export type DockLine =
  | { kind: 'message'; id: string; who: string; text: string; at: number }
  | { kind: 'wave'; id: string; fromUserId: string; fromName: string; at: number }

/** How far up the dock must be pulled before it opens the chat. */
const OPEN_DRAG = SPACE.xxxl
const OPEN_VELOCITY = 700

function lastFromHistory(raw: unknown, myId?: string): DockLine | null {
  const list = Array.isArray(raw) ? raw : ((raw as { messages?: unknown[] } | null)?.messages ?? [])
  const lines = (list as Record<string, any>[])
    .filter((m) => !m.moderation_hidden && (m.content || m.message_text))
    .map((m): DockLine => {
      const sender = m.user_id || m.userId || m.sender_id
      return {
        kind: 'message',
        id: String(m.id),
        who: sender === myId ? 'You' : m.user?.name || m.sender_name || 'Attendee',
        text: String(m.content || m.message_text),
        at: Date.parse(m.created_at || m.createdAt) || 0,
      }
    })
    .sort((a, b) => a.at - b.at)
  return lines[lines.length - 1] ?? null
}

/**
 * The room's chat, docked as one row (Flow 4 Room, R3-0 02′, R3-D4 13′): a
 * 64 pt capsule on the bar glass, 16 in from the edges at the safe area. The
 * bubble glyph, "Room chat" and its last line, and at the end "3 new", a
 * chevron, "Try again" or "Rejoin".
 *
 * The last line is the newest of the room's last message ("Cosmic Panda:
 * Rumours side two.") and a wave to you ("Night Cat waved at you", white, with
 * a chevron): that row opens their card, so the toast is never the only way to
 * answer (R3-D4 4.2). Nothing names an arrival (ROUND3 C1). Tap or pull up for
 * the full chat, pushed over the overlay; no haptic.
 *
 * The dock only reads: the last message once, then new ones over the shared
 * subscription map, so opening the chat does not join twice. "N new" counts
 * what arrived while you were here, and clears when you open the chat.
 */
export function ChatDock({
  chatGroupId,
  myId,
  wave,
  onOpen,
  onOpenPerson,
  bottomInset,
}: {
  chatGroupId: string | null
  myId?: string
  /** The newest wave to you, while it is fresh. */
  wave: Extract<DockLine, { kind: 'wave' }> | null
  onOpen: () => void
  onOpenPerson: (userId: string) => void
  bottomInset: number
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [message, setMessage] = useState<DockLine | null>(null)
  const [fresh, setFresh] = useState(0)
  // The history request failed: not the same as a quiet room, so it says so.
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // Left: the server refuses the history and the socket, so neither is asked.
  const left = useRoomMembership().left.has(chatGroupId ?? '')

  useEffect(() => {
    if (!chatGroupId || left) return
    let cancelled = false
    apiClient
      .getChatMessages(chatGroupId, { limit: 8 })
      .then((r) => {
        if (cancelled) return
        setFailed(!r.success)
        if (r.success) setMessage(lastFromHistory(r.data, myId))
      })
      .catch((e) => {
        Logger.debug('chat', 'dock history failed', { error: e })
        if (!cancelled) setFailed(true)
      })
    const unsubscribe = subscribeToChatMessage(chatGroupId, (data) => {
      if (data.chatGroupId !== chatGroupId) return
      const m = data.message
      const mine = m.userId === myId
      setMessage({ kind: 'message', id: m.id, who: mine ? 'You' : m.userName || 'Attendee', text: m.content, at: Date.parse(m.createdAt) || Date.now() })
      if (!mine) setFresh((n) => n + 1)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [chatGroupId, myId, left, attempt])

  const last = useMemo(() => (wave && (!message || wave.at >= message.at) ? wave : message), [wave, message])
  const open = () => {
    setFresh(0)
    onOpen()
  }

  // Pull up to open: the dock follows the finger a little, then hands off.
  const lift = useSharedValue(0)
  const pull = Gesture.Pan()
    .activeOffsetY(-SPACE.sm)
    .failOffsetY(SPACE.sm)
    .onUpdate((e) => {
      lift.set(Math.max(-OPEN_DRAG, Math.min(0, e.translationY * 0.5)))
    })
    .onEnd((e) => {
      if (e.translationY < -OPEN_DRAG || e.velocityY < -OPEN_VELOCITY) scheduleOnRN(open)
      lift.set(withSpring(0, SPRING.snap))
    })
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }] }))

  const state = left ? 'left' : failed && !last ? 'failed' : last ? 'line' : 'quiet'
  const line =
    state === 'left'
      ? 'You left this chat. Open it to rejoin.'
      : state === 'failed'
        ? 'Couldn’t load messages.'
        : state === 'quiet'
          ? 'Nobody has said anything yet. Be the first.'
          : last!.kind === 'wave'
            ? `${last!.fromName} waved at you`
            : `${last!.who}: ${last!.text}`
  const waveRow = state === 'line' && last?.kind === 'wave'
  const label = ['Room chat', line, fresh && !waveRow ? `${fresh} new` : null].filter(Boolean).join('. ')

  return (
    <GestureDetector gesture={pull}>
      <Animated.View style={[styles.place, { bottom: bottomInset }, liftStyle]}>
        <ScalePress
          testID="room-dock"
          onPress={() => (waveRow ? onOpenPerson((last as Extract<DockLine, { kind: 'wave' }>).fromUserId) : open())}
          pressedScale={PRESS.scale}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={waveRow ? 'Opens their card' : 'Opens the room chat'}
          // While the row is a wave, the chat is still one action away (it is otherwise only the pull-up).
          accessibilityActions={waveRow ? [{ name: 'activate' }, { name: 'openChat', label: 'Open room chat' }] : undefined}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'openChat') open()
            else if (e.nativeEvent.actionName === 'activate' && waveRow) onOpenPerson((last as Extract<DockLine, { kind: 'wave' }>).fromUserId)
          }}
          accessibilityLiveRegion="polite"
        >
          <Material role="bar" style={[styles.dock, contrast && IC_HAIRLINE]}>
            <Icon name={state === 'failed' ? 'cloud-off' : 'message-circle'} size={ICON.nav} />
            <View style={styles.text}>
              <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold), styles.ink]}>
                Room chat
              </Text>
              <Text
                testID="room-dock-line"
                numberOfLines={1}
                maxFontSizeMultiplier={CONTROL_FONT_CAP}
                style={[font('caption', bold, FONT_FAMILY.brand[400]), waveRow ? styles.ink : styles.secondary]}
              >
                {line}
              </Text>
            </View>
            {waveRow ? (
              <Icon name="chevron-right" size={ICON.control} color={COLOR.textSecondary} />
            ) : state === 'failed' || state === 'left' ? (
              <Pressable
                onPress={state === 'failed' ? () => setAttempt((n) => n + 1) : open}
                hitSlop={(minTarget() - SPACE.xl) / 2}
                accessibilityRole="button"
                accessibilityLabel={state === 'failed' ? 'Try again' : 'Rejoin'}
                testID="room-dock-action"
              >
                <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>{state === 'failed' ? 'Try again' : 'Rejoin'}</Text>
              </Pressable>
            ) : fresh > 0 ? (
              <Badge text={`${fresh} new`} size={22} testID="room-dock-new" />
            ) : null}
          </Material>
        </ScalePress>
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: SPACE.lg, right: SPACE.lg },
  dock: {
    height: SIZE.tabBar,
    borderRadius: RADIUS.tabBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingLeft: SPACE.xl - SPACE.xs,
    paddingRight: SPACE.lg,
    overflow: 'hidden',
  },
  text: { flex: 1, minWidth: 0 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
