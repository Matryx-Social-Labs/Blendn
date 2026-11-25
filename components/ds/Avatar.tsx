import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'

import { DURATION, MATERIAL, RADIUS, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { Creature, creatureFor, Initial } from './Creature'
import { useIncreaseContrast } from './shared'

export type AvatarSize = 24 | 32 | 40 | 56 | 72 | 112

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
  /** Only when no name is beside it: the name (or pseudonym) read instead of the picture. */
  label?: string
  /** A creature blinks once as it appears: the person sheet and the profile only, never a list (`<Creature blink>`). */
  blink?: boolean
  testID?: string
} & (
  | {
      kind: 'photo'
      uri: string
      /**
       * Whose photo: their initial on their hue disc is drawn under it, so a loading or dead photo still reads as them.
       * `''` only where nothing names them yet (a server visual with no name): the disc alone, never a "?".
       */
      name: string
      /** The picture failed to load (a dead URL): the initial stays; a caller may still swap in its own fallback. */
      onError?: () => void
    }
  /** The pseudonym (the `markSeed`, never a user id): it picks the creature and its palette (`creatureFor`). */
  | { kind: 'creature'; pseudonym: string }
  /** A named person with no photo: their initial on their hue disc (`personFace`, owner F1 B). Never for the anonymous. */
  | { kind: 'initial'; name: string }
)

/**
 * Who someone is, as a picture (DESIGN-BRIEF §12, guidelines/components/Avatar.html).
 *
 * - `photo`: earned; only where the room names someone to you. It loads over their initial on their hue disc (the face a
 *   named person with no photo has), fading in, so a slow or dead photo is never an empty hole (SCRUM-1088 A).
 * - `creature`: everyone else, as `<Creature>` draws them: an animal face
 *   on a disc in one of eight hues, its expression the pseudonym's adjective;
 *   the same pseudonym draws the same one everywhere in one event.
 *
 * A crew is never an Avatar: it is its `CrewEmblem`.
 *
 * Decorative when the name is beside it; given `label`, it reads the name,
 * never "image". It never scales with text. Increase
 * Contrast rings it in 50% white so a dark plate separates from a dark card.
 * No haptic.
 */
export function Avatar(props: AvatarProps) {
  const { size, ring, halo, label, testID, blink } = props
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const ringColor = contrast ? MATERIAL.hairlineIncreaseContrast : ring

  const a11y = label
    ? { accessible: true, accessibilityLabel: label }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }

  const radius = RADIUS.capsule
  // Outside the cut-out when there is one, else outside the face.
  const haloReach = SPACE.xxs * (ringColor ? 2 : 1)
  const haloRing = halo ? (
    <View
      testID={testID && `${testID}-halo`}
      pointerEvents="none"
      style={[
        styles.halo,
        { top: -haloReach, bottom: -haloReach, left: -haloReach, right: -haloReach, borderColor: halo, borderRadius: radius },
      ]}
    />
  ) : null

  if (props.kind === 'initial') {
    return (
      <View testID={testID} style={{ width: size, height: size }} {...a11y}>
        {haloRing}
        <Initial name={props.name} size={size} ring={ringColor} testID={testID} />
      </View>
    )
  }
  if (props.kind === 'creature') {
    return (
      <View testID={testID} style={{ width: size, height: size }} {...a11y}>
        {haloRing}
        <Creature {...creatureFor(props.pseudonym)} size={size} ring={ringColor} blink={blink} />
      </View>
    )
  }
  return (
    <View testID={testID} style={{ width: size, height: size }} {...a11y}>
      {haloRing}
      {ringColor ? (
        <View
          testID={testID && `${testID}-ring`}
          style={[styles.ring, { backgroundColor: ringColor, borderRadius: radius }]}
        />
      ) : null}
      <View testID={testID && `${testID}-body`} style={[styles.body, { width: size, height: size, borderRadius: radius }]}>
        <Initial name={props.name} size={size} letter={props.name.trim() !== ''} testID={testID && `${testID}-initial`} />
        {/* expo-image cross-fades a network load only; a memory-cache hit paints at once, so a warm list never shimmers. */}
        <Image
          testID={testID && `${testID}-photo`}
          source={{ uri: props.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={reduceMotion ? 0 : DURATION.quick}
          accessible={false}
          onError={props.onError}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', top: -SPACE.xxs, bottom: -SPACE.xxs, left: -SPACE.xxs, right: -SPACE.xxs },
  halo: { position: 'absolute', borderWidth: SPACE.xxs },
  body: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
})
