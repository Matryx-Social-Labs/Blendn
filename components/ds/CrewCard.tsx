import type { ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { withSpring, withTiming } from 'react-native-reanimated'

import { Icon } from '../ui/Icon'
import { COLOR, DURATION, ICON, MATERIAL, MAX_FONT_SCALE, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { ACHIEVEMENT, AchievementBadge, type AchievementKind } from './AchievementBadge'
import { Button } from './Button'
import { CountTicks } from './CountTicks'
import { CrewEmblem, type CrewScene } from './CrewEmblem'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'
import { Title } from './Title'

/** The emblem: 96 on a card, 56 compact (the page); 40 in a row. */
const EMBLEM = { full: 96, compact: 56, row: 40 } as const
const ROW_MIN_HEIGHT = SIZE.primary + SPACE.sm

export type CrewCardCrew = {
  name: string
  /** The server's `emblemSeed`. */
  emblemSeed: string
  size: number
  /** Here now: a count, never who. */
  here: number
  bio?: string | null
  /** The crew's hashtags as drawn, without the # (`tagText`): the card adds it. */
  tags: string[]
  intent?: string
  /** The crew's tier badge ("Out together often"): one pill, never a count (14.5, E15). */
  badge?: AchievementKind
}

export type CrewWave = {
  /**
   * `idle` Wave; `waved` your side waved (or liked) tonight; `waveBack` they waved at your side and you haven't answered:
   * the card is lit and the button is Wave back (board crews/05-room A, advisor Q4 2026-11-25).
   */
  state: 'idle' | 'waved' | 'waveBack'
  /** A `waveBack` card drawn lit (rose wash, "Waved at…"); default true. The Room lights only the first three (advisor Q4). */
  lit?: boolean
  /** The crew you're waving as; absent (null) for a solo person's plain Wave. */
  as?: string | null
  onPress: () => void
}

/**
 * A crew as strangers see it in the Room (guidelines/components/CrewCard.html,
 * Flow 10 · 10.7): the emblem, the name, the count ticks, the tags, one line of
 * overlap, and Like (which likes the crew, as you or as your crew). Counts,
 * never people: never a face, never a name but the crew's. `like` absent is
 * your own crew. Compact is the row form in a list.
 *
 * Read as "Nebula, crew of 4, 2 here, Dance floor, Techno heads", then Like.
 * `H.like` on Like (never `H.primary`); none on a tap, which opens the crew's
 * sheet. Liked keeps its check and does nothing more.
 */
export function CrewCard({
  crew,
  overlap,
  wave,
  compact = false,
  onSheet = false,
  onPress,
  emblemScene,
  testID,
}: {
  crew: CrewCardCrew
  /** Crew-held, from the server ("Both crews are into Techno"). */
  overlap?: string | null
  wave?: CrewWave
  compact?: boolean
  /**
   * A preview on a sheet (Make a crew, Flow 10 · 10.2): 8% white on iOS glass,
   * sunken on Android's solid sheet, the frame's `field_bg`. Not for lists.
   */
  onSheet?: boolean
  /** Opens the crew's sheet (Hide tonight, Block, Report live there). */
  onPress?: () => void
  /** Make a crew's preview only (Shuffle dances): never on a card in a list. */
  emblemScene?: CrewScene
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const here = Math.max(0, Math.min(crew.here, crew.size))
  const hashtags = crew.tags.map((t) => `#${t}`)
  const label = [crew.name, `crew of ${crew.size}`, here ? `${here} here` : null, crew.bio, ...hashtags, crew.intent, crew.badge ? `Badge: ${ACHIEVEMENT[crew.badge].label}` : null].filter(Boolean).join(', ')
  const detail = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const lit = wave?.state === 'waveBack' && wave.lit !== false

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { borderRadius: compact ? RADIUS.sheet : RADIUS.card },
        onSheet && { backgroundColor: Platform.OS === 'android' ? COLOR.surfaceSunken : MATERIAL.fillOnGlass },
        contrast && IC_HAIRLINE,
        lit && styles.lit,
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessible
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={overlap ? `${label}. ${overlap}` : label}
        style={styles.info}
      >
        <View style={styles.top}>
          <View style={styles.emblem}>
            <CrewEmblem seed={crew.emblemSeed} size={compact ? EMBLEM.compact : EMBLEM.full} scene={emblemScene} />
            <CountTicks size={crew.size} here={here} />
          </View>
          <View style={styles.text}>
            <Title variant={compact ? 'heading' : 'title'} style={styles.ink}>
              {crew.name}
            </Title>
            {lit ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.atYou]}>
                {wave?.as ? `Waved at ${wave.as}` : 'Waved at you'}
              </Text>
            ) : null}
            {/* The hashtags ride the count's line: one line, cut at the end (board crews/tags/01 · Crew card), so five never wrap the card. */}
            <Text numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: detail }]}>
              {[`Crew of ${crew.size}`, here ? `${here} here now` : null, ...hashtags].filter(Boolean).join(' · ')}
            </Text>
            {crew.badge ? (
              <View style={styles.badge}>
                <AchievementBadge kind={crew.badge} />
              </View>
            ) : null}
            {crew.bio ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} numberOfLines={2} style={[font(compact ? 'meta' : 'body', bold), styles.ink]}>
                {crew.bio}
              </Text>
            ) : null}
          </View>
        </View>
        {crew.intent ? (
          <View style={styles.meta}>
            {crew.intent ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: detail }]}>{crew.intent}</Text> : null}
          </View>
        ) : null}
        {overlap ? (
          <View style={styles.overlap}>
            <Icon name="sparkles" size={ICON.inline} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink, styles.text]}>{overlap}</Text>
          </View>
        ) : null}
      </Pressable>
      {wave ? <WaveButton wave={wave} /> : null}
    </View>
  )
}

