import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

import { Icon } from '../ui/Icon'
import { COLOR, DURATION, ICON, MAX_FONT_SCALE, RADIUS, RISE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { Button } from './Button'
import { Creature, creatureFor } from './Creature'
import { CrewEmblem, EMBLEM_SQUIRCLE } from './CrewEmblem'
import { fade, MomentStage, spring, useBeats } from './MomentStage'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useScreenReader } from './shared'

/** SCREENS-ADDITIONS 10.8: two emblems at 160 slide in and stop, overlapping by ~12%. */
const EMBLEM = 160
const OVERLAP = Math.round(EMBLEM * 0.12)
const ROW = 2 * EMBLEM - OVERLAP
/** flow10b.js `blend`: the second emblem wears a 6 pt ink cut where it lies over the first. */
const CUT = 6
/** Flow 10 prototype: they slide from ±140 pt; they interlock at ~620 ms, the text with them, the buttons at ~820. */
const SLIDE_FROM = 140
const SLIDE_AT = 120
const LAND_MS = 620
const ACTIONS_AT = 820
/** flow10b.js: the scrim at 86% over the moment orbs. */
const SCRIM = 0.86

export type BlendCrew = { kind: 'crew'; name: string; emblemSeed: string; count: number }
export type BlendPerson = { kind: 'person'; pseudonym: string }

/** Your side is first. A Blend always has a crew in it (crew_likes_has_a_crew), so two people is not one. */
export type MomentBlendProps = ({ ours: BlendCrew; theirs: BlendCrew | BlendPerson } | { ours: BlendPerson; theirs: BlendCrew }) & {
  /** "Dance floor", "Friendship": the public card fields both sides share. Never drawn when your side is you alone (yours is people data). */
  facets?: readonly string[]
  /** Your like made it: `H.match` as it lands. Everyone who sees it later (the push, the next open) gets none: it is unsolicited. */
  yourLike: boolean
  onOpen: () => void
  /** Later, and system back: the Blend waits under Live now in the Banter. */
  onLater: () => void
  testID?: string
}

/** The line under the title, and what a screen reader says for it. Names nobody, and never says who liked first. */
function who(ours: BlendCrew | BlendPerson, theirs: BlendCrew | BlendPerson) {
  if (ours.kind === 'person') {
    const crew = theirs as BlendCrew
    return { line: `You + ${crew.name} · 1 + ${crew.count} people`, spoken: `You and ${crew.name}, ${crew.count + 1} people` }
  }
  if (theirs.kind === 'person') return { line: `${ours.name} + one more · ${ours.count} + 1 people`, spoken: `${ours.name} and one more, ${ours.count + 1} people` }
  return { line: `${ours.name} + ${theirs.name} · ${ours.count} + ${theirs.count} people`, spoken: `${ours.name} and ${theirs.name}, ${ours.count + theirs.count} people` }
}

/**
 * It's a Blend (guidelines/components/MomentBlend.html, Flow 10.8, §21.5): two
 * crews, or a crew and a person, liked each other. L4, ≤ 1.2 s, skippable.
 *
 * Like the Match, but the emblems interlock instead of faces sliding: they
 * come in on `M.pop` and stop overlapping by 12%, the title rises on
 * `M.celebrate`, then Open the Blend and Later. `H.match` on landing for the
 * person whose like made it, and nobody else. Nobody is named until someone
 * reveals.
 *
 * Reduce Motion: the emblems fade in place, a 200 ms crossfade, `H.match`
 * unchanged (at once).
 */
