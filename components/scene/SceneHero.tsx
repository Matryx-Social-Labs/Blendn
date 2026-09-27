import { MaterialIcons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Dimensions, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated'

import type { FeedMediaItem } from '../../lib/feedMedia'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import { SceneHeroMedia } from './SceneHeroMedia'

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
 * 574 on a 390 frame. Type comes from the fixed `TYPE` scale, but a photograph
 * is not type: its *shape* is what has to survive a change of screen width. So this
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
   * The scarcity pill's text, or nothing.
   *
   * ## The frame says "LIMITED ACCESS" and we cannot
   *
   * It draws that on every event. Nothing in the product backs it: the only
   * thing an organiser is asked is `max_capacity`, whose own placeholder reads
   * "Unlimited if blank" — a fire-safety number, not a claim about
   * exclusivity. A 500-person warehouse night has a capacity and is not
   * exclusive. `visibility` is public/private/unlisted, which is about who can
   * *find* the event rather than who may attend.
   *
   * This was briefly wired to `max_capacity > 0`, which meant "the organiser
   * filled in a field" and rendered as "this is hard to get into". That is the
   * interface asserting something it does not know.
   *
   * The Pulse hit the same thing first and settled it: its frame's pills read
   * "SONIC VOID" and "EXCLUSIVE", and `FeaturedCard` shows the category
   * instead, because a pill you can act on beats a pill that sounds exciting.
   * See `docs/PULSE.md`.
   *
   * So the caller passes a string it can defend — "12 SPOTS LEFT" computed
   * from real remaining capacity — or nothing at all. Genuine exclusivity
   * needs an access model the organiser actually sets, which does not exist
   * yet and is a schema change, not a label.
   */
  scarcity,
  height,
  onPressMedia,
  scrollY,
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
   *
   * Swipeable, and auto-advancing until the first swipe. See `SceneHeroMedia`
   * for why it stops permanently rather than resuming.
   */
  playlist?: FeedMediaItem[]
  title: string
  dateLabel: string
  timeLabel: string
  scarcity?: string | null
  height?: number
  /** Opens the lightbox at the item currently shown. */
  onPressMedia?: (index: number) => void
  /**
   * The host scroll's `contentOffset.y`, when the hero sits in one.
   *
   * Drives the parallax, the pull-down stretch and the caption fade on the UI
   * thread. Absent (the preview harness), the hero is still.
   */
  scrollY?: SharedValue<number>
  /** The title is a shared element on the real screen; the harness passes none. */
  children?: React.ReactNode
}) {
  const h = height ?? sceneHeroHeight()
  const reduceMotion = useReducedMotion()

  /*
   * ## Pulled past the top, the photograph stretches to fill the gap
   *
   * iOS bounces the scroll, and without this the bounce opened a strip of bare
   * page above the hero. Scaled from its bottom edge, by exactly what it takes
   * for the top to stay on the screen's top, so the picture follows the finger
   * down (Apple Music's album art does this). A transform on the clip box, not
   * a height: scaling costs nothing, and a height change here would re-lay-out
   * the whole screen on every frame of the pull.
   *
   * The box is scaled, not the media inside it. The media is clipped by this
   * box, so scaling the media alone would crop the stretch away at the old top.
   * Android does not bounce past zero, so there it never runs.
   */
  const clipStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.get() : 0
    if (reduceMotion || y >= 0) return { transform: [{ translateY: 0 }, { scale: 1 }] }
    const pull = -y
    // Translate first so it is not itself scaled: moving up by half the growth
    // keeps the bottom edge where it was.
    return { transform: [{ translateY: -pull / 2 }, { scale: (h + pull) / h }] }
  })

  /*
   * ## Scrolled down, the photograph drifts at half speed
   *
   * The page moves at 1x and the picture at 0.5x, so the sections slide up
   * over it instead of the two leaving together, which is the one cue that
   * the hero is *behind* the page and not a block in it. Clipped by the box
   * above, so the drift never shows below the hero's own foot.
   */
  const mediaStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.get() : 0
    if (reduceMotion || y <= 0) return { transform: [{ translateY: 0 }] }
    return { transform: [{ translateY: Math.min(y, h) * 0.5 }] }
  })

  /*
   * ## The caption goes before the header reaches it
   *
   * Gone by 45% of the hero, while it is still well below the top bar, so the
   * title never slides under the bar's buttons half-read. A fade, so it stays
   * under Reduce Motion: it moves nothing, and it explains where the title
   * went.
   */
  const captionStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.get() : 0
    return { opacity: interpolate(y, [0, h * 0.45], [1, 0], Extrapolation.CLAMP) }
  })

  return (
    <View style={[styles.hero, { height: h }]}>
      <Animated.View style={[styles.clip, clipStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, mediaStyle]}>
          {playlist && playlist.length > 0 ? (
            <SceneHeroMedia
              playlist={playlist}
              width={Dimensions.get('window').width}
              height={h}
              onPress={onPressMedia}
            />
          ) : (
            <Image
              source={source}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
          )}
        </Animated.View>
        {/*
          Transparent to the page's own background, not to black, and spanning
          the whole hero rather than a band at its foot.

          The frame's gradient is `inset-0` ending on #0F0E0E. Ending it on black
          instead would put a subtly darker, cooler rectangle over a warm
          near-black page — the same two-blacks problem that survived months in
          the launch overlay because nobody diffs them. And at 180pt it was sized
          for the old 430pt card: against a hero half again as tall, a two-line title
          would begin above the gradient's top edge, on bare photograph.
        */}
        <LinearGradient
          colors={[EMBER.bgClear, EMBER.bg]}
          start={{ x: 0.5, y: 0.25 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          /*
           * Nothing here may take a touch.
           *
           * This covers the *entire* hero and is drawn after the pager, so
           * without this it swallowed every gesture aimed at the media beneath
           * it — the hero could not be swiped and tapping it opened nothing.
           * A decorative overlay that eats input is the most invisible kind of
           * broken: it looks exactly right and simply does not respond.
           */
          pointerEvents="none"
        />
      </Animated.View>
      {/*
        Also `none`. The caption covers the bottom third and holds no controls,
        so the pager underneath keeps that area swipeable.
      */}
      {/*
        One node to VoiceOver, not five.

        Unlabelled, this caption is read as four separate fragments in visual
        order — a scarcity pill, a title, a date, a time — and the two meta
        items are icon-plus-text pairs, so the swipe order includes stops that
        announce nothing. Grouped, it is a single announcement in the order
        somebody actually wants: what it is, when, and how tight the door is.

        `accessibilityRole="header"` because this *is* the screen's heading, and
        it lets a VoiceOver user jump straight here with the rotor rather than
        swiping past the hero's media pager.
      */}
      <Animated.View
        style={[styles.info, captionStyle]}
        pointerEvents="none"
        accessible
        accessibilityRole="header"
        accessibilityLabel={[title, dateLabel, timeLabel, scarcity]
          .filter(Boolean)
          .join('. ')}
      >
        {scarcity ? (
          <View style={styles.pill}>
            <Text style={styles.pillText} maxFontSizeMultiplier={1.4}>
              {scarcity}
            </Text>
          </View>
        ) : null}

        {children ?? (
          /*
            Capped at 1.2, and this is the one place in the app where the cap is
            not optional.
            React Native **clips** a glyph to its `lineHeight` where CSS lets it
            overflow. At Accessibility XXXL iOS scales text by about 3.1x, which
            would render two rows of sliced letterforms over a photograph.
            `numberOfLines={2}` truncates, it does not rescue the line box.

            1.2 is the largest step whose glyphs still fit the line.
            Somebody who needs bigger type than that gets it everywhere else on
            this screen; the hero title is a display element with the same words
            in the accessible label below.
          */
          <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1.2}>
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
          both sit at `ICON.sm`, inline with the meta text.

          The glyphs take the labels' grey: the CTA is this screen's one
          accent (`docs/DESIGN_SYSTEM.md`).

          These arrive already formatted. The screen used to print one combined
          string under a single calendar icon, which labels half of what it says
          wrongly — and the frame gives them separate slots for that reason.
        */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <MaterialIcons name="event" size={ICON.sm} color={EMBER.textSecondary} />
            <Text style={styles.metaText}>{dateLabel}</Text>
          </View>
          <View style={styles.metaItem}>
            <MaterialIcons name="schedule" size={ICON.sm} color={EMBER.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {timeLabel}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

/**
 * The title: the screen's one `display`.
 *
 * ## No text shadow
 *
 * The frame specifies `0 0 30px rgba(255,144,109,0.3)`, a soft warm bloom. RN's
 * `textShadow` is not CSS's: at radius 30 it renders as a flat warm rectangle
 * sitting behind the words — a visible brown box, not a glow. The gradient over
 * the hero is already what makes the title legible.
 */
export const sceneHeroTitleStyle = TYPE.display

const styles = StyleSheet.create({
  hero: { width: '100%' },
  /*
   * `surfaceSunken`, so an event with no cover is a dark panel rather than a
   * transparent hole. `source` is undefined in that case and `expo-image`
   * draws nothing, which would otherwise show the page straight through the
   * hero and put the title on nothing.
   *
   * The clip lives here, not on `hero`, so the stretch can grow the box above
   * the hero's top while the caption (a sibling) stays unscaled on the bottom.
   */
  clip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', backgroundColor: EMBER.surfaceSunken },
  /* The screen gutter on every side, bottom-aligned, 16pt between the three blocks. */
  info: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: GUTTER,
    gap: SPACE.lg,
    alignItems: 'flex-start',
  },
  pill: {
    minHeight: CONTROL.sm,
    justifyContent: 'center',
    backgroundColor: EMBER.scrim,
    borderWidth: 1,
    borderColor: EMBER.separator,
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: SPACE.md,
  },
  // Uppercased in the string, not by `textTransform`, so the tracking lands on
  // the real glyphs.
  pillText: { ...TYPE.label, color: EMBER.textPrimary },
  title: sceneHeroTitleStyle,
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.xl },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  metaText: { ...TYPE.meta, flexShrink: 1 },
})
