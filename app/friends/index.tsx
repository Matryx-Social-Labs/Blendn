import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SearchField } from '../../components/ds/SearchField'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { OfflineStrip, useOffline } from '../../components/profile/OfflineStrip'
import { PagedFooter } from '../../components/friends/PagedFooter'
import { PersonRow, PersonRowSkeleton, PERSON_ROW_HEIGHT, usePersonRowsFixed } from '../../components/friends/PersonRow'
import { MakeCrewRow } from '../../components/friends/MakeCrewRow'
import { SettingsGroup } from '../../components/ds/SettingsRow'
import { RequestsRow } from '../../components/friends/RequestsRow'
import { friendsSinceParts, type Friend } from '../../lib/friends'
import { groupedCount } from '../../lib/friendsHere'
import { FRIEND_SEARCH_MAX, FRIENDS_PAGE } from '../../lib/friendsPaging'
import { COLOR, SIZE, SPACE } from '../../lib/design/tokens'
import { useFriendRequests } from '../../lib/useFriendRequests'
import { useFriendsList } from '../../lib/useFriendsList'
import { usePullToRefresh } from '../../lib/usePullToRefresh'
import { useTopBarState } from '../../lib/useTopBarState'
import { CONTROL_FONT_CAP, font, HueProvider, useBoldText } from '../../components/ds/shared'

/** D7: "Recently added" holds this many (the server's newest first). */
export const RECENTLY_ADDED = 5
/** Below this many friends the list is a screenful and visibly all of itself: no sections. */
export const SECTIONS_FROM = 12
/** A section's head: one capped line on a fixed height, so the list keeps `getItemLayout`. */
const SECTION_HEAD = SIZE.tag

export type FriendItem = { kind: 'head'; key: string; title: string } | { kind: 'friend'; key: string; friend: Friend }

/** "A" for Aarav and Ábhi; "#" for a name that starts with no Latin letter. */
const letterOf = (name: string): string => {
  const c = name.trim().normalize('NFD').charAt(0).toUpperCase()
  return c >= 'A' && c <= 'Z' ? c : '#'
}

/**
 * D7 (D-LM1): the loaded friends as "Recently added" (the server's newest, up to `RECENTLY_ADDED`), then A–Z under a head
 * per letter, "#" last. Built from the pages read so far: a later page adds names into the letters it belongs to. A search,
 * or a list short enough to be visibly all of itself, is one plain run.
 */
export function friendItems(friends: readonly Friend[], sectioned: boolean): FriendItem[] {
  const row = (prefix: string) => (friend: Friend): FriendItem => ({ kind: 'friend', key: `${prefix}${friend.userId}`, friend })
  if (!sectioned) return friends.map(row(''))
  const sorted = [...friends].sort((a, b) => {
    const [la, lb] = [letterOf(a.name), letterOf(b.name)]
    if ((la === '#') !== (lb === '#')) return la === '#' ? 1 : -1
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  })
  const items: FriendItem[] = [{ kind: 'head', key: 'h:recent', title: 'Recently added' }, ...friends.slice(0, RECENTLY_ADDED).map(row('r:'))]
  let letter = ''
  for (const friend of sorted) {
    const next = letterOf(friend.name)
    if (next !== letter) items.push({ kind: 'head', key: `h:${next}`, title: next })
    letter = next
    items.push(row('a:')(friend))
  }
  return items
}

/** Each item's length and offset, for `getItemLayout`: heads are `SECTION_HEAD`, rows `PERSON_ROW_HEIGHT`. */
export function itemOffsets(items: readonly FriendItem[]): number[] {
  const offsets: number[] = []
  let at = 0
  for (const item of items) {
    offsets.push(at)
    at += item.kind === 'head' ? SECTION_HEAD : PERSON_ROW_HEIGHT
  }
  return offsets
}

