import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Creature, CREATURE_GLYPHS, creatureFor, type CreatureGlyph, VenuePlate } from '../../components/ds'
import { Text } from '../../components/ui/Text'
import { COLOR, CREATURE_PALETTES, RADIUS, SPACE, VENUE_PLATES } from '../../lib/design/tokens'

/**
 * The creature set and the venue plates, every one of them.
 *
 * Deep-link `exp+blendn:///preview/ds-creatures`. The design export's
 * guidelines/creatures/Set.html and guidelines/components/VenuePlates.html,
 * drawn by the components, so the two can be laid side by side.
 */
const GLYPHS = Object.keys(CREATURE_GLYPHS) as CreatureGlyph[]
const PALETTES = CREATURE_PALETTES.map((_, i) => i)
const PLATE_TYPES = Object.keys(VENUE_PLATES)
const SIZES = [24, 32, 48, 64, 112]
const SEEDS = ['Cosmic Panda', 'Velvet Heron', 'Neon Dragon', 'Quiet Fox', 'Cosmic Comet', 'Stellar Nebula', 'Blazing Phoenix', 'Cosmic Panda 2']
const TILE = { width: 168, height: 196 }
const HERO_HEIGHT = 220

export default function DsCreaturesPreview() {
  const insets = useSafeAreaInsets()
  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xl }]}>
      <Text variant="title">The creature set · {GLYPHS.length}</Text>
      <View style={styles.wrap}>
        {GLYPHS.map((glyph, i) => (
          <View key={glyph} testID={`creature-${glyph}`} style={styles.cell}>
            <View style={styles.row}>
              <Creature glyph={glyph} palette={i % PALETTES.length} size={56} />
              <Creature glyph={glyph} palette={(i + 3) % PALETTES.length} size={24} />
            </View>
            <Text variant="caption">{glyph}</Text>
          </View>
        ))}
      </View>

      <Text variant="heading">Every creature × the eight palettes</Text>
      {GLYPHS.map((glyph) => (
        <View key={glyph} style={styles.row}>
          {PALETTES.map((palette) => (
            <View key={palette} testID={`creature-${glyph}-${palette}`}>
              <Creature glyph={glyph} palette={palette} size={32} />
            </View>
          ))}
        </View>
      ))}

      <Text variant="heading">Seeded from a pseudonym</Text>
      {SEEDS.map((seed) => (
        <View key={seed} testID={`creature-seed-${seed}`} style={styles.row}>
          <Creature {...creatureFor(seed)} size={40} />
          <Text variant="body">{seed}</Text>
        </View>
      ))}

      <Text variant="heading">Sizes and the ring</Text>
      <View style={[styles.row, styles.onSurface]}>
        {SIZES.map((size) => (
          <View key={size} testID={`creature-size-${size}`}>
            <Creature {...creatureFor('Velvet Heron')} size={size} ring={COLOR.ink} />
          </View>
        ))}
      </View>

      <Text variant="title">Venue-type plates</Text>
      <View style={styles.wrap}>
        {PLATE_TYPES.map((type) => (
          <View key={type} testID={`venue-plate-${type}`} style={styles.cell}>
            <VenuePlate type={type} size={120} />
            <Text variant="caption">{type}</Text>
          </View>
        ))}
      </View>

      <Text variant="heading">In place · a row thumb, a tile, a hero</Text>
      <View testID="venue-plate-thumb">
        <VenuePlate type="brewery" size={56} radius={RADIUS.thumb} />
      </View>
      <View testID="venue-plate-tile" style={[styles.clip, TILE]}>
        <VenuePlate type="club" />
      </View>
      <View testID="venue-plate-hero" style={[styles.hero, { height: HERO_HEIGHT }]}>
        <VenuePlate type="liveMusic" />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.lg, gap: SPACE.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  cell: { alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  onSurface: { padding: SPACE.lg, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface },
  clip: { borderRadius: RADIUS.mediaInCard, overflow: 'hidden' },
  hero: { marginHorizontal: -SPACE.lg, overflow: 'hidden' },
})
