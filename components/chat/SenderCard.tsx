import { router } from 'expo-router'
import { handRoomPerson } from '../../lib/roomPersonHandoff'
import { useEffect, useState } from 'react'

import { apiClient } from '../../lib/apiClient'
import type { RoomAttendee } from '../../lib/activeRoom'
import { Logger } from '../../lib/logger'
import { likeRefusal } from '../../lib/likeRefusal'
import { shouldSendWave, waveRefusal, waveStateAfter, waveStatusFor, WAVE_SETTLE_MS, type WaveStatus } from '../../lib/waves'
import { lensView, parseLens, type RoomLens } from '../../lib/roomLens'
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
  eventTitle,
}: {
  sender: Sender | null
  eventId: string | null
  chatGroupId: string
  /** The sheet's context line ("In the room at …"); none when the caller does not know it. */
  eventTitle?: string | null
  onClose: () => void
  onBlocked: (senderId: string) => void
}) {
  const [shown, setShown] = useState<Sender | null>(sender)
  if (sender && sender !== shown) setShown(sender)
  const [card, setCard] = useState<RoomAttendee | null>(null)
  const [lens, setLens] = useState<RoomLens | null>(null)
  const [state, setState] = useState<PersonState>('none')
  /** This session's wave at them (`lib/waves.ts`), over the deck's flags; and the conversation a mutual opened. */
  const [waveLocal, setWaveLocal] = useState<WaveStatus | undefined>(undefined)
  const [opened, setOpened] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [sending, setSending] = useState(false)

  // A new person starts clean (adjusted in render, on the same change).
  const [cardFor, setCardFor] = useState<string | null>(sender?.id ?? null)
  if (sender && sender.id !== cardFor) {
    setCardFor(sender.id)
    setCard(null)
    setState('none')
    setWaveLocal(undefined)
    setOpened(null)
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
        setLens(parseLens(r.data?.lens))
      })
      .catch((error) => Logger.warn('chat', 'Roster lookup failed', { error }))
    return () => {
      live = false
    }
  }, [senderId, eventId])

  const who = sender ?? shown
  if (!who) return null
  const attendee = card ? attendeeFromMatch(card) : null

  // This card's own mutual first, then the deck's (one from before a restart).
  const mutualConversation = opened ?? card?.conversationId ?? null
  const waveStatus = waveStatusFor({ youWaved: card?.youWaved, wavedAtYou: card?.wavedAtYou, conversationId: mutualConversation }, waveLocal)

  const openChat = (conversationId: string | null) => {
    onClose()
    // No conversation known (an older server, or a friend the mutual opened nothing with): the chats list has it.
    if (conversationId) router.push({ pathname: '/private-chat/[conversationId]', params: { conversationId } } as never)
    else router.navigate('/(tabs)/chat' as never)
  }

  /** Wave, or wave back (SCRUM-1042): the hand swings until both the server and 07-motion's 800 ms are done. */
  const wave = async () => {
    if (!eventId || !shouldSendWave(waveStatus)) return
    setWaveLocal('sending')
    setRefusal(null)
    try {
      const [result] = await Promise.all([apiClient.sendWave(eventId, who.id), new Promise((r) => setTimeout(r, WAVE_SETTLE_MS))])
      setWaveLocal(waveStateAfter({ ok: !!result.success, mutual: result.data?.mutual }))
      if (!result.success) return setRefusal(waveRefusal(result.errorCode, result.error).message)
      if (!result.data?.mutual) return void askPushInContext('like')
      setOpened(result.data.conversationId ?? null)
      openChat(result.data.conversationId ?? null)
    } catch (error) {
      Logger.warn('chat', 'Wave failed', { error })
      setWaveLocal(undefined)
      setRefusal(waveRefusal(undefined, undefined).message)
    }
  }

  // Their deck card, as the lens reads it: only what the deck sent (never a name, photo or bio).
  const lensPerson = card ? { workField: card.workField ?? null, sharedIntents: card.sharedIntents ?? [], interests: card.sharedInterests, overlaps: card.overlaps ?? [], badges: card.badges ?? [], age: card.age, tonightAnswer: card.tonightAnswer, workIntent: card.workIntent } : null

  const viewProfile = () => {
    onClose()
    // P-A page: their deck card goes with them (lead pills, In common), in memory, never in the link.
    if (lensPerson) handRoomPerson(who.id, { person: lensPerson, lens })
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
          // P-A: their deck card through the room's lens (the sheet draws only what the deck sent for them).
          ...(card && lensPerson
            ? lensView(
                lensPerson,
                lens,
                eventTitle ? { title: eventTitle } : null,
                !!card.photo
              )
            : {}),
        }}
        variant={!card ? 'thin' : waveStatus === 'mutual' ? 'matched' : card.insideNow === false ? 'was' : 'here'}
        state={state}
        wave={waveStatus}
        refusal={refusal ? { text: refusal } : undefined}
        onWave={() => void wave()}
        onSayHi={() => openChat(mutualConversation)}
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
