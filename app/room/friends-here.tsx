import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../../components/ds/Button'
import { Spinner } from '../../components/ds/Loader'
import { SearchField } from '../../components/ds/SearchField'
import { HueProvider, font, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { PersonRow, PersonRowSkeleton } from '../../components/friends/PersonRow'
import { useOffline } from '../../components/OfflineBanner'
import { useToast } from '../../components/Toast'
import { COLOR, FONT_FAMILY, SPACE } from '../../lib/design/tokens'
import { groupedCount, useMessageFriend } from '../../lib/friendsHere'
import { SEARCH_MAX, FRIEND_ROW_HEIGHT, layoutOf, useFriendsHereList, withLetters, type FriendsListItem } from '../../lib/friendsHereList'
import { useTopBarState } from '../../lib/useTopBarState'

/**
 * See all friends here (plans/friends-in-room.md C2, D15): a pushed screen, not a
 * sheet, because a sheet scrolls its children in a ScrollView and 300 rows would not
 * virtualise. Rose, like the Room it came from. A to Z with sticky letters, a search
 * over the friends here only, 64 pt rows (`getItemLayout` is exact, so a fast scroll
 * never shows a blank cell) and the server's pages of 50 by cursor.
 *
 * Rows are PersonRows with Message, the same one action as the section: real names
 * and photos, and nothing about the event or the room. A very long name ends in an
 * ellipsis; Message never moves. Nothing here plays a haptic.
 */
function FriendsHereScreenContent() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>()
  const insets = useSafeAreaInsets()
  const bar = useTopBarState()
  const bold = useBoldText()
  const offline = useOffline()
  const { showToast } = useToast()
  const list = useFriendsHereList(eventId || null)
  const chat = useMessageFriend(useCallback((text: string) => showToast(text, 'error'), [showToast]))

  const rows = withLetters(list.friends)
  const stickyHeaderIndices = rows.flatMap((r, i) => (r.kind === 'letter' ? [i] : []))
  const layout = layoutOf(rows)
  // total is the unfiltered count: clearing a search that matched nobody is an empty list on its way back, not an empty room.
  const none = list.status === 'ready' && !list.query.trim() && !list.searching && list.total === 0 && list.friends.length === 0

  // Everyone has gone while this was open: the section is gone too, so go back to the Room.
  useEffect(() => {
    if (none) router.back()
  }, [none])

  const renderItem = ({ item }: { item: FriendsListItem }) =>
    item.kind === 'letter' ? (
      <View style={styles.letter} accessibilityRole="header">
        <Text accessibilityLabel={item.letter} style={[font('label', bold, FONT_FAMILY.mono[500]), styles.letterText]}>
          {item.letter}
        </Text>
      </View>
    ) : (
      <PersonRow
        person={item.friend}
        trailing={
          <Button
            kind="lit"
            size="sm"
            icon="message-circle"
            label="Message"
            accessibilityLabel={`Message ${item.friend.name}`}
            loading={chat.opening === item.friend.userId}
            disabled={offline}
            onPress={() => void chat.message(item.friend)}
          />
        }
      />
    )

  const body =
    list.status === 'loading' ? (
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
      <FlatList
        testID="friends-here-list"
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        getItemLayout={(_, index) => layout[index]}
        stickyHeaderIndices={stickyHeaderIndices}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReachedThreshold={1.5}
        onEndReached={() => void list.loadMore()}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + SPACE.xl }]}
        // Only a search can come up empty: with no search and no friends the screen is already on its way back.
        ListEmptyComponent={list.query.trim() ? <StateScreen icon="search" title="No friend here by that name." testID="friends-here-no-match" gutter /> : null}
        ListFooterComponent={list.loadingMore ? <View style={styles.more}><Spinner size={20} /></View> : null}
        showsVerticalScrollIndicator={false}
        {...bar.scrollProps}
      />
    )

  return (
    <View style={styles.container}>
      {/* ponytail: a DS gap. TopBar's title and sub are plain strings, so the count is not in Geist Mono beside the title as the frame draws it. */}
      <TopBar title="Friends here" sub={list.total > 0 ? groupedCount(list.total) : undefined} state={bar.state} onBack={() => router.back()} testID="friends-here-top" />
      <View style={styles.search}>
        <SearchField
          value={list.query}
          onChangeText={list.search}
          placeholder="Search friends here"
          busy={list.searching}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={SEARCH_MAX}
          testID="friends-here-search"
        />
      </View>
      {body}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  search: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.sm },
  list: { paddingHorizontal: SPACE.gutter },
  // The sticky letter sits on the page's own ground, so rows slide under it.
  letter: { height: 32, justifyContent: 'center', backgroundColor: COLOR.ink },
  letterText: { color: COLOR.textSecondary },
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
