import { router } from 'expo-router'

import { COLOR } from '../../lib/design/tokens'
import type { MessageRequest } from '../../lib/useBanterInbox'
import { Facepile, type Face } from '../ds/Facepile'
import { Badge } from '../ds/MonoFamily'
import { useBanterPress } from './pressGuard'
import { SettingsGroup, SettingsRow } from '../ds/SettingsRow'

const FACES = 3

const faceOf = (r: MessageRequest): Face =>
  r.sender_avatar ? { kind: 'photo', uri: r.sender_avatar } : { kind: 'creature', pseudonym: r.sender_name ?? r.request_id }

/**
 * Everyone asking to talk, as one row above the chats: the newest faces and the true count, whatever the number. Sixty
 * waiting put three tall cards ahead of every conversation, so the answers now live on the Requests page (redesign, Gate A).
 */
export function BanterRequestsRow({ requests, total }: { requests: readonly MessageRequest[]; total: number }) {
  // A lift after holding the row is not a tap, as on every other Banter row.
  const open = useBanterPress(() => router.push('/message-requests'))
  return (
    <SettingsGroup>
      <SettingsRow
        testID="banter-requests"
        // Crew invites alone have no faces to show.
        leading={requests.length ? <Facepile faces={requests.slice(0, FACES).map(faceOf)} total={Math.min(requests.length, FACES)} size={24} ring={COLOR.surface} /> : undefined}
        title="Requests"
        label={`Requests, ${total}`}
        accessory={<Badge text={total > 99 ? '99+' : total} size={22} />}
        trail="chevron"
        onPress={open}
      />
    </SettingsGroup>
  )
}
