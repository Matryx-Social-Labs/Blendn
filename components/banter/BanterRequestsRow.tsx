import { router } from 'expo-router'

import { COLOR } from '../../lib/design/tokens'
import { personFace } from '../../lib/personFace'
import type { MessageRequest } from '../../lib/useBanterInbox'
import { Facepile, type Face } from '../ds/Facepile'
import { Badge } from '../ds/MonoFamily'
import { useBanterPress } from './pressGuard'
import { SettingsGroup, SettingsRow } from '../ds/SettingsRow'

const FACES = 3

// A request carries the sender's name by design: their photo, or their initial (F1 B), never a creature.
const faceOf = (r: MessageRequest): Face => personFace({ named: true, name: r.sender_name || 'Someone', photo: r.sender_avatar })

/**
 * Everyone asking to message you, as one row above the chats: the newest faces and the true count, whatever the number. Sixty
 * waiting put three tall cards ahead of every conversation, so the answers live on the Message requests page (redesign, Gate A).
 * Message requests only: crew invites are answered in Notifications and on Crews (requests placement A, 2026-11-15).
 */
export function BanterRequestsRow({ requests, total }: { requests: readonly MessageRequest[]; total: number }) {
  // A lift after holding the row is not a tap, as on every other Banter row.
  const open = useBanterPress(() => router.push('/message-requests'))
  return (
    <SettingsGroup>
      <SettingsRow
        testID="banter-requests"
        leading={requests.length ? <Facepile faces={requests.slice(0, FACES).map(faceOf)} total={Math.min(requests.length, FACES)} size={24} ring={COLOR.surface} /> : undefined}
        title="Message requests"
        label={`Message requests, ${total}`}
        accessory={<Badge text={total > 99 ? '99+' : total} size={22} />}
        trail="chevron"
        onPress={open}
      />
    </SettingsGroup>
  )
}
