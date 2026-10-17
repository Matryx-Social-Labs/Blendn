import { StyleSheet, View } from 'react-native'

import { PALETTE_GLYPH, VENUE_PLATES } from '../../lib/design/tokens'
import { Icon, type IconName } from '../ui/Icon'

/** A restaurant reuses the café's pair, no new colour (owner's ruling on A87). */
const PLATE_COLOURS = { ...VENUE_PLATES, restaurant: VENUE_PLATES.cafe }
type PlateType = keyof typeof PLATE_COLOURS

/** Each type's outline glyph (the design export's sets.js `PLATES`; Restaurant's from Flow 11). */
export const VENUE_PLATE_GLYPHS = {
  brewery: 'beer',
  gardenBar: 'tree-palm',
  bar: 'wine',
  club: 'disc-3',
  liveMusic: 'music-2',
  cafe: 'coffee',
  restaurant: 'utensils',
} as const satisfies Record<PlateType, IconName>

/** The design's proportions: the glyph at 40% of the plate (of 120 when it fills), corners at 20%. */
const GLYPH_SHARE = 0.4
const FILL_BASIS = 120
const RADIUS_SHARE = 0.2

/**
 * How far the second colour reaches from the centre. A View, not a bitmap, so
 * its size costs nothing.
 * ponytail: covers a plate up to 2 × 4096pt across; raise it if one is bigger.
 */
const REACH = 4096

/**
 * A venue's art when it has no next event: its type's two-colour split (the
 * `--plate-*` tokens) with the type's outline glyph at 70% white. Never a grey
 * box, never an invented poster (guidelines/components/VenuePlates.html).
 *
 * `size` draws a square (120 in the set, 56 as a row thumb with `radius` 8);
 * without it the plate fills its parent (a tile, a hero). A type it has no
 * plate for — anything the server adds later — gets the bar's until drawn.
 *
 * Decorative: the venue's name and type beside it are what is read out.
 */
export function VenuePlate({
  type,
  size,
  radius,
  testID,
}: {
  type: string
  size?: number
  radius?: number
  testID?: string
}) {
  const plate: PlateType = Object.hasOwn(PLATE_COLOURS, type) ? (type as PlateType) : 'bar'
  const [a, b] = PLATE_COLOURS[plate]
  return (
    <View
      testID={testID}
      style={[
        size ? { width: size, height: size } : StyleSheet.absoluteFill,
        styles.plate,
        { borderRadius: radius ?? (size ? Math.round(size * RADIUS_SHARE) : 0), backgroundColor: a },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.secondHalf, { backgroundColor: b }]} />
      <Icon
        name={VENUE_PLATE_GLYPHS[plate]}
        size={Math.round((size ?? FILL_BASIS) * GLYPH_SHARE)}
        color={PALETTE_GLYPH.plate}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  plate: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  /*
   * The half-plane right of the centre, turned 45° about the centre: x + y >
   * (w + h) / 2. That is CSS's `linear-gradient(135deg, a 50%, b 50%)` at any
   * aspect (the corner diagonal is only the same on a square), and it needs no
   * layout pass, so the first frame is already split.
   */
  secondHalf: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: REACH,
    height: 2 * REACH,
    marginTop: -REACH,
    transformOrigin: 'left center',
    transform: [{ rotate: '45deg' }],
  },
})
