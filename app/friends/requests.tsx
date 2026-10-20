import { router } from 'expo-router'
import { useState } from 'react'
import { FlatList, RefreshControl, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { IncomingRequestRow } from '../../components/friends/IncomingRequestRow'
import { PersonRowSkeleton } from '../../components/friends/PersonRow'
import { EMBER, GUTTER, SPACE } from '../../lib/theme'
import { useFriendRequests } from '../../lib/useFriendRequests'
import { useTopBarState } from '../../lib/useTopBarState'

/**
 * People asking to be your friend — what "Requests" on the Me tab and at the
 * top of Friends opens.
 *
 * Incoming only. Your own sent requests live on Add friends beside your link,
 * where you would go to send one. Accept and Not now behave exactly as they do
 * there (`useFriendRequests`).
 */
export default function FriendRequestsScreen() {
  const { incoming, loaded, failed, load, respond, busy } = useFriendRequests()
  const [refreshing, setRefreshing] = useState(false)
  const bar = useTopBarState()

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
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TopBar title="Requests" state={bar.state} onBack={() => router.back()} />
      {!loaded && !failed ? (
        <PersonRowSkeleton />
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
          contentContainerStyle={incoming.length ? styles.list : styles.emptyList}
          ListEmptyComponent={empty}
          // `textSecondary`, the one pull-to-refresh colour (docs/DESIGN_SYSTEM.md).
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />}
          showsVerticalScrollIndicator={false}
          {...bar.scrollProps}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  list: { paddingHorizontal: GUTTER, paddingVertical: SPACE.sm },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: GUTTER },
})
