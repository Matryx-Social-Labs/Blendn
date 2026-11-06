import { Pressable, StyleSheet, Text, View } from 'react-native'

import { font, PRESSED_WASH, useBoldText, CONTROL_FONT_CAP } from '../ds/shared'
import { VENUE_PLATE_GLYPHS } from '../ds/VenuePlate'
import { PhotoScrim } from '../ui/GradientFill'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import type { PlateKey } from '../../lib/placesPane'
import { VenueMap } from './VenueMap'

/*
 * Flow 4 V-A, the map is the hero (owner's pick 2026-11-05; `flow-4/screens.js` venueA, `flow4.css` .lmap/.vpin/.dir).
 * A 300 pt map on the venue, its type's glyph in a 44 pt ember pin at the centre (the pin glows still, never a pulse
 * loop), the map fading into the page over its last 96 pt, and Directions on the map. The map is decoration: the rows
 * under it carry the facts. The 6,422 seeded venues have no photos, so the page looks finished in any country.
 */
export const VENUE_HERO_HEIGHT = 300
/** `.mfade`: the map's foot fades to ink over 96 pt. */
const FADE = SPACE.xxxl * 2
/** `.vpin`: 44 pt, the ember selection fill, a 1 pt ember rim and a 24 pt ember glow. */
const PIN = SPACE.xxl + SPACE.md
// design-exception: the board's pin glow (`0 0 24px` ember 55%) and its 22 pt glyph (`ic(glyph,22)`).
const PIN_GLOW = [{ offsetX: 0, offsetY: 0, blurRadius: 24, spreadDistance: 0, color: tint(COLOR.brandOrange, 0.55) }]
const PIN_GLYPH = 22
/** `.dir`: 40 tall, 16 in from the right, its foot 24 above the map's. */
const DIR_HEIGHT = SPACE.xxl + SPACE.sm
const DIR_TOP = VENUE_HERO_HEIGHT - DIR_HEIGHT - SPACE.xl

export function VenueHero({
  latitude,
  longitude,
  plate,
  onDirections,
}: {
  latitude?: number | null
  longitude?: number | null
  plate: PlateKey
  onDirections?: () => void
}) {
  const bold = useBoldText()
  const located = !!latitude && !!longitude
  return (
    <View style={styles.hero} testID="venue-hero">
      <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
        {located ? <VenueMap latitude={latitude} longitude={longitude} /> : null}
        <PhotoScrim foot={1} style={styles.fade} />
        <View testID="venue-pin" style={styles.pin}>
          <Icon name={VENUE_PLATE_GLYPHS[plate] ?? 'map-pin'} size={PIN_GLYPH} color={COLOR.selectionEmberGlyph} />
        </View>
      </View>
      {located && onDirections ? (
        <Pressable onPress={onDirections} accessibilityRole="button" accessibilityLabel="Directions" android_ripple={{ color: PRESSED_WASH.android }} style={styles.dir} testID="venue-directions">
          <Material role="media" style={StyleSheet.absoluteFill} />
          <Icon name="navigation" size={ICON.inline} color={COLOR.textPrimary} />
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('control', bold, FONT_FAMILY.brand[700]), styles.ink]}>
            Directions
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { height: VENUE_HERO_HEIGHT, backgroundColor: COLOR.surfaceSunken },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: FADE },
  pin: {
    position: 'absolute',
    top: VENUE_HERO_HEIGHT / 2 - PIN / 2,
    alignSelf: 'center',
    width: PIN,
    height: PIN,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.selectionEmberFill,
    borderWidth: 1,
    borderColor: COLOR.brandOrange,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: PIN_GLOW,
  },
  dir: {
    position: 'absolute',
    right: SPACE.lg,
    top: DIR_TOP,
    height: DIR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs + SPACE.xxs,
    paddingHorizontal: SPACE.md + SPACE.xxs,
    borderRadius: RADIUS.capsule,
    overflow: 'hidden',
  },
  ink: { color: COLOR.textPrimary },
})
