import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Reanimated from 'react-native-reanimated'

import { RequestCard, RequestFace } from '../banter/BanterParts'
import { SectionHeader } from '../ds/SectionHeader'
import { inboxTimeLabel } from '../banter/inbox'
import { useToast } from '../Toast'
import { Text } from '../ui/Text'
import { apiClient } from '../../lib/apiClient'
import {
  acceptConflictLine,
  boardMarkSeed,
  boardMessage,
  inboxRequests,
  isSettled,
  outgoingLine,
  type BoardRequest,
  type BoardRequests,
} from '../../lib/board'
import { Logger } from '../../lib/logger'
import { boardSafetySheet } from '../../lib/safetyUtils'
import { showSheet } from '../../lib/sheet'
import { COLOR } from '../../lib/design/tokens'
import { CONTROL, OPACITY, SPACE } from '../../lib/theme'
import { BoardMark } from './BoardSections'
import { useBanterPress } from '../banter/pressGuard'
import { rowBack, rowOut, rowReflow } from '../motion/presence'
import { useAnnounced } from '../ds/shared'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'

/** A withdrawal that did not go out, on its row: nothing from the server's answer, which could carry a decline. */
export const WITHDRAW_FAILED = 'Couldn’t withdraw. Try again.'

type Answer = 'accept' | 'decline' | 'withdraw'

