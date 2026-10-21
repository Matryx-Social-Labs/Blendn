import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '../components/ds/Button'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { PersonRow } from '../components/friends/PersonRow'
import { SkeletonCircle, SkeletonLine } from '../components/Skeleton'
import { apiClient } from '../lib/apiClient'
import { Logger } from '../lib/logger'
import { blockedLine } from '../lib/blockedLine'
import { unblockUser, type BlockedUser } from '../lib/safetyUtils'
import { showSheet } from '../lib/sheet'
import { CONTROL, EMBER, GUTTER, SPACE } from '../lib/theme'
import { useTopBarState } from '../lib/useTopBarState'

/**
 * The people you blocked, and a way to undo each.
 *
 * Drawn with the friends surfaces' row (`PersonRow`): a blocked person is a
 * person, and this list looked like a settings form with a 50pt avatar, a
 * hairline under every row and "Reason: harassment" in italics. Unblock asks
 * in the app's sheet, as blocking did, and says it happened in a toast.
 */
export default function BlockedUsers() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)
  const bar = useTopBarState()
  const insets = useSafeAreaInsets()

  /*
   * The API client directly, not `getBlockedUsers` from safetyUtils: that one
   * answers a failure with `[]`, which drew "No blocked users" for somebody
   * who had blocked people and was simply offline — the one list where
   * "nobody" is the wrong thing to be told by mistake.
   *
   * State is set only in the callbacks, once the request has settled.
   */
  const loadBlockedUsers = () =>
    apiClient.getBlockedUsers()
      .then((result) => {
        if (result.success && result.data) {
          setBlockedUsers(result.data.users)
          setFailed(false)
        } else {
          Logger.warn('profile', 'Could not load blocked users', { error: result.error })
          setFailed(true)
        }
      })
      .catch((error) => {
        Logger.error('profile', 'Error loading blocked users', { error })
        setFailed(true)
      })
      .finally(() => setLoading(false))

  useEffect(() => {
    loadBlockedUsers()
  }, [])

  const handleUnblock = (user: BlockedUser) => {
    const name = user.blocked_user_name || 'this person'
    showSheet({
      kind: 'actions',
      title: `Unblock ${name}?`,
      message: 'They can see your profile and message you again. They are not told.',
      actions: [
        {
          label: 'Unblock',
          variant: 'destructive',
          run: async () => {
            const result = await unblockUser(user.blocked_id)
            if (!result.success) return { ok: false, error: "Couldn't unblock them. Try again." }
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
        person={{ userId: item.blocked_id, name, photo: item.blocked_user_photo }}
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
        title="Blocked users didn't load"
        body="Check your connection and try again."
        actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
      />
    ) : (
      <StateScreen
        icon="shield-check"
        title="No blocked users"
        body="People you block show up here, and you can unblock them any time."
      />
    )

  return (
    <View style={styles.container}>
      <TopBar title="Blocked users" state={bar.state} onBack={() => router.back()} />

      {loading ? (
        <View style={styles.listContent} accessibilityLabel="Loading">
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <SkeletonCircle width={CONTROL.md} />
              <View style={styles.skeletonText}>
                <SkeletonLine width="45%" />
                <SkeletonLine width="30%" />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={(item) => item.blocked_id}
          renderItem={renderBlockedUser}
          // The foot is the list's own padding: a wrapper that insets the screen cuts the scroll on a line above the home indicator.
          contentContainerStyle={[blockedUsers.length === 0 ? styles.emptyList : styles.listContent, { paddingBottom: insets.bottom + SPACE.xl }]}
          ListEmptyComponent={renderEmptyState}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />}
          showsVerticalScrollIndicator={false}
          {...bar.scrollProps}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  centred: { alignSelf: 'center' },
  container: { flex: 1, backgroundColor: EMBER.bg },
  listContent: { paddingHorizontal: GUTTER, paddingVertical: SPACE.sm },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: GUTTER },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md },
  skeletonText: { flex: 1, gap: SPACE.sm },
})
