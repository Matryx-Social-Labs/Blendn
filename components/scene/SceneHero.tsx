import { Image } from 'expo-image'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated'

import { Orbs } from '../ds/Orbs'
import { ScrimPill, TimeBadge, monoCaption } from '../ds/MonoFamily'
import { CONTROL_FONT_CAP, font, useBoldText } from '../ds/shared'
import { PhotoScrim, StatusScrim } from '../ui/GradientFill'
import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import type { FeedMediaItem } from '../../lib/feedMedia'
import { HERO_CAPTION_FOOT, SceneHeroMedia } from './SceneHeroMedia'

/**
 * The Scene's hero (Flow 3 `scene`, 420 tall): the cover (or the organiser's clips and stills) full bleed under the
 * status bar, the head scrim that lets the clock and the circles read over any photo, and the foot scrim that carries the
 * words: the time badge and the pills, the title, then "at {venue}, {area}".
 *
 * ## No cover is the brand orbs, not a grey box
 *
 * An event with nothing to show is the page's ink with the brand orbs drawn on it (frame 22 · 22-O). The words sit on it
 * exactly as they sit on a photograph.
 *
 * ## Pills say only what can be defended
 *
 * The time badge is the one date grammar (`cardTime`, or "Ended"). A scarcity pill is a count the capacity really
 * supports (`lib/scarcity.ts`), the age pill the organiser's own floor, the people pill the Pulse's rule (five and up).
 * Nothing here asserts exclusivity the product has no model for.
 *
 * ## Motion
 *
 * Pulled past the top, the hero stretches from its foot (#32: the clip box scales by what the bounce uncovers, so no
 * bare page opens above it; Android's own overscroll does the rest). Scrolled, the photograph drifts at half speed and
 * the caption is gone by 45% of the hero, before the bar's small title takes over (#30). Reduce Motion keeps the
 * stretch (a direct manipulation) and drops the drift.
 */
export const SCENE_HERO_HEIGHT = 420
export const sceneHeroHeight = () => SCENE_HERO_HEIGHT

/** The head scrim's reach (the venue page's 180). */
const HEAD_SCRIM = 180
/** The foot scrim's reach: tall enough that a two-line title never starts on bare photograph. */
const FOOT_SCRIM = 260
const CAPTION_FADE_AT = 0.45

export type ScenePill = { key: string; text: string; /** The cancelled pill: white, ink on it. */ white?: boolean }

