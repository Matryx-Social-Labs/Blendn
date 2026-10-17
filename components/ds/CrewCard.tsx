import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { Icon } from '../ui/Icon'
import { COLOR, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { ACHIEVEMENT, AchievementBadge, type AchievementKind } from './AchievementBadge'
import { Button } from './Button'
import { Chip } from './Chip'
import { CountTicks } from './CountTicks'
import { CrewEmblem } from './CrewEmblem'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The emblem: 96 on a card, 56 compact (the page); 40 in a row. */
const EMBLEM = { full: 96, compact: 56, row: 40 } as const
/** The ⋯ in the card's corner: a 32 pt raised circle, 12 in, reaching the target through slop. */
const MORE = SIZE.tag
const ROW_MIN_HEIGHT = SIZE.primary + SPACE.sm

export type CrewCardCrew = {
  name: string
  /** The server's `emblemSeed`. */
  emblemSeed: string
  size: number
  /** Here now: a count, never who. */
  here: number
  bio?: string | null
  tags: string[]
  intent?: string
}

export type CrewLike = {
  /** Your side already liked them tonight. */
  liked?: boolean
  /** The crew you're liking as; absent for a solo person's plain Like. */
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
  like,
  compact = false,
  onPress,
  onMore,
  testID,
}: {
  crew: CrewCardCrew
  /** Crew-held, from the server ("Both crews are into Techno"). */
  overlap?: string | null
  like?: CrewLike
  compact?: boolean
  /** Opens the crew's sheet. */
  onPress?: () => void
  /** The ⋯: report or hide. */
  onMore?: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const here = Math.max(0, Math.min(crew.here, crew.size))
  const label = [crew.name, `crew of ${crew.size}`, here ? `${here} here` : null, crew.bio, ...crew.tags, crew.intent].filter(Boolean).join(', ')
  const detail = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const slop = (minTarget() - MORE) / 2

  return (
    <View testID={testID} style={[styles.card, { borderRadius: compact ? RADIUS.sheet : RADIUS.card }, contrast && IC_HAIRLINE]}>
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
            <CrewEmblem seed={crew.emblemSeed} size={compact ? EMBLEM.compact : EMBLEM.full} />
            <CountTicks size={crew.size} here={here} />
          </View>
          <View style={styles.text}>
            <Text style={[font(compact ? 'heading' : 'title', bold), styles.ink, onMore ? styles.clearMore : null]}>{crew.name}</Text>
            <Text style={[font('meta', bold), { color: detail }]}>
              {here ? `Crew of ${crew.size} · ${here} here now` : `Crew of ${crew.size}`}
            </Text>
            {crew.bio ? (
              <Text numberOfLines={2} style={[font(compact ? 'meta' : 'body', bold), styles.ink]}>
                {crew.bio}
              </Text>
            ) : null}
          </View>
        </View>
        {crew.tags.length || crew.intent ? (
          <View style={styles.meta}>
            {/* Flow 10 `tagChips`: the outline chip (A31). */}
            {crew.tags.map((t) => (
              <Chip key={t} label={t} variant="outline" />
            ))}
            {crew.intent ? <Text style={[font('meta', bold), { color: detail }]}>{crew.intent}</Text> : null}
          </View>
        ) : null}
        {overlap ? (
          <View style={styles.overlap}>
            <Icon name="sparkles" size={ICON.inline} />
            <Text style={[font('meta', bold), styles.ink, styles.text]}>{overlap}</Text>
          </View>
        ) : null}
      </Pressable>
      {like ? <LikeButton like={like} /> : null}
      {onMore ? (
        <Pressable
          onPress={onMore}
          hitSlop={slop}
          accessibilityRole="button"
          accessibilityLabel={`More, ${crew.name}`}
          android_ripple={{ color: PRESSED_WASH.android, borderless: true }}
          style={styles.more}
        >
          <Icon name="ellipsis" size={ICON.inline} />
        </Pressable>
      ) : null}
    </View>
  )
}

function LikeButton({ like }: { like: CrewLike }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  if (!like.liked) return <Button kind="primary" label={like.as ? `Like for ${like.as}` : 'Like'} pressHaptic={H.like} onPress={like.onPress} />
  const text = like.as ? `Liked for ${like.as}` : 'Liked'
  // Settled: words in the button's place, not a button (a second like does nothing, §10.2).
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={text} style={[styles.liked, contrast && IC_HAIRLINE]}>
      <Icon name="check" size={ICON.control} active />
      <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('button', bold), styles.ink]}>
        {text}
      </Text>
    </View>
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
  testID,
}: {
  name: string
  emblemSeed: string
  size: number
  sub?: string
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
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[name, line, badge ? `Badge: ${ACHIEVEMENT[badge].label}` : null].filter(Boolean).join(', ')}
      android_ripple={{ color: PRESSED_WASH.android }}
      style={({ pressed }) => [styles.row, pressed && Platform.OS === 'ios' ? { backgroundColor: PRESSED_WASH.ios } : null]}
    >
      <CrewEmblem seed={emblemSeed} size={EMBLEM.row} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.ink]}>
          {name}
        </Text>
        <Text style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{line}</Text>
      </View>
      {badge ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AchievementBadge kind={badge} />
        </View>
      ) : onPress ? (
        <Icon name="chevron-right" size={ICON.control} color={COLOR.textTertiary} />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.md },
  info: { gap: SPACE.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.lg },
  emblem: { alignItems: 'center', gap: SPACE.sm },
  text: { flex: 1, gap: SPACE.xs },
  ink: { color: COLOR.textPrimary },
  clearMore: { paddingRight: MORE },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm },
  liked: {
    height: SIZE.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    borderRadius: RADIUS.button,
    backgroundColor: COLOR.surface,
  },
  overlap: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  more: {
    position: 'absolute',
    top: SPACE.md,
    right: SPACE.md,
    width: MORE,
    height: MORE,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
})
