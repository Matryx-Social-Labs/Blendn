import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'

import { COLOR, DURATION, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { DiscMark } from './DiscMark'
import { font, useBoldText } from './shared'

/** One of our own notifications, as a sample: never a real person's name or photo. */
export type SampleNotification = { title: string; body: string }

/** FLOW-WALK § 2.x: each sample springs in about 380 ms after the last. */
export const SAMPLE_STAGGER_MS = 380
/** The first starts as the sheet settles from its rise. */
const FIRST_AT = DURATION.medium
/** Each drops in from this far above, and from just under full size. */
const DROP = SPACE.xl
const FROM_SCALE = 0.96
/** How long ago each sample "arrived", top first: the lock screen's own newest-first order. */
const WHEN = ['now', '2m', '1h'] as const
/** The frame's words grow with the phone's text size only so far: it is a picture of a lock screen, not the question. */
const FRAME_FONT_CAP = MAX_FONT_SCALE.caption
const MARK = SIZE.tag / 2 + SPACE.xxs

/**
 * The push ask's picture (SCRUM-1006, FLOW-WALK § 2.x): a lock screen lit by the brand's two lights, with our own sample
 * notifications on it. Read as one element: "Sample notifications" and each sample's words; the clock is decoration.
 *
 * Motion: the samples spring in one by one, once, on mount. Reduce Motion: the stack is already there. Nothing in here holds
 * glass, so a sample may fade (SCRUM-1003 forbids it only on what holds the material).
 */
export function LockScreenPreview({ samples, testID }: { samples: readonly SampleNotification[]; testID?: string }) {
  const bold = useBoldText()
  const label = `Sample notifications. ${samples.map((s) => `${s.title}. ${s.body}`).join(' ')}`
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label} style={styles.frame}>
      <Lights />
      {/* The label above says it all; TalkBack would otherwise stop on each line too. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text maxFontSizeMultiplier={FRAME_FONT_CAP} style={[font('display', bold), styles.clock]}>
          9:41
        </Text>
        <View style={styles.stack}>
          {samples.map((sample, i) => (
            // Keyed by its words: another ask in place of this one plays its own drop.
            <Sample key={`${sample.title}|${sample.body}`} sample={sample} index={i} bold={bold} testID={testID && `${testID}-sample-${i}`} />
          ))}
        </View>
      </View>
    </View>
  )
}

function Sample({ sample, index, bold, testID }: { sample: SampleNotification; index: number; bold: boolean; testID?: string }) {
  const still = useReducedMotion()
  const p = useSharedValue(still ? 1 : 0)
  useEffect(() => {
    // Reduce Motion turned on mid-drop: straight to rest (setting it cancels the spring).
    if (still) p.set(1)
    // Once: a sample that has started never replays.
    else if (p.get() === 0) p.set(withDelay(FIRST_AT + index * SAMPLE_STAGGER_MS, withSpring(1, SPRING.settle)))
  }, [still, index, p])
  const drop = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.get()),
    transform: [{ translateY: DROP * (p.get() - 1) }, { scale: FROM_SCALE + (1 - FROM_SCALE) * p.get() }],
  }))
  return (
    <Animated.View testID={testID} style={[styles.card, drop]}>
      <View style={styles.mark}>
        <DiscMark height={MARK} />
      </View>
      <View style={styles.words}>
        <Text numberOfLines={1} maxFontSizeMultiplier={FRAME_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.primary]}>
          {sample.title}
        </Text>
        {/* Two lines, as a lock screen gives a body; a sample puts its title last, so a cut only ever takes the title (lib/pushAsk). */}
        <Text numberOfLines={2} maxFontSizeMultiplier={FRAME_FONT_CAP} style={[font('meta', bold), styles.secondary]}>
          {sample.body}
        </Text>
      </View>
      <Text maxFontSizeMultiplier={FRAME_FONT_CAP} style={[font('caption', bold), styles.when]}>
        {WHEN[index] ?? ''}
      </Text>
    </Animated.View>
  )
}

/**
 * Ember low on the left, violet high on the right: the landing's two lights, at the orbs' strengths. Sized from its own
 * layout, as `Orbs` is: a percentage size stopped short of the frame's right edge on iOS (a hard seam, drive 2026-11-02).
 */
function Lights() {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {box ? (
        <Svg width={box.width} height={box.height}>
          <Defs>
            <RadialGradient id="ember" cx="20%" cy="85%" r="65%">
              <Stop offset={0} stopColor={COLOR.brandOrange} stopOpacity={COLOR.orbOrangeAlpha} />
              <Stop offset={1} stopColor={COLOR.brandOrange} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="violet" cx="85%" cy="15%" r="65%">
              <Stop offset={0} stopColor={COLOR.brandViolet} stopOpacity={COLOR.orbVioletAlpha} />
              <Stop offset={1} stopColor={COLOR.brandViolet} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={box.width} height={box.height} fill="url(#ember)" />
          <Rect width={box.width} height={box.height} fill="url(#violet)" />
        </Svg>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairlineStrong,
    backgroundColor: COLOR.ink,
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.md,
    marginBottom: SPACE.md,
  },
  clock: { color: COLOR.textPrimary, textAlign: 'center', marginBottom: SPACE.lg },
  stack: { gap: SPACE.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surfaceRaised,
  },
  mark: {
    width: SIZE.tag,
    height: SIZE.tag,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLOR.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { flex: 1, minWidth: 0 },
  primary: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  when: { color: COLOR.textTertiary, alignSelf: 'flex-start' },
})
