import { Image } from 'expo-image'
import { Animated, StyleSheet, Text, View } from 'react-native'

import { LivePill, MonoRun } from '../ds/MonoFamily'
import { CONTROL_FONT_CAP, font, useBoldText, useLargeText } from '../ds/shared'
import { VenuePlate } from '../ds/VenuePlate'
import { PhotoScrim, StatusScrim } from '../ui/GradientFill'
import { Icon } from '../ui/Icon'
import type { VenueDetail } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { liveNowLabel } from '../../lib/home'
import { distanceText } from '../../lib/placesPane'
import { useSessionTime } from '../../lib/useSessionTime'
import { timeWords, type VenueHero as Hero } from '../../lib/venuePage'

/** The hero (fullpages.js `venue`): 380 tall, under the status bar; the dock and the controls ride over it. */
export const VENUE_HERO_HEIGHT = 380
/** The head scrim that lets the clock and the circles read over any cover. */
const HEAD_SCRIM = 180

/**
 * "You’re live · 42 min", white on the photo. A leaf: it ticks itself (the
 * clock is the server's, and the page above it does not re-render with it).
 */
function YouAreLivePill({ live, onZero }: { live: VenueDetail['live']; onZero: () => void }) {
  const bold = useBoldText()
  const time = useSessionTime(live, onZero)
  return (
    <View
      accessible
      accessibilityLabel={time ? `You’re live, ${timeWords(time)}` : 'You’re live'}
      testID="venue-you-live"
      style={styles.youLive}
    >
      <Icon name="radio" size={ICON.inline} color={COLOR.ink} />
      <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.onWhite]}>
        You’re live
        {time ? (
          <>
            {' · '}
            <Text style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.tabular]}>
              <MonoRun text={timeWords(time)} />
            </Text>
          </>
        ) : null}
      </Text>
    </View>
  )
}

/**
 * Overscroll at the top stretches the picture (DS #32, audit P2): scaled from
 * its foot by 1 + pull / height, which is exactly what the bounce uncovers, so
 * the top edge stays on the screen's top and no ink shows above the hero. A
 * direct manipulation (it follows the finger), so Reduce Motion keeps it.
 */
/** The plate fades over the first quarter of the hero, by when its centred glyph would reach the circles' row. */
export const PLATE_FADE_BY = VENUE_HERO_HEIGHT / 4
/**
 * Where the plate's glyph sits, as a share of the hero's height: centred, or a third of the way down at the
 * accessibility sizes, where the name and its line grow up from the foot into the centre (audit C5).
 */
const GLYPH_AT = { rest: 1 / 2, large: 1 / 3 } as const
/** The glyph is gone by the time it scrolls up to the circles' row, a quarter of the hero down, wherever it starts. */
export const plateFade = (scrollY: Animated.Value, glyphAt: number = GLYPH_AT.rest) =>
  scrollY.interpolate({ inputRange: [0, VENUE_HERO_HEIGHT * (glyphAt - 1 / 4)], outputRange: [1, 0], extrapolate: 'clamp' })

export const stretchScale = (scrollY: Animated.Value) =>
  scrollY.interpolate({ inputRange: [-VENUE_HERO_HEIGHT, 0], outputRange: [2, 1], extrapolateRight: 'clamp' })

export function VenueHero({
  hero,
  name,
  typeLabel,
  area,
  km,
  live,
  onZero,
  scrollY,
}: {
  hero: Hero
  name: string
  typeLabel: string
  area: string | null
  /** Kilometres, as the list handed it over; nothing when it did not. */
  km: number | null
  live: VenueDetail['live']
  onZero: () => void
  /** The page's scroll offset (core `Animated`, native driver): the picture stretches while it is negative. */
  scrollY?: Animated.Value
}) {
  const bold = useBoldText()
  const large = useLargeText()
  const glyphAt = large ? GLYPH_AT.large : GLYPH_AT.rest
  const distance = distanceText(km)
  // At the accessibility sizes the address leaves the hero (it only truncated there, C37); Where has it in full.
  const lead = [typeLabel, large ? null : area].filter(Boolean).join(' · ')
  const liveText = liveNowLabel(live.liveNow)
  return (
    <View style={styles.hero} testID="venue-hero">
      <Animated.View
        testID="venue-hero-media"
        style={[
          StyleSheet.absoluteFill,
          scrollY && { transform: [{ scale: stretchScale(scrollY) }], transformOrigin: 'bottom' },
          // A plate's glyph is gone before it scrolls up into the back and share circles, which have no bar under them
          // yet (r7 L3: the cutlery read as a third button). A photograph stays.
          scrollY && hero.kind !== 'cover' && { opacity: plateFade(scrollY, glyphAt) },
        ]}
      >
        {hero.kind === 'cover' ? (
          <Image source={{ uri: hero.uri }} contentFit="cover" cachePolicy="memory-disk" style={StyleSheet.absoluteFill} accessible={false} />
        ) : (
          // The plate centres its glyph in what it fills: a frame from (2·at - 1)·H to the foot is centred at `at`·H. The
          // part above the top is under the status bar, the same ground the stretch uncovers.
          <View testID="venue-hero-plate-frame" style={[styles.plateFrame, { top: VENUE_HERO_HEIGHT * (2 * glyphAt - 1) }]}>
            <VenuePlate type={hero.plate} />
          </View>
        )}
      </Animated.View>
      <StatusScrim style={styles.headScrim} pointerEvents="none" />
      <PhotoScrim style={styles.scrim} pointerEvents="none" />
      <View style={styles.text}>
        {liveText || live.youAreLive ? (
          <View style={styles.pills}>
            {liveText ? <LivePill text={liveText} testID="venue-bucket" /> : null}
            {live.youAreLive ? <YouAreLivePill live={live} onZero={onZero} /> : null}
          </View>
        ) : null}
        <View accessible accessibilityRole="header" accessibilityLabel={[name, lead, distance].filter(Boolean).join(', ')} style={styles.words}>
          {/* The hero's one display line: capped at 1.2, where React Native clips a glyph to its line box. */}
          <Text numberOfLines={2} maxFontSizeMultiplier={1.2} style={[font('display', bold), styles.ink]}>
            {name}
          </Text>
          <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink]}>
            {lead}
            {distance ? (
              <>
                {lead ? ' · ' : ''}
                <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>
                  <MonoRun text={distance} />
                </Text>
              </>
            ) : null}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Not clipped: the stretched picture grows upward past the hero's top edge to fill what the bounce uncovers.
  hero: { height: VENUE_HERO_HEIGHT, backgroundColor: COLOR.surface, justifyContent: 'flex-end' },
  plateFrame: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  headScrim: { position: 'absolute', left: 0, right: 0, top: 0, height: HEAD_SCRIM },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '66%' },
  text: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.xxl, gap: SPACE.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs + SPACE.xxs },
  words: { gap: SPACE.xxs },
  youLive: {
    height: SPACE.xl + SPACE.xs,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.textPrimary,
  },
  ink: { color: COLOR.textPrimary },
  onWhite: { color: COLOR.ink },
  tabular: { fontVariant: ['tabular-nums'] },
})
