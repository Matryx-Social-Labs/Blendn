import Animated from 'react-native-reanimated'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SearchField } from '../../components/ds/SearchField'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { OfflineStrip, useOffline } from '../../components/profile/OfflineStrip'
import { PagedFooter } from '../../components/friends/PagedFooter'
import { LIST_FACE, PersonRow, PersonRowSkeleton, PERSON_ROW_HEIGHT, usePersonRowsFixed } from '../../components/friends/PersonRow'
import { InviteLinkCard } from '../../components/friends/InviteLinkCard'
import { LetterScrubber } from '../../components/friends/LetterScrubber'
import { Button } from '../../components/ds/Button'
import { IconButton } from '../../components/ds/IconButton'
import { Title } from '../../components/ds/Title'
import { useToast } from '../../components/Toast'
import { MakeCrewRow } from '../../components/friends/MakeCrewRow'
import { SettingsGroup } from '../../components/ds/SettingsRow'
import { RequestsRow } from '../../components/friends/RequestsRow'
import { friendsSinceParts, type Friend } from '../../lib/friends'
import { CHAT_FAILED, openFriendChat } from '../../lib/friendChat'
import { friendItems, headFor, headIndex, listMode, SCRUBBER_FROM, scrubberLetters, type FriendItem } from '../../lib/friendsIndex'
import { useAuth } from '../../lib/useAuth'
import { useFriendInvite } from '../../lib/useFriendInvite'
import { groupedCount } from '../../lib/friendsHere'
import { FRIEND_SEARCH_MAX, FRIENDS_PAGE } from '../../lib/friendsPaging'
import { COLOR, MAX_FONT_SCALE, SIZE, SPACE } from '../../lib/design/tokens'
import { useFriendRequests } from '../../lib/useFriendRequests'
import { useFriendsList } from '../../lib/useFriendsList'
import { usePullToRefresh } from '../../lib/usePullToRefresh'
import { useTopBarState } from '../../lib/useTopBarState'
import { CONTROL_FONT_CAP, font, HueProvider, useBoldText } from '../../components/ds/shared'
import { useSkeletonCrossfade } from '../../components/motion/useSkeletonCrossfade'

/** A section's head: one capped line on a fixed height, so the list keeps `getItemLayout`. */
const SECTION_HEAD = SIZE.tag

/** Each item's offset, for `getItemLayout`: heads are `SECTION_HEAD`, rows `PERSON_ROW_HEIGHT`, under whatever stands `above` them. */
export function itemOffsets(items: readonly FriendItem[], above: number): number[] {
  const offsets: number[] = []
  let at = above
  for (const item of items) {
    offsets.push(at)
    at += item.kind === 'head' ? SECTION_HEAD : PERSON_ROW_HEIGHT
  }
  return offsets
}

/**
 * Your friends — what the Friends row on the Me tab opens.
 *
 * Real names and photos: both people said yes. Tapping one opens their
 * profile; the top-right opens Add friends, which is where your link is.
 * Requests waiting on you sit above the list, when there are any, and Make a
 * crew from the list once there is anybody to make one with.
 *
 * Read a page at a time by the server's cursor and windowed (fixed 64 pt rows and 32 pt sticky heads, `getItemLayout`), so a
 * thousand friends cost a screenful. Past a screenful the list is Recently added (the newest page's first five), then the server's
 * A–Z (`GET /friends?order=name`, admin #998) a page at a time, with an index down the edge from the whole list's `letters`
 * (`lib/friendsIndex`). The count under the title is the server's whole list, drawn once it is more than one page: a short list
 * is visibly all of itself.
 */
