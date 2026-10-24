import { useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { COLOR, FONT_FAMILY, PRESS, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { tint } from '../../lib/theme'
import { ScrimPill } from './MonoFamily'
import { CONTROL_FONT_CAP, focusRing, font, IC_HAIRLINE, minTarget, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

const CARD_HEIGHT = 200
/** The venue's pin on the card: 14 pt of ember, a 3 pt ink ring, a 2 pt halo at 35% (the page). */
const VENUE_PIN = { dot: 14, ring: 3, halo: SPACE.xxs, haloAlpha: 0.35 } as const
/** Your dot sits low left on the card. */
const YOU_AT = { left: '30%', top: '70%' } as const

/** A pin's colour by what it marks: ember events, violet open venues (Flow 11), green live, white you. */
export const PIN_COLOR = { event: COLOR.brandOrange, venue: COLOR.brandViolet, live: COLOR.live, you: COLOR.textPrimary } as const
export type PinKind = keyof typeof PIN_COLOR
/** 10 pt of colour; 14 when selected, and for you. Every pin is ringed 2 pt in ink. */
const PIN = { dot: 10, big: 14, ring: SPACE.xxs, youHalo: 3, youHaloAlpha: 0.25 } as const
/** The cluster: 28 pt, 34 from a hundred; ink at 85%, a 2 pt white ring. */
const CLUSTER = { size: 28, big: 34, bigFrom: 100, alpha: 0.85 } as const

/**
 * The map as a card on the Scene and the venue page (guidelines/components/MapCard.html):
 * a radius-24, 200 pt band of the map with the venue's ember pin at the
 * centre, "Open in Maps" as a scrim pill bottom left and the address bottom
 * right. The screen draws the map itself into `map` (every gesture off: the
 * tap belongs to the card); until then, and with no coordinate, the ground is
 * surfaceSunken.
 *
 * One button, "Map, {venue}, {address}", that opens Maps, silently. The pill
 * caps at 1.3×; the map has no text of its own. Increase Contrast: the 50%
 * hairline on the card (the pill takes its own). It never pans in.
 */
export function MapCard({
  venue,
  address,
  map,
  you = false,
  pill = 'Open in Maps',
  onPress,
  height = CARD_HEIGHT,
  previewState,
  testID,
}: {
  venue: string
  address?: string
  map?: ReactNode
  /** Your dot, when you are near enough to be on the card. */
  you?: boolean
  pill?: string
  onPress?: () => void
  height?: number
  /** The design gallery only. */
  previewState?: 'focused'
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const android = Platform.OS === 'android'
  const [focused, setFocused] = useState(false)

  return (
    <View>
      <ScalePress
        testID={testID}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        pressedScale={android ? 1 : PRESS.scale}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        accessibilityRole="button"
        accessibilityLabel={['Map', venue, address].filter(Boolean).join(', ')}
        accessibilityHint="Opens Maps"
        style={[styles.card, { height }]}
      >
        {map ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {map}
          </View>
        ) : null}
        <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
          <View testID={testID && `${testID}-pin`} style={styles.venueHalo}>
            <View style={styles.venueRing}>
              <View testID={testID && `${testID}-pin-dot`} style={styles.venueDot} />
            </View>
          </View>
        </View>
        {you ? (
          <View pointerEvents="none" style={[styles.at, YOU_AT]}>
            <MapPin kind="you" testID={testID && `${testID}-you`} />
          </View>
        ) : null}
        <View style={styles.pill} pointerEvents="none">
          <ScrimPill>
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.ink]}>
              {pill}
            </Text>
          </ScrimPill>
        </View>
        {/* One line, ended with "…": two lines bottom-anchored were clipped mid-word on Android (r7 L4); the card above has it in full. */}
        {address ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} numberOfLines={1} ellipsizeMode="tail" style={[font('caption', bold), styles.ink, styles.address]}>
            {address}
          </Text>
        ) : null}
        {contrast ? <View testID={testID && `${testID}-contrast`} pointerEvents="none" style={[StyleSheet.absoluteFill, IC_HAIRLINE, styles.radius]} /> : null}
      </ScalePress>
      {focused || previewState === 'focused'
        ? focusRing(RADIUS.mediaInCard).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </View>
  )
}

