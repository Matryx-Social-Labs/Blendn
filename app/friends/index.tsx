import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import { PersonRow } from '../../components/friends/PersonRow'
import { RequestsRow } from '../../components/friends/RequestsRow'
import { LoadError } from '../../components/LoadError'
import { EmberButton } from '../../components/onboarding/EmberControls'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import { friendsSinceLabel, type Friend } from '../../lib/friends'
import { EMBER, GUTTER, ICON, SPACE } from '../../lib/theme'
import { useFriendRequests } from '../../lib/useFriendRequests'

/**
 * Your friends — the list the count on the Me tab opens.
 *
 * Real names and photos: both people said yes. Tapping one opens their
 * profile; the top-right opens Add friends, which is where your link is.
 * Requests waiting on you sit above the list, when there are any.
 */
export default function FriendsScreen() {
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const requests = useFriendRequests()

  const load = useCallback(async () => {
    const result = await apiClient.getFriends()
    if (result.success && result.data) {
      setFriends(result.data.friends)
      setFailed(false)
    } else {
      setFailed(true)
    }
  }, [])

  // On focus: coming back from a profile you just unfriended should not show them.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([load(), requests.load()])
    setRefreshing(false)
  }

  const openAdd = () => router.push('/friends/add')

  const empty = failed ? (
    <LoadError title="Your friends didn't load" onRetry={() => void onRefresh()} retrying={refreshing} />
  ) : (
    <View style={styles.empty}>
      <Ionicons name="people-outline" size={ICON.lg} color={EMBER.textTertiary} />
      <Text variant="title" style={styles.center}>No friends yet</Text>
      <Text variant="body" color={EMBER.textSecondary} style={styles.center}>
        Nobody can find you by searching. Share your link with the people you want here.
      </Text>
      <EmberButton label="Add friends" onPress={openAdd} />
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader
        title="Friends"
        onBack={() => router.back()}
        rightIconButton={{ name: 'person-add-outline', onPress: openAdd, accessibilityLabel: 'Add friends' }}
      />
      {requests.incoming.length > 0 ? (
        <View style={styles.requests}>
          <RequestsRow count={requests.incoming.length} />
        </View>
      ) : null}
      {friends === null && !failed ? (
        <View style={styles.loading}>
          <ActivityIndicator color={EMBER.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={friends ?? []}
          keyExtractor={(f) => f.userId}
          renderItem={({ item }) => (
            <PersonRow
              person={item}
              detail={friendsSinceLabel(item.since)}
              onPress={() => router.push({ pathname: '/friends/[userId]', params: { userId: item.userId } })}
              trailing={<Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textSecondary} />}
            />
          )}
          contentContainerStyle={friends?.length ? styles.list : styles.emptyList}
          ListEmptyComponent={empty}
          onRefresh={onRefresh}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: GUTTER, paddingVertical: SPACE.sm },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: GUTTER },
  requests: { paddingHorizontal: GUTTER, paddingBottom: SPACE.sm },
  empty: { alignItems: 'center', gap: SPACE.lg },
  center: { textAlign: 'center' },
})
