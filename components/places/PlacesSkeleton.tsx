import { StyleSheet, View } from 'react-native'

import { Skeleton } from '../Skeleton'
import { RADIUS, SPACE } from '../../lib/design/tokens'
import { OPEN_CARD_ART, OPEN_CARD_WIDTH, TILE_WIDTH } from './PlaceCards'

/**
 * Loading (B10): static `Skeleton`s at the new sections' geometry. A 130 × 26 bar and three 156 squares with two
 * text bars each; a 150 × 26 bar and two 200 × 132; a 100 × 26 bar and four 132-tall area blocks. Nothing loops.
 */
const SKELETON = { bar: 26, text: 12, area: 132, headers: [130, 150, 100] } as const
export function PlacesSkeleton() {
  return (
    <View accessibilityLabel="Loading places" accessibilityState={{ busy: true }} testID="places-skeleton">
      <View style={styles.section}>
        <View style={styles.gutter}>
          <Skeleton width={SKELETON.headers[0]} height={SKELETON.bar} />
        </View>
        <View style={styles.rail}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonTile}>
              <Skeleton width={TILE_WIDTH} height={TILE_WIDTH} borderRadius={RADIUS.mediaInCard} />
              <Skeleton width={TILE_WIDTH * 0.8} height={SKELETON.text} borderRadius={RADIUS.capsule} />
              <Skeleton width={TILE_WIDTH * 0.5} height={SKELETON.text} borderRadius={RADIUS.capsule} />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <View style={styles.gutter}>
          <Skeleton width={SKELETON.headers[1]} height={SKELETON.bar} />
        </View>
        <View style={styles.rail}>
          {[0, 1].map((i) => (
            <Skeleton key={i} width={OPEN_CARD_WIDTH} height={OPEN_CARD_ART} borderRadius={RADIUS.mediaInCard} />
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <View style={styles.gutter}>
          <Skeleton width={SKELETON.headers[2]} height={SKELETON.bar} />
        </View>
        <View style={[styles.gutter, styles.areas]}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="47%" height={SKELETON.area} borderRadius={RADIUS.mediaInCard} />
          ))}
        </View>
      </View>
    </View>
  )
}


const styles = StyleSheet.create({
  gutter: { paddingHorizontal: SPACE.gutter },
  section: { gap: SPACE.md, paddingBottom: SPACE.xl },
  rail: { paddingHorizontal: SPACE.gutter, gap: SPACE.md, flexDirection: 'row' },
  areas: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  skeletonTile: { gap: SPACE.sm },
})
