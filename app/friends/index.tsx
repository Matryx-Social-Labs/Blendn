import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { OfflineStrip, useOffline } from '../../components/profile/OfflineStrip'
import { PagedFooter } from '../../components/friends/PagedFooter'
import { PersonRow, PersonRowSkeleton, PERSON_ROW_HEIGHT } from '../../components/friends/PersonRow'
import { MakeCrewRow } from '../../components/friends/MakeCrewRow'
import { SettingsGroup } from '../../components/ds/SettingsRow'
import { RequestsRow } from '../../components/friends/RequestsRow'
import { friendsSinceParts, type Friend } from '../../lib/friends'
import { groupedCount } from '../../lib/friendsHere'
import { FRIENDS_PAGE } from '../../lib/friendsPaging'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { useFriendRequests } from '../../lib/useFriendRequests'
import { useFriendsList } from '../../lib/useFriendsList'
import { usePullToRefresh } from '../../lib/usePullToRefresh'
import { useTopBarState } from '../../lib/useTopBarState'
import { HueProvider } from '../../components/ds/shared'

/**
 * Your friends — the list the count on the Me tab opens.
 *
 * Real names and photos: both people said yes. Tapping one opens their
 * profile; the top-right opens Add friends, which is where your link is.
 * Requests waiting on you sit above the list, when there are any, and Make a
 * crew from the list once there is anybody to make one with.
 *
 * Read a page at a time by the server's cursor and windowed (fixed 64 pt rows, `getItemLayout`), so a thousand friends
 * cost a screenful. The count under the title is the server's whole list, drawn once it is more than one page: a short
 * list is visibly all of itself.
 */
function FriendsScreenContent() {
  const list = useFriendsList()
  const [refreshing, setRefreshing] = useState(false)
  const requests = useFriendRequests()
  const bar = useTopBarState()
  const insets = useSafeAreaInsets()
  const offline = useOffline()

  // On focus: coming back from a profile you just unfriended should not show them. The head is read again, the pages read further stay.
  useFocusEffect(
    useCallback(() => {
      void list.refresh('merge')
    }, [list.refresh]) // eslint-disable-line react-hooks/exhaustive-deps -- `refresh` is stable; `list` is a new object each render
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([list.refresh('replace'), requests.load()])
    setRefreshing(false)
  }
  // The branded pull (motion #18); the bar's own scroll handler rides inside it.
  const pull = usePullToRefresh({ refreshing, onRefresh: () => void onRefresh(), onScroll: bar.scrollProps.onScroll })

  const openAdd = () => router.push('/friends/add')
  const failed = list.status === 'failed'

  const empty = failed ? (
    <StateScreen
      icon="cloud-off"
      title="Your friends didn’t load"
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

  const header =
    requests.incomingTotal > 0 || list.total > 0 ? (
      <View style={styles.rows}>
        {requests.incomingTotal > 0 ? (
          <SettingsGroup>
            <RequestsRow count={requests.incomingTotal} />
          </SettingsGroup>
        ) : null}
        {list.total > 0 ? (
          <SettingsGroup>
            <MakeCrewRow />
          </SettingsGroup>
        ) : null}
      </View>
    ) : null

  return (
    <View style={styles.container}>
      <TopBar
        title="Friends"
        sub={list.total > FRIENDS_PAGE ? groupedCount(list.total) : undefined}
        state={bar.state}
        onBack={() => router.back()}
        actions={[{ icon: 'user-plus', label: 'Add friends', onPress: openAdd }]}
      />
      {offline ? (
        <View style={styles.offline}>
          <OfflineStrip offline />
        </View>
      ) : null}
      {/* No friends to scroll: the rows that stand above them stand above the empty state too. */}
      {list.friends.length ? null : header}
      {list.status === 'loading' ? (
        <PersonRowSkeleton />
      ) : (
        <View style={styles.flex}>
          <FlatList
            testID="friends-list"
            data={list.friends}
            keyExtractor={(f) => f.userId}
            renderItem={({ item }) => <FriendRow friend={item} />}
            getItemLayout={(_data, index) => ({ length: PERSON_ROW_HEIGHT, offset: PERSON_ROW_HEIGHT * index, index })}
            onEndReachedThreshold={1.5}
            onEndReached={() => void list.loadMore()}
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews
            contentContainerStyle={[list.friends.length ? styles.list : styles.emptyList, { paddingBottom: insets.bottom + SPACE.xl }]}
            ListHeaderComponent={list.friends.length ? header : null}
            ListEmptyComponent={empty}
            ListFooterComponent={<PagedFooter loading={list.loadingMore} failed={list.moreFailed} onRetry={() => void list.loadMore()} testID="friends-more" />}
            showsVerticalScrollIndicator={false}
            {...pull.listProps}
          />
          {pull.indicator}
        </View>
      )}
    </View>
  )
}

/** One friend: "Friends since Mar 2026", and nothing of any event or room. */
function FriendRow({ friend }: { friend: Friend }) {
  const since = friendsSinceParts(friend.since)
  return (
    <PersonRow
      person={friend}
      detail={since.words}
      detailMono={since.date ?? undefined}
      onPress={() => router.push({ pathname: '/friends/[userId]', params: { userId: friend.userId } })}
      chevron
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  flex: { flex: 1 },
  list: { paddingHorizontal: SPACE.gutter, paddingVertical: SPACE.sm },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  // The frame's column: the request card and Make a crew stand 8 apart, and the first friend 8 under them.
  rows: { gap: SPACE.sm, paddingBottom: SPACE.sm, paddingHorizontal: 0 },
  offline: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xs, paddingBottom: SPACE.sm },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function FriendsScreen() {
  return (
    <HueProvider value="rose">
      <FriendsScreenContent />
    </HueProvider>
  )
}
