import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'
import Svg, { Polygon } from 'react-native-svg'

import { Icon } from '../ui/Icon'
import { MATERIAL, PALETTE_GLYPH, RADIUS, SPACE } from '../../lib/design/tokens'
import { Creature, creatureFor } from './Creature'
import { useIncreaseContrast } from './shared'

export type AvatarSize = 24 | 32 | 40 | 56 | 72 | 112

/** A crew's emblem sits at half the square; its corner is 30% of its side (the Avatar page). */
const GLYPH_FRACTION = 0.5
const CREW_CORNER = 0.3

export type AvatarProps = {
  /** One of the page's steps (`AvatarSize`), or a grid cell's face (the Room's GridFace, MeetNextCard). */
  size: number
  /** The 2 pt cut-out ring, in the colour behind the avatar: `COLOR.ink` on the page, `COLOR.surface` in a card. */
  ring?: string
  /**
   * A second 2 pt ring outside `ring`, in a world's edge colour: a request's face on Notifications. It sits outside the cut-out,
   * so the face is still cut from its ground.
   */
  halo?: string
  /** Only when no name is beside it: the name (or pseudonym, or crew name) read instead of the picture. */
  label?: string
  testID?: string
} & (
  | { kind: 'photo'; uri: string; /** The picture failed to load (a dead URL): the caller draws its own fallback. */ onError?: () => void }
  /** The pseudonym (the `markSeed`, never a user id): it picks the creature and its palette (`creatureFor`). */
  | { kind: 'creature'; pseudonym: string }
  /** A crew's emblem plate: two colours. */
  | { kind: 'crew'; plate: readonly [string, string] }
)

/** Two colours split on the 135° diagonal, hard-edged (the export's `linear-gradient(135deg, a 50%, b 50%)`). */
function Plate({ colors, testID }: { colors: readonly [string, string]; testID?: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 1 1" preserveAspectRatio="none">
      <Polygon testID={testID} points="0,0 1,0 0,1" fill={colors[0]} />
      <Polygon testID={testID} points="1,0 1,1 0,1" fill={colors[1]} />
    </Svg>
  )
}

/**
 * Who someone is, as a picture (DESIGN-BRIEF §12, guidelines/components/Avatar.html).
 *
 * - `photo`: earned; only where the room names someone to you.
 * - `creature`: everyone else, as `<Creature>` draws them: an outline animal
 *   at half the disc on a two-colour plate; the same pseudonym draws the same
 *   one everywhere in one event.
 * - `crew`: a square with 30% corners on the crew's emblem plate.
 *
 * Decorative when the name is beside it; given `label`, it reads the name (a
 * crew adds "crew"), never "image". It never scales with text. Increase
 * Contrast rings it in 50% white so a dark plate separates from a dark card.
 * No haptic.
 */
export function Avatar(props: AvatarProps) {
  const { size, ring, halo, label, testID } = props
  const contrast = useIncreaseContrast()
  const ringColor = contrast ? MATERIAL.hairlineIncreaseContrast : ring

  const name = label && (props.kind === 'crew' ? `${label}, crew` : label)
  const a11y = name
    ? { accessible: true, accessibilityLabel: name }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }

  const crew = props.kind === 'crew'
  const radius = crew ? Math.round(size * CREW_CORNER) : RADIUS.capsule
  // Outside the cut-out when there is one, else outside the face.
  const haloReach = SPACE.xxs * (ringColor ? 2 : 1)
  const haloRing = halo ? (
    <View
      testID={testID && `${testID}-halo`}
      pointerEvents="none"
      style={[
        styles.halo,
        { top: -haloReach, bottom: -haloReach, left: -haloReach, right: -haloReach, borderColor: halo, borderRadius: crew ? radius + haloReach : radius },
      ]}
    />
  ) : null

  if (props.kind === 'creature') {
    return (
      <View testID={testID} style={{ width: size, height: size }} {...a11y}>
        {haloRing}
        <Creature {...creatureFor(props.pseudonym)} size={size} ring={ringColor} />
      </View>
    )
  }
  return (
    <View testID={testID} style={{ width: size, height: size }} {...a11y}>
      {haloRing}
      {ringColor ? (
        <View
          testID={testID && `${testID}-ring`}
          style={[styles.ring, { backgroundColor: ringColor, borderRadius: props.kind === 'crew' ? radius + SPACE.xxs : radius }]}
        />
      ) : null}
      <View testID={testID && `${testID}-body`} style={[styles.body, { width: size, height: size, borderRadius: radius }]}>
        {props.kind === 'photo' ? (
          <Image source={{ uri: props.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} onError={props.onError} />
        ) : (
          <>
            <Plate testID={testID && `${testID}-plate`} colors={props.plate} />
            <Icon name="users" size={Math.round(size * GLYPH_FRACTION)} color={PALETTE_GLYPH.creature} />
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', top: -SPACE.xxs, bottom: -SPACE.xxs, left: -SPACE.xxs, right: -SPACE.xxs },
  halo: { position: 'absolute', borderWidth: SPACE.xxs },
  body: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
})