function FriendsScreenContent() {
  const list = useFriendsList()
  // The A–Z, read only once the list is long enough to have sections (`az`).
  const byName = useFriendsList('name')
  const arrive = useSkeletonCrossfade(list.status === 'loading')
  const [refreshing, setRefreshing] = useState(false)
  const requests = useFriendRequests()
  const bar = useTopBarState()
  const insets = useSafeAreaInsets()
  const offline = useOffline()

  const searched = list.searched !== null
  const mode = listMode(list.allTotal, searched)
  const az = mode === 'az'
  const azNow = useRef(az)
  useEffect(() => {
    azNow.current = az
  }, [az])

  // On focus: coming back from a profile you just unfriended should not show them. The head is read again, the pages read further stay.
  useFocusEffect(
    useCallback(() => {
      void list.refresh('merge')
      if (azNow.current) void byName.refresh('merge')
    }, [list.refresh, byName.refresh]) // eslint-disable-line react-hooks/exhaustive-deps -- `refresh` is stable; `list` is a new object each render
  )
  // The list just grew long enough for sections (or opened that long): its A–Z is read for the first time.
  useEffect(() => {
    if (az && byName.status === 'loading') void byName.refresh('merge')
  }, [az]) // eslint-disable-line react-hooks/exhaustive-deps -- only when the mode turns to A–Z

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([list.refresh('replace'), azNow.current ? byName.refresh('replace') : null, requests.load()])
    setRefreshing(false)
  }
  // The branded pull (motion #18); the bar's own scroll handler rides inside it.
  const pull = usePullToRefresh({ refreshing, onRefresh: () => void onRefresh(), onScroll: bar.scrollProps.onScroll })

  const openAdd = () => router.push('/friends/add')
  // What scrolls: the A–Z's pages, or the plain list (a short one, or a search).
  const shown = az ? byName : list
  const naming = az && byName.status === 'loading'
  const failed = list.status === 'failed' || (az && byName.status === 'failed')

  const hasHeader = !searched && (requests.incomingTotal > 0 || list.total > 0)
  const items = useMemo(
    () => (az ? (byName.status === 'ready' ? friendItems(byName.friends, 'az', list.friends) : []) : friendItems(list.friends, 'plain')),
    [az, byName.status, byName.friends, list.friends]
  )
  // The group above the first row scrolls with the list, and `getItemLayout` counts from the top of everything that scrolls.
  const [aboveHeight, setAboveHeight] = useState(0)
  const above = SPACE.sm + (hasHeader ? aboveHeight : 0)
  const offsets = useMemo(() => itemOffsets(items, above), [items, above])
  // Rows are exactly 64 only at the default size; past it they grow (DS-05) and indexing by 64 would misplace them.
  const fixedRows = usePersonRowsFixed()
  // The index down the edge, past 12 letter heads, and only while rows have their fixed height (an exact jump needs `getItemLayout`;
  // at the large sizes the heads are still headers, which a screen reader's heading navigation walks).
  const heads = byName.letters
  const letters = useMemo(() => (az && fixedRows && heads && heads.length > SCRUBBER_FROM ? scrubberLetters(heads) : null), [az, fixedRows, heads])
  const listRef = useRef<FlatList<FriendItem>>(null)
  // The head a scrubber letter asked for whose page has not been read yet.
  const seeking = useRef<string | null>(null)
  // A jump that read pages on its way: its first scroll runs before iOS has the new rows' height and is clamped short, so it lands
  // again once the list grows (`onContentSizeChange`), once.
  const readOnWay = useRef(false)
  const landing = useRef<number | null>(null)
  /** Jumps to the sought head, or reads the next page on the way to it. */
  const seek = () => {
    if (!seeking.current) return
    const index = headIndex(items, seeking.current)
    if (index >= 0) {
      listRef.current?.scrollToIndex({ index, animated: false })
      landing.current = readOnWay.current ? index : null
      seeking.current = null
    } else if (!byName.hasMore || byName.moreFailed) seeking.current = null
    else if (!byName.loadingMore) {
      readOnWay.current = true
      void byName.loadMore()
    }
  }
  const land = () => {
    if (landing.current === null) return
    listRef.current?.scrollToIndex({ index: landing.current, animated: false })
    landing.current = null
  }
  const jumpTo = (letter: string) => {
    if (!letters || !heads) return
    readOnWay.current = false
    landing.current = null
    seeking.current = letter === '★' ? null : headFor(letters, letter, heads)
    // `ListHeaderComponent` sits above index 0, so ★ (the top) scrolls to the very top rather than to Recently added under it.
    if (letter === '★') listRef.current?.scrollToOffset({ offset: 0, animated: false })
    else seek()
  }
  /*
   * A head on a page not read yet: the pages before it are read, one at a time, until it lands; then the list jumps there.
   * ponytail: a jump to the far end of thousands of friends reads every page on the way (100 a page).
   * Upgrade path: read from the letter (`from=`) and fill the pages above it as they scroll into view.
   */
  useEffect(seek, [items, byName.hasMore, byName.loadingMore, byName.moreFailed]) // eslint-disable-line react-hooks/exhaustive-deps -- runs as each page lands; `seek` reads the render it is made in
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
    <FriendsEmpty />
  )

  // Flow 7 1-A: Friend requests and Make a crew in one group above the list (they were two cards pushing the first friend down).
  const header =
    hasHeader ? (
      <View testID="friends-above" onLayout={(e) => setAboveHeight(e.nativeEvent.layout.height)} style={styles.rows}>
        <SettingsGroup>
          {requests.incomingTotal > 0 ? <RequestsRow count={requests.incomingTotal} faces={requests.incoming.slice(0, 3).map((r) => r.person)} /> : null}
          {list.total > 0 ? <MakeCrewRow /> : null}
        </SettingsGroup>
      </View>
    ) : null

  return (
    <View style={styles.container}>
      <TopBar
        title="Friends"
        // The whole list's count, drawn once it is more than a page; a search narrows the list, never this number.
        sub={list.allTotal > FRIENDS_PAGE ? `${groupedCount(list.allTotal)} friends` : undefined}
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
      {list.status === 'loading' || naming ? (
        <>
          {naming ? header : null}
          <PersonRowSkeleton />
        </>
      ) : (
        <Animated.View entering={arrive} style={styles.flex}>
          <FlatList
            ref={listRef}
            testID="friends-list"
            data={items}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (item.kind === 'head' ? <SectionHead title={item.title} fixed={fixedRows} /> : <FriendRow friend={item.friend} />)}
            getItemLayout={fixedRows ? (_data, index) => ({ length: items[index]?.kind === 'head' ? SECTION_HEAD : PERSON_ROW_HEIGHT, offset: offsets[index] ?? 0, index }) : undefined}
            // The heads stick under the bar; `ListHeaderComponent` (when drawn) is index 0 to the list, so they shift by one.
            stickyHeaderIndices={items.flatMap((item, i) => (item.kind === 'head' ? [i + (list.friends.length && header ? 1 : 0)] : []))}
            onContentSizeChange={land}
            onEndReachedThreshold={1.5}
            onEndReached={() => void shown.loadMore()}
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews
            contentContainerStyle={[list.friends.length ? styles.list : searched || failed ? styles.emptyList : styles.emptyTop, { paddingBottom: insets.bottom + SPACE.xl }]}
            ListHeaderComponent={list.friends.length ? header : null}
            ListEmptyComponent={empty}
            ListFooterComponent={<PagedFooter loading={shown.loadingMore} failed={shown.moreFailed} onRetry={() => void shown.loadMore()} testID="friends-more" />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            {...pull.listProps}
          />
          {pull.indicator}
          {letters ? (
            <View style={styles.scrubber}>
              <LetterScrubber letters={letters} onLetter={jumpTo} testID="friends-scrubber" />
            </View>
          ) : null}
        </Animated.View>
      )}
    </View>
  )
}

