import { useState } from 'react'

import { CREW_MAX_MEMBERS } from '../../lib/crews'
import type { Friend } from '../../lib/friends'
import { Sheet } from '../ds/Sheet'
import { SettingsRow } from '../ds/SettingsRow'
import { RowsCard } from './RowsCard'
import { FriendsStep, type FriendsStepProps } from './MakeSteps'

const NONE_TO_ASK = 'Every friend of yours is in this crew, or you have none to ask yet.'

const LINK_HINT = 'For a friend not on Blend’n yet. Joining also makes you friends. Works once, for 7 days.'

/**
 * Ask more friends into the crew (the friends step of Make a crew, reused):
 * friends who are not already in it, a count of how many, never who was
 * skipped. Or share a link (S7). `room` is how many more the crew can take.
 */
export function InviteFriendsSheet({
  visible,
  friends,
  paging,
  search,
  room,
  asking,
  onRetry,
  onAsk,
  onShareLink,
  sharing,
  onClose,
}: {
  visible: boolean
  /** null while loading; 'failed' is not "none to ask". */
  friends: Friend[] | null | 'failed'
  /** The friends are read a page at a time. */
  paging?: FriendsStepProps['paging']
  search?: FriendsStepProps['search']
  room: number
  asking: boolean
  onRetry: () => void
  onAsk: (userIds: string[]) => void
  onShareLink: () => void
  /** A link is being made. */
  sharing: boolean
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
      {/* Y-A (advisor 2026-11-25): above the friends, so it is there with none to ask too. */}
      <RowsCard testID="crew-link">
        <SettingsRow icon="link" title="Share a crew link" hint={LINK_HINT} trail="chevron" disabled={sharing} onPress={onShareLink} testID="crew-link-row" />
      </RowsCard>
      <FriendsStep friends={friends} picked={picked} onToggle={toggle} onRetry={onRetry} none={NONE_TO_ASK} limit={Math.min(room, CREW_MAX_MEMBERS - 1)} paging={paging} search={search} />
    </Sheet>
  )
}
