import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Polygon } from 'react-native-svg'

import { Icon } from '../ui/Icon'
import { CREATURE_PALETTES, MATERIAL, PALETTE_GLYPH, RADIUS, SPACE } from '../../lib/design/tokens'
import { useIncreaseContrast } from './shared'

export type AvatarSize = 24 | 32 | 40 | 56 | 72 | 112

/** The glyph sits at half the disc; a crew square's corner is 30% of its side (the Avatar page). */
const GLYPH_FRACTION = 0.5
const CREW_CORNER = 0.3

export type AvatarProps = {
  size: AvatarSize
  /** The 2 pt cut-out ring, in the colour behind the avatar: `COLOR.ink` on the page, `COLOR.surface` in a card. */
  ring?: string
  /** Only when no name is beside it: the name (or pseudonym, or crew name) read instead of the picture. */
  label?: string
  testID?: string
} & (
  | { kind: 'photo'; uri: string }
  /** `glyph` draws the creature at the size it is given (the creature set, P5); `palette` is the pseudonym's hash. */
  | { kind: 'creature'; palette: number; glyph: (size: number) => ReactNode }
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
 * - `creature`: everyone else. An outline animal at half the disc on a
 *   two-colour plate from the eight creature palettes; the same pseudonym
 *   draws the same one everywhere in one event.
 * - `crew`: a square with 30% corners on the crew's emblem plate.
 *
 * Decorative when the name is beside it; given `label`, it reads the name (a
 * crew adds "crew"), never "image". It never scales with text. Increase
 * Contrast rings it in 50% white so a dark plate separates from a dark card.
 * No haptic.
 */
export function Avatar(props: AvatarProps) {
  const { size, ring, label, testID } = props
  const contrast = useIncreaseContrast()
  const radius = props.kind === 'crew' ? Math.round(size * CREW_CORNER) : RADIUS.capsule
  const glyphSize = Math.round(size * GLYPH_FRACTION)
  const ringColor = contrast ? MATERIAL.hairlineIncreaseContrast : ring

  const name = label && (props.kind === 'crew' ? `${label}, crew` : label)
  const a11y = name
    ? { accessible: true, accessibilityLabel: name }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }

  return (
    <View testID={testID} style={{ width: size, height: size }} {...a11y}>
      {ringColor ? (
        <View
          testID={testID && `${testID}-ring`}
          style={[styles.ring, { backgroundColor: ringColor, borderRadius: radius === RADIUS.capsule ? radius : radius + SPACE.xxs }]}
        />
      ) : null}
      <View testID={testID && `${testID}-body`} style={[styles.body, { width: size, height: size, borderRadius: radius }]}>
        {props.kind === 'photo' ? (
          <Image source={{ uri: props.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        ) : (
          <>
            <Plate
              testID={testID && `${testID}-plate`}
              colors={props.kind === 'crew' ? props.plate : CREATURE_PALETTES[props.palette % CREATURE_PALETTES.length]}
            />
            {props.kind === 'crew' ? <Icon name="users" size={glyphSize} color={PALETTE_GLYPH.creature} /> : props.glyph(glyphSize)}
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', top: -SPACE.xxs, bottom: -SPACE.xxs, left: -SPACE.xxs, right: -SPACE.xxs },
  body: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
})