/**
 * A section's head, sticky over the rows: on solid ink, so a row never shows through it. `-bar`, so the visual checker reads
 * a row passing under it as the design (rc7: "A" over "Arnav Nair"). At the default size it is the fixed `SECTION_HEAD` the
 * list's `getItemLayout` counts on; at larger text its 1.3× words outgrew that box and touched the first row ("Recently
 * added" at AX, rc7), so it grows with them.
 */
function SectionHead({ title, fixed }: { title: string; fixed: boolean }) {
  const bold = useBoldText()
  return (
    <View testID={`friends-head-${title === '#' ? 'other' : title.replace(/\s+/g, '-').toLowerCase()}-bar`} style={[styles.head, fixed ? styles.headFixed : styles.headGrows]}>
      <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold), styles.headText]}>
        {title}
      </Text>
    </View>
  )
}

/** One friend: "Friends since Mar 2026", and nothing of any event or room; Message on the row (Flow 7 1-A), the profile on a tap. */
function FriendRow({ friend }: { friend: Friend }) {
  const since = friendsSinceParts(friend.since)
  const { showToast } = useToast()
  const [opening, setOpening] = useState(false)
  const message = async () => {
    if (opening) return
    setOpening(true)
    const opened = await openFriendChat(friend)
    setOpening(false)
    if (!opened) showToast(CHAT_FAILED, 'error', { haptic: 'error' })
  }
  return (
    <PersonRow
      person={friend}
      avatar={LIST_FACE}
      detail={since.words}
      detailMono={since.date ?? undefined}
      onPress={() => router.push({ pathname: '/friends/[userId]', params: { userId: friend.userId } })}
      trailing={<IconButton size="sm" icon="message-circle" accessibilityLabel={`Message ${friend.name}`} onPress={() => void message()} disabled={opening} />}
    />
  )
}

