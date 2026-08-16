import { memo } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native'

import { EMBER, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'
import type { FeedMediaItem } from '../../lib/feedMedia'
import { FeedMedia } from './FeedMedia'

const SCREEN_WIDTH = Dimensions.get('window').width

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

/**
 * The row's own gutter — **24**, and it is not `Main`'s 12.
 *
 * Measured off `1141:4660`, the carousel's mask: it sits at section-x `-12`,
 * which cancels `Main`'s 12pt padding and makes the row **full-bleed 390**.
 * Card 1 then starts at x=**24** inside it (`1141:4663`).
 *
 * The build had the row inside `Main`'s gutter instead, so the card started at
 * 12 and the row was clipped at `screen − 12`. Two visible consequences:
 *
 * 1. **The card was not centred.** The frame leaves 24 to its left and 34.5 to
 *    its right on a 390 artboard — near-centred, biased left just enough to
 *    show the next card. At 12 it read as jammed against the edge.
 * 2. **The row stopped short.** A carousel whose scroll area ends 12pt inside
 *    the screen looks like a clipped list rather than one that runs off the
 *    edge, which is the whole affordance the peek is there to create.
 *
 * The card's own geometry was never wrong — radius 32, padding 32, gap 16, pill
 * at 17/5, meta gaps 24 and 8, title 36/45 all match `1141:4663` exactly. Only
 * where it sat did.
 */
export const FEATURED_ROW_INSET = 24

/**
 * The width when there is nothing to peek at.
 *
 * One featured event in a narrow-catalogue city — which is every city right
 * now — left a card at 300 against a 402pt screen and 78pt of dead space beside
 * it, reading as a broken layout rather than as an invitation to scroll.
 *
 * Insets by the row's gutter, not `Main`'s, so the solo card lands centred
 * between the same two edges the carousel's first card does.
 */
export const FEATURED_CARD_SOLO = SCREEN_WIDTH - FEATURED_ROW_INSET * 2
/*
 * The card's shape, not one of its two numbers.
 *
 * The width was taken proportionally (85% of the screen) and the height was
 * taken **literally** (450), so the two only agreed on a 390pt device. On the
 * 440pt phone this was screenshotted against, the card came out 374 x 450 where
 * the frame's proportions want 374 x 508 — 58pt short, which reads as a squat
 * card with the caption crowding the bottom edge, and gets worse the wider the
 * phone.
 *
 * Half-proportional is the trap: it looks correct on the one device whose width
 * matches the artboard, which is the device a designer checks it on.
 */
export const FEATURED_CARD_ASPECT = 450 / 331.5
export const FEATURED_CARD_HEIGHT = Math.round(FEATURED_CARD_WIDTH * FEATURED_CARD_ASPECT)
export const FEATURED_CARD_GAP = 24

const SCREEN_HEIGHT = Dimensions.get('window').height

/**
 * Everything between the top of the screen and the top of the card, summed.
 *
 * Not guessed — each term is a constant this screen already applies, and the
 * total was checked against a screenshot: on a 440 × 956 device with a 62pt top
 * inset the card's top measured **387**, and `62 + 325 = 387`.
 *
 * | | |
 * |---|---|
 * | `TOP_BAR_HEIGHT` | 64 |
 * | content `paddingTop` | 32 |
 * | `PulseHeader` — frame `1141:4645` | 133 |
 * | `MAIN_GAP` — frame: section at y=277, header ends 229 | 48 |
 * | `SectionHeader` — frame `1141:4655` | 24 |
 * | `SECTION_GAP` — frame: mask at section-y 48, after a 24 header | 24 |
 *
 * A layout pass would be more robust than arithmetic, but `onLayout` only
 * reports after the first paint, so the card would render at one width and
 * visibly resize. These are all fixed values; if one of them changes, this sum
 * and `__tests__/pulseCardGeometry.test.ts` change with it.
 */
const CHROME_ABOVE_CARD = 64 + 32 + 133 + 48 + 24 + 24

/**
 * Daylight between the card's bottom edge and the bar.
 *
 * The rule is on the **edge**, not the content. Letting the card's rounded
 * bottom slide under the bar was tried — the last 32pt of the card is
 * `1141:4666`'s padding with nothing drawn in it, so no content was hidden and
 * it bought 45pt of width. It still read wrong: a card that runs out of sight
 * behind the navigation looks clipped, whatever is technically visible.
 *
 * So the card sits fully on the page, and the space it needs comes out of the
 * bar instead — see `TAB_BAR_PADDING_TOP` and `CENTRE_SIZE`.
 */
const CARD_BOTTOM_BREATH = 8

/**
 * The card's size and the row's gutter, for a screen with these safe insets.
 *
 * ## Two constraints the frame does not have
 *
 * `Main` is a 390 × 3548 scrolling artboard, so the frame never had to fit the
 * Featured card inside a viewport — and at 85% of the screen it does not. On a
 * 440 × 956 device the card came out 374 × 508 with its top at 387, so its
 * bottom landed at 908 against a tab bar starting at ~843: **65pt of the hero
 * card, including part of its title, sat underneath the navigation.**
 *
 * So the height is clamped to the space actually available and the width
 * follows from the frame's aspect. The card gets smaller on short screens and
 * reaches the frame's 85% on tall ones; it is never cut off by the bar.
 *
 * ## Centred, not left-biased
 *
 * The frame puts card 1 at x=24 in a 390 viewport — near-centred, biased left
 * to reveal the next card. Once the card is narrower than 85% there is room to
 * do better: the gutter is `(screen - card) / 2`, so **the card in view is
 * centred and its neighbours peek equally on both sides**. With `snapToInterval`
 * at `width + gap` every card lands in the same centred position, which is what
 * makes the row read as a carousel rather than as a list that starts flush.
 */
export function featuredCardLayout(insets: { top: number; bottom: number }, barTop: number) {
  /*
   * `barTop` is the bar's real top edge, not `TAB_BAR_CLEARANCE`.
   *
   * The clearance constant is a *padding* number and has been 88 through two
   * changes of the bar's actual height — at the time of writing it under-reports
   * it by 20pt. Fine for reserving scroll space, wrong for placing an edge.
   */
  const available = barTop - (insets.top + CHROME_ABOVE_CARD) - CARD_BOTTOM_BREATH

  const width = Math.min(
    FEATURED_CARD_WIDTH,
    Math.round(available / FEATURED_CARD_ASPECT)
  )
  return {
    width,
    height: Math.round(width * FEATURED_CARD_ASPECT),
    /** Half the leftover, so the card in view sits in the middle of the screen. */
    inset: Math.round((SCREEN_WIDTH - width) / 2),
  }
}

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
 * ## Sized by the frame's ratio, at whatever width it is given
 *
 * The frame's card is 331.5 × 450 — 85% of a 390pt artboard, and a 1.357 ratio.
 * Both numbers are taken proportionally now; taking the width proportionally and
 * the height literally is what made the card 58pt short on a 440pt phone, and
 * correct on exactly the one device that matches the artboard.
 */
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
  /** Position in the row. Only used to alternate the pill's colour. */
  accentIndex?: number
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
  accentIndex = 0,
  width = FEATURED_CARD_WIDTH,
  onPress,
}: Props) {
  const accent = accentIndex % 2 === 0 ? EMBER.gradientFrom : EMBER.gradientTo
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
        colors={['rgba(15,14,14,0)', 'rgba(15,14,14,0.2)', EMBER.bg]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.body}>
        {tag ? (
          <View style={[styles.tagPill, { borderColor: `${accent}1A` }]}>
            <Text
              style={[styles.tagText, { color: accent }]}
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
          so its caption cannot grow into more room. At 36/45 over three lines
          an uncapped title at Accessibility XXXL would need roughly 420pt of
          the card's ~470pt height, pushing the date and venue off the bottom
          and leaving a photograph with a wall of text on it.

          `numberOfLines` truncates, which is the right failure here: a title
          cut short still tells you what the event is, where a caption pushed
          off the card tells you nothing about when or where.
        */}
        <Text style={styles.title} numberOfLines={3} maxFontSizeMultiplier={1.3}>
          {title}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={15} color={EMBER.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              {dateLabel}
            </Text>
          </View>
          {placeLabel ? (
            <View style={[styles.metaItem, styles.metaItemFlexible]}>
              <Ionicons name="location-outline" size={15} color={EMBER.textSecondary} />
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
    // Height comes from the width prop at the call site — see `height` above.
    // Leaving it here as well would win over the inline style on the solo card.
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

/**
 * Memoised, and the props it is given were made stable for it.
 *
 * The most expensive component on the Pulse: a full-bleed hero carrying
 * images and, when the organiser uploaded one, a video player.
 *
 * `memo` alone would have bought nothing: `renderItem` built a fresh
 * `feedPlaylist(...)` array and a fresh `onPress` closure per card per render,
 * so the shallow compare failed every time. `featuredCards` in
 * `app/(tabs)/events.tsx` precomputes both, which is what makes this work.
 */
export const FeaturedCard = memo(FeaturedCardImpl)
