import { useEffect, useRef } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, withTiming } from 'react-native-reanimated'

import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, RADIUS, RISE, SIZE, SPACE } from '../../lib/design/tokens'
import { FRIEND_OVERFLOW_FACES, FRIEND_ROWS, type FriendHere } from '../../lib/friendsHere'
import { useReducedMotion } from '../../lib/motion'
import { PersonRow } from '../friends/PersonRow'
import { Button } from '../ds/Button'
import { Facepile, type Face } from '../ds/Facepile'
import { SectionHeader } from '../ds/SectionHeader'
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

/**
 * Friends here (plans/friends-in-room.md, C1; the Room's rose world): the
 * friends at this event who let friends see them, as one card of rows, each
 * with the one action, Message, which opens your friend chat. Real names and
 * photos: this is the one place a friend is a person in a room.
 *
 * Up to 3 rows; past 3 one overflow row, a Facepile of the next five and "N
 * more here", and See all (a pushed screen: a sheet would not virtualise).
 * Nothing at all with no friends, never an empty card, and never a count of 1.
 * Offline the rows stay and Message dims; a busy Message holds its flare and
 * the other rows stay enabled.
 *
 * Motion: it enters as part of the Room's entrance; a section that arrives
 * later fades in and rises `RISE.list`, and leaves in a quick fade. Reduce
 * Motion: the fades alone. Nothing loops, nothing pulses when a friend arrives.
 * Haptics: none (Message opens a screen; arriving is passive).
 */
export function FriendsHere({
  friends,
  total,
  opening,
  offline,
  appearances,
  onMessage,
  onSeeAll,
  testID = 'friends-here',
}: {
  friends: FriendHere[]
  /** Everyone listed for you here, of whom `friends` is the first page. */
  total: number
  /** The friend whose chat is being opened. */
  opening: string | null
  offline: boolean
  /** Bumps when the section arrives after the Room's first paint: say so, once. */
  appearances: number
  onMessage: (friend: FriendHere) => void
  onSeeAll: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const told = useRef(0)
  useEffect(() => {
    // Once per Room session, only for an arrival after first paint; departures say nothing.
    if (appearances === 0 || told.current > 0) return
    told.current = appearances
    AccessibilityInfo.announceForAccessibilityWithOptions('A friend is here', { queue: true })
  }, [appearances])

  if (total <= 0 || friends.length === 0) return null
  const rows = friends.slice(0, FRIEND_ROWS)
  const more = total - rows.length
  const seeAll = `See all ${total} friends here`

  return (
    <Animated.View testID={testID} entering={reduceMotion ? FadeIn.duration(DURATION.base) : enter} exiting={FadeOut.duration(DURATION.quick)} style={styles.section}>
      <SectionHeader
        title="Friends here"
        count={total > 1 ? total : undefined}
        action={total > FRIEND_ROWS ? { label: 'See all', onPress: onSeeAll } : undefined}
        testID={`${testID}-head`}
      />
      <View style={styles.card}>
        {rows.map((f, i) => (
          <Animated.View key={f.userId} entering={FadeIn.duration(DURATION.base)} exiting={FadeOut.duration(DURATION.quick)} style={i ? styles.separator : null}>
            <PersonRow
              person={f}
              trailing={
                <Button
                  kind="lit"
                  size="sm"
                  icon="message-circle"
                  label="Message"
                  accessibilityLabel={`Message ${f.name}`}
                  loading={opening === f.userId}
                  disabled={offline}
                  onPress={() => onMessage(f)}
                  testID={`${testID}-message-${i}`}
                />
              }
            />
          </Animated.View>
        ))}
        {more > 0 ? (
          <ScalePress
            onPress={onSeeAll}
            haptic={false}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={seeAll}
            style={[styles.more, styles.separator]}
            testID={`${testID}-more`}
          >
            <Facepile faces={friends.slice(FRIEND_ROWS, FRIEND_ROWS + FRIEND_OVERFLOW_FACES).map(faceOf)} size={24} max={FRIEND_OVERFLOW_FACES} text="" ring={COLOR.surface} />
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.moreText]}>
              {`${more} more here`}
            </Text>
            <Icon name="chevron-right" size={ICON.control} color={COLOR.textTertiary} />
          </ScalePress>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  section: { gap: SPACE.sm, paddingHorizontal: SPACE.gutter },
  card: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, overflow: 'hidden', paddingHorizontal: SPACE.lg },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
  more: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: SIZE.control },
  moreText: { flex: 1, color: COLOR.textSecondary },
})
