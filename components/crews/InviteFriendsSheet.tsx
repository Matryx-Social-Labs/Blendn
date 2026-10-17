import { useState } from 'react'

import { CREW_MAX_MEMBERS } from '../../lib/crews'
import type { Friend } from '../../lib/friends'
import { Sheet } from '../ds/Sheet'
import { FriendsStep } from './MakeSteps'

const NONE_TO_ASK = 'Every friend of yours is in this crew, or you have none to ask yet.'

/**
 * Ask more friends into the crew (the friends step of Make a crew, reused):
 * friends who are not already in it, a count of how many, never who was
 * skipped. `room` is how many more the crew can take.
 */
export function InviteFriendsSheet({
  visible,
  friends,
  room,
  asking,
  onRetry,
  onAsk,
  onClose,
}: {
  visible: boolean
  /** null while loading; 'failed' is not "none to ask". */
  friends: Friend[] | null | 'failed'
  room: number
  asking: boolean
  onRetry: () => void
  onAsk: (userIds: string[]) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const toggle = (userId: string) =>
    setPicked((p) => (p.includes(userId) ? p.filter((id) => id !== userId) : p.length < Math.min(room, CREW_MAX_MEMBERS - 1) ? [...p, userId] : p))
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={() => setPicked([])}
      title="Invite friends"
      detents={['tall']}
      actions={[
        {
          label: picked.length ? `Ask ${picked.length}` : 'Pick friends to ask',
          kind: 'primary',
          onPress: () => onAsk(picked),
          disabled: picked.length === 0,
          loading: asking,
        },
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="crew-invite-sheet"
    >
      <FriendsStep friends={friends} picked={picked} onToggle={toggle} onRetry={onRetry} none={NONE_TO_ASK} />
    </Sheet>
  )
}
