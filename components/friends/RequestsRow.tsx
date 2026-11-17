import { router } from 'expo-router'

import { Badge } from '../ds/MonoFamily'
import { View } from 'react-native'

import { Facepile } from '../ds/Facepile'
import { SettingsRow } from '../ds/SettingsRow'
import { COLOR } from '../../lib/design/tokens'
import type { FriendPerson } from '../../lib/friends'
import { personFace } from '../../lib/personFace'

/**
 * "Friend requests (3)": the way to people waiting on an answer from you (Flow 6 `me` and `friends`: the user-plus glyph, the title, the
 * count as the DS badge, a chevron). One `SettingsRow`; the caller puts it in a `SettingsGroup` (alone on Friends, with Crews on Me).
 *
 * On the Me tab and at the top of Friends. Before it, the only place a request showed was Add friends — a screen you open to send your
 * link, not to check for answers — so a request could sit unseen for as long as nobody went there. Drawn only when there is at
 * least one; the count is a badge per the design system (white, ink digits), not the accent.
 */
export function RequestsRow({ count, faces }: { count: number; faces?: readonly FriendPerson[] }) {
  return (
    <SettingsRow
      testID="requests-row"
      // Flow 7 1-A: the first few asking, as a pile of faces, in place of the glyph.
      icon={faces?.length ? undefined : 'user-plus'}
      leading={faces?.length ? <FacesLead people={faces} /> : undefined}
      title="Friend requests"
      label={`${count} friend request${count === 1 ? '' : 's'}`}
      hint={undefined}
      accessory={<Badge text={count > 99 ? '99+' : count} size={22} testID="requests-badge" />}
      trail="chevron"
      onPress={() => router.push('/friends/requests')}
    />
  )
}

/** Up to three people as the DS pile on a card (Flow 7 1-A and 6-A: the requests row, the Me Friends row). Decorative: the row names them. */
export function FacesLead({ people }: { people: readonly FriendPerson[] }) {
  const faces = people.slice(0, LEAD_FACES).map((p) => personFace({ named: true, name: p.name, photo: p.photo }))
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Facepile faces={faces} total={faces.length} size={24} ring={COLOR.surface} />
    </View>
  )
}
const LEAD_FACES = 3
