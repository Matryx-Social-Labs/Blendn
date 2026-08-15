import { MaterialIcons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Dimensions, StyleSheet, Text, View } from 'react-native'

import type { FeedMediaItem } from '../../lib/feedMedia'
import { EMBER, EMBER_FONTS } from '../../lib/theme'
import { FeedMedia } from '../pulse/FeedMedia'

/**
 * The Scene's hero — frame `1141:4855`, inside `1141:4853` (390 wide).
 *
 * ## Full bleed, and why that mattered
 *
 * The screen this replaces drew the hero as a card: inset 10pt, 30pt radius,
 * hairline border, 430pt tall, with the page content in a rounded sheet
 * overlapping its foot. The frame has none of that — the photograph runs edge
 * to edge and its bottom dissolves into the page background, and the sections
 * sit directly on the page. The sheet was what forced the hero to be a card, so
 * the two had to change together.
 *
 * ## The height is an aspect, not a number
 *
 * 574 on a 390 frame. Type in this codebase is used at the frame's own values
 * (`EMBER_TYPE.screenTitle` ships 48/-2.4 unscaled), but a photograph is not
 * type: its *shape* is what has to survive a change of screen width. So this
 * scales and the text does not.
 */
const FRAME_WIDTH = 390
const FRAME_HERO_HEIGHT = 574
export const HERO_ASPECT = FRAME_WIDTH / FRAME_HERO_HEIGHT

export const sceneHeroHeight = (width: number = Dimensions.get('window').width) =>
  Math.round(width / HERO_ASPECT)

export function SceneHero({
  source,
  playlist,
  title,
  dateLabel,
  timeLabel,
  /**
   * Whether to draw "LIMITED ACCESS".
   *
   * The frame draws it unconditionally. Doing that would make every event claim
   * limited access including the uncapped ones, which is a thing the screen
   * would simply be saying that is not true — so the caller decides, from
   * whether the event actually has a capacity.
   */
  limited = false,
  height,
  children,
}: {
  source: React.ComponentProps<typeof Image>['source']
  /**
   * The organiser's media, cycling.
   *
   * The same `FeedMediaItem[]` the feed cards walk, from the same
   * `feedPlaylist` — so a clip that plays on the card plays here, with the
   * same poster rule and the same "a video is never cut off" behaviour. When
   * absent the hero is a still, which is what an event with one photograph is.
   */
  playlist?: FeedMediaItem[]
  title: string
  dateLabel: string
  timeLabel: string
  limited?: boolean
  height?: number
  /** The title is a shared element on the real screen; the harness passes none. */
  children?: React.ReactNode
}) {
  const h = height ?? sceneHeroHeight()

  return (
    <View style={[styles.hero, { height: h }]}>
      {playlist && playlist.length > 0 ? (
        /*
         * `isActive` is unconditionally true: this is the screen the user
         * opened, not one card among twenty in a feed, so the
         * single-active-player policy is satisfied by there being one.
         */
        <FeedMedia playlist={playlist} isActive width={Dimensions.get('window').width} height={h} />
      ) : (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      )}
      {/*
        Transparent to the page's own background, not to black, and spanning
        the whole hero rather than a band at its foot.

        The frame's gradient is `inset-0` ending on #0F0E0E. Ending it on black
        instead would put a subtly darker, cooler rectangle over a warm
        near-black page — the same two-blacks problem that survived months in
        the launch overlay because nobody diffs them. And at 180pt it was sized
        for the old 430pt card: against a hero half again as tall, 48pt of title
        would begin above the gradient's top edge, on bare photograph.
      */}
      <LinearGradient
        colors={['rgba(15,14,14,0)', EMBER.bg]}
        start={{ x: 0.5, y: 0.25 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.info}>
        {limited ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>LIMITED ACCESS</Text>
          </View>
        ) : null}

        {children ?? (
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        )}

        {/*
          Date and time side by side, each with its own icon.

          **MaterialIcons, not Ionicons.** The frame's glyphs are Material
          Symbols — solid, flat-capped — and the outline Ionicons that were here
          are a visibly different family: thinner strokes, rounded caps, a
          different calendar. Checked against the exported SVGs rather than
          guessed: the date glyph is an 18x20 calendar with two tabs
          (`event`), the time glyph a 20x20 clock with hands (`schedule`), and
          the sizes below are the frame's, which are deliberately not equal.

          These arrive already formatted. The screen used to print one combined
          string under a single calendar icon, which labels half of what it says
          wrongly — and the frame gives them separate slots for that reason.
        */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <MaterialIcons name="event" size={18} color={EMBER.textSecondary} />
            <Text style={styles.metaText}>{dateLabel}</Text>
          </View>
          <View style={styles.metaItem}>
            <MaterialIcons name="schedule" size={20} color={EMBER.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {timeLabel}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

/**
 * The title. Frame `1141:4863`: Plus Jakarta ExtraBold 48, tracking -2.4.
 *
 * ## The frame's 43.2 line height cannot be used literally
 *
 * CSS `leading-[43.2px]` on a 48px font is legal — the glyphs simply overflow
 * their line box and nothing is lost. React Native **clips** to the line box,
 * so copying 43.2 across cut the tops and bottoms off the letters. It is the
 * one number on this frame that does not survive translation, and it looked
 * like a font-loading bug rather than a layout one.
 *
 * 56 is 1.17em: enough for Plus Jakarta's ascender and descender at this
 * weight, and still tighter than the 1.3-1.4 a default would give, which is
 * what the frame's leading is actually reaching for.
 *
 * ## No text shadow
 *
 * The frame specifies `0 0 30px rgba(255,144,109,0.3)`, a soft warm bloom. RN's
 * `textShadow` is not CSS's: at radius 30 it renders as a flat warm rectangle
 * sitting behind the words — a visible brown box, not a glow. The gradient over
 * the hero is already what makes the title legible, and it does that job
 * without an artefact. A real bloom needs a blurred layer behind the text, and
 * should only be built if the plain title is measurably hard to read.
 */
export const sceneHeroTitleStyle = {
  fontFamily: EMBER_FONTS.displayExtraBold,
  fontSize: 48,
  lineHeight: 56,
  letterSpacing: -2.4,
  color: EMBER.textPrimary,
} as const

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden' },
  /* 32pt on every side, bottom-aligned, 16pt between the three blocks. */
  info: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 32,
    gap: 16,
    alignItems: 'flex-start',
  },
  pill: {
    backgroundColor: 'rgba(255,144,109,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,144,109,0.2)',
    borderRadius: 9999,
    paddingHorizontal: 17,
    paddingVertical: 7,
  },
  pillText: {
    fontFamily: EMBER_FONTS.bodyRegular,
    color: EMBER.accent,
    fontSize: 16,
    lineHeight: 24,
    // Uppercased in the string, not by `textTransform`, so the tracking lands
    // on the real glyphs — the same rule as EMBER_TYPE.eyebrow and link.
    letterSpacing: 0.8,
  },
  title: sceneHeroTitleStyle,
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: {
    fontFamily: EMBER_FONTS.bodyMedium,
    color: EMBER.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    flexShrink: 1,
  },
})
