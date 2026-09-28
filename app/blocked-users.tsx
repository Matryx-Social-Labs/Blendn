import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppHeader } from '../components/AppHeader'
import { PersonRow } from '../components/friends/PersonRow'
import { LoadError, LoadState } from '../components/LoadError'
import { SkeletonCircle, SkeletonLine } from '../components/Skeleton'
import { Text } from '../components/ui/Text'
import { apiClient } from '../lib/apiClient'
import { Logger } from '../lib/logger'
import { getReportTypeLabel, unblockUser, type BlockedUser, type ReportType } from '../lib/safetyUtils'
import { showSheet } from '../lib/sheet'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, SPACE } from '../lib/theme'

/** The reasons `getReportTypeLabel` can name; anything else is not shown. */
const KNOWN_REASONS = new Set<string>([
  'inappropriate_messages',
  'fake_profile',
  'harassment',
  'spam',
  'inappropriate_photos',
  'inappropriate_content',
  'hate_speech',
  'other',
])

/**
 * "Blocked Sep 12 · Harassment".
 *
 * The reason is the report's label, never the raw enum ("Reason:
 * inappropriate_messages"), and is left out when it is not one of them.
 */
function blockedDetail(user: Pick<BlockedUser, 'blocked_at' | 'reason'>, now = new Date()): string {
  const at = new Date(user.blocked_at)
  const when = Number.isNaN(at.getTime())
    ? null
    : at.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: at.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      })
  const reason = user.reason && KNOWN_REASONS.has(user.reason) ? getReportTypeLabel(user.reason as ReportType) : null
  return [when ? `Blocked ${when}` : 'Blocked', reason].filter(Boolean).join(' · ')
}

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
    return (
      <PersonRow
        person={{ userId: item.blocked_id, name, photo: item.blocked_user_photo }}
        detail={blockedDetail(item)}
        trailing={
          <Pressable
            onPress={() => handleUnblock(item)}
            accessibilityRole="button"
            accessibilityLabel={`Unblock ${name}`}
            hitSlop={SPACE.sm}
            style={({ pressed }) => [styles.unblock, pressed && styles.pressed]}
          >
            <Text variant="button" numberOfLines={1} maxFontSizeMultiplier={1.3}>Unblock</Text>
          </Pressable>
        }
      />
    )
  }

  const renderEmptyState = () =>
    failed ? (
      <LoadError title="Blocked users didn't load" onRetry={() => void onRefresh()} retrying={refreshing} />
    ) : (
      <LoadState
        icon="shield-checkmark-outline"
        title="No blocked users"
        message="People you block show up here, and you can unblock them any time."
      />
    )

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Blocked users" onBack={() => router.back()} />

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
          contentContainerStyle={blockedUsers.length === 0 ? styles.emptyList : styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  listContent: { paddingHorizontal: GUTTER, paddingVertical: SPACE.sm },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: GUTTER },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md },
  skeletonText: { flex: 1, gap: SPACE.sm },
  unblock: {
    height: CONTROL.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
})