/**
 * Flow 7 1b-A: with nobody yet, the way in is on the page — your invite card, Share my link, and your QR code one tap away — rather
 * than a screen further on.
 */
function FriendsEmpty() {
  const bold = useBoldText()
  const { user } = useAuth()
  const { invite, failed, share } = useFriendInvite()
  return (
    <View testID="friends-empty" style={styles.empty}>
      <View style={styles.emptyWords}>
        <Title variant="page" accessibilityRole="header" style={[styles.emptyTitle, styles.centre]}>
          No friends yet
        </Title>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.lede} style={[font('lede', bold), styles.muted, styles.centre]}>
          Nobody can find you by searching. Send your link to the people you want here.
        </Text>
      </View>
      <InviteLinkCard url={invite?.url} failed={failed} name={user?.name} photo={user?.image} />
      <View style={styles.emptyActions}>
        <Button label="Share my link" icon="share" onPress={() => void share()} disabled={!invite} />
        <Button kind="tertiary" muted icon="qr-code" label="Show my QR code" onPress={() => router.push({ pathname: '/friends/add', params: { side: 'qr' } })} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  flex: { flex: 1 },
  list: { paddingHorizontal: SPACE.gutter, paddingVertical: SPACE.sm },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  emptyTop: { flexGrow: 1, paddingHorizontal: SPACE.gutter },
  // The frame's column: the request card and Make a crew stand 8 apart, and the first friend 8 under them.
  rows: { gap: SPACE.sm, paddingBottom: SPACE.sm, paddingHorizontal: 0 },
  search: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.sm },
  head: { justifyContent: 'center', backgroundColor: COLOR.ink },
  headFixed: { height: SECTION_HEAD },
  headGrows: { minHeight: SECTION_HEAD, paddingVertical: SPACE.sm },
  headText: { color: COLOR.textSecondary },
  offline: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xs, paddingBottom: SPACE.sm },
  // design-exception: the board's index sits 4 in from the right edge (fr.css `.frscrub`).
  scrubber: { position: 'absolute', right: 4, top: SPACE.md },
  // design-exception: Flow 7 1b-A (fr.js `emptyA`): 40 above the words, the card 24 under them, the buttons 16 under it.
  empty: { paddingTop: 40, gap: SPACE.xl },
  emptyWords: { gap: SPACE.sm },
  emptyTitle: { color: COLOR.textPrimary },
  emptyActions: { gap: SPACE.sm },
  centre: { textAlign: 'center' },
  muted: { color: COLOR.textSecondary },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function FriendsScreen() {
  return (
    <HueProvider value="rose">
      <FriendsScreenContent />
    </HueProvider>
  )
}
