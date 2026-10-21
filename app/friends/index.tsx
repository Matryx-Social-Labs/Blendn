import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { PersonRow, PersonRowSkeleton } from '../../components/friends/PersonRow'
import { RequestsRow } from '../../components/friends/RequestsRow'
import { apiClient } from '../../lib/apiClient'
import { friendsSinceParts, type Friend } from '../../lib/friends'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { useFriendRequests } from '../../lib/useFriendRequests'
import { useTopBarState } from '../../lib/useTopBarState'
import { HueProvider } from '../../components/ds/shared'

/**
 * Your friends — the list the count on the Me tab opens.
 *
 * Real names and photos: both people said yes. Tapping one opens their
 * profile; the top-right opens Add friends, which is where your link is.
 * Requests waiting on you sit above the list, when there are any.
 */
function FriendsScreenContent() {
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const requests = useFriendRequests()
  const bar = useTopBarState()

  const load = useCallback(async () => {
    const result = await apiClient.getFriends()
    if (result.success && result.data) {
      setFriends(result.data.friends)
      setFailed(false)
    } else {
      setFailed(true)
    }
  }, [])

  // On focus: coming back from a profile you just unfriended should not show them.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([load(), requests.load()])
    setRefreshing(false)
  }

  const openAdd = () => router.push('/friends/add')

  const empty = failed ? (
    <StateScreen
      icon="cloud-off"
      title="Your friends didn't load"
      body="Check your connection and try again."
      actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
    />
  ) : (
    <StateScreen
      icon="users"
      title="No friends yet"
      body="Nobody can find you by searching. Share your link with the people you want here."
      actions={[{ label: 'Add friends', onPress: openAdd }]}
    />
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TopBar
        title="Friends"
        state={bar.state}
        onBack={() => router.back()}
        actions={[{ icon: 'user-plus', label: 'Add friends', onPress: openAdd }]}
      />
      {requests.incoming.length > 0 ? (
        <View style={styles.requests}>
          <RequestsRow count={requests.incoming.length} />
        </View>
      ) : null}
      {friends === null && !failed ? (
        <PersonRowSkeleton />
      ) : (
        <FlatList
          data={friends ?? []}
          keyExtractor={(f) => f.userId}
          renderItem={({ item }) => {
            const since = friendsSinceParts(item.since)
            return (
              <PersonRow
                person={item}
                detail={since.words}
                detailMono={since.date ?? undefined}
                onPress={() => router.push({ pathname: '/friends/[userId]', params: { userId: item.userId } })}
                chevron
              />
            )
          }}
          contentContainerStyle={friends?.length ? styles.list : styles.emptyList}
          ListEmptyComponent={empty}
          // `textSecondary`, the one pull-to-refresh colour (docs/DESIGN_SYSTEM.md).
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
          showsVerticalScrollIndicator={false}
          {...bar.scrollProps}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  list: { paddingHorizontal: SPACE.gutter, paddingVertical: SPACE.sm },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  requests: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.sm },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function FriendsScreen() {
  return (
    <HueProvider value="rose">
      <FriendsScreenContent />
    </HueProvider>
  )
}