/**
 * DS #15: Like becomes Liked at t0 (the swap), then M.pop 0.85 → 1 over the new plate. Never from nothing (0.85, not 0), and
 * under Reduce Motion a 180 ms fade in place. The haptic is the press-in's own (`H.like`).
 */
export const popIn = (reduceMotion: boolean) => () => {
  'worklet'
  return {
    initialValues: { opacity: reduceMotion ? 0 : 1, transform: [{ scale: reduceMotion ? 1 : 0.85 }] },
    animations: {
      opacity: withTiming(1, { duration: DURATION.quick }),
      transform: [{ scale: withSpring(1, SPRING.pop) }],
    },
  }
}

export function WaveButton({ wave }: { wave: CrewWave }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  if (wave.state !== 'waved') {
    const back = wave.state === 'waveBack'
    // As the person Wave (Wave dock A): Wave is lit, Wave back the filled one; the press is H.select.
    return (
      <Button
        kind={back ? 'primary' : 'lit'}
        label={back ? 'Wave back' : wave.as ? `Wave for ${wave.as}` : 'Wave'}
        icon="hand"
        pressHaptic={H.select}
        onPress={wave.onPress}
      />
    )
  }
  // Settled: words in the button's place, not a button (a second wave does nothing, §10.2).
  return (
    <Animated.View
      testID="crew-waved"
      entering={popIn(reduceMotion)}
      accessible
      accessibilityRole="text"
      accessibilityLabel="Waved"
      style={[styles.liked, contrast && IC_HAIRLINE]}
    >
      <Icon name="check" size={ICON.control} active />
      <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('button', bold), styles.ink, styles.likedText]}>
        Waved
      </Text>
    </Animated.View>
  )
}

/**
 * A crew as a row in a list (Flow 10 `crewRow`): the 40 pt emblem, the name,
 * "Crew of N" (or `sub`), a chevron, or the crew's badge in its place ("Out
 * together often", ROUND3 G4). Read as one element, the badge included; a
 * button when it opens something; no haptic.
 */
export function CrewRow({
  name,
  emblemSeed,
  size,
  sub,
  badge,
  onPress,
  trailing,
  testID,
}: {
  name: string
  emblemSeed: string
  size: number
  sub?: string
  /**
   * A control at the row's end in the chevron's place (Settings → Blocked's Unblock). Such a row is in a list on the
   * gutter, not in a card, and groups nothing for a screen reader, so the control is reached on its own.
   */
  trailing?: ReactNode
  /** The crew's tier badge, drawn and read in the chevron's place. */
  badge?: AchievementKind
  onPress?: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const line = sub ?? `Crew of ${size}`
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessible={!trailing}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={trailing ? undefined : [name, line, badge ? `Badge: ${ACHIEVEMENT[badge].label}` : null].filter(Boolean).join(', ')}
      android_ripple={{ color: PRESSED_WASH.android }}
      style={({ pressed }) => [styles.row, trailing ? styles.flush : null, pressed && Platform.OS === 'ios' ? { backgroundColor: PRESSED_WASH.ios } : null]}
    >
      <CrewEmblem seed={emblemSeed} size={EMBLEM.row} />
      <View style={styles.text}>
        {/* A 32-character name takes two lines rather than "The Midnight Vin…"; the row's height is a minimum. */}
        <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>
          {name}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
          {line}
        </Text>
      </View>
      {badge ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AchievementBadge kind={badge} />
        </View>
      ) : trailing ? (
        trailing
      ) : onPress ? (
        <Icon name="chevron-right" size={ICON.control} color={COLOR.textTertiary} />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingVertical: SPACE.xs },
  card: { backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.md },
  info: { gap: SPACE.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.lg },
  emblem: { alignItems: 'center', gap: SPACE.sm },
  text: { flex: 1, gap: SPACE.xs },
  ink: { color: COLOR.textPrimary },
  atYou: { color: COLOR.selectionRoseGlyph },
  lit: { backgroundColor: COLOR.selectionRoseFill, borderWidth: 1, borderColor: COLOR.brandRose },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm },
  liked: {
    minHeight: SIZE.primary,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    borderRadius: RADIUS.button,
    backgroundColor: COLOR.surface,
  },
  likedText: { flexShrink: 1, textAlign: 'center' },
  overlap: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flush: { paddingHorizontal: 0 },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
})
