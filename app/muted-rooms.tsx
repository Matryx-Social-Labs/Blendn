import { router } from 'expo-router'
import { useCallback } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { SkeletonCircle, SkeletonLine } from '../components/Skeleton'
import { COLOR, SPACE } from '../lib/design/tokens'
import { muteEnds, mutedRoomRoute, useMutedRooms, MUTED_SCAN_PAGES, type MutedRoom } from '../lib/mutedRooms'
import { useTopBarOverlay } from '../lib/useTopBarState'

const SKELETON_ROWS = [0, 1, 2]
/** Pages of 20 rooms; said when the scan stopped here with more behind it. */
const CAPPED_NOTE = `Showing rooms from your ${MUTED_SCAN_PAGES * 20} most recent.`

/**
 * Every room you muted (Settings › Notifications › Muted rooms, Flow 9 · 9.6 frame 04), when there are more than the
 * three the Notifications screen previews. A row opens that room's info, where the mute is lifted.
 *
 * Virtualised: the rooms are read page by page (`useMutedRooms`) and a row is drawn only while it is near the screen.
 * Each row is its own card, so the list can recycle them.
 */
function MutedRoomsContent() {
  const bold = useBoldText()
  const insets = useSafeAreaInsets()
  const bar = useTopBarOverlay()
  const muted = useMutedRooms()

  const renderRoom = useCallback(
    ({ item }: { item: MutedRoom }) => (
      <SettingsGroup testID={`muted-room-${item.id}`}>
        <SettingsRow
          icon="bell-off"
          title={item.title}
          hint={muteEnds(item.mute)}
          trail="chevron"
          onPress={() => router.push(mutedRoomRoute(item) as never)}
        />
      </SettingsGroup>
    ),
    []
  )

  const empty = muted.loading ? (
    <View accessibilityLabel="Loading" style={styles.skeletons}>
      {SKELETON_ROWS.map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <SkeletonCircle width={SPACE.xxl} />
          <View style={styles.skeletonText}>
            <SkeletonLine width="55%" />
            <SkeletonLine width="35%" />
          </View>
        </View>
      ))}
    </View>
  ) : muted.failed ? (
    <StateScreen
      icon="cloud-off"
      title="Your rooms didn’t load"
      body="Check your connection and try again."
      actions={[{ label: 'Try again', onPress: muted.refresh }]}
      testID="muted-rooms-failed"
    />
  ) : muted.scanning ? (
    <Text style={[font('meta', bold), styles.foot]}>Checking your rooms…</Text>
  ) : (
    <StateScreen
      icon="bell"
      title="No muted rooms"
      body="A room you mute shows up here, and you can turn it back on from its info."
      testID="muted-rooms-empty"
    />
  )

  const foot =
    muted.rooms.length > 0 && (muted.scanning || muted.capped) ? (
      <Text style={[font('meta', bold), styles.foot]}>{muted.scanning ? 'Checking more rooms…' : CAPPED_NOTE}</Text>
    ) : null

  return (
    <View style={styles.container}>
      <FlatList
        data={muted.rooms}
        keyExtractor={(room) => room.id}
        renderItem={renderRoom}
        ListEmptyComponent={empty}
        ListFooterComponent={foot}
        contentContainerStyle={[styles.content, { paddingTop: bar.contentTop, paddingBottom: insets.bottom + SPACE.xl }, muted.rooms.length === 0 && styles.emptyContent]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={false} onRefresh={muted.refresh} tintColor={COLOR.textSecondary} progressViewOffset={bar.indicatorTop} />}
        {...bar.scrollProps}
      />
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="Muted rooms" state={bar.state} onBack={() => router.back()} testID="muted-rooms-top" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: SPACE.gutter, gap: SPACE.md },
  emptyContent: { flexGrow: 1 },
  foot: { color: COLOR.textTertiary, textAlign: 'center', paddingVertical: SPACE.lg },
  skeletons: { gap: SPACE.lg },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  skeletonText: { flex: 1, gap: SPACE.sm },
})

/** Violet world: one hue on this screen (`HueProvider`), as Settings and Notifications. */
export default function MutedRoomsScreen() {
  return (
    <HueProvider value="violet">
      <MutedRoomsContent />
    </HueProvider>
  )
}
