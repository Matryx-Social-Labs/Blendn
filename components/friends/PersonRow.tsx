import { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { OptimizedImage } from '../OptimizedImage'
import { Text } from '../ui/Text'
import { EMBER, EMBER_RADIUS, SPACE } from '../../lib/theme'
import type { FriendPerson } from '../../lib/friends'

/** The avatar's box and its decode hint, one number so they cannot drift. */
const AVATAR = 48

/**
 * One person on a friend surface: photo, name, a line under it, and whatever
 * the screen needs on the right (Accept, Requested, a chevron).
 *
 * Real name and photo, because every place this is drawn is one both people
 * agreed to — the friends list, requests, a link someone handed out. Never
 * used in a room, where the same person is a pseudonym.
 */
export function PersonRow({
  person,
  detail,
  onPress,
  trailing,
}: {
  person: FriendPerson
  detail?: string
  onPress?: () => void
  trailing?: ReactNode
}) {
  const body = (
    <>
      {/* Decorative: the name beside it says who this is. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {person.photo ? (
          <OptimizedImage source={person.photo} style={styles.avatar} width={AVATAR} height={AVATAR} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Text variant="heading">{(person.name[0] ?? '?').toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1} maxFontSizeMultiplier={1.4}>{person.name}</Text>
        {detail ? <Text variant="meta" numberOfLines={1} maxFontSizeMultiplier={1.3}>{detail}</Text> : null}
      </View>
      {trailing}
    </>
  )

  return onPress ? (
    <ScalePress
      onPress={onPress}
      haptic={false}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${person.name}, ${detail}` : person.name}
      style={styles.row}
    >
      {body}
    </ScalePress>
  ) : (
    <View style={styles.row}>{body}</View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: EMBER_RADIUS.pill },
  avatarEmpty: { backgroundColor: EMBER.surface, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: SPACE.xxs },
})