/**
 * Board requests, in the Banter — PLACEHOLDER DESIGN (docs/PLACEHOLDER_SCREENS.md §6).
 *
 * Here and not in notifications: a notification is how you arrive, not where
 * the thing lives. A board request is the same object as a message request —
 * somebody asking to start talking — so it is a second instance of the
 * Banter's Requests pattern rather than a new place.
 *
 * Asks waiting on you are answered here, with Report and Block behind More.
 * Asks you sent sit under them, quieter. Nothing here can tell an asker they
 * were declined: the server never sends it (their declined ask reads pending
 * until the night lapses), and the lines follow what it sends.
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
  // What became of an accept that did not go through, said quietly on the ask.
  const [notes, setNotes] = useState<Record<string, string>>({})
  // The one row a failed answer just put back: it fades in where it was (Going's Undo); no other row enters.
  const [restoredId, setRestoredId] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()

  const apply = useCallback((result: Awaited<ReturnType<typeof apiClient.getBoardRequests>>) => {
    // A failure keeps what was drawn: these are secondary to the conversations.
    if (!result.success || !result.data) {
      Logger.warn('board', 'requests load failed', { error: result.error })
      return
    }
    setRequests(inboxRequests(result.data))
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
  const restore = (request: BoardRequest, side: keyof BoardRequests, at: number) => {
    setRestoredId(request.id)
    setRequests((prev) => {
      if (prev[side].some((r) => r.id === request.id)) return prev
      const rows = [...prev[side]]
      rows.splice(Math.min(at, rows.length), 0, request)
      return { ...prev, [side]: rows }
    })
  }

  /*
   * Accept holds the row until the conversation exists, then opens it. That
   * conversation is pseudonymous and carries `origin_board_request_id`, so the
   * server answers `fromMatch: false` and the thread draws no match opener.
   *
   * Decline and withdraw leave at once, and come back where they were if the
   * answer does not go out. A 409 is never an error: an accept that cannot go
   * through leaves a quiet line on the ask (`acceptConflictLine`), and the
   * reload settles the rest — the server keeps a decline from the asker, so
   * nothing here has to hide one.
   */
  const answer = async (request: BoardRequest, action: Answer) => {
    if (busyRef.current.has(request.id)) return
    setBusyFor(request.id, true)
    if (action === 'withdraw') setNotes(({ [request.id]: _, ...rest }) => rest)
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

    if (isSettled(result)) {
      if (action === 'accept') setNotes((prev) => ({ ...prev, [request.id]: acceptConflictLine(result) }))
      void load()
      return
    }
    if (action !== 'accept') restore(request, side, at)
    if (action !== 'withdraw') {
      showToast(boardMessage(result, `Couldn’t ${action} that. Try again.`), 'error', { haptic: 'error' })
      return
    }
    // Withdrawing is yours alone: no toast, a line on the row that came back (heard too, M20), and never the server's words.
    H.error()
    setNotes((prev) => ({ ...prev, [request.id]: WITHDRAW_FAILED }))
  }

  /** Report or block the asker, by the ask: the board never names anybody to the client. */
  const more = (request: BoardRequest) =>
    showSheet(
      boardSafetySheet({ kind: 'request', requestId: request.id }, request.counterpart, () => {
        setRequests((prev) => without(prev, request.id))
        void load()
      })
    )

  if (shown === 0) return null

  // The last row takes its heading with it (iOS drive): the section and YOU ASKED fade out with it, not a frame before,
  // and the section fades back in with a row a failed answer put back (and as it first arrives, a beat after the Banter).
  return (
    <Reanimated.View style={styles.section} entering={reduceMotion ? undefined : rowBack} exiting={reduceMotion ? undefined : rowOut}>
      <SectionHeader title="The Lobby" count={requests.incoming.length > 0 ? requests.incoming.length : undefined} />
      {requests.incoming.map((r) => (
        <Reanimated.View
          key={r.id}
          exiting={reduceMotion ? undefined : rowOut}
          layout={reduceMotion ? undefined : rowReflow}
          entering={!reduceMotion && restoredId === r.id ? rowBack : undefined}
        >
          <RequestCard
            testID={`board-request-${r.id}`}
            // The asker is a handle: their generated mark, never a photo (`boardMarkSeed`).
            face={<RequestFace pseudonym={boardMarkSeed(r.counterpart, r.event.id, r.id)} />}
            name={r.counterpart}
            note={incomingMessage(r)}
            foot={notes[r.id]}
            time={inboxTimeLabel(r.createdAt)}
            pending={busy.has(r.id)}
            onAccept={() => void answer(r, 'accept')}
            onDecline={() => void answer(r, 'decline')}
            onMore={() => more(r)}
          />
        </Reanimated.View>
      ))}
      {requests.outgoing.length > 0 ? (
        <Reanimated.View style={styles.outgoing} exiting={reduceMotion ? undefined : rowOut} layout={reduceMotion ? undefined : rowReflow}>
          <Text variant="label" accessibilityRole="header">
            YOU ASKED
          </Text>
          {requests.outgoing.map((r) => (
            <Reanimated.View
              key={r.id}
              exiting={reduceMotion ? undefined : rowOut}
              layout={reduceMotion ? undefined : rowReflow}
              entering={!reduceMotion && restoredId === r.id ? rowBack : undefined}
            >
              <OutgoingRow request={r} busy={busy.has(r.id)} note={notes[r.id]} onWithdraw={() => void answer(r, 'withdraw')} />
            </Reanimated.View>
          ))}
        </Reanimated.View>
      ) : null}
    </Reanimated.View>
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
  note,
  onWithdraw,
}: {
  request: BoardRequest
  busy: boolean
  /** A withdrawal that did not go out (`WITHDRAW_FAILED`). */
  note?: string
  onWithdraw: () => void
}) {
  useAnnounced(note)
  // Inside the Banter's list: a lift after a hold withdraws nothing (components/banter/pressGuard.ts).
  onWithdraw = useBanterPress(onWithdraw)
  const line = outgoingLine(request)
  return (
    <View style={styles.outRow}>
      <BoardMark seed={boardMarkSeed(request.counterpart, request.event.id, request.id)} />
      <View style={styles.outText}>
        <Text variant="body" color={COLOR.textSecondary}>
          You asked {request.counterpart} · {request.event.title}
        </Text>
        <Text variant="meta">{line}</Text>
        {note ? (
          <Text variant="meta" accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
      </View>
      {request.live ? (
        <Pressable
          onPress={onWithdraw}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Withdraw your ask to ${request.counterpart}`}
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [styles.withdraw, (pressed || busy) && styles.pressed]}
        >
          <Text variant="button" color={COLOR.textSecondary}>
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
