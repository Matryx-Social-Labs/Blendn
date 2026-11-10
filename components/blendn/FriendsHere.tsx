import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, withTiming } from 'react-native-reanimated'

import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, RADIUS, RISE, SPACE } from '../../lib/design/tokens'
import { groupedCount, type FriendHere } from '../../lib/friendsHere'
import { useReducedMotion } from '../../lib/motion'
import { Avatar } from '../ds/Avatar'
import type { Face } from '../ds/Facepile'
import { CONTROL_FONT_CAP, font, useBoldText } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'

/** The section's later arrival (first friend arrives): it fades in as it rises `RISE.list` on the entrance ease. */
const enter = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: RISE.list }] },
    animations: {
      opacity: withTiming(1, { duration: DURATION.base, easing: Easing.bezier(...EASING.entrance) }),
      transform: [{ translateY: withTiming(0, { duration: DURATION.base, easing: Easing.bezier(...EASING.entrance) }) }],
    },
  }
}

const faceOf = (f: FriendHere): Face => (f.photo ? { kind: 'photo', uri: f.photo } : { kind: 'creature', pseudonym: f.name })

/** The row's stack (R-A `friendsHere`): three 28 pt faces, each over the last by 8. */
const STACK = 3
const STACK_FACE = 28
const ROW = 60

/** "Ananya is here", or "6 friends here" (grouped: "1,204 friends here"). */
export function friendsHereLine(friends: FriendHere[], total: number): string {
  return total === 1 && friends[0] ? `${friends[0].name} is here` : `${groupedCount(total)} friends here`
}

/**
 * Friends here (plans/friends-in-room.md; Flow 5 R-A `friendsHere`): one 60 pt row in People, the first three friends'
 * faces, "6 friends here" and a chevron, to the Friends here screen, where each has Message. Real names and photos:
 * friends at this event who let friends see them. Nothing at all with no friends, never an empty row.
 *
 * Motion: it enters as part of the Room's entrance; a row that arrives later fades in and rises `RISE.list`, and
 * leaves in a quick fade. Reduce Motion: the fades alone. Nothing loops, nothing pulses when a friend arrives.
 * Haptics: none (it opens a screen).
 */
export function FriendsHere({
  friends,
  total,
  onSeeAll,
  testID = 'friends-here',
}: {
  friends: FriendHere[]
  /** Everyone listed for you here, of whom `friends` is the first page. */
  total: number
  onSeeAll: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  if (total <= 0 || friends.length === 0) return null
  const line = friendsHereLine(friends, total)
  return (
    <Animated.View testID={testID} entering={reduceMotion ? FadeIn.duration(DURATION.base) : enter} exiting={FadeOut.duration(DURATION.quick)} style={styles.gutter}>
      <ScalePress onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={line} accessibilityHint="Opens Friends here" testID={`${testID}-row`} style={styles.row}>
        <View style={styles.stack}>
          {friends.slice(0, STACK).map((f, i) => (
            <View key={f.userId} style={i ? styles.over : null}>
              <Avatar size={STACK_FACE} ring={COLOR.surface} testID={`${testID}-face-${i}`} {...faceOf(f)} />
            </View>
          ))}
        </View>
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('rowTitle', bold, FONT_FAMILY.brand[500]), styles.line]}>
          {line}
        </Text>
        <Icon name="chevron-right" size={ICON.control} color={COLOR.textSecondary} />
      </ScalePress>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: SPACE.gutter },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.md + SPACE.xxs,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
  },
  stack: { flexDirection: 'row' },
  over: { marginLeft: -SPACE.sm },
  line: { flex: 1, minWidth: 0, color: COLOR.textPrimary },
})
