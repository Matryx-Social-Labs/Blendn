import { router } from 'expo-router'
import { useCallback } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'

import { RequestRow } from '../components/banter/RequestRow'
import { Button } from '../components/ds/Button'
import { HueProvider } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { COLOR, SPACE } from '../lib/design/tokens'
import { useBanterInbox, type MessageRequest } from '../lib/useBanterInbox'
import { useTopBarOverlay } from '../lib/useTopBarState'

/**
 * Every message request waiting on you (SCRUM-760: the Banter's Requests strip keeps three and says the true count; this is
 * "See all"). The same cards and answers as the strip, a page at a time as the end comes near by `loadMoreRequests`,
 * windowed. Nothing else of the Banter loads here (`requestsOnly`).
 */
function RequestsScreen() {
  const inbox = useBanterInbox({ requestsOnly: true })
  const bar = useTopBarOverlay()
  const { incomingRequests, requestsTotal } = inbox
  const total = Math.max(requestsTotal ?? 0, incomingRequests.length)
  const more = total > incomingRequests.length

  const renderItem = useCallback(({ item }: { item: MessageRequest }) => <RequestRow request={item} inbox={inbox} />, [inbox])

  return (
    <View style={styles.screen}>
      <FlatList
        testID="requests-list"
        data={incomingRequests}
        keyExtractor={(r) => r.request_id}
        renderItem={renderItem}
        ItemSeparatorComponent={Gap}
        onEndReached={() => {
          if (more && !inbox.requestsLoadingMore) void inbox.loadMoreRequests()
        }}
        onEndReachedThreshold={1.5}
        initialNumToRender={8}
        windowSize={9}
        ListEmptyComponent={
          inbox.loading ? null : (
            <StateScreen icon="message-circle" title="No requests waiting" body="Somebody asking to message you shows up here." testID="requests-empty" />
          )
        }
        ListFooterComponent={
          more ? (
            <View style={styles.footer}>
              <Button kind="tertiary" size="sm" label="Show more requests" loading={inbox.requestsLoadingMore} onPress={() => void inbox.loadMoreRequests()} testID="requests-more" />
            </View>
          ) : null
        }
        contentContainerStyle={[styles.content, { paddingTop: bar.contentTop }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        {...bar.scrollProps}
      />
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="Requests" sub={total ? `${total} waiting` : undefined} state={bar.state} onBack={() => router.back()} testID="requests-top" />
      </View>
    </View>
  )
}

const Gap = () => <View style={styles.gap} />

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.xxl },
  gap: { height: SPACE.md },
  footer: { alignItems: 'center', paddingVertical: SPACE.lg },
})

// Rose world: requests are people asking to talk, as the Banter they come from.
export default function MessageRequests() {
  return (
    <HueProvider value="rose">
      <RequestsScreen />
    </HueProvider>
  )
}
