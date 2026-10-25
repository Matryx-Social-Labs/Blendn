import { router } from 'expo-router'
import { useCallback } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { SkeletonCircle, SkeletonLine } from '../components/Skeleton'
import { COLOR, SPACE, MAX_FONT_SCALE } from '../lib/design/tokens'
import { muteEnds, mutedRoomRoute, useMutedRooms, MUTED_PAGE_SIZE, MUTED_SCAN_PAGES, type MutedRoom } from '../lib/mutedRooms'
import { Button } from '../components/ds/Button'
import { useTopBarOverlay } from '../lib/useTopBarState'

const SKELETON_ROWS = [0, 1, 2]
/** Said when the scan stopped at its cap with more behind it. */
const CAPPED_NOTE = `Showing rooms from your ${MUTED_SCAN_PAGES * MUTED_PAGE_SIZE} most recent.`

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
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.foot]}>Checking your rooms…</Text>
  ) : muted.partial ? (
    // Nothing found, but not everything was read: "No muted rooms" would be a guess.
    <StateScreen
      icon="cloud-off"
      title="Some rooms didn’t load"
      body="Check your connection and try again."
      actions={[{ label: 'Try again', onPress: muted.refresh }]}
      testID="muted-rooms-partial-empty"
    />
  ) : (
    <StateScreen
      icon="bell"
      title="No muted rooms"
      body="A room you mute shows up here, and you can turn it back on from its info."
      testID="muted-rooms-empty"
    />
  )

  // Never a quietly short list: a page that did not come says so, with a way to read again.
  const foot =
    muted.rooms.length > 0 && muted.partial ? (
      <View style={styles.partial} testID="muted-rooms-partial">
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.foot]}>Some rooms didn’t load.</Text>
        <Button kind="tertiary" size="sm" label="Try again" onPress={muted.refresh} />
      </View>
    ) : muted.rooms.length > 0 && (muted.scanning || muted.capped) ? (
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.foot]}>{muted.scanning ? 'Checking more rooms…' : CAPPED_NOTE}</Text>
    ) : null

  return (
    <View style={styles.container}>
      <FlatList
        testID="muted-rooms-list"
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
        refreshControl={<RefreshControl refreshing={muted.loading && muted.rooms.length > 0} onRefresh={muted.refresh} tintColor={COLOR.textSecondary} progressViewOffset={bar.indicatorTop} />}
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
  partial: { alignItems: 'center' },
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
