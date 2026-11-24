import { router } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '../components/ds/Button'
import { SearchField } from '../components/ds/SearchField'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { PersonRow } from '../components/friends/PersonRow'
import { SectionHeader } from '../components/ds/SectionHeader'
import { BlockedCrews } from '../components/settings/BlockedCrews'
import { SkeletonCircle, SkeletonLine } from '../components/Skeleton'
import { COLOR, SIZE, SPACE, MAX_FONT_SCALE } from '../lib/design/tokens'
import { Logger } from '../lib/logger'
import { blockedLine, blockedName } from '../lib/blockedLine'
import { BLOCKED_SEARCH_FROM, BLOCKED_SEARCH_MAX, blockedCountLine, fetchBlockedPage } from '../lib/blockedUsersPage'
import { unblockUser, type BlockedUser } from '../lib/safetyUtils'
import { showSheet } from '../lib/sheet'
import { useTopBarState } from '../lib/useTopBarState'
import { emptyAfterRowOut, rowOut, rowReflow } from '../components/motion/presence'
import { useReducedMotion } from '../lib/motion'
import { useSkeletonCrossfade } from '../components/motion/useSkeletonCrossfade'

/** Empty pages with a cursor after them, followed on in one go before the foot waits for the next end-reach. */
const MAX_EMPTY_HOPS = 5
/** A search asks the server once typing pauses this long. */
const SEARCH_DEBOUNCE_MS = 300

/**
 * The people you blocked, and a way to undo each.
 *
 * Drawn with the friends surfaces' row (`PersonRow`): a blocked person is a
 * person, and this list looked like a settings form with a 50pt avatar, a
 * hairline under every row and "Reason: harassment" in italics. Unblock asks
 * in the app's sheet, as blocking did, and says it happened in a toast.
 *
 * Read a page at a time (`fetchBlockedPage`) and drawn by a FlatList that mounts only the rows near the screen, so a
 * long list costs the same as a short one. The next page is asked for as the end comes into view; a server that has no
 * cursors yet answers everyone at once, which is one page with no next. A search is the server's (`?q=`), paged the same
 * way, so a name further back than anything loaded is still found; the count is the server's total.
 */
