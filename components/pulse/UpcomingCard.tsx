import { memo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { CONTROL, EMBER, EMBER_RADIUS, ICON, OPACITY, SPACE, TYPE } from '../../lib/theme'
import { OptimizedImage } from '../OptimizedImage'
import ScalePress from '../motion/ScalePress'
import { HeartIcon } from '../motion/HeartIcon'

/** The photo: a square on the card's right edge. */
export const UPCOMING_THUMB = CONTROL.md * 2

/**
 * An event in the Upcoming list, as one row: words on the left, photo on the right.
 *
 * ## Why a row and not a photo card
 *
 * Luma's event list (and every dense event list worth copying) reads by *when*
 * first and treats the cover as colour, not as a stage. The list is grouped by
 * day above this card, so the card says only the time; the photo is a 96pt
 * square beside the text, so nothing is ever printed on top of an unknown
 * photograph and no scrim is needed. Three of these fit where one 165pt photo
 * card used to.
 *
 * ## Every value on this card is one the server already returns
 *
 * | Shown | Real |
 * |---|---|
 * | "7:00 PM" | `startTime`, via `timeLabel` |
 * | category | `categories[0]` |
 * | venue | `venueName`, else `city`, via `placeLabel` |
 * | "142 joined" | `currentCapacity` |
 * | "1.2 km" | `distance`, via `formatDistance` |
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
  /** "7:00 PM" — the date is the group heading above the card. */
  timeLabel: string
  /** Venue name, or the city when the venue is unnamed. */
  placeLabel?: string | null
  /** Attendees so far. Omitted below 1: see above. */
  joinedCount?: number | null
  /** Pre-formatted by `formatDistance`, or absent when we have no fix. */
  distanceLabel?: string | null
  onPress: () => void
  /**
   * The quick-actions tray (save, check in or out, details). Also offered to
   * VoiceOver as a "Quick actions" custom action, since a long-press is not
   * discoverable with a screen reader.
   */
  onLongPress?: () => void
  /**
   * A status after the time — "On the waitlist", "Cancelled". `noteTone`
   * `destructive` for the one that is bad news.
   */
  note?: string | null
  noteTone?: 'default' | 'destructive'
  /**
   * One text action under the meta — "RATE PEOPLE YOU MET" on a past event.
   * Its own button, so it does not open the event.
   */
  action?: { label: string; accessibilityLabel: string; onPress: () => void } | null
  /*
   * The heart. Saving an event is the whole of `event_favorites` and what the
   * Going tab's "Saved" section is built from, so it stays through the restyle.
   *
   * On the photo's corner rather than in the text column: it is a silent
   * toggle, and keeping it off the words keeps a mis-tap from opening the
   * event (or the reverse).
   */
  isFavorited?: boolean
  favoriteBusy?: boolean
  onToggleFavorite?: () => void
}

/** Hoisted so the prop keeps one identity across renders. */
const QUICK_ACTIONS = [{ name: 'quickActions', label: 'Quick actions' }]

