import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { EMBER, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'
import OptimizedImage from '../OptimizedImage'

import { Dimensions } from 'react-native'

const SCREEN_WIDTH = Dimensions.get('window').width
const ROW_PADDING = 12

/**
 * Narrow enough that the next card peeks, which is what tells somebody the row
 * scrolls.
 *
 * `FEATURED_CARD_SOLO` is the width when there is nothing to peek at. One
 * featured event in a narrow-catalogue city — which is every city right now —
 * left a card at 300 against a 402pt screen and 78pt of dead space beside it,
 * reading as a broken layout rather than as an invitation to scroll.
 */
/*
 * The frame's proportions, not a smaller guess at them.
 *
 * Frame `1141:4643` is **390pt wide** — a phone frame. Its card is 331.5 x 450,
 * which is 85% of the frame width. Everything here was shrunk on the assumption
 * that the frame's numbers were desktop values needing adjustment for a phone;
 * they were already phone values, and the shrinking is what made the screen read
 * as flat next to the design.
 */
export const FEATURED_CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.85)
export const FEATURED_CARD_SOLO = SCREEN_WIDTH - ROW_PADDING * 2
export const FEATURED_CARD_HEIGHT = 450
export const FEATURED_CARD_GAP = 24

/**
 * One card in the Featured row — a photograph with the event written over it.
 *
 * ## The tag says the category, not a mood
 *
 * The frame's pills read "SONIC VOID" and "EXCLUSIVE", which are invented
 * strings in the same family as the invented interest chips on the onboarding
 * frames. `events.categories[0]` is the real one and it is what every other
 * surface groups on, so a pill that says "Nightlife" is a filter the person can
 * act on where "SONIC VOID" is a word.
 *
 * The frame alternates the pill between the gradient's two ends per card, so
 * `accentIndex` carries that alternation rather than a colour — a caller
 * passing the list index gets the frame's rhythm without knowing the palette.
 *
 * ## Sized in whole points, not from the frame's arithmetic
 *
 * The frame's card is 331.5 × 450 inside a 390 frame, which is a mask artifact
 * rather than a chosen number, and 450 is taller than the visible area on the
 * shortest phone we support once the sticky bar and the tab bar are subtracted.
 * 300 × 408 keeps the frame's ratio to within a percent and leaves the next
 * card peeking, which is what tells somebody the row scrolls.
 */
interface Props {
  title: string
  /** The category name — already the real one, from the server's taxonomy. */
  tag?: string | null
  imageUrl?: string | null
  /** "Oct 24", formatted by the caller so this component holds no date logic. */
  dateLabel: string
  /** Venue name, or the city when the venue is unnamed. */
  placeLabel?: string | null
  /** Position in the row. Only used to alternate the pill's colour. */
  accentIndex?: number
  /** Full width when it is the only card — see `FEATURED_CARD_SOLO`. */
  width?: number
  onPress: () => void
}

export function FeaturedCard({
  title,
  tag,
  imageUrl,
  dateLabel,
  placeLabel,
  accentIndex = 0,
  width = FEATURED_CARD_WIDTH,
  onPress,
}: Props) {
  const accent = accentIndex % 2 === 0 ? EMBER.gradientFrom : EMBER.gradientTo

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${dateLabel}${placeLabel ? `, ${placeLabel}` : ''}`}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      {imageUrl ? (
        <OptimizedImage
          source={imageUrl}
          style={StyleSheet.absoluteFill as never}
          width={Math.round(width)}
          height={FEATURED_CARD_HEIGHT}
          contentFit="cover"
          priority="high"
        />
      ) : (
        // Not a broken-image glyph and not a blank rectangle: an event with no
        // cover still has a name, and the scrim below keeps it legible either
        // way. Every card in the row stays the same size whatever loaded.
        <View style={styles.imageFallback} />
      )}

      {/*
        Top-to-bottom, transparent to page colour.

        The scrim is what makes white text on an unknown photograph legible, so
        it is not decoration and it is not optional — a light image without it
        is an unreadable card, and we do not control what an organiser uploads.
      */}
      <LinearGradient
        colors={['rgba(15,14,14,0)', 'rgba(15,14,14,0.2)', EMBER.bg]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.body}>
        {tag ? (
          <View style={[styles.tagPill, { borderColor: `${accent}1A` }]}>
            <Text style={[styles.tagText, { color: accent }]} numberOfLines={1}>
              {tag.toUpperCase()}
            </Text>
          </View>
        ) : null}

        <Text style={styles.title} numberOfLines={3}>
          {title}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={15} color={EMBER.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {dateLabel}
            </Text>
          </View>
          {placeLabel ? (
            <View style={[styles.metaItem, styles.metaItemFlexible]}>
              <Ionicons name="location-outline" size={15} color={EMBER.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {placeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    height: FEATURED_CARD_HEIGHT,
    borderRadius: EMBER_RADIUS.card,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceMedia,
  },
  pressed: { opacity: 0.9 },
  imageFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: EMBER.surfaceMedia },

  body: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 32, gap: 16 },

  tagPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(45,44,44,0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: 17,
    paddingVertical: 5,
  },
  tagText: EMBER_TYPE.tag,

  title: EMBER_TYPE.cardTitleLarge,

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Only the place shrinks. The date is short and fixed, so letting both flex
  // truncates "Oct 24" before the venue name it was competing with.
  metaItemFlexible: { flexShrink: 1 },
  metaText: { ...EMBER_TYPE.meta, flexShrink: 1 },
})
