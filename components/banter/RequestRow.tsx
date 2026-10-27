import { router } from 'expo-router'
import Reanimated, { Easing, FadeOut, LinearTransition } from 'react-native-reanimated'

import { DURATION, EASING } from '../../lib/design/tokens'
import type { MessageRequest, useBanterInbox } from '../../lib/useBanterInbox'
import { inboxTimeLabel } from './inbox'
import { RequestCard, RequestFace } from './BanterParts'
import { useReducedMotion } from '../../lib/motion'

const REQUEST_REFLOW = LinearTransition.duration(DURATION.base).easing(Easing.bezier(...EASING.standard))

/**
 * One message request as a card (Flow 5 #05, R3-0 C11): the asker and their note verbatim, Decline and Accept, ⋯ for Block and
 * Report, the face and name opening their profile. The Banter's Requests strip and its "See all" screen draw the same row, so
 * what an answer does (leaves with a quick fade, the rest reflow) is one thing.
 */
export function RequestRow({ request: r, inbox }: { request: MessageRequest; inbox: ReturnType<typeof useBanterInbox> }) {
  const reduceMotion = useReducedMotion()
  return (
    <Reanimated.View exiting={reduceMotion ? undefined : FadeOut.duration(DURATION.quick)} layout={reduceMotion ? undefined : REQUEST_REFLOW}>
      <RequestCard
        testID={`banter-request-${r.request_id}`}
        face={<RequestFace photo={r.sender_avatar} pseudonym={r.sender_name ?? undefined} />}
        name={r.sender_name || 'Someone'}
        // The request's note, verbatim (ROUND3 C11).
        note={r.initial_message?.trim() || 'Wants to message you'}
        time={inboxTimeLabel(r.created_at)}
        pending={inbox.requestPending[r.request_id]}
        onAccept={() => void inbox.respondToRequest(r, 'accept')}
        onDecline={() => void inbox.respondToRequest(r, 'decline')}
        onMore={() => inbox.openRequestMore(r)}
        onOpen={r.sender_id ? () => router.push({ pathname: '/user/[id]', params: { id: String(r.sender_id) } } as never) : undefined}
      />
    </Reanimated.View>
  )
}