export function SceneHero({
  source,
  playlist,
  title,
  when,
  whenSpoken,
  struck = false,
  pills = [],
  place,
  onPressMedia,
  scrollY,
}: {
  source: React.ComponentProps<typeof Image>['source']
  /**
   * The organiser's media, cycling (`feedPlaylist` / `clipFirst`): the same `FeedMediaItem[]` the feed cards walk. One
   * photograph is the common case and behaves as a still. Swipeable, auto-advancing until the first swipe
   * (`SceneHeroMedia`).
   */
  playlist?: FeedMediaItem[]
  title: string
  /** The badge: "Live", "Ended", "9 PM", "Sat 24 Oct · 9 PM", "Sat 27 – Mon 29 Sep". */
  when: string
  /** What a screen reader says for the badge when the words on it read badly aloud (a range's dash: "Sat 27 to Mon 29 Sep"). */
  whenSpoken?: string
  /** A cancelled event's date is struck through. */
  struck?: boolean
  pills?: ScenePill[]
  /** "at Toit, Indiranagar". */
  place: string
  /** Opens the lightbox at the item currently shown. */
  onPressMedia?: (index: number) => void
  scrollY?: SharedValue<number>
}) {
  const h = SCENE_HERO_HEIGHT
  const { width } = useWindowDimensions()
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()

  const clipStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.get() : 0
    if (y >= 0) return { transform: [{ translateY: 0 }, { scale: 1 }] }
    const pull = -y
    // Translate first so it is not itself scaled: moving up by half the growth keeps the foot where it was.
    return { transform: [{ translateY: -pull / 2 }, { scale: (h + pull) / h }] }
  })
  const mediaStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.get() : 0
    if (reduceMotion || y <= 0) return { transform: [{ translateY: 0 }] }
    return { transform: [{ translateY: Math.min(y, h) * 0.5 }] }
  })
  // A fade, so it stays under Reduce Motion: it moves nothing, and it explains where the title went.
  const captionStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.get() : 0
    return { opacity: interpolate(y, [0, h * CAPTION_FADE_AT], [1, 0], Extrapolation.CLAMP) }
  })

  return (
    <View testID="scene-hero" style={[styles.hero, { height: h }]}>
      <Animated.View style={[styles.clip, clipStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, mediaStyle]}>
          {playlist && playlist.length > 0 ? (
            <SceneHeroMedia playlist={playlist} width={width} height={h} onPress={onPressMedia} />
          ) : source ? (
            <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={200} accessible={false} />
          ) : (
            <View testID="scene-hero-orbs" style={StyleSheet.absoluteFill}>
              <Orbs set="brand" />
            </View>
          )}
        </Animated.View>
        {/* Nothing here may take a touch: these cover the media the hero swipes and opens. */}
        <StatusScrim testID="scene-hero-head" pointerEvents="none" style={styles.head} />
        <PhotoScrim testID="scene-hero-foot" pointerEvents="none" style={styles.foot} />
      </Animated.View>
      {/* One node to a screen reader, in the order somebody wants it: what it is, when, how tight the door is, where. */}
      <Animated.View
        style={[styles.info, captionStyle]}
        pointerEvents="none"
        accessible
        accessibilityRole="header"
        accessibilityLabel={[title, whenSpoken ?? when, ...pills.map((p) => p.text), place].filter(Boolean).join('. ')}
      >
        <View style={styles.pills}>
          {struck ? (
            <ScrimPill>
              <Text style={[monoCaption(bold), styles.ink, styles.struck]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
                {when}
              </Text>
            </ScrimPill>
          ) : (
            <TimeBadge when={when} testID="scene-when" />
          )}
          {pills.map((p) =>
            p.white ? (
              <View key={p.key} testID={`scene-pill-${p.key}`} style={styles.whitePill}>
                <Text style={[font('caption', bold), styles.onWhite]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
                  {p.text}
                </Text>
              </View>
            ) : (
              <ScrimPill key={p.key} testID={`scene-pill-${p.key}`}>
                <Text style={[font('caption', bold), styles.ink]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
                  {p.text}
                </Text>
              </ScrimPill>
            )
          )}
        </View>
        {/* Capped at 1.2: React Native clips a glyph to its line box, and over a photograph that is two rows of sliced letters. */}
        <Text numberOfLines={2} maxFontSizeMultiplier={1.2} style={[font('title', bold), styles.ink]}>
          {title}
        </Text>
        {place ? (
          <Text numberOfLines={1} style={[font('meta', bold), styles.ink]}>
            {place}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  )
}

const PILL_HEIGHT = 28

const styles = StyleSheet.create({
  hero: { width: '100%' },
  // The clip lives here, not on `hero`, so the stretch can grow the box above the hero's top while the caption stays unscaled.
  clip: { ...StyleSheet.absoluteFill, overflow: 'hidden', backgroundColor: COLOR.surface },
  head: { position: 'absolute', top: 0, left: 0, right: 0, height: HEAD_SCRIM },
  foot: { position: 'absolute', bottom: 0, left: 0, right: 0, height: FOOT_SCRIM },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.gutter, paddingBottom: HERO_CAPTION_FOOT, gap: SPACE.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.xs },
  ink: { color: COLOR.textPrimary },
  onWhite: { color: COLOR.ink },
  struck: { textDecorationLine: 'line-through', textDecorationColor: COLOR.textSecondary },
  whitePill: { height: PILL_HEIGHT, justifyContent: 'center', paddingHorizontal: SPACE.md, borderRadius: RADIUS.capsule, backgroundColor: COLOR.textPrimary },
})
