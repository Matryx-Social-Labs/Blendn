import { memo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Dimensions, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'

import { EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import type { FeedMediaItem } from '../../lib/feedMedia'
import { FeedMedia } from './FeedMedia'
import { PULSE_HEADER_HEIGHT } from './PulseHeader'
import { TOP_BAR_HEIGHT } from './PulseTopBar'

const SCREEN_WIDTH = Dimensions.get('window').width

/*
 * The Featured row, on the design system (`docs/DESIGN_SYSTEM.md`).
 *
 * Cards start at the page margin like everything else on The Pulse, so the
 * headline, "Featured" and the card share one left edge. They used to be
 * centred in whatever width was left after fitting above the tab bar, which put
 * the card ~55pt in beside a 24pt page and was the most visible misalignment on
 * the screen.
 */
export const FEATURED_ROW_INSET = GUTTER
export const FEATURED_CARD_GAP = SPACE.lg
/** How much of the next card shows: enough to read as a card, not a sliver. */
const FEATURED_PEEK = SPACE.xxl
/**
 * The photograph is square, and the words sit under it rather than on it.
 *
 * It was a 4:5 photo with the title printed over a dark scrim. The event lists
 * worth copying (Luma, District, Airbnb) never put text on a photograph they
 * did not take: an organiser's upload can be anything, and a scrim strong
 * enough to guarantee contrast greys out the picture it is there to show.
 * Square, because the words now need their own ~100pt and a 4:5 photo plus
 * them no longer fits above the tab bar at full width.
 */
export const FEATURED_PHOTO_ASPECT = 1
/** Title (two lines at most) and the date/venue line, under the photo. */
export const FEATURED_BODY_HEIGHT =
  SPACE.lg + TYPE.title.lineHeight * 2 + SPACE.xs + TYPE.meta.lineHeight
export const FEATURED_CARD_WIDTH =
  SCREEN_WIDTH - FEATURED_ROW_INSET - FEATURED_CARD_GAP - FEATURED_PEEK
/** The width when there is nothing to peek at: margin to margin. */
export const FEATURED_CARD_SOLO = SCREEN_WIDTH - FEATURED_ROW_INSET * 2

/**
 * Everything between the top of the screen (below the safe area) and the top
 * of the card: the bar, the content's top padding, `PulseHeader`, the gap to
 * the section, and the section heading with its gap. Each term is the constant
 * that draws it, so changing one moves this with it.
 */
export const CHROME_ABOVE_CARD =
  TOP_BAR_HEIGHT + SPACE.lg + PULSE_HEADER_HEIGHT + SPACE.xxl + TYPE.heading.lineHeight + SPACE.lg

/** Daylight between the card's bottom edge and the tab bar. */
const CARD_BOTTOM_BREATH = SPACE.xl

/**
 * The card's size for a screen with these safe insets.
 *
 * Photo plus words is clamped to the space above the tab bar (`barTop` is the
 * bar's real top edge) and the width follows from the photo's aspect, so the
 * hero card is never partly hidden behind the navigation on a short phone.
 */
export function featuredCardLayout(
  insets: { top: number; bottom: number },
  barTop: number,
  solo = false,
  /**
   * Anything drawn above the header that the chrome constant can't know about
   * — the banners ("You're in San Francisco — nothing here yet", offline),
   * measured by the caller. Without it a banner pushed the card's words under
   * the tab bar.
   */
  above = 0
) {
  const max = solo ? FEATURED_CARD_SOLO : FEATURED_CARD_WIDTH
  const available = barTop - (insets.top + CHROME_ABOVE_CARD + above) - CARD_BOTTOM_BREATH
  // Floored at 60%: a stack of banners should push the card down the page,
  // not shrink it to a thumbnail.
  const width = Math.max(
    Math.round(max * 0.6),
    Math.min(max, Math.round((available - FEATURED_BODY_HEIGHT) / FEATURED_PHOTO_ASPECT))
  )
  const photoHeight = Math.round(width * FEATURED_PHOTO_ASPECT)
  return {
    width,
    photoHeight,
    height: photoHeight + FEATURED_BODY_HEIGHT,
    inset: FEATURED_ROW_INSET,
  }
}

interface Props {
  title: string
  /** The category name — already the real one, from the server's taxonomy. */
  tag?: string | null
  /**
   * Everything this event can show, in order — build it with `feedPlaylist`.
   *
   * One photograph is the common case and behaves exactly as a static card. An
   * event with several, or with a clip, cycles them while it is active.
   */
  playlist?: FeedMediaItem[]
  /**
   * Whether this is the card the viewport has settled on.
   *
   * Only the active card mounts a player, so this is the single-active-player
   * policy rather than a hint. Default `false`: a card that is never told it is
   * active shows its photograph and costs nothing, which is the right behaviour
   * for every caller that does not track viewability.
   */
  isActive?: boolean
  /** "Oct 24", formatted by the caller so this component holds no date logic. */
  dateLabel: string
  /** Venue name, or the city when the venue is unnamed. */
  placeLabel?: string | null
  /** Full width when it is the only card — see `FEATURED_CARD_SOLO`. */
  width?: number
  onPress: () => void
  /** The quick-actions tray; also a "Quick actions" VoiceOver action. */
  onLongPress?: () => void
}

const QUICK_ACTIONS = [{ name: 'quickActions', label: 'Quick actions' }]

function FeaturedCardImpl({
  title,
  tag,
  playlist = [],
  isActive = false,
  dateLabel,
  placeLabel,
  width = FEATURED_CARD_WIDTH,
  onPress,
  onLongPress,
}: Props) {
  // From the width it is actually drawn at: the solo card is wider.
  const photoHeight = Math.round(width * FEATURED_PHOTO_ASPECT)

  return (
    // Scales rather than dims: a dimmed photo reads as disabled. No haptic —
    // it navigates, and the next screen is the confirmation.
    <ScalePress
      haptic={false}
      pressedScale={0.98}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${dateLabel}${placeLabel ? `, ${placeLabel}` : ''}`}
      accessibilityActions={onLongPress ? QUICK_ACTIONS : undefined}
      onAccessibilityAction={
        onLongPress
          ? (e) => {
              if (e.nativeEvent.actionName === 'quickActions') onLongPress()
            }
          : undefined
      }
      style={{ width }}
    >
      <View style={[styles.photo, { height: photoHeight }]}>
        {/*
          The whole media set, walked while this is the card on screen. Only the
          active card mounts a player; `FeedMedia` keeps the opening still
          mounted underneath whatever is playing, so there is always a
          photograph behind and no loading or error state is needed here.

          With no media the photo well stays its own fill — a quiet square, not
          a broken-image glyph — so every card in the row keeps its shape.
        */}
        {playlist.length > 0 ? (
          <FeedMedia playlist={playlist} isActive={isActive} width={width} height={photoHeight} />
        ) : null}

        {tag ? (
          // A small neutral label on a dark backing, so it stays readable on any
          // photograph and does not compete with the screen's one accent.
          <View style={styles.tagPill}>
            <Text style={styles.tagText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              {tag.toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        {/*
          Capped at 1.3, and two lines: `featuredCardLayout` budgets exactly
          that much room under the photo so the card clears the tab bar.
          Truncating is the right failure — a title cut short still says what
          the event is.
        */}
        <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {title}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={ICON.sm} color={EMBER.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              {dateLabel}
            </Text>
          </View>
          {placeLabel ? (
            <View style={[styles.metaItem, styles.metaItemFlexible]}>
              <Ionicons name="location-outline" size={ICON.sm} color={EMBER.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {placeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  photo: {
    borderRadius: EMBER_RADIUS.card,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceMedia,
  },

  tagPill: {
    position: 'absolute',
    left: SPACE.lg,
    top: SPACE.lg,
    backgroundColor: EMBER.scrim,
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    maxWidth: '80%',
  },
  tagText: { ...TYPE.label, color: EMBER.textPrimary },

  body: { paddingTop: SPACE.lg, gap: SPACE.xs },
  title: TYPE.title,

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  metaItemFlexible: { flexShrink: 1 },
  metaText: { ...TYPE.meta, flexShrink: 1 },
})

export const FeaturedCard = memo(FeaturedCardImpl)
