import { FlatList, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { barTop } from '../../lib/barGeometry'
import { SIZE, SPACE } from '../../lib/design/tokens'
import type { RoomPerson } from '../../lib/useRoom'
import { GridFace } from '../ds/GridFace'
import { TopBar } from '../ds/TopBar'
import { EveryoneHead, faceOf, GRID_GAP, ShowMore, useGridCell } from './RoomSections'

/**
 * "People from tonight" (Flow 4 R4.1 4.5): who was in the room, read only, until the room's chat closes. The Room's own
 * grid cell, marked "Was here"; no like, no wave and no card, since nobody is there to answer. Virtualised in threes,
 * as the Room's grid is: a concert room is thousands.
 */
export function PeopleFromTonight({
  people,
  hasMore,
  loadingMore,
  onMore,
  onBack,
}: {
  people: readonly RoomPerson[]
  /** The roster is paged: more than the loaded page exist. The head then claims no count (a page is not the crowd). */
  hasMore: boolean
  loadingMore: boolean
  onMore: () => void
  onBack: () => void
}) {
  const insets = useSafeAreaInsets()
  const cell = useGridCell()
  return (
    <View style={styles.fill} testID="people-from-tonight">
      <FlatList<RoomPerson>
        data={people}
        keyExtractor={(p) => p.id}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ paddingTop: barTop(insets.top) + SIZE.circleButton + SPACE.lg, paddingBottom: insets.bottom + SPACE.xxxl }}
        ListFooterComponent={hasMore ? <ShowMore count={null} loading={loadingMore} onMore={onMore} /> : null}
        ListHeaderComponent={<EveryoneHead title="People from tonight" count={hasMore ? 0 : people.length} />}
        renderItem={({ item, index }) => (
          <GridFace face={faceOf(item)} name={item.name} reason="Was here" width={cell} here={false} testID={`people-from-tonight-${index}`} />
        )}
      />
      <TopBar onBack={onBack} testID="people-from-tonight-bar" />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { paddingHorizontal: SPACE.gutter, columnGap: GRID_GAP, marginBottom: GRID_GAP },
})
