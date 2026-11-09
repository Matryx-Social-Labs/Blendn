import { useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import { IconButton } from '../ds/IconButton'
import { font, useBoldText } from '../ds/shared'
import { RadialWash, type RadialLayer } from '../ui/GradientFill'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, RADIUS, SPACE } from '../../lib/design/tokens'
import { categoryGlyph } from '../../lib/categoryGlyph'
import type { Stamp } from '../../lib/eventFacts'
import type { FeedMediaItem } from '../../lib/feedMedia'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { SceneHeroMedia } from './SceneHeroMedia'

/*
 * Flow 4 E-B, "lit from behind" (owner's pick 2026-11-05; `flow-4/screens.js` eventB, `flow4.css` .posterB/.washB/.sposter).
 * The cover sits uncropped in a square the width of the page's column, 28 pt corners, and its light pours into the page:
 * the Pulse lead's underglow, larger, plus a radial wash behind the top of the page. With no cover it is the stamp poster.
 * On scroll the poster eases to 0.92 over the first 220 pt and its light fades to 40% over 300 (never off); Reduce Motion
 * keeps both still.
 */

/** The page's column: 24 in on each side. The poster is that square. */
export const posterSide = (width: number) => width - 2 * SPACE.gutter
const SCALE_TO = 0.92
const SCALE_OVER = 220
const LIGHT_TO = 0.4
const LIGHT_OVER = 300
/** `.posterB` box-shadow: 0 24px 80px -14px ember 62%; and its 0.5 pt light rim. */
// design-exception: the board's underglow (0 24 80 -14) is the Pulse lead's (`glowLead`) at poster size; no token holds it.
const GLOW = [{ offsetX: 0, offsetY: SPACE.xl, blurRadius: 80, spreadDistance: -14, color: tint(COLOR.brandOrange, 0.62) }]
const RIM = tint(COLOR.textPrimary, 0.12)
/** `.washB`: 660 tall from the top of the screen, ember behind the poster and a violet corner lower right. */
export const POSTER_WASH_HEIGHT = 660
const WASH: readonly RadialLayer[] = [
  { color: COLOR.brandOrange, alpha: 0.24, at: [50, 32], size: [80, 42], reach: 0.72 },
  { color: COLOR.brandViolet, alpha: 0.1, at: [88, 58], size: [60, 30], reach: 0.7 },
]
/** `.sposter`: ember from below, violet in the top-right corner, on the sunken surface. */
const STAMP_LIGHT: readonly RadialLayer[] = [
  { color: COLOR.brandOrange, alpha: 0.48, at: [50, 88], size: [70, 70], reach: 0.7 },
  { color: COLOR.brandViolet, alpha: 0.26, at: [88, 8], size: [60, 50], reach: 0.7 },
]

const light = (y: number, reduceMotion: boolean) => {
  'worklet'
  return reduceMotion ? 1 : 1 - (1 - LIGHT_TO) * interpolate(y, [0, LIGHT_OVER], [0, 1], 'clamp')
}

/** The page's wash, fixed behind the scroll: drawn first by the screen, it fades with the poster's light. */
export function PosterLight({ scrollY }: { scrollY?: SharedValue<number> }) {
  const reduceMotion = useReducedMotion()
  const style = useAnimatedStyle(() => ({ opacity: light(scrollY ? scrollY.get() : 0, reduceMotion) }))
  return (
    <Animated.View pointerEvents="none" style={[styles.wash, style]}>
      <RadialWash testID="scene-poster-wash" layers={WASH} style={StyleSheet.absoluteFill} />
    </Animated.View>
  )
}

