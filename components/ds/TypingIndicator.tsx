import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { Avatar } from './Avatar'
import { avatarOf, BUBBLE, plural, type ChatPerson } from './chatShared'
import { font, useBoldText } from './shared'

/** #14: a 1200 ms cycle, each dot 160 ms behind the last; opacity 0.35 ↔ 1, rising 2 pt. */
const CYCLE_MS = 1200
const PHASE_MS = 160
const LOW = 0.35
const LIFT = 2
/** Reduce Motion: the dots hold at 40 · 70 · 100% (the page). */
const STILL = [0.4, 0.7, 1] as const
const DOT = 6

function Dot({ clock, index, still, testID }: { clock: SharedValue<number>; index: number; still: boolean; testID?: string }) {
  const style = useAnimatedStyle(() => {
    if (still) return { opacity: STILL[index], transform: [{ translateY: 0 }] }
    const x = (clock.get() - (index * PHASE_MS) / CYCLE_MS + 1) % 1
    const wave = (1 - Math.cos(2 * Math.PI * x)) / 2
    return { opacity: LOW + (1 - LOW) * wave, transform: [{ translateY: -LIFT * wave }] }
  })
  return <Animated.View testID={testID} style={[styles.dot, style]} />
}

/**
 * Someone is typing (guidelines/components/TypingIndicator.html, motion #14):
 * three 6 pt dots in an inbound bubble, with the typer's creature; more than
 * one typing, no face and "N people are typing" beside it. It shows in
 * anonymous DMs too: typing reveals nothing.
 *
 * The dots breathe one after another, one of the three loops the app allows
 * (ROUND3 E): it runs only while this is mounted, so the screen unmounts it
 * the moment the message lands. Reduce Motion holds them at 40 · 70 · 100%.
 *
 * Read once as "{name} is typing"; never a live region (§14). No haptic.
 */
export function TypingIndicator({
  people,
  surface = 'room',
  testID,
}: {
  people: ChatPerson[]
  /** `dm`: no face and no indent — the bubbles there have none (Flow 5 DM #16). */
  surface?: 'room' | 'dm'
  testID?: string
}) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const clock = useSharedValue(0)

  // DS #14: the loop runs only while somebody is typing. The component can stay mounted with nobody (it renders nothing then).
  const typing = people.length > 0
  useEffect(() => {
    if (reduceMotion || !typing) return
    clock.set(withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }), -1))
    return () => cancelAnimation(clock)
  }, [reduceMotion, typing, clock])

  if (!people.length) return null
  const one = people.length === 1
  const label = one ? `${people[0].name} is typing` : `${plural(people.length, 'person', 'people')} are typing`

  return (
    <View testID={testID} accessible accessibilityLabel={label} style={styles.row}>
      {surface === 'dm' ? null : one ? (
        <View testID={testID && `${testID}-avatar`}>
          <Avatar {...avatarOf(people[0], BUBBLE.avatar)} />
        </View>
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={styles.bubble}>
        {STILL.map((_, i) => (
          <Dot key={i} clock={clock} index={i} still={reduceMotion} testID={testID && `${testID}-dot-${i}`} />
        ))}
      </View>
      {one ? null : <Text style={[font('meta', bold), styles.count]}>{label}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm },
  spacer: { width: BUBBLE.avatar },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
    borderRadius: BUBBLE.radius,
    borderBottomLeftRadius: BUBBLE.tail,
    backgroundColor: COLOR.surfaceSunken,
  },
  dot: { width: DOT, height: DOT, borderRadius: RADIUS.capsule, backgroundColor: COLOR.textSecondary },
  count: { flexShrink: 1, color: COLOR.textTertiary },
})
