import { barCircleBottom } from '../../lib/barGeometry'
import { Image } from 'expo-image'
import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '../ds/Avatar'
import { ScrimPill } from '../ds/MonoFamily'
import { Orbs } from '../ds/Orbs'
import { CONTROL_FONT_CAP, font, useBoldText, useIncreaseContrast, useSelection } from '../ds/shared'
import { PhotoScrim, StatusScrim } from '../ui/GradientFill'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, SIZE, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import type { Rect } from '../ds/chatShared'
import { HeroPips, ProfileHeroPager } from './ProfileHeroPager'

/** Flow 6 `user` and `friend`: `heroH = W × 1.3` (the audit's fix for a 751 pt hero on a 390 pt phone). */
export const PROFILE_HERO_ASPECT = 1.3
export const heroHeightFor = (width: number) => Math.round(width * PROFILE_HERO_ASPECT)

/** DS #32: the hero scales from its bottom edge, up to 1.15 with the pull. */
export const HERO_STRETCH_MAX = 1.15
/** The frame's scrims: the status scrim 160 pt tall, the foot's 220 pt. */
const HEAD_FADE = 160
const FOOT_FADE = 220
/** The name block sits 44 pt up from the hero's foot (Flow 6 `user`). */
const NAME_FROM_FOOT = 44
/** The creature's disc and its distance above the hero's middle (Flow 6 `user`: top = heroH / 2 − 130). */
const CREATURE = 180
const CREATURE_ABOVE_MIDDLE = 130
/** Between the bar's foot and the pips (the frame's 6 pt). */
const PIPS_GAP = SPACE.sm - SPACE.xxs
const RING_ALPHA = 0.16

/** The scale for a pull of `pull` points on a hero `height` tall: 1 at rest, 1.15 at most. Pure, so the cap is testable. */
export const stretchScale = (pull: number, height: number) => {
  'worklet'
  return Math.min(HERO_STRETCH_MAX, 1 + Math.max(0, pull) / height)
}

export type ProfileHeroStageProps = {
  width: number
  /** The page's fit for its fold (`heroFoldHeight`, r7 M2); absent, the drawn W × 1.3. */
  height?: number
  /** The page's scroll offset; absent, the hero holds still. */
  scrollY?: SharedValue<number>
  /** Their photos, when they are shown. */
  photos: string[]
  /** The blurred derivative the server sends instead of photos before a reveal. */
  blurredUri?: string | null
  name: string
  age?: number | null
  /** The line under the name. */
  subtitle?: string | null
  /** Seeds the creature when there is no photo; the room's `markSeed`, never a user id. */
  seed: string
  /** The hero says "Anonymous until you both reveal" (an unrevealed profile). */
  anonymous?: boolean
  /** A tap on a photo, with where it was, so the viewer can travel from it (DS #33). */
  onPressPhoto?: (index: number, from: Rect | null) => void
  testID?: string
}

/**
 * The hero of someone's profile and a friend's (Flow 6 `user`, `friend`): their photo full-bleed (the pager, or one blurred
 * still, or their creature on the orbs), the status scrim above and the ink fade below, and the name at 44 pt from the foot, the
 * age in Geist Mono beside it.
 *
 * DS #32: pulled past the top on iOS the hero scales from its bottom edge, up to 1.15 (kept under Reduce Motion: it is direct
 * manipulation). Android stretches the whole page with the system's own overscroll instead. The hero is `width × 1.3` tall, so
 * the name, the overlap line and the first section show above the fold; the page may pass a `height` that lands its fold on a
 * section's top (`heroFoldHeight`, r7 M2).
 */
export function ProfileHeroStage({ width, height: fitted, scrollY, photos, blurredUri, name, age, subtitle, seed, anonymous = false, onPressPhoto, testID }: ProfileHeroStageProps) {
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const height = fitted ?? heroHeightFor(width)
  const [page, setPage] = useState(0)
  const circle = Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton

  const stretch = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.get() : 0
    if (Platform.OS !== 'ios' || y >= 0) return { transform: [{ translateY: 0 }, { scale: 1 }] }
    const s = stretchScale(-y, height)
    // Scaled about its middle and lifted by half the growth, so the bottom edge stays where it was.
    return { transform: [{ translateY: -(height * (s - 1)) / 2 }, { scale: s }] }
  })

  // The hero is full-bleed at the page's top, so where it is follows from the scroll: nothing to measure, nothing to wait for.
  const press = (index: number) => {
    const offset = Math.max(0, scrollY ? scrollY.get() : 0)
    onPressPhoto?.(index, { x: 0, y: offset ? -offset : 0, width, height })
  }

  const shown = photos.length > 0
  const label = age ? `${name}, ${age}` : name

  return (
    <Animated.View testID={testID} style={[{ width, height }, styles.hero, stretch]}>
      {shown ? (
        <ProfileHeroPager photos={photos} width={width} height={height} onPage={setPage} onPress={press} />
      ) : blurredUri ? (
        <Image
          testID="hero-blurred"
          source={{ uri: blurredUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={60}
          accessibilityLabel="Blurred photo, hidden until they reveal"
        />
      ) : (
        <View testID="hero-creature" style={StyleSheet.absoluteFill}>
          {/* The profile's hue (rose), not the brand set's ember and violet (D31): one hue per screen. */}
          <Orbs set="brand" tint={sel.edge} />
          <View style={[styles.creature, { top: height / 2 - CREATURE_ABOVE_MIDDLE }]}>
            <Avatar kind="creature" pseudonym={seed} size={CREATURE} ring={tint(COLOR.textPrimary, RING_ALPHA)} />
            {anonymous ? (
              <View style={styles.pill}>
                <ScrimPill testID="hero-anonymous">
                  <Icon name="eye-off" size={ICON.inline} color={COLOR.textPrimary} />
                  <Text style={[font('caption', bold), styles.ink]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
                    Anonymous until you both reveal
                  </Text>
                </ScrimPill>
              </View>
            ) : null}
          </View>
        </View>
      )}

      <StatusScrim pointerEvents="none" style={[styles.head, { height: HEAD_FADE }]} />
      {/* The hero ends on the page's ink, so its foot reaches it: no seam (the 0.88 default is for a photo that goes on below). */}
      <PhotoScrim contrast={contrast} foot={1} pointerEvents="none" style={[styles.foot, { height: FOOT_FADE }]} />
      <HeroPips count={shown ? photos.length : 0} page={page} top={barCircleBottom(insets.top, circle > SIZE.circleButton) + PIPS_GAP} />

      <View pointerEvents="none" style={styles.nameBlock}>
        <Text
          accessible
          accessibilityRole="header"
          accessibilityLabel={label}
          numberOfLines={2}
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          style={[font('display', bold), styles.ink]}
        >
          {name}
          {age ? (
            <>
              {', '}
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('display', bold, FONT_FAMILY.mono[700])]}>{age}</Text>
            </>
          ) : null}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.ink]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  hero: { overflow: 'hidden', backgroundColor: COLOR.surface },
  head: { position: 'absolute', left: 0, right: 0, top: 0 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  creature: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: SPACE.xl },
  pill: { alignSelf: 'center' },
  nameBlock: { position: 'absolute', left: SPACE.gutter, right: SPACE.gutter, bottom: NAME_FROM_FOOT, gap: SPACE.xs },
  ink: { color: COLOR.textPrimary },
})
