import { useCallback, useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import ScalePress from '../motion/ScalePress'
import { Material } from '../ui/Material'
import { CHAT_REACTIONS, type ChatReaction } from '../../lib/chatReactions'
import { COLOR, DURATION, FONT_FAMILY, RADIUS, SIZE, SPACE, SPRING, STAGGER, TYPE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { reactionName } from './chatShared'
import { font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from './shared'

/** Each emoji's target: 44 pt on iOS, 48 dp on Android (the page's 40 pt disc sits inside it). */
export const REACTION_CELL = minTarget
const DISC = SIZE.control - SPACE.sm
/** The emoji under the finger grows (the page's pressed state). */
const HOT_SCALE = 1.2
/** #36: the bar springs 0.9 → 1 from its anchor; each emoji 0.6 → 1, 18 ms apart. */
const BAR_FROM = 0.9
const EMOJI_FROM = 0.6
/** The page's 22 pt emoji in the bar, 28 pt pills under a bubble, popping from 85% when yours lands (#37). */
const BAR_EMOJI = 22
const PILL_HEIGHT = 28
const LAND_FROM = 0.85

export type ReactionBarProps = {
  /** The emoji you have already given this message. */
  mine: readonly string[]
  /** A tap or a scrub let go on one: give it, or take yours back. */
  onPick: (emoji: ChatReaction) => void
  /** Which end of the bar is anchored to the bubble: `right` over your own. */
  side?: 'left' | 'right'
  /** The design gallery only: draws the emoji at this index pressed. */
  previewPressed?: number
  testID?: string
}

/**
 * The long-press bar (guidelines/components/ReactionBar.html, motion #36,
 * #37): the six emoji the server accepts in a 48 pt control-glass capsule
 * (Android: the solid tier), the ones you gave on a white disc. Six only, no
 * picker. A tap gives one or takes it back; a finger dragged along scrubs,
 * growing the emoji under it with `H.reaction('scrub')` per emoji crossed,
 * and lets go on it. A reaction you give lands with `H.reaction('land')`;
 * taking yours back plays nothing. It stays open after the finger lifts.
 *
 * Motion #36: the capsule springs 0.9 → 1 from its anchor on `M.snap` (glass
 * never fades, §5.2 rule 6), the emoji pop in 18 ms apart. Reduce Motion:
 * the capsule appears in place and the emoji fade in. Emoji are drawn by the
 * system at a fixed size. Increase Contrast: the hairline.
 */
export function ReactionBar({ mine, onPick, side = 'left', previewPressed, testID }: ReactionBarProps) {
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const hot = useSharedValue(previewPressed ?? -1)
  const scale = useSharedValue(reduceMotion ? 1 : BAR_FROM)
  const cell = REACTION_CELL()

  useEffect(() => {
    if (!reduceMotion) scale.set(withSpring(1, SPRING.snap))
    // Once, as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = useCallback(
    (i: number) => {
      const emoji = CHAT_REACTIONS[i]
      if (!mine.includes(emoji)) H.reaction('land')
      onPick(emoji)
    },
    [mine, onPick]
  )
  const tick = useCallback(() => H.reaction('scrub'), [])

  const under = (x: number) => {
    'worklet'
    return Math.max(0, Math.min(CHAT_REACTIONS.length - 1, Math.floor((x - SPACE.xs) / cell)))
  }
  const scrub = Gesture.Pan()
    .activeOffsetX([-SPACE.sm, SPACE.sm])
    .onStart((e) => hot.set(under(e.x)))
    .onUpdate((e) => {
      const i = under(e.x)
      if (i === hot.get()) return
      hot.set(i)
      scheduleOnRN(tick)
    })
    .onEnd(() => {
      if (hot.get() >= 0) scheduleOnRN(pick, hot.get())
    })
    .onFinalize(() => hot.set(-1))
  if (testID) scrub.withTestId(`${testID}-scrub`)

  const spring = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))

  return (
    <GestureDetector gesture={scrub}>
      <Animated.View testID={testID} style={[{ transformOrigin: side === 'left' ? 'left bottom' : 'right bottom' }, spring]}>
        <Material role="control" accessibilityRole="toolbar" style={[styles.bar, contrast && IC_HAIRLINE]}>
          {CHAT_REACTIONS.map((emoji, i) => (
            <Cell
              key={emoji}
              emoji={emoji}
              index={i}
              selected={mine.includes(emoji)}
              hot={hot}
              reduceMotion={reduceMotion}
              onPress={() => pick(i)}
              testID={testID && `${testID}-disc-${i}`}
            />
          ))}
        </Material>
      </Animated.View>
    </GestureDetector>
  )
}

function Cell({
  emoji,
  index,
  selected,
  hot,
  reduceMotion,
  onPress,
  testID,
}: {
  emoji: string
  index: number
  selected: boolean
  hot: SharedValue<number>
  reduceMotion: boolean
  onPress: () => void
  testID?: string
}) {
  const appear = useSharedValue(0)
  useEffect(() => {
    const delay = reduceMotion ? 0 : index * STAGGER.tight
    appear.set(
      reduceMotion
        ? withTiming(1, { duration: motionTokens(true).duration.base })
        : withDelay(delay, withSpring(1, SPRING.snap))
    )
    // Once, as the bar opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const style = useAnimatedStyle(() => {
    const grown = withTiming(hot.get() === index ? HOT_SCALE : 1, { duration: DURATION.press })
    const from = reduceMotion ? 1 : EMOJI_FROM
    return {
      opacity: Math.min(1, appear.get()),
      transform: [{ scale: from + (1 - from) * appear.get() }, { scale: grown }],
    }
  })

  return (
    <ScalePress
      pressedScale={1}
      onPress={onPress}
      onPressIn={() => hot.set(index)}
      onPressOut={() => hot.set(-1)}
      accessibilityRole="button"
      accessibilityLabel={`React, ${reactionName(emoji)}`}
      accessibilityState={{ selected }}
      style={[styles.cell, { width: REACTION_CELL() }]}
    >
      <Animated.View testID={testID} style={[styles.disc, selected && styles.selected, style]}>
        {/* design-exception: an emoji glyph sized to its 40 pt disc, drawn by the system */}
        <Text maxFontSizeMultiplier={1} style={{ fontSize: BAR_EMOJI }}>
          {emoji}
        </Text>
      </Animated.View>
    </ScalePress>
  )
}

export type ReactionPillProps = {
  emoji: string
  count: number
  /** Yours is among them: a 1 pt white outline. */
  mine: boolean
  /** Give it or take yours back. */
  onPress?: () => void
  /** Yours has just landed (#37): it pops in on `M.pop`. The bar played the haptic. */
  landed?: boolean
  testID?: string
}

/**
 * A reaction under a bubble (the same page): a 28 pt `surfaceSunken` pill
 * with the emoji and, past one, a Geist Mono count; yours has a 1 pt white
 * outline. Read "fire, 3, including you"; the count, never who. A tap gives it
 * or takes yours back, silently: the landing is what plays. Yours lands with a
 * pop from 0.85 on `M.pop` (#37); under Reduce Motion it simply appears.
 * ponytail: the count swaps; it rolls once RollingNumber (P2) exists.
 */
export function ReactionPill({ emoji, count, mine, onPress, landed = false, testID }: ReactionPillProps) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const pop = useSharedValue(1)

  useEffect(() => {
    if (!landed || reduceMotion) return
    pop.set(withSequence(withTiming(LAND_FROM, { duration: 0 }), withSpring(1, SPRING.pop)))
  }, [landed, reduceMotion, pop])
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }))

  const label = `${reactionName(emoji)}, ${count}${mine ? ', including you' : ''}`
  const body = (
    <Animated.View testID={testID} style={[styles.pill, mine && styles.mine, popStyle]}>
      <Text maxFontSizeMultiplier={1} style={styles.pillEmoji}>
        {emoji}
      </Text>
      {count > 1 ? (
        <Text maxFontSizeMultiplier={1.3} style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.count]}>
          {count}
        </Text>
      ) : null}
    </Animated.View>
  )
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label}>
        {body}
      </View>
    )
  }
  return (
    <ScalePress
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: mine }}
      hitSlop={{ top: (minTarget() - PILL_HEIGHT) / 2, bottom: (minTarget() - PILL_HEIGHT) / 2 }}
    >
      {body}
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  bar: {
    height: SIZE.control,
    paddingHorizontal: SPACE.xs,
    borderRadius: RADIUS.capsule,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cell: { height: SIZE.control, alignItems: 'center', justifyContent: 'center' },
  disc: { width: DISC, height: DISC, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: COLOR.selectionFill },
  pill: {
    height: PILL_HEIGHT,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surfaceSunken,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    // The outline's width always, transparent, so marking yours never shifts the row.
    borderWidth: 1,
    borderColor: 'transparent',
  },
  mine: { borderColor: COLOR.textPrimary },
  pillEmoji: { ...TYPE.meta },
  count: { color: COLOR.textPrimary, fontVariant: ['tabular-nums'] },
})
