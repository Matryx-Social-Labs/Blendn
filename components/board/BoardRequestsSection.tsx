import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { BanterHeading, BanterRequest } from '../banter/BanterSections'
import { inboxTimeLabel } from '../banter/inbox'
import { useToast } from '../Toast'
import { Text } from '../ui/Text'
import { apiClient } from '../../lib/apiClient'
import {
  boardMarkSeed,
  boardMessage,
  inboxRequests,
  isSettled,
  outgoingLine,
  type BoardRequest,
  type BoardRequests,
} from '../../lib/board'
import { Logger } from '../../lib/logger'
import { CONTROL, EMBER, OPACITY, SPACE } from '../../lib/theme'
import { BoardMark } from './BoardSections'

/**
 * Board requests, in the Banter — PLACEHOLDER DESIGN (docs/PLACEHOLDER_SCREENS.md §6).
 *
 * Here and not in notifications: a notification is how you arrive, not where
 * the thing lives. A board request is the same object as a message request —
 * somebody asking to start talking — so it is a second instance of the
 * Banter's Requests pattern rather than a new place.
 *
 * Asks waiting on you are answered here. Asks you sent sit under them,
 * quieter, and **never say "declined"**: the server delivers no decline, so a
 * card that stops being pending reads as closed and nothing more.
 *
 * Owns its own load, so the Banter screen only has to place it. `refreshKey`
 * moves on the Banter's pull-to-refresh; `onCount` says whether it drew
 * anything, so the inbox does not claim "No conversations yet" beneath it.
 */
export function BoardRequestsSection({
  refreshKey,
  onCount,
}: {
  refreshKey: number
  onCount: (count: number) => void
}) {
  const { showToast } = useToast()
  const [requests, setRequests] = useState<BoardRequests>({ incoming: [], outgoing: [] })
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set())

  const apply = useCallback((result: Awaited<ReturnType<typeof apiClient.getBoardRequests>>) => {
    // A failure keeps what was drawn: these are secondary to the conversations.
    if (!result.success || !result.data) {
      Logger.warn('board', 'requests load failed', { error: result.error })
      return
    }
    setRequests(inboxRequests(result.data))
  }, [])
  const load = useCallback(() => apiClient.getBoardRequests().then(apply), [apply])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )
  // Again whenever the Banter is pulled to refresh.
  useEffect(() => {
    if (refreshKey > 0) void load()
  }, [refreshKey, load])

  const shown = requests.incoming.length + requests.outgoing.length
  useEffect(() => onCount(shown), [shown, onCount])

  const markBusy = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const drop = (id: string) =>
    setRequests((prev) => ({
      incoming: prev.incoming.filter((r) => r.id !== id),
      outgoing: prev.outgoing.filter((r) => r.id !== id),
    }))

  /*
   * Accept holds the row until the conversation exists, then opens it. That
   * conversation is pseudonymous and carries `origin_board_request_id`, so the
   * server answers `fromMatch: false` and the thread draws no match opener.
   */
  const answer = async (request: BoardRequest, action: 'accept' | 'decline' | 'withdraw') => {
    if (busy.has(request.id)) return
    markBusy(request.id, true)
    // A decline or a withdrawal leaves at once; the answer goes out with it.
    if (action !== 'accept') drop(request.id)
    const result = await apiClient.answerBoardRequest(request.id, action)
    markBusy(request.id, false)

    if (result.success) {
      if (action === 'accept') {
        drop(request.id)
        if (result.data?.conversationId) {
          router.push({
            pathname: '/private-chat/[conversationId]',
            params: { conversationId: result.data.conversationId },
          } as never)
        }
      }
      return
    }
    // "Already answered", "That event has ended": what happened, not a failure.
    if (isSettled(result)) showToast(boardMessage(result, 'That request has already been answered'), 'info')
    else showToast(boardMessage(result, "Couldn't answer that. Try again."), 'error')
    void load()
  }

  if (shown === 0) return null

  return (
    <View style={styles.section}>
      <BanterHeading
        title="The Board"
        detail={requests.incoming.length > 0 ? String(requests.incoming.length) : undefined}
      />
      {requests.incoming.map((r) => (
        <BanterRequest
          key={r.id}
          name={r.counterpart}
          markSeed={boardMarkSeed(r.counterpart, r.event.id, r.id)}
          timeLabel={inboxTimeLabel(r.createdAt)}
          message={incomingMessage(r)}
          pending={busy.has(r.id)}
          onAccept={() => void answer(r, 'accept')}
          onDecline={() => void answer(r, 'decline')}
        />
      ))}
      {requests.outgoing.length > 0 ? (
        <View style={styles.outgoing}>
          <Text variant="label">YOU ASKED</Text>
          {requests.outgoing.map((r) => (
            <OutgoingRow key={r.id} request={r} onWithdraw={() => void answer(r, 'withdraw')} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** Where it is, and what they said if they said anything. */
function incomingMessage(r: BoardRequest): string {
  const said = r.message?.trim()
  return said ? `${r.event.title} — “${said}”` : `Wants to join you at ${r.event.title}`
}

/** Quieter than an incoming request: a line, the state, and Withdraw while it is live. */
function OutgoingRow({ request, onWithdraw }: { request: BoardRequest; onWithdraw: () => void }) {
  const line = outgoingLine(request)
  return (
    <View
      style={styles.outRow}
      accessible
      accessibilityLabel={`You asked ${request.counterpart}, ${request.event.title}. ${line}`}
    >
      <BoardMark seed={boardMarkSeed(request.counterpart, request.event.id, request.id)} />
      <View style={styles.outText}>
        <Text variant="body" color={EMBER.textSecondary}>
          {request.counterpart} · {request.event.title}
        </Text>
        <Text variant="meta">{line}</Text>
      </View>
      {request.live ? (
        <Pressable
          onPress={onWithdraw}
          accessibilityRole="button"
          accessibilityLabel={`Withdraw your ask to ${request.counterpart}`}
          style={({ pressed }) => [styles.withdraw, pressed && styles.pressed]}
        >
          <Text variant="button" color={EMBER.textSecondary}>
            Withdraw
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: OPACITY.pressed },
  section: { gap: SPACE.lg },
  outgoing: { gap: SPACE.md },
  outRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  outText: { flex: 1 },
  withdraw: { minHeight: CONTROL.md, justifyContent: 'center', paddingHorizontal: SPACE.sm },
})
