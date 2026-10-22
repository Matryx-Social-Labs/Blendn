import { router } from 'expo-router'
import { useEffect, useState } from 'react'

import { apiClient } from '../../lib/apiClient'
import type { RoomAttendee } from '../../lib/activeRoom'
import { Logger } from '../../lib/logger'
import { likeRefusal } from '../../lib/likeRefusal'
import { reasonLine } from '../../lib/roomMoments'
import { markSeed } from '../../lib/pseudonymAvatar'
import { attendeeFromMatch } from '../../lib/roomLive'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { PersonCard, type PersonState } from '../ds/PersonCard'
import { ConnectSheet } from '../grid/ConnectSheet'
import { askPushInContext } from '../../lib/pushAsk'

/** Somebody in a room's chat, as their message names them: the room's handle and pseudonym. */
export type Sender = { id: string; name: string }

/**
 * A message's sender, tapped (R1, ROUND3 D 5.1): the same PersonCard the Room
 * opens from a face, on `M.travel`, silently. What it knows comes from the
 * event's roster (the Room's own read, cached 30 s): their reason, age and
 * whether you liked them; somebody the roster doesn't list (they hid
 * themselves) gets the thin card, which never says why.
 *
 * Like and Wave are the Room's calls; a like that turns mutual opens the
 * conversation it made. Message is the request that reveals you
 * (`ConnectSheet`). ⋯ is Block / Report: a block takes their messages out of
 * this feed (`onBlocked`).
 *
 * ponytail: ConnectSheet is still Flow 4's pre-redesign sheet; it moves to the
 * DS with the Room's PersonCard (Flow 4).
 */
export function SenderCard({
  sender,
  eventId,
  chatGroupId,
  onClose,
  onBlocked,
}: {
  sender: Sender | null
  eventId: string | null
  chatGroupId: string
  onClose: () => void
  onBlocked: (senderId: string) => void
}) {
  const [shown, setShown] = useState<Sender | null>(sender)
  if (sender && sender !== shown) setShown(sender)
  const [card, setCard] = useState<RoomAttendee | null>(null)
  const [state, setState] = useState<PersonState>('none')
  const [refusal, setRefusal] = useState<string | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [sending, setSending] = useState(false)

  // A new person starts clean (adjusted in render, on the same change).
  const [cardFor, setCardFor] = useState<string | null>(sender?.id ?? null)
  if (sender && sender.id !== cardFor) {
    setCardFor(sender.id)
    setCard(null)
    setState('none')
    setRefusal(null)
  }

  const senderId = sender?.id ?? null
  useEffect(() => {
    if (!senderId || !eventId) return
    let live = true
    apiClient
      .getEventMatches(eventId)
      .then((r) => {
        if (!live || !r.success) return
        const found = (r.data?.matches as RoomAttendee[] | undefined)?.find((m) => m.userId === senderId) ?? null
        setCard(found)
        if (found?.youLiked) setState('liked')
      })
      .catch((error) => Logger.warn('chat', 'Roster lookup failed', { error }))
    return () => {
      live = false
    }
  }, [senderId, eventId])

  const who = sender ?? shown
  if (!who) return null
  const attendee = card ? attendeeFromMatch(card) : null

  const like = async () => {
    if (!eventId || state === 'liked') return
    setState('liked')
    setRefusal(null)
    const result = await apiClient.likeAtEvent(eventId, who.id)
    if (!result.success) {
      setState('none')
      setRefusal(likeRefusal(result.errorCode, result.error).message)
      return
    }
    const conversationId = result.data?.mutual ? result.data.conversationId : undefined
    if (!conversationId) void askPushInContext('like')
    if (conversationId) {
      onClose()
      router.push({ pathname: '/private-chat/[conversationId]', params: { conversationId } } as never)
    }
  }

  const wave = async () => {
    if (!eventId) return
    setState('waveBusy')
    setRefusal(null)
    const result = await apiClient.sendWave(eventId, who.id)
    // Once per ten minutes: a wave already sent reads as waved, not as a failure.
    if (result.success || result.errorCode === 'WAVE_TOO_SOON') return setState('waved')
    setState(card?.youLiked ? 'liked' : 'none')
    setRefusal(likeRefusal(result.errorCode, result.error).message)
  }

  const viewProfile = () => {
    onClose()
    router.push({
      pathname: '/user/[id]',
      params: { id: who.id, ...(eventId ? { eventId } : {}), pseudonym: who.name, roomSeed: `${chatGroupId}:${who.id}` },
    } as never)
  }

  return (
    <>
      <PersonCard
        visible={sender !== null && !connectOpen}
        onClose={onClose}
        person={{
          // The creature their bubble draws: the one seed rule (`markSeed`).
          face: { kind: 'creature', pseudonym: markSeed(who.name, `${chatGroupId}:${who.id}`) },
          name: who.name,
          age: attendee?.age,
          reason: attendee ? reasonLine(attendee) : undefined,
          chips: card?.sharedInterests,
        }}
        variant={card ? (card.insideNow === false ? 'was' : 'here') : 'thin'}
        state={state}
        refusal={refusal ? { text: refusal } : undefined}
        onLike={() => void like()}
        onWave={() => void wave()}
        onMessage={() => setConnectOpen(true)}
        onMore={() => {
          onClose()
          showUserSafetyActions(who.name, who.id, () => onBlocked(who.id))
        }}
        onViewProfile={viewProfile}
        testID="sender-card"
      />
      <ConnectSheet
        visible={connectOpen}
        displayName={who.name}
        sending={sending}
        onDismiss={() => setConnectOpen(false)}
        onSend={async (note) => {
          setSending(true)
          try {
            const result = await apiClient.createMessageRequest(who.id, note)
            // A request that already stands is still a request (`CONFLICT`).
            if (result.success || result.errorCode === 'CONFLICT') setState('requested')
            else setRefusal(likeRefusal(result.errorCode, result.error).message)
            setConnectOpen(false)
          } finally {
            setSending(false)
          }
        }}
      />
    </>
  )
}
