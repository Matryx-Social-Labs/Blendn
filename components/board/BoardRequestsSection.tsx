import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { BanterHeading, BanterRequest } from '../banter/BanterSections'
import { inboxTimeLabel } from '../banter/inbox'
import { useToast } from '../Toast'
import { Text } from '../ui/Text'
import { apiClient } from '../../lib/apiClient'
import {
  askStillOpen,
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

type Answer = 'accept' | 'decline' | 'withdraw'

/**
 * Board requests, in the Banter — PLACEHOLDER DESIGN (docs/PLACEHOLDER_SCREENS.md §6).
 *
 * Here and not in notifications: a notification is how you arrive, not where
 * the thing lives. A board request is the same object as a message request —
 * somebody asking to start talking — so it is a second instance of the
 * Banter's Requests pattern rather than a new place.
 *
 * Asks waiting on you are answered here. Asks you sent sit under them,
 * quieter, and **never let a decline be read**: a declined ask looks exactly
 * like one still waiting (`askStillOpen`), and withdrawing one that turns out
 * to be already answered says nothing — it just goes, as any withdrawal does.
 *
 * Owns its own load, so the Banter screen only has to place it. `refreshKey`
 * moves on the Banter's pull-to-refresh and live sync; `onCount` says whether
 * it drew anything, so the inbox does not claim "No conversations yet" beneath
 * it.
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
  // The guard is a ref: two taps in one frame both see the state from before either.
  const busyRef = useRef(new Set<string>())
  // Withdrawn here, whatever the server said: a reload must not bring one back.
  const gone = useRef(new Set<string>())

  const apply = useCallback((result: Awaited<ReturnType<typeof apiClient.getBoardRequests>>) => {
    // A failure keeps what was drawn: these are secondary to the conversations.
    if (!result.success || !result.data) {
      Logger.warn('board', 'requests load failed', { error: result.error })
      return
    }
    const shown = inboxRequests(result.data)
    setRequests({
      incoming: shown.incoming,
      outgoing: shown.outgoing.filter((r) => !gone.current.has(r.id)),
    })
  }, [])
  const load = useCallback(
    () =>
      apiClient
        .getBoardRequests()
        .then(apply)
        .catch((error) => Logger.warn('board', 'requests load threw', { error: String(error) })),
    [apply]
  )

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )
  // Again whenever the Banter is pulled to refresh or its live sync fires.
  useEffect(() => {
    if (refreshKey > 0) void load()
  }, [refreshKey, load])

  const shown = requests.incoming.length + requests.outgoing.length
  useEffect(() => onCount(shown), [shown, onCount])

  const setBusyFor = (id: string, on: boolean) => {
    if (on) busyRef.current.add(id)
    else busyRef.current.delete(id)
    setBusy(new Set(busyRef.current))
  }

  const without = (prev: BoardRequests, id: string): BoardRequests => ({
    incoming: prev.incoming.filter((r) => r.id !== id),
    outgoing: prev.outgoing.filter((r) => r.id !== id),
  })

  /** Put one row back where it was, leaving anything loaded since alone. */
  const restore = (request: BoardRequest, side: keyof BoardRequests, at: number) =>
    setRequests((prev) => {
      if (prev[side].some((r) => r.id === request.id)) return prev
      const rows = [...prev[side]]
      rows.splice(Math.min(at, rows.length), 0, request)
      return { ...prev, [side]: rows }
    })

  /*
   * Accept holds the row until the conversation exists, then opens it. That
   * conversation is pseudonymous and carries `origin_board_request_id`, so the
   * server answers `fromMatch: false` and the thread draws no match opener.
   *
   * Decline and withdraw leave at once. If the answer does not go out, the row
   * comes back where it was — except a withdrawal the server calls already
   * answered, which stays gone and silent: anything else would tell the asker
   * that the other person had said no.
   */
  const answer = async (request: BoardRequest, action: Answer) => {
    if (busyRef.current.has(request.id)) return
    setBusyFor(request.id, true)
    const side: keyof BoardRequests = action === 'withdraw' ? 'outgoing' : 'incoming'
    const at = requests[side].findIndex((r) => r.id === request.id)
    if (action !== 'accept') setRequests((prev) => without(prev, request.id))

    let result: Awaited<ReturnType<typeof apiClient.answerBoardRequest>>
    try {
      result = await apiClient.answerBoardRequest(request.id, action)
    } catch (error) {
      result = { success: false, error: String(error) }
    } finally {
      setBusyFor(request.id, false)
    }

    if (result.success) {
      if (action === 'withdraw') gone.current.add(request.id)
      if (action === 'accept') {
        setRequests((prev) => without(prev, request.id))
        if (result.data?.conversationId) {
          router.push({
            pathname: '/private-chat/[conversationId]',
            params: { conversationId: result.data.conversationId },
          } as never)
        }
      }
      return
    }

    if (action === 'withdraw') {
      if (isSettled(result)) gone.current.add(request.id)
      else restore(request, side, at)
      return
    }
    if (isSettled(result)) {
      // "Already answered", "That event has ended": what happened, not a failure.
      if (action === 'accept') showToast(boardMessage(result, 'That request has already been answered'), 'info')
      void load()
      return
    }
    if (action === 'decline') restore(request, side, at)
    showToast(boardMessage(result, `Couldn't ${action} that. Try again.`), 'error')
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
          <Text variant="label" accessibilityRole="header">
            YOU ASKED
          </Text>
          {requests.outgoing.map((r) => (
            <OutgoingRow
              key={r.id}
              request={r}
              busy={busy.has(r.id)}
              onWithdraw={() => void answer(r, 'withdraw')}
            />
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

/**
 * Quieter than an incoming request: a line, the state, and Withdraw while the
 * ask still reads as open. Not one accessible container — on iOS that swallows
 * the Withdraw button inside it, and VoiceOver could never reach it.
 */
function OutgoingRow({
  request,
  busy,
  onWithdraw,
}: {
  request: BoardRequest
  busy: boolean
  onWithdraw: () => void
}) {
  const line = outgoingLine(request)
  return (
    <View style={styles.outRow}>
      <BoardMark seed={boardMarkSeed(request.counterpart, request.event.id, request.id)} />
      <View style={styles.outText}>
        <Text variant="body" color={EMBER.textSecondary}>
          You asked {request.counterpart} · {request.event.title}
        </Text>
        <Text variant="meta">{line}</Text>
      </View>
      {askStillOpen(request) ? (
        <Pressable
          onPress={onWithdraw}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Withdraw your ask to ${request.counterpart}`}
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [styles.withdraw, (pressed || busy) && styles.pressed]}
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
