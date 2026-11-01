import { StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { font, useBoldText, useSelection } from '../ds/shared'
import { SolidBarFade } from '../ui/GradientFill'
import { Icon } from '../ui/Icon'
import { COLOR, ICON, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'

/**
 * The picture in the middle of a permission step (Flow 2 location 01), drawn from design-system parts: no
 * stock photographs. It is decorative, hidden from a screen reader (the title and sentence say what the step is for), and
 * a preview of something the product really does, so it is a view, not a screenshot that go stale with the copy.
 */

const MAP_HEIGHT = 300
/** The map card's height with the "Precise location is off" notice above it (the frame draws 232). */
export const MAP_HEIGHT_WITH_NOTICE = 232

const NEARBY = [
  { pseudonym: 'Quiet Heron', x: 0.2, y: 0.28 },
  { pseudonym: 'Velvet Lynx', x: 0.76, y: 0.22 },
  { pseudonym: 'Amber Otter', x: 0.7, y: 0.72 },
] as const
const NEARBY_SIZE = 40
const YOU_SIZE = 72
/** The two rings around "you": 160 and 240 across, the frame's. */
const RINGS = [160, 240] as const
/** The streets: hairlines at the frame's angles, not orange (the accent is not for decoration). */
const STREETS = [
  { at: 0.18, vertical: true },
  { at: 0.46, vertical: true },
  { at: 0.78, vertical: true },
  { at: 0.3, vertical: false },
  { at: 0.62, vertical: false },
] as const
const STREET_TILT = { vertical: '8deg', horizontal: '-6deg' } as const

/**
 * The rings over the map: "you" in the middle, three creatures around, the footer line over a scrim. No city is named
 * (SCRUM-997).
 */
export function LocationIllustration({ notice = false }: { notice?: boolean }) {
  const bold = useBoldText()
  const sel = useSelection()
  const height = notice ? MAP_HEIGHT_WITH_NOTICE : MAP_HEIGHT
  return (
    <View
      testID="location-illustration"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.card, styles.map, { height }]}
    >
      {STREETS.map((street, i) => (
        <View
          key={i}
          style={[
            street.vertical ? styles.streetV : styles.streetH,
            street.vertical ? { left: `${street.at * 100}%`, transform: [{ rotate: STREET_TILT.vertical }] } : { top: `${street.at * 100}%`, transform: [{ rotate: STREET_TILT.horizontal }] },
          ]}
        />
      ))}
      {RINGS.map((side) => (
        <View key={side} style={[styles.ring, { width: side, height: side, borderRadius: side / 2, marginLeft: -side / 2, marginTop: -side / 2 }]} />
      ))}
      {NEARBY.map((p) => (
        <View key={p.pseudonym} style={{ position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
          <Avatar kind="creature" pseudonym={p.pseudonym} size={NEARBY_SIZE} />
        </View>
      ))}
      <View style={styles.you}>
        {/* You are the screen's hue (violet in onboarding), never white. */}
        <View testID="you-ring" style={[styles.youRing, { backgroundColor: sel.edge }]}>
          <Avatar kind="creature" pseudonym="You" size={YOU_SIZE - SPACE.sm} />
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.youTag]}>You</Text>
      </View>
      <View style={styles.footer}>
        {/*
          The scrim: clear to the sunken surface over its top 60%, then solid under the words. The DS fade (a
          LinearGradient, drawn on every architecture) and a solid block, not a CSS `linear-gradient` (DS-21, A35).
        */}
        <View testID="location-scrim" pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SolidBarFade testID="location-scrim-fade" color={COLOR.surfaceSunken} style={styles.scrimFade} />
          <View style={styles.scrimSolid} />
        </View>
        <View style={styles.footerRow}>
          <Icon name="map-pin" size={ICON.inline} color={COLOR.textPrimary} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.footerLabel]}>NEAR YOU</Text>
          {/* No city: until the catalogue knows where the person is, a named one is a guess, and was wrong (SCRUM-997). */}
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.footerBody]}>Check-in only works while you’re inside the venue.</Text>
      </View>
    </View>
  )
}

/** The scrim fades over its top 60% and is solid below (the frame's 0% → 60% stop). */
const SCRIM_FADE = 3
const SCRIM_SOLID = 2

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, backgroundColor: COLOR.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline, overflow: 'hidden' },
  map: { backgroundColor: COLOR.surfaceSunken },
  streetV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline },
  streetH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline },
  ring: { position: 'absolute', left: '50%', top: '50%', borderWidth: 1, borderColor: COLOR.hairlineStrong },
  you: { position: 'absolute', left: '50%', top: '50%', marginLeft: -YOU_SIZE / 2, marginTop: -YOU_SIZE / 2, width: YOU_SIZE, alignItems: 'center', gap: SPACE.xs },
  youRing: { width: YOU_SIZE, height: YOU_SIZE, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center' },
  youTag: { color: COLOR.textPrimary, backgroundColor: COLOR.ink, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.capsule, overflow: 'hidden' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: SPACE.xxxl, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg, gap: SPACE.xs },
  scrimFade: { flex: SCRIM_FADE },
  scrimSolid: { flex: SCRIM_SOLID, backgroundColor: COLOR.surfaceSunken },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  footerLabel: { color: COLOR.textPrimary },
  footerBody: { color: COLOR.textSecondary },
})
