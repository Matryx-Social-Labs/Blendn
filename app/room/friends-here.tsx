import Animated from 'react-native-reanimated'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../../components/ds/Button'
import { Spinner } from '../../components/ds/Loader'
import { SearchField } from '../../components/ds/SearchField'
import { HueProvider } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { PersonRow, PersonRowSkeleton, usePersonRowsFixed } from '../../components/friends/PersonRow'
import { useOffline } from '../../components/OfflineBanner'
import { useToast } from '../../components/Toast'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { groupedCount, useMessageFriend } from '../../lib/friendsHere'
import { FRIEND_ROW_HEIGHT, FRIENDS_PAGE, SEARCH_ABOVE, SEARCH_MAX, useFriendsHereList } from '../../lib/friendsHereList'
import type { FriendHere } from '../../lib/friendsHere'
import { idParam } from '../../lib/routeParams'
import { useTopBarState } from '../../lib/useTopBarState'
import { useSkeletonCrossfade } from '../../components/motion/useSkeletonCrossfade'

/**
 * See all friends here (plans/friends-in-room.md C2, D15; Flow 5 C6, I-A): a pushed
 * screen, not a sheet, because a sheet scrolls its children in a ScrollView and 300 rows
 * would not virtualise. Rose, like the Room it came from. A to Z with no letters (owner
 * call D4, A); above 20 friends a search over the friends here comes first; 64 pt rows
 * (`getItemLayout` is exact, so a fast scroll never shows a blank cell); the server's
 * pages of 20 by cursor, each behind "Show 20 more".
 *
 * Rows are PersonRows with Message, the same one action as the section: real names
 * and photos, and nothing about the event or the room. A very long name ends in an
 * ellipsis; Message never moves. Nothing here plays a haptic.
 */
function FriendsHereScreenContent() {
  // A link that names no event (or not one the server could have made) has no list to wait for (RC drive 4 D-11).
  const eventId = idParam(useLocalSearchParams().eventId)
  const insets = useSafeAreaInsets()
  const bar = useTopBarState()
  const offline = useOffline()
  const { showToast } = useToast()
  const list = useFriendsHereList(eventId)
  const arrive = useSkeletonCrossfade(list.status === 'loading')
  const chat = useMessageFriend(useCallback((text: string) => showToast(text, 'error'), [showToast]))

  // Opened by a link with nothing under it, Back is the Pulse.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/events'))
  // Rows are exactly 64 only at the default size; past it they grow (DS-05) and indexing by 64 would misplace them.
  const fixedRows = usePersonRowsFixed()
  // total is the unfiltered count: clearing a search that matched nobody is an empty list on its way back, not an empty room.
  const none = list.status === 'ready' && !list.query.trim() && !list.searching && list.total === 0 && list.friends.length === 0

  // Everyone has gone while this was open: the section is gone too, so go back to the Room.
  useEffect(() => {
    if (none) router.back()
  }, [none])

  const renderItem = ({ item }: { item: FriendHere }) => (
    <PersonRow
      person={item}
      trailing={
        <Button
          kind="secondary"
          size="sm"
          icon="message-circle"
          label="Message"
          accessibilityLabel={`Message ${item.name}`}
          loading={chat.opening === item.userId}
          disabled={offline}
          onPress={() => void chat.message(item)}
        />
      }
    />
  )
  // Search first only when there are more than one page shows (the unfiltered total, so a search in progress keeps it).
  const searchable = !!eventId && list.total > SEARCH_ABOVE

  const body = !eventId ? (
    <StateScreen
      icon="link-2-off"
      title="This link doesn’t work"
      body="It doesn’t lead to a room."
      gutter
      testID="friends-here-broken-link"
    />
  ) : list.status === 'loading' ? (
      <PersonRowSkeleton />
    ) : list.status === 'error' ? (
      <StateScreen
        icon="cloud-off"
        title="Your friends didn’t load"
        body="Check your connection and try again."
        actions={[{ label: 'Try again', onPress: list.retry }]}
        gutter
        testID="friends-here-error"
      />
    ) : (
      <Animated.View entering={arrive} style={styles.fill}>
      <FlatList
        testID="friends-here-list"
        data={list.friends}
        keyExtractor={(f) => f.userId}
        renderItem={renderItem}
        getItemLayout={fixedRows ? (_, index) => ({ length: FRIEND_ROW_HEIGHT, offset: FRIEND_ROW_HEIGHT * index, index }) : undefined}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + SPACE.xl }]}
        // Only a search can come up empty: with no search and no friends the screen is already on its way back.
        ListEmptyComponent={list.query.trim() ? <StateScreen icon="search" title="No friend here by that name." testID="friends-here-no-match" gutter /> : null}
        ListFooterComponent={
          list.loadingMore ? (
            <View style={styles.more}>
              <Spinner size={20} />
            </View>
          ) : list.hasMore ? (
            <View style={styles.more}>
              <Button kind="tertiary" label={`Show ${FRIENDS_PAGE} more`} onPress={() => void list.loadMore()} testID="friends-here-more" />
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        {...bar.scrollProps}
      />
      </Animated.View>
    )

  return (
    <View style={styles.container}>
      {/* ponytail: a DS gap. TopBar's title and sub are plain strings, so the count is not in Geist Mono beside the title as the frame draws it. */}
      <TopBar title="Friends here" sub={list.total > 0 ? groupedCount(list.total) : undefined} state={bar.state} onBack={goBack} testID="friends-here-top" />
      {searchable ? (
      <View style={styles.search}>
        <SearchField
          value={list.query}
          onChangeText={list.search}
          placeholder={`Search ${groupedCount(list.total)} friends`}
          busy={list.searching}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={SEARCH_MAX}
          testID="friends-here-search"
        />
      </View>
      ) : null}
      {body}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  fill: { flex: 1 },
  search: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.sm },
  list: { paddingHorizontal: SPACE.gutter },
  more: { alignItems: 'center', height: FRIEND_ROW_HEIGHT, justifyContent: 'center' },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function FriendsHereScreen() {
  return (
    <HueProvider value="rose">
      <FriendsHereScreenContent />
    </HueProvider>
  )
}
