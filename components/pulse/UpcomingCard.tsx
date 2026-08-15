import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { EMBER, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'
import OptimizedImage from '../OptimizedImage'

const IMAGE_HEIGHT = 150

/**
 * An event in the Upcoming list — image, name, who is going, how far.
 *
 * ## Every value on this card is one the server already returns
 *
 * The frame's numbers are invented ("142 Joined", "1.2 mi", "28"), but each has
 * a real column behind it, which is the difference between this section and the
 * Nearby one below it:
 *
 * | Drawn | Real |
 * |---|---|
 * | category pill | `categories[0]` |
 * | "142 Joined" | `currentCapacity` |
 * | "1.2 mi" | `distance`, via `formatDistance` |
 * | "28" / "Nov 2" | `startTime` |
 * | paragraph | `shortDescription` |
 *
 * Anything the caller cannot fill is omitted rather than zeroed. "0 joined" on
 * a new event reads as a failure of the event; no line reads as an event that
 * has not started filling up, which is what it is.
 */
interface Props {
  title: string
  /** Category name from the server's taxonomy, not a mood word. */
  category?: string | null
  imageUrl?: string | null
  /** "28", "Nov 2" — the short date that sits opposite the title. */
  dayLabel: string
  /** Attendees so far. Omitted below 1: see above. */
  joinedCount?: number | null
  /** Pre-formatted by `formatDistance`, or absent when we have no fix. */
  distanceLabel?: string | null
  description?: string | null
  onPress: () => void
  actionLabel?: string
  /*
   * The heart, which the frame does not draw.
   *
   * Kept because the card it replaces had one, and quietly dropping a control
   * during a restyle is how a capability disappears without a decision — saving
   * an event for later is the whole of `event_favorites` and the thing the
   * "Interested" rail above is built from.
   *
   * Placed opposite the category pill rather than beside "Details", so the two
   * actions on the card are not adjacent: one opens a screen and the other is a
   * silent toggle, and a mis-tap between them is annoying in both directions.
   *
   * Raised for the designer in `docs/PULSE.md`.
   */
  isFavorited?: boolean
  favoriteBusy?: boolean
  onToggleFavorite?: () => void
}

export function UpcomingCard({
  title,
  category,
  imageUrl,
  dayLabel,
  joinedCount,
  distanceLabel,
  description,
  onPress,
  actionLabel = 'Details',
  isFavorited,
  favoriteBusy,
  onToggleFavorite,
}: Props) {
  const showJoined = typeof joinedCount === 'number' && joinedCount > 0

  return (
    <View style={styles.card}>
      <View style={styles.media}>
        {imageUrl ? (
          <OptimizedImage
            source={imageUrl}
            style={StyleSheet.absoluteFill as never}
            height={IMAGE_HEIGHT}
            contentFit="cover"
          />
        ) : (
          <View style={styles.mediaFallback} />
        )}
        {category ? (
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText} numberOfLines={1}>
              {category}
            </Text>
          </View>
        ) : null}

        {onToggleFavorite ? (
          <Pressable
            onPress={onToggleFavorite}
            disabled={favoriteBusy}
            accessibilityRole="button"
            accessibilityState={{ selected: Boolean(isFavorited), disabled: Boolean(favoriteBusy) }}
            accessibilityLabel={
              isFavorited ? `Remove ${title} from interested` : `Mark ${title} as interested`
            }
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={({ pressed }) => [
              styles.favorite,
              favoriteBusy && styles.favoriteBusy,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={isFavorited ? 'heart' : 'heart-outline'}
              size={18}
              color={isFavorited ? EMBER.accent : EMBER.textPrimary}
            />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.day} numberOfLines={1}>
            {dayLabel}
          </Text>
        </View>

        {showJoined || distanceLabel ? (
          <View style={styles.metaRow}>
            {showJoined ? (
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={13} color={EMBER.textSecondary} />
                <Text style={styles.metaText}>{`${joinedCount} joined`}</Text>
              </View>
            ) : null}
            {distanceLabel ? (
              <View style={styles.metaItem}>
                <Ionicons name="navigate-outline" size={13} color={EMBER.textSecondary} />
                <Text style={styles.metaText}>{distanceLabel}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}

        {/*
          The whole card is not the tap target; this button is.

          A card that is itself pressable and also contains a pressable button
          gives two ways to do one thing and a dead zone between them. The frame
          draws the button, so the button is the affordance.
        */}
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} for ${title}`}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: EMBER.surfaceMedia,
    borderRadius: EMBER_RADIUS.card,
    padding: 16,
    gap: 16,
  },
  media: {
    height: IMAGE_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceSunken,
  },
  mediaFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: EMBER.surfaceSunken },
  categoryPill: {
    position: 'absolute',
    left: 12,
    top: 12,
    backgroundColor: 'rgba(39,37,37,0.75)',
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 3,
    maxWidth: '70%',
  },
  categoryText: { ...EMBER_TYPE.categoryPill, fontSize: 13, lineHeight: 20 },
  favorite: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: 'rgba(39,37,37,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dimmed while the write is in flight rather than swapped for a spinner: the
  // icon has already changed optimistically, and replacing it mid-write makes
  // the state you just chose vanish for the length of a round trip.
  favoriteBusy: { opacity: 0.5 },

  body: { gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // Only the title flexes. The date is short and must never be the thing that
  // truncates — "Nov" is not a date.
  title: { ...EMBER_TYPE.cardTitle, fontSize: 20, lineHeight: 26, flex: 1 },
  day: { ...EMBER_TYPE.meta, color: EMBER.accent, fontSize: 14, lineHeight: 26 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { ...EMBER_TYPE.meta, fontSize: 14, lineHeight: 20 },

  description: { ...EMBER_TYPE.cardBody, fontSize: 14, lineHeight: 20 },

  action: {
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: EMBER_TYPE.tag.fontFamily,
    fontSize: 15,
    lineHeight: 22,
    color: EMBER.textPrimary,
  },
  pressed: { opacity: 0.7 },
})
