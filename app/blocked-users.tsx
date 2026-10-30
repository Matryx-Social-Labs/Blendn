import { router } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '../components/ds/Button'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { PersonRow } from '../components/friends/PersonRow'
import { SkeletonCircle, SkeletonLine } from '../components/Skeleton'
import { COLOR, SIZE, SPACE, MAX_FONT_SCALE } from '../lib/design/tokens'
import { Logger } from '../lib/logger'
import { blockedLine } from '../lib/blockedLine'
import { fetchBlockedPage } from '../lib/blockedUsersPage'
import { unblockUser, type BlockedUser } from '../lib/safetyUtils'
import { showSheet } from '../lib/sheet'
import { useTopBarState } from '../lib/useTopBarState'

/** Empty pages with a cursor after them, followed on in one go before the foot waits for the next end-reach. */
const MAX_EMPTY_HOPS = 5

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
 * cursors yet answers everyone at once, which is one page with no next.
 */
function BlockedUsersContent() {
  const bold = useBoldText()
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const bar = useTopBarState()
  const insets = useSafeAreaInsets()
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
  const loadBlockedUsers = () => {
    const mine = ++read.current
    return fetchBlockedPage()
      .then((result) => {
        if (read.current !== mine) return
        if (result.ok) {
          setBlockedUsers(result.page.users)
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
        const result = await fetchBlockedPage(cursor)
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
  }, [nextCursor, loadingMore, moreFailed])
  const onEndReached = useCallback(() => loadMore(), [loadMore])

  useEffect(() => {
    loadBlockedUsers()
  }, [])

  const handleUnblock = (user: BlockedUser) => {
    const name = user.blocked_user_name || 'this person'
    showSheet({
      kind: 'actions',
      hue: 'violet',
      title: `Unblock ${name}?`,
      message: 'They can see your profile again. A conversation you ended stays closed. They are not told.',
      actions: [
        {
          label: 'Unblock',
          variant: 'destructive',
          run: async () => {
            const result = await unblockUser(user.blocked_id)
            if (!result.success) return { ok: false, error: "Couldn’t unblock them. Try again." }
            setBlockedUsers((prev) => prev.filter((u) => u.blocked_id !== user.blocked_id))
            return { ok: true, toast: user.blocked_user_name ? `${user.blocked_user_name} is unblocked` : 'Unblocked' }
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
    const name = item.blocked_user_name || 'Someone'
    const line = blockedLine(item)
    return (
      <PersonRow
        // A blocked person is a creature mark, never their face (E10, flow-6 blocked): the server sends no photo, and none is drawn if one slips through.
        person={{ userId: item.blocked_id, name, photo: null }}
        detail={line.detail}
        detailMono={line.mono}
        detailTail={line.tail}
        trailing={
          <Button kind="secondary" size="sm" label="Unblock" accessibilityLabel={`Unblock ${name}`} onPress={() => handleUnblock(item)} style={styles.centred} />
        }
      />
    )
  }

  const renderEmptyState = () =>
    failed ? (
      <StateScreen
        icon="cloud-off"
        title="Blocked users didn’t load"
        body="Check your connection and try again."
        actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
      />
    ) : (
      <StateScreen
        testID="blocked-empty"
        icon="shield-check"
        title="No blocked users"
        body="People you block show up here, and you can unblock them any time."
      />
    )

  /** The foot of a long list: the next page on its way, or the one that did not come. */
  const footer = loadingMore ? (
    <View style={styles.skeletonRow} accessibilityLabel="Loading more">
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
      <TopBar title="Blocked users" state={bar.state} onBack={() => router.back()} />

      {loading ? (
        <View style={styles.listContent} accessibilityLabel="Loading">
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
        <FlatList
          testID="blocked-users-list"
          data={blockedUsers}
          keyExtractor={(item) => item.blocked_id}
          renderItem={renderBlockedUser}
          // The foot is the list's own padding: a wrapper that insets the screen cuts the scroll on a line above the home indicator.
          contentContainerStyle={[blockedUsers.length === 0 ? styles.emptyList : styles.listContent, { paddingBottom: insets.bottom + SPACE.xl }]}
          ListEmptyComponent={renderEmptyState}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={footer}
          initialNumToRender={14}
          windowSize={7}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
          showsVerticalScrollIndicator={false}
          {...bar.scrollProps}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  centred: { alignSelf: 'center' },
  container: { flex: 1, backgroundColor: COLOR.ink },
  listContent: { paddingHorizontal: SPACE.gutter, paddingVertical: SPACE.sm },
  // Top-aligned, as Muted rooms' (D-L11): one empty state, one placement.
  emptyList: { flexGrow: 1, paddingHorizontal: SPACE.gutter },
  moreFailed: { alignItems: 'center', paddingVertical: SPACE.lg },
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