export function SceneHero({
  playlist,
  title,
  category,
  stamp,
  venueLine,
  onPressMedia,
  scrollY,
}: {
  /** The organizer's media, clip first; empty draws the stamp poster. */
  playlist: FeedMediaItem[]
  /** For "Cover for …". */
  title: string
  /** The first category's slug: the stamp poster's glyph. */
  category?: string
  /** The date the stamp poster prints. */
  stamp: Stamp | null
  /** "Third Wave Coffee · Koramangala" under the stamp. */
  venueLine: string
  onPressMedia?: (index: number) => void
  scrollY?: SharedValue<number>
}) {
  const { width } = useWindowDimensions()
  const side = posterSide(width)
  const reduceMotion = useReducedMotion()
  // The clip's pause (WCAG 2.2.2): a clip loops on the poster, so it can always be stopped; Reduce Motion starts it paused.
  const [chosen, setChosen] = useState<boolean | null>(null)
  const paused = chosen ?? reduceMotion
  const [clipInView, setClipInView] = useState(false)

  const scaleStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.get() : 0
    const k = reduceMotion ? 0 : interpolate(y, [0, SCALE_OVER], [0, 1], 'clamp')
    return { transform: [{ scale: 1 - (1 - SCALE_TO) * k }] }
  })
  const glowStyle = useAnimatedStyle(() => ({ opacity: light(scrollY ? scrollY.get() : 0, reduceMotion) }))

  return (
    <Animated.View testID="scene-hero" style={[styles.poster, { width: side, height: side }, scaleStyle]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow, glowStyle]} />
      <View style={styles.clip}>
        {playlist.length > 0 ? (
          <View accessible={playlist.length === 1} accessibilityRole="image" accessibilityLabel={`Cover for ${title}`} style={StyleSheet.absoluteFill}>
            <SceneHeroMedia
              playlist={playlist}
              width={side}
              height={side}
              fit="contain"
              autoAdvance={false}
              pips="center"
              onPress={onPressMedia}
              paused={paused}
              started={chosen !== null}
              onClipInView={setClipInView}
            />
          </View>
        ) : (
          <StampPoster stamp={stamp} category={category} venueLine={venueLine} />
        )}
        <View pointerEvents="none" style={styles.rim} />
      </View>
      {playlist.length > 0 && clipInView ? (
        <View style={styles.playback}>
          <IconButton
            tier="media"
            icon={paused ? 'play' : 'pause'}
            accessibilityLabel={paused ? 'Play video' : 'Pause video'}
            onPress={() => setChosen(!paused)}
            testID="scene-hero-playback"
          />
        </View>
      ) : null}
    </Animated.View>
  )
}

/** The poster for an event with no cover: its date in Geist Mono, lit from below, the category's glyph and the venue. */
function StampPoster({ stamp, category, venueLine }: { stamp: Stamp | null; category?: string; venueLine: string }) {
  const bold = useBoldText()
  const glyph = category ? categoryGlyph(category) : undefined
  return (
    <View
      testID="scene-hero-stamp"
      accessible
      accessibilityRole="image"
      accessibilityLabel={[stamp?.spoken, venueLine].filter(Boolean).join(', ')}
      style={styles.stamp}
    >
      <RadialWash layers={STAMP_LIGHT} style={StyleSheet.absoluteFill} />
      {glyph ? (
        <View style={styles.stampGlyph}>
          {/* design-exception: the board's stamp glyph is 28 (a decorative size). */}
          <Icon name={glyph} size={28} color={COLOR.selectionEmberGlyph} />
        </View>
      ) : null}
      {stamp ? (
        <View style={styles.stampDate}>
          <Text maxFontSizeMultiplier={1} style={[styles.stampWord, { fontFamily: FONT_FAMILY.mono[500] }]}>
            {stamp.dow}
          </Text>
          <Text maxFontSizeMultiplier={1} style={[styles.stampDay, { fontFamily: FONT_FAMILY.mono[700] }]}>
            {stamp.dd}
          </Text>
          <Text maxFontSizeMultiplier={1} style={[styles.stampWord, { fontFamily: FONT_FAMILY.mono[500] }]}>
            {stamp.mon}
          </Text>
        </View>
      ) : null}
      {venueLine ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={1} style={[font('control', bold), styles.stampVenue]}>
          {venueLine}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wash: { position: 'absolute', left: 0, right: 0, top: 0, height: POSTER_WASH_HEIGHT },
  poster: { alignSelf: 'center', transformOrigin: 'top' },
  glow: { borderRadius: RADIUS.disc, backgroundColor: COLOR.ink, boxShadow: GLOW },
  clip: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.disc, overflow: 'hidden', backgroundColor: COLOR.surfaceSunken },
  rim: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.disc, borderWidth: StyleSheet.hairlineWidth, borderColor: RIM },
  playback: { position: 'absolute', top: SPACE.md, right: SPACE.md },
  stamp: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.surfaceSunken },
  // design-exception: the board places the glyph 22 in from the corner (`.sposter .sg`).
  stampGlyph: { position: 'absolute', left: 22, top: 22 },
  stampDate: { alignItems: 'center' },
  // design-exception: the stamp poster's type is the board's art (`.sposter .sd`): 20/24 words, a 120/124 day.
  stampWord: { fontSize: 20, lineHeight: 24, letterSpacing: 2, color: COLOR.selectionEmberGlyph },
  // design-exception: as above.
  stampDay: { fontSize: 120, lineHeight: 124, letterSpacing: -4, color: COLOR.textPrimary },
  // design-exception: the board's venue line sits 22 in and 20 up (`.sposter .sv`).
  stampVenue: { position: 'absolute', left: 22, right: 22, bottom: 20, textAlign: 'center', color: COLOR.textSecondary },
})

