import { router } from 'expo-router'

import { Badge } from '../ds/MonoFamily'
import { ProfileRow } from '../profile/ProfileRow'

/**
 * "Friend requests (3)": the way to people waiting on an answer from you (Flow 6 `me` and `friends`: a 56 pt sunken row, the user-plus
 * glyph, the title, the count as the DS badge, a chevron).
 *
 * On the Me tab and at the top of Friends. Before it, the only place a request showed was Add friends — a screen you open to send your
 * link, not to check for answers — so a request could sit unseen for as long as nobody went there. Drawn only when there is at
 * least one; the count is a badge per the design system (white, ink digits), not the accent.
 */
export function RequestsRow({ count }: { count: number }) {
  return (
    <ProfileRow
      testID="requests-row"
      icon="user-plus"
      title="Friend requests"
      label={`${count} friend request${count === 1 ? '' : 's'}`}
      hint="Opens your friend requests"
      trailing={<Badge text={count > 99 ? '99+' : count} size={22} testID="requests-badge" />}
      onPress={() => router.push('/friends/requests')}
    />
  )
}
