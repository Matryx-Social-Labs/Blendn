import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Creature, CREATURE_MOODS, CREATURE_SPECIES, creatureFor } from '../../components/ds/Creature'
import { VenuePlate } from '../../components/ds/VenuePlate'
import { Text } from '../../components/ui/Text'
import { COLOR, CREATURE_HUES, RADIUS, SPACE, VENUE_PLATES } from '../../lib/design/tokens'

/**
 * The creature set and the venue plates, every one of them.
 *
 * Deep-link `exp+blendn:///preview/ds-creatures`. The design export's
 * guidelines/creatures/Set.html and guidelines/components/VenuePlates.html,
 * drawn by the components, so the two can be laid side by side.
 */
const HUES = CREATURE_HUES.map((_, i) => i)
const PLATE_TYPES = Object.keys(VENUE_PLATES)
const SIZES = [24, 32, 48, 64, 112]
const SEEDS = ['Cosmic Panda', 'Velvet Heron', 'Neon Dragon', 'Laughing Dolphin', 'Cosmic Comet', 'Midnight Hummingbird', 'Blazing Phoenix', 'Wild Wren 2']
const TILE = { width: 168, height: 196 }
const HERO_HEIGHT = 220

export default function DsCreaturesPreview() {
  const insets = useSafeAreaInsets()
  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xl }]}>
      <Text variant="title">The faces · {CREATURE_SPECIES.length}</Text>
      <View style={styles.wrap}>
        {CREATURE_SPECIES.map((species, i) => (
          <View key={species} testID={`creature-${species}`} style={styles.cell}>
            <View style={styles.row}>
              <Creature species={species} mood={CREATURE_MOODS[i % CREATURE_MOODS.length]} hue={i % HUES.length} size={56} />
              <Creature species={species} mood="curious" hue={(i + 3) % HUES.length} size={24} />
            </View>
            <Text variant="caption">{species}</Text>
          </View>
        ))}
      </View>

      <Text variant="heading">Every face × the eight hues</Text>
      {CREATURE_SPECIES.map((species) => (
        <View key={species} style={styles.row}>
          {HUES.map((hue) => (
            <View key={hue} testID={`creature-${species}-${hue}`}>
              <Creature species={species} mood={CREATURE_MOODS[hue % CREATURE_MOODS.length]} hue={hue} size={32} />
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
