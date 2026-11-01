import { router } from 'expo-router'
import Reanimated, { FadeOut } from 'react-native-reanimated'

import { DURATION } from '../../lib/design/tokens'
import type { CrewInvite } from '../../lib/crews'
import type { MessageRequest, useBanterInbox } from '../../lib/useBanterInbox'
import { inboxTimeLabel } from './inbox'
import { RequestCard, RequestFace } from './BanterParts'
import { useReducedMotion } from '../../lib/motion'

/**
 * One message request as a card (Flow 5 #05, R3-0 C11): the asker and their note verbatim, Decline and Accept, ⋯ for Block and
 * Report, the face and name opening their profile.
 */
export function RequestRow({ request: r, inbox }: { request: MessageRequest; inbox: ReturnType<typeof useBanterInbox> }) {
  const reduceMotion = useReducedMotion()
  return (
    <Reanimated.View exiting={reduceMotion ? undefined : FadeOut.duration(DURATION.quick)}>
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

/** A crew invite on the same page: it leaves the same way, and the list closes the gap. */
export function InviteRow({ invite, onDecline }: { invite: CrewInvite; onDecline: (invite: CrewInvite) => void }) {
  const reduceMotion = useReducedMotion()
  return (
    <Reanimated.View exiting={reduceMotion ? undefined : FadeOut.duration(DURATION.quick)}>
      <RequestCard
        testID={`requests-invite-${invite.crewId}`}
        face={<RequestFace emblemSeed={invite.emblemSeed} />}
        name={invite.name}
        note={`${invite.invitedBy} invited you to the crew`}
        time={inboxTimeLabel(invite.invitedAt)}
        accept="Join"
        // Join is the consent screen (Flow 10 · 10.3): it reveals you to the crew, so it asks there.
        onAccept={() => router.push({ pathname: '/crews/invite/[crewId]', params: { crewId: invite.crewId } })}
        onDecline={() => onDecline(invite)}
      />
    </Reanimated.View>
  )
}
