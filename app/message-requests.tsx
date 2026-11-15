import { router } from 'expo-router'
import { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, LinearTransition } from 'react-native-reanimated'

import { RequestRow } from '../components/banter/RequestRow'
import { PageFooter } from '../components/chat/PageFooter'
import { Button } from '../components/ds/Button'
import { HueProvider } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { COLOR, DURATION, EASING, SPACE } from '../lib/design/tokens'
import { useReducedMotion } from '../lib/motion'
import { useBanterInbox, type MessageRequest } from '../lib/useBanterInbox'
import { useTopBarOverlay } from '../lib/useTopBarState'
import { emptyAfterRowOut } from '../components/motion/presence'

/**
 * Every message request waiting on you (the Banter's Message requests row leads here; SCRUM-760). The answers live here, a
 * page at a time as the end comes near by `loadMoreRequests`, windowed. Of the Banter's chats, nothing loads here
 * (`requestsOnly`). Crew invites are not here: they are answered in Notifications and on Crews (requests placement A).
 */
const REQUEST_REFLOW = LinearTransition.duration(DURATION.base).easing(Easing.bezier(...EASING.standard))

function RequestsScreen() {
  const inbox = useBanterInbox({ requestsOnly: true })
  const bar = useTopBarOverlay()
  const { incomingRequests, requestsTotal } = inbox
  const total = Math.max(requestsTotal ?? 0, incomingRequests.length)
  const more = total > incomingRequests.length

  const reduceMotion = useReducedMotion()
  // A failed read means what is drawn may not be all of it: never "nothing waiting".
  const failed = inbox.requestsFailed
  const retry = () => void inbox.loadChats(true, true)
  const loadMore = () => {
    if (more && !inbox.requestsLoadingMore) void inbox.loadMoreRequests()
  }
  const renderItem = useCallback(({ item }: { item: MessageRequest }) => <RequestRow request={item} inbox={inbox} />, [inbox])

  return (
    <View style={styles.screen}>
      <Animated.FlatList
        testID="requests-list"
        data={incomingRequests}
        keyExtractor={(r) => r.request_id}
        renderItem={renderItem}
        ItemSeparatorComponent={Gap}
        itemLayoutAnimation={reduceMotion ? undefined : REQUEST_REFLOW}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        initialNumToRender={8}
        windowSize={9}
        ListEmptyComponent={
          inbox.loading ? null : (
            // After the last answer it waits for the row's fade (emptyAfterRowOut).
            <Animated.View entering={reduceMotion ? undefined : emptyAfterRowOut}>
              {failed ? (
                <StateScreen
                  icon="cloud-off"
                  title="Couldn’t load your requests"
                  body="Check your connection and try again."
                  actions={[{ label: 'Try again', onPress: retry }]}
                  testID="requests-failed"
                />
              ) : (
                <StateScreen icon="message-circle" title="No message requests" body="Somebody you met who asks to message you shows up here." testID="requests-empty" />
              )}
            </Animated.View>
          )
        }
        ListFooterComponent={
          failed && incomingRequests.length ? (
            <PageFooter loading={false} failed onRetry={retry} what="requests" testID="requests-failed" />
          ) : more ? (
            <View style={styles.footer}>
              <Button kind="tertiary" size="sm" label="Show more requests" loading={inbox.requestsLoadingMore} onPress={loadMore} testID="requests-more" />
            </View>
          ) : null
        }
        // Empty, the state sits in the middle of the screen, as Friend requests' does (board 04 · A).
        contentContainerStyle={[styles.content, !incomingRequests.length && styles.emptyList, { paddingTop: bar.contentTop }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        {...bar.scrollProps}
      />
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="Message requests" sub={total ? `${total} waiting` : undefined} state={bar.state} onBack={() => router.back()} testID="requests-top" />
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
  emptyList: { flexGrow: 1, justifyContent: 'center' },
})

// Rose world: requests are people asking to talk, as the Banter they come from.
export default function MessageRequests() {
  return (
    <HueProvider value="rose">
      <RequestsScreen />
    </HueProvider>
  )
}
