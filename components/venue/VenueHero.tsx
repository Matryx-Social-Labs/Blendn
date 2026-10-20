import { Image } from 'expo-image'
import { Animated, StyleSheet, Text, View } from 'react-native'

import { LivePill } from '../ds/MonoFamily'
import { font, useBoldText } from '../ds/shared'
import { VenuePlate } from '../ds/VenuePlate'
import { PhotoScrim, StatusScrim } from '../ui/GradientFill'
import { Icon } from '../ui/Icon'
import type { VenueDetail } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
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
      <Text style={[font('caption', bold), styles.onWhite]}>
        You’re live
        {time ? (
          <>
            {' · '}
            <Text style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{timeWords(time)}</Text>
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
  const distance = distanceText(km)
  const lead = [typeLabel, area].filter(Boolean).join(' · ')
  const liveText = liveNowLabel(live.liveNow)
  return (
    <View style={styles.hero} testID="venue-hero">
      <Animated.View
        testID="venue-hero-media"
        style={[StyleSheet.absoluteFill, scrollY && { transform: [{ scale: stretchScale(scrollY) }], transformOrigin: 'bottom' }]}
      >
        {hero.kind === 'cover' ? (
          <Image source={{ uri: hero.uri }} contentFit="cover" cachePolicy="memory-disk" style={StyleSheet.absoluteFill} accessible={false} />
        ) : (
          <VenuePlate type={hero.plate} />
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
          <Text numberOfLines={2} style={[font('meta', bold), styles.ink]}>
            {lead}
            {distance ? (
              <>
                {lead ? ' · ' : ''}
                <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{distance}</Text>
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