/**
 * A pin (the home map, the cards): 10 pt of colour ringed 2 pt in ink, by kind
 * (`PIN_COLOR`); selected is 14 with a white ring outside the ink one; you are
 * 14 of white with a soft halo. Centred on its own box: place the box's centre
 * on the point. A pin you can tap is a 44 / 48 target, "{label}, pin", and
 * plays `H.select` (the home map's pin tap).
 */
export function MapPin({
  kind = 'event',
  selected = false,
  label,
  onPress,
  testID,
}: {
  kind?: PinKind
  selected?: boolean
  /** "{title}, {time}": read as "…, pin". */
  label?: string
  onPress?: () => void
  testID?: string
}) {
  const inner = kind === 'you' || selected ? PIN.big : PIN.dot
  const outer = inner + PIN.ring * 2
  const dot = (
    <View style={styles.centre}>
      {kind === 'you' ? (
        <View
          testID={testID && `${testID}-halo`}
          style={[styles.ringed, { width: outer + PIN.youHalo * 2, height: outer + PIN.youHalo * 2, backgroundColor: tint(COLOR.textPrimary, PIN.youHaloAlpha) }]}
        />
      ) : null}
      {selected ? (
        <View testID={testID && `${testID}-selected`} style={[styles.ringed, { width: outer + PIN.ring * 2, height: outer + PIN.ring * 2, borderWidth: PIN.ring, borderColor: COLOR.textPrimary }]} />
      ) : null}
      <View
        testID={testID && `${testID}-dot`}
        style={{ width: outer, height: outer, borderRadius: RADIUS.capsule, backgroundColor: PIN_COLOR[kind], borderWidth: PIN.ring, borderColor: COLOR.ink }}
      />
    </View>
  )
  if (!onPress) {
    return (
      <View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {dot}
      </View>
    )
  }
  const target = minTarget()
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        H.select()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel={label ? `${label}, pin` : 'Pin'}
      accessibilityState={{ selected }}
      style={[styles.centre, { width: target, height: target }]}
    >
      {dot}
    </Pressable>
  )
}

/**
 * Pins that overlap at a zoom become one (never drawn before): an ink disc, a
 * 2 pt white ring and the count in Geist Mono. A tap zooms in, silently (the
 * zoom is the answer); it never opens a list. "{N} events here", a button that
 * zooms in, on a 44 / 48 target.
 */
export function MapCluster({ count, onPress, testID }: { count: number; onPress?: () => void; testID?: string }) {
  const bold = useBoldText()
  const size = count >= CLUSTER.bigFrom ? CLUSTER.big : CLUSTER.size
  const target = Math.max(minTarget(), size)
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${count === 1 ? 'event' : 'events'} here`}
      accessibilityHint="Zooms in"
      style={[styles.centre, { width: target, height: target }]}
    >
      <View testID={testID && `${testID}-disc`} style={[styles.cluster, { width: size, height: size }]}>
        <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold, FONT_FAMILY.mono[700]), styles.ink, styles.tabular]}>
          {count}
        </Text>
      </View>
    </Pressable>
  )
}

const venueOuter = VENUE_PIN.dot + VENUE_PIN.ring * 2
const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.mediaInCard, overflow: 'hidden', backgroundColor: COLOR.surfaceSunken },
  radius: { borderRadius: RADIUS.mediaInCard },
  centre: { alignItems: 'center', justifyContent: 'center' },
  venueHalo: {
    width: venueOuter + VENUE_PIN.halo * 2,
    height: venueOuter + VENUE_PIN.halo * 2,
    borderRadius: RADIUS.capsule,
    borderWidth: VENUE_PIN.halo,
    borderColor: tint(COLOR.brandOrange, VENUE_PIN.haloAlpha),
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueRing: {
    width: venueOuter,
    height: venueOuter,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueDot: { width: VENUE_PIN.dot, height: VENUE_PIN.dot, borderRadius: RADIUS.capsule, backgroundColor: COLOR.brandOrange },
  at: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  ringed: { position: 'absolute', borderRadius: RADIUS.capsule },
  pill: { position: 'absolute', left: SPACE.md, bottom: SPACE.md },
  address: { position: 'absolute', right: SPACE.md, bottom: SPACE.md, maxWidth: '50%', textAlign: 'right' },
  ink: { color: COLOR.textPrimary },
  tabular: { fontVariant: ['tabular-nums'] },
  cluster: {
    borderRadius: RADIUS.capsule,
    backgroundColor: tint(COLOR.ink, CLUSTER.alpha),
    borderWidth: SPACE.xxs,
    borderColor: COLOR.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