function BlockedUsersContent() {
  const bold = useBoldText()
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [loading, setLoading] = useState(true)
  const arrive = useSkeletonCrossfade(loading)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [query, setQuery] = useState('')
  /** The search the list on screen answers: `query` once typing pauses. */
  const [searched, setSearched] = useState('')
  /** The server's count: of everybody (for the Search placeholder), and of what the search found. */
  const [total, setTotal] = useState(0)
  const [found, setFound] = useState(0)
  /** The crews you blocked (advisor B-A): their group goes first; with any, People gets its own heading and no empty state. */
  const [crewCount, setCrewCount] = useState(0)
  const bar = useTopBarState()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  /** The read in force: a refresh or a page that lands after a newer read began is dropped. */
  const read = useRef(0)

  /*
   * The page's own read, not `getBlockedUsers` from safetyUtils: that one
   * answers a failure with `[]`, which drew "No blocked users" for somebody
   * who had blocked people and was simply offline — the one list where
   * "nobody" is the wrong thing to be told by mistake.
   *
   * State is set only in the callbacks, once the request has settled.
   */
  const loadBlockedUsers = (search = searched) => {
    const mine = ++read.current
    return fetchBlockedPage(null, search)
      .then((result) => {
        if (read.current !== mine) return
        if (result.ok) {
          setBlockedUsers(result.page.users)
          if (search.trim()) setFound(result.page.total)
          else setTotal(result.page.total)
          setNextCursor(result.page.nextCursor)
          setLoadingMore(false)
          setMoreFailed(false)
          setFailed(false)
        } else {
          Logger.warn('profile', 'Could not load blocked users', { error: result.error })
          setFailed(true)
        }
      })
      .catch((error) => {
        if (read.current !== mine) return
        Logger.error('profile', 'Error loading blocked users', { error })
        setFailed(true)
      })
      .finally(() => {
        if (read.current === mine) setLoading(false)
      })
  }

  /**
   * The next page, once. A failure keeps what is on screen and offers Try again at the foot. An empty page with a
   * cursor after it (a server that filters after it pages) is followed on at once, a few times, so the foot does not
   * stall on an empty page.
   */
  const loadMore = useCallback((retry = false) => {
    if (!nextCursor || loadingMore || (moreFailed && !retry)) return
    setMoreFailed(false)
    const mine = read.current
    setLoadingMore(true)
    const run = async () => {
      let cursor: string | null = nextCursor
      for (let hops = 0; cursor && hops < MAX_EMPTY_HOPS; hops += 1) {
        const result = await fetchBlockedPage(cursor, searched)
        if (read.current !== mine) return
        if (!result.ok) return setMoreFailed(true)
        setBlockedUsers((prev) => {
          const have = new Set(prev.map((u) => u.blocked_id))
          return [...prev, ...result.page.users.filter((u) => !have.has(u.blocked_id))]
        })
        setNextCursor(result.page.nextCursor)
        if (result.page.users.length > 0) return
        cursor = result.page.nextCursor
      }
    }
    // Unconditionally: a refresh that superseded this read must not leave the foot spinning (it also clears it itself).
    run()
      .catch(() => {
        if (read.current === mine) setMoreFailed(true)
      })
      .finally(() => setLoadingMore(false))
  }, [nextCursor, loadingMore, moreFailed, searched])
  const onEndReached = useCallback(() => loadMore(), [loadMore])

  useEffect(() => {
    const next = query.trim()
    if (next === searched) return
    const timer = setTimeout(() => setSearched(next), next ? SEARCH_DEBOUNCE_MS : 0)
    return () => clearTimeout(timer)
  }, [query, searched])

  // The first read, and again for every search (the rows on screen stay until the answer lands).
  useEffect(() => {
    loadBlockedUsers(searched)
  }, [searched])

  const handleUnblock = (user: BlockedUser) => {
    const known = blockedName(user)
    const name = known === 'Someone' ? 'this person' : known
    showSheet({
      kind: 'actions',
      hue: 'violet',
      title: `Unblock ${name}?`,
      message: 'They can see your profile again. A conversation you ended stays closed. They are not told.',
      actions: [
        {
          label: 'Unblock',
          // Neutral, as the board's button language has it: unblocking gives access back; red is for Delete only.
          variant: 'secondary',
          run: async () => {
            const result = await unblockUser(user.blocked_id)
            if (!result.success) return { ok: false, error: "Couldn’t unblock them. Try again." }
            setBlockedUsers((prev) => prev.filter((u) => u.blocked_id !== user.blocked_id))
            setTotal((n) => Math.max(0, n - 1))
            return { ok: true, toast: known === 'Someone' ? 'Unblocked' : `${known} is unblocked` }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadBlockedUsers()
    setRefreshing(false)
  }

  const renderBlockedUser = ({ item }: { item: BlockedUser }) => {
    const name = blockedName(item)
    const line = blockedLine(item)
    return (
      // Unblocked, the row fades and the rest close the gap (DS #16, audit M13).
      <Animated.View exiting={reduceMotion ? undefined : rowOut}>
        <PersonRow
          // A blocked person is a creature mark, never their face (E10, flow-6 blocked): the server sends no photo, and none is drawn if one slips through.
          person={{ userId: item.blocked_id, name, photo: null }}
          named={false}
          detail={line.detail}
          detailMono={line.mono}
          detailTail={line.tail}
          trailing={
            <Button kind="secondary" size="sm" label="Unblock" accessibilityLabel={`Unblock ${name}`} onPress={() => handleUnblock(item)} style={styles.centred} />
          }
        />
      </Animated.View>
    )
  }

  const renderEmptyState = () =>
    failed ? (
      <StateScreen
        icon="cloud-off"
        title="Blocked didn’t load"
        body="Check your connection and try again."
        actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
      />
    ) : (
      searched ? (
        <StateScreen testID="blocked-no-match" icon="search" title={`Nobody called “${searched}”`} body="Search by the name you saw them as, or where you blocked them." />
      ) : (
        <StateScreen
          testID="blocked-empty"
          icon="ban"
          title="Nobody blocked"
          body="Block someone from their profile or a chat. They aren’t told, and you can unblock here any time."
        />
      )
    )

  /** The foot of a long list: the next page on its way, or the one that did not come. */
  const footer = loadingMore ? (
    <View accessible style={styles.skeletonRow} accessibilityLabel="Loading more">
      <SkeletonCircle width={SIZE.control} />
      <View style={styles.skeletonText}>
        <SkeletonLine width="45%" />
        <SkeletonLine width="30%" />
      </View>
    </View>
  ) : moreFailed ? (
    <View style={styles.moreFailed}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.moreFailedText]}>The rest didn’t load.</Text>
      <Button kind="tertiary" size="sm" label="Try again" onPress={() => loadMore(true)} />
    </View>
  ) : null

  return (
    <View style={styles.container}>
      <TopBar title="Blocked" state={bar.state} onBack={() => router.back()} />

      {loading ? (
        <View accessible style={styles.listContent} accessibilityLabel="Loading">
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <SkeletonCircle width={SIZE.control} />
              <View style={styles.skeletonText}>
                <SkeletonLine width="45%" />
                <SkeletonLine width="30%" />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Animated.View entering={arrive} style={styles.fill}>
        <Animated.FlatList
          testID="blocked-users-list"
          itemLayoutAnimation={reduceMotion ? undefined : rowReflow}
          data={blockedUsers}
          ListHeaderComponent={
            <View style={styles.head}>
              {total > 0 || crewCount > 0 ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.lede]}>
                  They can’t see you or message you. They aren’t told.
                </Text>
              ) : null}
              {searched ? null : <BlockedCrews onCount={setCrewCount} />}
              {crewCount > 0 && total > 0 ? <SectionHeader title="People" count={total} /> : null}
              {total > BLOCKED_SEARCH_FROM ? (
                <SearchField
                  value={query}
                  onChangeText={(text) => setQuery(text.slice(0, BLOCKED_SEARCH_MAX))}
                  placeholder={`Search ${blockedCountLine(total)}`}
                  resultsLabel={searched ? `${found.toLocaleString('en-US')} found` : undefined}
                  testID="blocked-search"
                />
              ) : null}
            </View>
          }
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.blocked_id}
          renderItem={renderBlockedUser}
          // The foot is the list's own padding: a wrapper that insets the screen cuts the scroll on a line above the home indicator.
          contentContainerStyle={[blockedUsers.length === 0 && crewCount === 0 ? styles.emptyList : styles.listContent, { paddingBottom: insets.bottom + SPACE.xl }]}
          // After the last unblock it waits for the row's fade (emptyAfterRowOut).
          ListEmptyComponent={
            // With crews blocked and nobody else, the People group is simply not there (B-A: an empty group is hidden).
            crewCount > 0 && !searched && !failed ? null : <Animated.View entering={reduceMotion ? undefined : emptyAfterRowOut}>{renderEmptyState()}</Animated.View>
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={footer}
          initialNumToRender={14}
          windowSize={7}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
          showsVerticalScrollIndicator={false}
          {...bar.scrollProps}
        />
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  centred: { alignSelf: 'center' },
  container: { flex: 1, backgroundColor: COLOR.ink },
  fill: { flex: 1 },
  listContent: { paddingHorizontal: SPACE.gutter, paddingVertical: SPACE.sm },
  // Top-aligned, as Muted rooms' (D-L11): one empty state, one placement.
  emptyList: { flexGrow: 1, paddingHorizontal: SPACE.gutter },
  moreFailed: { alignItems: 'center', paddingVertical: SPACE.lg },
  head: { gap: SPACE.md, paddingBottom: SPACE.sm },
  lede: { color: COLOR.textSecondary },
  moreFailedText: { color: COLOR.textTertiary },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md },
  skeletonText: { flex: 1, gap: SPACE.sm },
})

/** Violet world: one hue on this screen (`HueProvider`), as Settings, which it opens from. */
export default function BlockedUsers() {
  return (
    <HueProvider value="violet">
      <BlockedUsersContent />
    </HueProvider>
  )
}