function UpcomingCardImpl({
  title,
  category,
  imageUrl,
  timeLabel,
  placeLabel,
  joinedCount,
  distanceLabel,
  onPress,
  onLongPress,
  note,
  noteTone = 'default',
  action,
  isFavorited,
  favoriteBusy,
  onToggleFavorite,
}: Props) {
  const showJoined = typeof joinedCount === 'number' && joinedCount > 0
  const eyebrow = [timeLabel, category].filter(Boolean).join(' · ')

  return (
    /*
      The whole card opens the event.

      It used to be a card with a "Details" button, on the reasoning that a
      pressable card holding a pressable button gives two ways to do one thing.
      As a row the card *is* the thing — every list app works this way — and the
      one control inside it, the heart, sits on the photo, away from the words.

      It scales on press rather than dimming; no haptic, since it navigates. The
      heart and the action are their own Pressables, so pressing them never
      shrinks the row.
    */
    <ScalePress
      haptic={false}
      pressedScale={0.98}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={[title, timeLabel, placeLabel].filter(Boolean).join(', ')}
      accessibilityActions={onLongPress ? QUICK_ACTIONS : undefined}
      onAccessibilityAction={
        onLongPress
          ? (e) => {
              if (e.nativeEvent.actionName === 'quickActions') onLongPress()
            }
          : undefined
      }
      style={styles.card}
    >
      <View style={styles.body}>
        {eyebrow || note ? (
          <Text style={styles.eyebrow} numberOfLines={1}>
            {eyebrow}
            {note ? (
              <Text style={noteTone === 'destructive' ? styles.noteBad : styles.note}>
                {eyebrow ? ` · ${note}` : note}
              </Text>
            ) : null}
          </Text>
        ) : null}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {placeLabel ? (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={ICON.sm} color={EMBER.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {placeLabel}
            </Text>
          </View>
        ) : null}
        {showJoined || distanceLabel ? (
          <View style={styles.metaRow}>
            {showJoined ? (
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={ICON.sm} color={EMBER.textSecondary} />
                <Text style={styles.metaText}>{`${joinedCount} joined`}</Text>
              </View>
            ) : null}
            {distanceLabel ? (
              <View style={styles.metaItem}>
                <Ionicons name="navigate-outline" size={ICON.sm} color={EMBER.textSecondary} />
                <Text style={styles.metaText}>{distanceLabel}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.thumb}>
        {imageUrl ? (
          <OptimizedImage
            source={imageUrl}
            recyclingKey={imageUrl ?? undefined}
            style={StyleSheet.absoluteFill as never}
            height={UPCOMING_THUMB}
            contentFit="cover"
          />
        ) : null}

        {onToggleFavorite ? (
          <Pressable
            onPress={onToggleFavorite}
            disabled={favoriteBusy}
            accessibilityRole="button"
            accessibilityState={{ selected: Boolean(isFavorited), disabled: Boolean(favoriteBusy) }}
            accessibilityLabel={isFavorited ? `Saved, ${title}` : `Save ${title}`}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={({ pressed }) => [
              styles.favorite,
              favoriteBusy && styles.favoriteBusy,
              pressed && styles.pressed,
            ]}
          >
            <HeartIcon
              on={Boolean(isFavorited)}
              size={ICON.sm}
              onColor={EMBER.textPrimary}
              offColor={EMBER.textPrimary}
            />
          </Pressable>
        ) : null}
      </View>
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  // A row on the page: one step up from `bg`, no border, no shadow.
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.lg,
    padding: SPACE.lg,
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.md,
  },
  pressed: { opacity: OPACITY.pressed },

  body: { flex: 1, gap: SPACE.xs },
  eyebrow: TYPE.meta,
  note: { color: EMBER.textPrimary },
  noteBad: { color: EMBER.destructive },
  action: { alignSelf: 'flex-start', marginTop: SPACE.xs },
  actionText: { ...TYPE.label, color: EMBER.textPrimary },
  title: TYPE.bodyStrong,
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, flexShrink: 1 },
  metaText: { ...TYPE.meta, flexShrink: 1 },

  // The fallback is the fill itself: an event with no cover shows a quiet
  // square, not a broken-image glyph, and every row keeps the same shape.
  thumb: {
    width: UPCOMING_THUMB,
    height: UPCOMING_THUMB,
    borderRadius: EMBER_RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: EMBER.surface,
  },
  favorite: {
    position: 'absolute',
    right: SPACE.xs,
    top: SPACE.xs,
    width: CONTROL.sm,
    height: CONTROL.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dimmed while the write is in flight rather than swapped for a spinner: the
  // icon has already changed optimistically, and replacing it mid-write makes
  // the state you just chose vanish for the length of a round trip.
  favoriteBusy: { opacity: OPACITY.disabled },
})

export const UpcomingCard = memo(UpcomingCardImpl)
