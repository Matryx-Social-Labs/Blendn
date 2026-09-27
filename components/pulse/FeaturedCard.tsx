import { memo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native'

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
/** 4:5. Tall enough for a photograph, short enough to fit above the bar at full width. */
export const FEATURED_CARD_ASPECT = 5 / 4
export const FEATURED_CARD_WIDTH =
  SCREEN_WIDTH - FEATURED_ROW_INSET - FEATURED_CARD_GAP - FEATURED_PEEK
/** The width when there is nothing to peek at: margin to margin. */
export const FEATURED_CARD_SOLO = SCREEN_WIDTH - FEATURED_ROW_INSET * 2
export const FEATURED_CARD_HEIGHT = Math.round(FEATURED_CARD_WIDTH * FEATURED_CARD_ASPECT)

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
 * The height is clamped to the space above the tab bar (`barTop` is the bar's
 * real top edge) and the width follows from the aspect, so the hero card is
 * never partly hidden behind the navigation on a short phone.
 */
export function featuredCardLayout(
  insets: { top: number; bottom: number },
  barTop: number,
  solo = false
) {
  const available = barTop - (insets.top + CHROME_ABOVE_CARD) - CARD_BOTTOM_BREATH
  const width = Math.min(
    solo ? FEATURED_CARD_SOLO : FEATURED_CARD_WIDTH,
    Math.round(available / FEATURED_CARD_ASPECT)
  )
  return {
    width,
    height: Math.round(width * FEATURED_CARD_ASPECT),
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
}

function FeaturedCardImpl({
  title,
  tag,
  playlist = [],
  isActive = false,
  dateLabel,
  placeLabel,
  width = FEATURED_CARD_WIDTH,
  onPress,
}: Props) {
  /*
   * From the width it is actually being drawn at, not from the default.
   *
   * `width` is a prop — the solo card is `FEATURED_CARD_SOLO`, wider than the
   * carousel one — so pinning the height to a constant made the shape wrong for
   * whichever of the two was not the default.
   */
  const height = Math.round(width * FEATURED_CARD_ASPECT)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${dateLabel}${placeLabel ? `, ${placeLabel}` : ''}`}
      style={({ pressed }) => [styles.card, { width, height }, pressed && styles.pressed]}
    >
      {/*
        The whole media set, walked while this is the card on screen.

        `playlist` replaces the old image-or-video pair. An event usually has one
        photograph and this behaves exactly as before for it; an event with three
        photographs and a clip now shows all four rather than only the first.

        `FeedMedia` keeps the opening still mounted underneath whatever is
        playing, so this component no longer needs a loading or an error state —
        there is always a photograph behind.
      */}
      {playlist.length > 0 ? (
        <FeedMedia playlist={playlist} isActive={isActive} width={width} height={height} />
      ) : (
        // Not a broken-image glyph and not a blank rectangle: an event with no
        // cover still has a name, and the scrim below keeps it legible either
        // way. Every card in the row stays the same size whatever loaded.
        <View style={styles.imageFallback} />
      )}

      {/*
        The clip, over the photograph, only for the card the viewport settled on.

        Mounted rather than paused: an unmounted card allocates no decoder, so a
        row of six costs one player instead of six. `FeedVideo` explains why that
        distinction is the whole policy.

        The image above stays mounted underneath — it is the poster. First paint
        is a real photograph, a slow network shows the photograph rather than
        black, and a clip that 404s leaves a card that looks finished instead of
        broken. There is no spinner because the poster already is one, and it is
        one nobody can tell from the finished thing.
      */}
      {/*
        Top-to-bottom, transparent to page colour.

        The scrim is what makes white text on an unknown photograph legible, so
        it is not decoration and it is not optional — a light image without it
        is an unreadable card, and we do not control what an organiser uploads.
      */}
      <LinearGradient
        colors={['rgba(15,14,14,0)', 'rgba(15,14,14,0.35)', 'rgba(15,14,14,0.9)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.body}>
        {tag ? (
          <View style={styles.tagPill}>
            <Text
              style={styles.tagText}
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
            >
              {tag.toUpperCase()}
            </Text>
          </View>
        ) : null}

        {/*
          Capped at 1.3.

          The card is a **fixed aspect** box — height is derived from width —
          so its caption cannot grow into more room. An uncapped title at
          Accessibility XXXL would fill most of the card, pushing the date and
          venue off the bottom and leaving a photograph with a wall of text.

          `numberOfLines` truncates, which is the right failure here: a title
          cut short still tells you what the event is, where a caption pushed
          off the card tells you nothing about when or where.
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
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: EMBER_RADIUS.card,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceMedia,
    // The scrim darkens the bottom almost to the page colour; the hairline
    // keeps the card's rounded bottom edge visible against the page.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EMBER.separator,
  },
  pressed: { opacity: 0.9 },
  imageFallback: { ...StyleSheet.absoluteFill, backgroundColor: EMBER.surfaceMedia },

  body: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACE.xl, gap: SPACE.sm },

  // A small neutral label on a dark backing, so it stays readable on any
  // photograph and does not compete with the screen's one accent.
  tagPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15,14,14,0.6)',
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    marginBottom: SPACE.xs,
  },
  tagText: { ...TYPE.label, color: EMBER.textPrimary },

  title: TYPE.title,

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  metaItemFlexible: { flexShrink: 1 },
  metaText: { ...TYPE.meta, flexShrink: 1 },
})

export const FeaturedCard = memo(FeaturedCardImpl)
