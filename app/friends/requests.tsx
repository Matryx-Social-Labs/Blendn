import { router } from 'expo-router'
import { useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { IncomingRequestRow, RequestSkeleton } from '../../components/friends/IncomingRequestRow'
import { OfflineStrip, useOffline } from '../../components/profile/OfflineStrip'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { useFriendRequests } from '../../lib/useFriendRequests'
import { useTopBarState } from '../../lib/useTopBarState'
import { HueProvider } from '../../components/ds/shared'

/**
 * People asking to be your friend — what "Requests" on the Me tab and at the
 * top of Friends opens.
 *
 * Incoming only. Your own sent requests live on Add friends beside your link,
 * where you would go to send one. Accept and Not now behave exactly as they do
 * there (`useFriendRequests`).
 */
function FriendRequestsScreenContent() {
  const { incoming, loaded, failed, load, respond, busy } = useFriendRequests()
  const [refreshing, setRefreshing] = useState(false)
  const bar = useTopBarState()
  const insets = useSafeAreaInsets()
  const offline = useOffline()

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const empty = failed ? (
    <StateScreen
      icon="cloud-off"
      title="Your requests didn't load"
      body="Check your connection and try again."
      actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
    />
  ) : (
    <StateScreen
      icon="user-plus"
      title="No requests"
      body="When somebody opens your link and asks to be your friend, they'll be here."
    />
  )

  return (
    <View style={styles.container}>
      <TopBar title="Requests" state={bar.state} onBack={() => router.back()} />
      {offline ? (
        <View style={styles.offline}>
          <OfflineStrip offline />
        </View>
      ) : null}
      {!loaded && !failed ? (
        <RequestSkeleton />
      ) : (
        <FlatList
          data={incoming}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <IncomingRequestRow
              request={item}
              busy={busy.has(item.id)}
              onRespond={(action) => void respond(item, action)}
            />
          )}
          contentContainerStyle={[incoming.length ? styles.list : styles.emptyList, { paddingBottom: insets.bottom + SPACE.xl }]}
          ListEmptyComponent={empty}
          // `textSecondary`, the one pull-to-refresh colour (docs/DESIGN_SYSTEM.md).
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
          showsVerticalScrollIndicator={false}
          {...bar.scrollProps}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  offline: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.sm },
  container: { flex: 1, backgroundColor: COLOR.ink },
  list: { paddingHorizontal: SPACE.gutter, paddingVertical: SPACE.sm, gap: SPACE.md },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function FriendRequestsScreen() {
  return (
    <HueProvider value="rose">
      <FriendRequestsScreenContent />
    </HueProvider>
  )
}
