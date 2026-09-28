import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import { IncomingRequestRow } from '../../components/friends/IncomingRequestRow'
import { LoadError } from '../../components/LoadError'
import { Text } from '../../components/ui/Text'
import { EMBER, GUTTER, ICON, SPACE } from '../../lib/theme'
import { useFriendRequests } from '../../lib/useFriendRequests'

/**
 * People asking to be your friend — what "Requests" on the Me tab and at the
 * top of Friends opens.
 *
 * Incoming only. Your own sent requests live on Add friends beside your link,
 * where you would go to send one. Accept and Not now behave exactly as they do
 * there (`useFriendRequests`).
 */
export default function FriendRequestsScreen() {
  const { incoming, loaded, failed, load, respond, busy } = useFriendRequests()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const empty = failed ? (
    <LoadError title="Your requests didn't load" onRetry={() => void onRefresh()} retrying={refreshing} />
  ) : (
    <View style={styles.empty}>
      <Ionicons name="person-add-outline" size={ICON.lg} color={EMBER.textTertiary} />
      <Text variant="title" style={styles.center}>No requests</Text>
      <Text variant="body" color={EMBER.textSecondary} style={styles.center}>
        When somebody opens your link and asks to be your friend, they&apos;ll be here.
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Requests" onBack={() => router.back()} />
      {!loaded && !failed ? (
        <View style={styles.loading}>
          <ActivityIndicator color={EMBER.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={incoming}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <IncomingRequestRow
              request={item}
              busy={busy.has(item.id)}
              onRespond={(action) => void respond(item, action)}
            />
          )}
          contentContainerStyle={incoming.length ? styles.list : styles.emptyList}
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
  empty: { alignItems: 'center', gap: SPACE.lg },
  center: { textAlign: 'center' },
})
