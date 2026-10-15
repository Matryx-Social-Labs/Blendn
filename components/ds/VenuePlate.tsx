import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'

import { PALETTE_GLYPH, VENUE_PLATES } from '../../lib/design/tokens'
import { Icon, type IconName } from '../ui/Icon'

type PlateType = keyof typeof VENUE_PLATES

/** Each type's outline glyph (the design export's sets.js `PLATES`). */
export const VENUE_PLATE_GLYPHS = {
  brewery: 'beer',
  gardenBar: 'tree-palm',
  bar: 'wine',
  club: 'disc-3',
  liveMusic: 'music-2',
  cafe: 'coffee',
} as const satisfies Record<PlateType, IconName>

/** The design's proportions: the glyph at 40% of the plate (of 120 when it fills), corners at 20%. */
const GLYPH_SHARE = 0.4
const FILL_BASIS = 120
const RADIUS_SHARE = 0.2

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
export function VenuePlate({ type, size, radius }: { type: string; size?: number; radius?: number }) {
  const plate: PlateType = Object.hasOwn(VENUE_PLATES, type) ? (type as PlateType) : 'bar'
  const [a, b] = VENUE_PLATES[plate]
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null)
  const box = size ? { width: size, height: size } : measured
  const reach = box ? box.width + box.height : 0
  return (
    <View
      testID="venue-plate"
      style={[
        size ? { width: size, height: size } : StyleSheet.absoluteFill,
        styles.plate,
        { borderRadius: radius ?? (size ? Math.round(size * RADIUS_SHARE) : 0), backgroundColor: a },
      ]}
      onLayout={size ? undefined : (e) => setMeasured(e.nativeEvent.layout)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {box ? (
        <Svg width={box.width} height={box.height} style={StyleSheet.absoluteFill}>
          {/*
           * The half-plane right of the centre, turned 45° about it: x + y > (w + h) / 2.
           * That is CSS's `linear-gradient(135deg, a 50%, b 50%)` at any aspect; the corner
           * diagonal is only the same on a square.
           */}
          <Rect
            x={box.width / 2}
            y={box.height / 2 - reach}
            width={reach}
            height={2 * reach}
            fill={b}
            transform={`rotate(45 ${box.width / 2} ${box.height / 2})`}
          />
        </Svg>
      ) : null}
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
})