/**
 * Your friends — the list the count on the Me tab opens.
 *
 * Real names and photos: both people said yes. Tapping one opens their
 * profile; the top-right opens Add friends, which is where your link is.
 * Requests waiting on you sit above the list, when there are any, and Make a
 * crew from the list once there is anybody to make one with.
 *
 * Read a page at a time by the server's cursor and windowed (fixed 64 pt rows and 32 pt sticky heads, `getItemLayout`), so a
 * thousand friends cost a screenful. Past a screenful the list is sectioned: Recently added, then A–Z (`friendItems`). The count under the title is the server's whole list, drawn once it is more than one page: a short
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

  const searched = list.searched !== null
  const items = useMemo(() => friendItems(list.friends, !searched && list.allTotal >= SECTIONS_FROM), [list.friends, list.allTotal, searched])
  const offsets = useMemo(() => itemOffsets(items), [items])
  // Rows are exactly 64 only at the default size; past it they grow (DS-05) and indexing by 64 would misplace them.
  const fixedRows = usePersonRowsFixed()
  const empty = failed ? (
    <StateScreen
      icon="cloud-off"
      title="Your friends didn’t load"
      body="Check your connection and try again."
      actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
    />
  ) : searched ? (
    // Only a search can come up empty with friends behind it: the list is still there, under another word.
    <StateScreen icon="search" title="No friend by that name." gutter testID="friends-no-match" />
  ) : (
    <StateScreen
      icon="users"
      title="No friends yet"
      body="Nobody can find you by searching. Share your link with the people you want here."
      actions={[{ label: 'Add friends', onPress: openAdd }]}
    />
  )

  const header =
    !searched && (requests.incomingTotal > 0 || list.total > 0) ? (
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
        // The whole list's count, drawn once it is more than a page; a search narrows the list, never this number.
        sub={list.allTotal > FRIENDS_PAGE ? groupedCount(list.allTotal) : undefined}
        state={bar.state}
        onBack={() => router.back()}
        actions={[{ icon: 'user-plus', label: 'Add friends', onPress: openAdd }]}
      />
      {offline ? (
        <View style={styles.offline}>
          <OfflineStrip offline />
        </View>
      ) : null}
      {list.allTotal > 0 || list.query ? (
        <View style={styles.search}>
          <SearchField
            value={list.query}
            onChangeText={list.search}
            placeholder="Search friends"
            busy={list.searching}
            resultsLabel={searched && !list.searching ? `${groupedCount(list.total)} ${list.total === 1 ? 'friend' : 'friends'}` : undefined}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxLength={FRIEND_SEARCH_MAX}
            testID="friends-search"
          />
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
            data={items}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (item.kind === 'head' ? <SectionHead title={item.title} /> : <FriendRow friend={item.friend} />)}
            getItemLayout={fixedRows ? (_data, index) => ({ length: items[index]?.kind === 'head' ? SECTION_HEAD : PERSON_ROW_HEIGHT, offset: offsets[index] ?? 0, index }) : undefined}
            // The heads stick under the bar; `ListHeaderComponent` (when drawn) is index 0 to the list, so they shift by one.
            stickyHeaderIndices={items.flatMap((item, i) => (item.kind === 'head' ? [i + (list.friends.length && header ? 1 : 0)] : []))}
            onEndReachedThreshold={1.5}
            onEndReached={() => void list.loadMore()}
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews
            contentContainerStyle={[list.friends.length ? styles.list : styles.emptyList, { paddingBottom: insets.bottom + SPACE.xl }]}
            ListHeaderComponent={list.friends.length ? header : null}
            ListEmptyComponent={empty}
            ListFooterComponent={<PagedFooter loading={list.loadingMore} failed={list.moreFailed} onRetry={() => void list.loadMore()} testID="friends-more" />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            {...pull.listProps}
          />
          {pull.indicator}
        </View>
      )}
    </View>
  )
}

/** A section's head, sticky over the rows: on solid ink, so a row never shows through it. */
function SectionHead({ title }: { title: string }) {
  const bold = useBoldText()
  return (
    <View style={styles.head}>
      <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold), styles.headText]}>
        {title}
      </Text>
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
  search: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.sm },
  head: { height: SECTION_HEAD, justifyContent: 'center', backgroundColor: COLOR.ink },
  headText: { color: COLOR.textSecondary },
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