export function MomentBlend({ ours, theirs, facets, yourLike, onOpen, onLater, testID }: MomentBlendProps) {
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const screenReader = useScreenReader()
  const insets = useSafeAreaInsets()
  const { duration } = motionTokens(reduceMotion)

  const scrim = useSharedValue(0)
  const orbs = useSharedValue(0)
  const art = useSharedValue(reduceMotion ? 0 : 1)
  const leftX = useSharedValue(reduceMotion ? 0 : -SLIDE_FROM)
  const rightX = useSharedValue(reduceMotion ? 0 : SLIDE_FROM)
  const text = useSharedValue(0)
  const rise = useSharedValue(reduceMotion ? 0 : RISE.list)
  const actions = useSharedValue(0)
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (reduceMotion) {
      ;[scrim, orbs, art, text].forEach((v) => v.set(fade(1, duration.base)))
      actions.set(fade(1, duration.base, duration.base))
      return
    }
    scrim.set(fade(1, DURATION.base))
    orbs.set(fade(1, DURATION.long))
    leftX.set(spring(0, 'pop', SLIDE_AT))
    rightX.set(spring(0, 'pop', SLIDE_AT))
    text.set(fade(1, DURATION.base, LAND_MS))
    rise.set(spring(0, 'celebrate', LAND_MS))
    actions.set(fade(1, DURATION.base, ACTIONS_AT))
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const skipBeats = useBeats([
    { at: reduceMotion ? 0 : LAND_MS, run: () => yourLike && H.match() },
    { at: reduceMotion ? duration.base : ACTIONS_AT, run: () => setLive(true) },
  ])
  const skip = () => {
    ;[scrim, orbs, art, text, actions].forEach((v) => v.set(1))
    leftX.set(0)
    rightX.set(0)
    rise.set(0)
    skipBeats()
  }

  const leftStyle = useAnimatedStyle(() => ({ opacity: art.get(), transform: [{ translateX: leftX.get() }] }))
  const rightStyle = useAnimatedStyle(() => ({ opacity: art.get(), transform: [{ translateX: rightX.get() }] }))
  const textStyle = useAnimatedStyle(() => ({ opacity: text.get(), transform: [{ translateY: rise.get() }] }))
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actions.get() }))

  const { line, spoken } = who(ours, theirs)
  const shared = ours.kind === 'crew' && facets?.length ? facets.join(' · ') : null
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary

  return (
    <MomentStage testID={testID} label={`It’s a Blend. ${spoken}.`} scrimAlpha={SCRIM} scrim={scrim} orbs="moment" orbsOpacity={orbs} onSkip={skip} onBack={onLater}>
      <View pointerEvents="box-none" style={[styles.page, { paddingTop: insets.top }]}>
        <View pointerEvents="box-none" style={styles.body}>
          <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Animated.View style={[styles.left, leftStyle]}>
              <Piece side={ours} />
            </Animated.View>
            <Animated.View style={[styles.right, rightStyle]}>
              <Piece side={theirs} cut={ours.kind === 'crew' && theirs.kind === 'crew'} />
            </Animated.View>
          </View>
          <Animated.View pointerEvents="box-none" style={[styles.copy, textStyle]}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.moment} style={[font('moment', bold), styles.centre]}>
              It’s a Blend
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.centre, { color: secondary }]}>
              {line}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.centre, styles.measure, { color: secondary }]}>
              Nobody’s named yet. Everyone’s on tonight’s names until your crew chooses to reveal.
            </Text>
            {shared ? (
              <View testID={testID && `${testID}-facets`} style={[styles.facets, contrast && IC_HAIRLINE]}>
                <Icon name="sparkles" size={ICON.inline} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink]}>{`You both: ${shared}`}</Text>
              </View>
            ) : null}
          </Animated.View>
        </View>
        <Animated.View
          testID={testID && `${testID}-actions`}
          pointerEvents={live || screenReader ? 'box-none' : 'none'}
          style={[styles.actions, { paddingBottom: insets.bottom + SPACE.xl }, actionsStyle]}
        >
          <Button label="Open the Blend" onPress={onOpen} testID={testID && `${testID}-open`} />
          <Button label="Later" kind="tertiary" onPress={onLater} testID={testID && `${testID}-later`} />
        </Animated.View>
      </View>
    </MomentStage>
  )
}

/** A crew's emblem, or a person's creature (anonymous here: nobody is named until someone reveals). */
function Piece({ side, cut = false }: { side: BlendCrew | BlendPerson; cut?: boolean }) {
  if (side.kind === 'person') return <Creature {...creatureFor(side.pseudonym)} size={EMBLEM} ring={COLOR.ink} />
  return (
    <View>
      {cut ? (
        <Svg width={EMBLEM} height={EMBLEM} viewBox="0 0 100 100" style={styles.cut}>
          <Path d={EMBLEM_SQUIRCLE} fill={COLOR.ink} />
        </Svg>
      ) : null}
      <CrewEmblem seed={side.emblemSeed} size={EMBLEM} />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.gutter, gap: SPACE.xxl },
  art: { width: ROW, height: EMBLEM },
  left: { position: 'absolute', left: 0, top: 0 },
  right: { position: 'absolute', left: EMBLEM - OVERLAP, top: 0 },
  cut: { position: 'absolute', left: -CUT, top: 0 },
  copy: { alignSelf: 'stretch', alignItems: 'center', gap: SPACE.sm },
  centre: { textAlign: 'center', color: COLOR.textPrimary },
  /** flow10b.js: the nobody-named line wraps at 320. */
  measure: { maxWidth: EMBLEM * 2 },
  ink: { color: COLOR.textPrimary },
  facets: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.xs,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  actions: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm },
})
