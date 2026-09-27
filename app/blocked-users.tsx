import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppHeader } from '../components/AppHeader'
import { Logger } from '../lib/logger'
import { getBlockedUsers, unblockUser, type BlockedUser } from '../lib/safetyUtils'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, SPACE, TYPE } from '../lib/theme'

export default function BlockedUsers() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // State is set only in the callbacks, once the request has settled.
  const loadBlockedUsers = () =>
    getBlockedUsers()
      .then(setBlockedUsers)
      .catch((error) => {
        Logger.error('profile', 'Error loading blocked users', { error })
        Alert.alert('Error', 'Failed to load blocked users')
      })
      .finally(() => setLoading(false))

  useEffect(() => {
    loadBlockedUsers()
  }, [])

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      'Unblock User',
      `Are you sure you want to unblock ${user.blocked_user_name || 'this user'}? They will be able to see your profile again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            const result = await unblockUser(user.blocked_id)
            Alert.alert(
              result.success ? 'Success' : 'Error',
              result.message
            )
            if (result.success) {
              // Remove from list
              setBlockedUsers(prev => prev.filter(u => u.blocked_id !== user.blocked_id))
            }
          }
        }
      ]
    )
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadBlockedUsers()
    setRefreshing(false)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString()
  }

  const renderBlockedUser = ({ item }: { item: BlockedUser }) => (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        <View style={styles.avatarContainer}>
          {item.blocked_user_photo ? (
            <Image 
              source={{ uri: item.blocked_user_photo }} 
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {(item.blocked_user_name?.[0] || '?').toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{item.blocked_user_name || 'Unknown user'}</Text>
          <Text style={styles.blockDate}>Blocked on {formatDate(item.blocked_at)}</Text>
          {item.reason && (
            <Text style={styles.blockReason}>Reason: {item.reason}</Text>
          )}
        </View>
      </View>
      
      <TouchableOpacity
        style={styles.unblockButton}
        onPress={() => handleUnblock(item)}
      >
        <Text style={styles.unblockButtonText}>Unblock</Text>
      </TouchableOpacity>
    </View>
  )

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="shield-checkmark-outline" size={64} color={EMBER.textTertiary} />
      <Text style={styles.emptyTitle}>No Blocked Users</Text>
      <Text style={styles.emptyText}>
        You haven&apos;t blocked anyone yet. Users you block will appear here.
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Blocked Users" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={EMBER.textSecondary} />
          <Text style={styles.loadingText}>Loading blocked users...</Text>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={(item) => item.blocked_id}
          renderItem={renderBlockedUser}
          style={styles.list}
          contentContainerStyle={blockedUsers.length === 0 ? styles.emptyList : styles.listContent}
          ListEmptyComponent={renderEmptyState}
          onRefresh={onRefresh}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...TYPE.body,
    marginTop: SPACE.lg,
    color: EMBER.textSecondary,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: SPACE.lg,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: GUTTER,
  },
  emptyTitle: {
    ...TYPE.title,
    marginTop: SPACE.lg,
    marginBottom: SPACE.sm,
  },
  emptyText: {
    ...TYPE.body,
    color: EMBER.textSecondary,
    textAlign: 'center',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingVertical: SPACE.lg,
    borderBottomWidth: 1,
    borderBottomColor: EMBER.separator,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    marginRight: SPACE.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: EMBER_RADIUS.pill,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...TYPE.heading,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    ...TYPE.bodyStrong,
    marginBottom: SPACE.xs,
  },
  blockDate: {
    ...TYPE.meta,
    marginBottom: SPACE.xxs,
  },
  blockReason: {
    ...TYPE.meta,
    color: EMBER.textTertiary,
    fontStyle: 'italic',
  },
  unblockButton: {
    backgroundColor: EMBER.surface,
    height: CONTROL.md,
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
    borderRadius: CONTROL.md / 2,
  },
  unblockButtonText: {
    ...TYPE.button,
  },
}) 
