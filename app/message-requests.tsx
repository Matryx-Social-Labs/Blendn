import { router } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, LinearTransition } from 'react-native-reanimated'

import { InviteRow, RequestRow } from '../components/banter/RequestRow'
import { PageFooter } from '../components/chat/PageFooter'
import { Button } from '../components/ds/Button'
import { HueProvider } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { COLOR, DURATION, EASING, SPACE } from '../lib/design/tokens'
import { useReducedMotion } from '../lib/motion'
import { useBanterInbox, type MessageRequest } from '../lib/useBanterInbox'
import type { CrewInvite } from '../lib/crews'
import { useCrewInbox } from '../lib/useCrewInbox'
import { useToast } from '../components/Toast'
import { useTopBarOverlay } from '../lib/useTopBarState'

/**
 * Every message request waiting on you and every crew invite (the Banter's Requests row leads here; SCRUM-760). The answers
 * live here, a page at a time as the end comes near by `loadMoreRequests`,
 * windowed. Of the Banter's chats, nothing loads here (`requestsOnly`).
 */
const REQUEST_REFLOW = LinearTransition.duration(DURATION.base).easing(Easing.bezier(...EASING.standard))

type Waiting = { kind: 'invite'; invite: CrewInvite } | { kind: 'request'; request: MessageRequest }

function RequestsScreen() {
  const inbox = useBanterInbox({ requestsOnly: true })
  const bar = useTopBarOverlay()
  const { incomingRequests, requestsTotal } = inbox
  const total = Math.max(requestsTotal ?? 0, incomingRequests.length)
  const more = total > incomingRequests.length

  const { showToast } = useToast()
  const crews = useCrewInbox(useCallback((text: string) => showToast(text, 'error', { haptic: 'error' }), [showToast]), { withBlends: false })
  const invites = crews.invites
  const waiting = total + Math.max(crews.invitesTotal, invites.length)
  const reduceMotion = useReducedMotion()
  // Either read failing means what is drawn may not be all of it: never "nothing waiting".
  const failed = inbox.requestsFailed || crews.failed
  const retry = () => {
    void crews.reload()
    void inbox.loadChats(true, true)
  }
  // Invites are drawn first, so they page first.
  const loadMore = () => {
    if (crews.invitesCursor) void crews.moreInvites()
    else if (more && !inbox.requestsLoadingMore) void inbox.loadMoreRequests()
  }

  // One windowed list: an account can hold dozens of invites, as many as it holds requests.
  const data = useMemo<Waiting[]>(
    () => [...invites.map((invite) => ({ kind: 'invite' as const, invite })), ...incomingRequests.map((request) => ({ kind: 'request' as const, request }))],
    [invites, incomingRequests]
  )
  const { decline } = crews
  const renderItem = useCallback(
    ({ item }: { item: Waiting }) => (item.kind === 'invite' ? <InviteRow invite={item.invite} onDecline={decline} /> : <RequestRow request={item.request} inbox={inbox} />),
    [decline, inbox]
  )

  return (
    <View style={styles.screen}>
      <Animated.FlatList
        testID="requests-list"
        data={data}
        keyExtractor={(w) => (w.kind === 'invite' ? `i:${w.invite.crewId}` : w.request.request_id)}
        renderItem={renderItem}
        ItemSeparatorComponent={Gap}
        itemLayoutAnimation={reduceMotion ? undefined : REQUEST_REFLOW}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        initialNumToRender={8}
        windowSize={9}
        ListEmptyComponent={
          inbox.loading || !crews.loaded ? null : failed ? (
            <StateScreen
              icon="cloud-off"
              title="Couldn’t load your requests"
              body="Check your connection and try again."
              actions={[{ label: 'Try again', onPress: retry }]}
              testID="requests-failed"
            />
          ) : (
            <StateScreen icon="message-circle" title="No requests waiting" body="Somebody asking to message you shows up here." testID="requests-empty" />
          )
        }
        ListFooterComponent={
          failed && data.length ? (
            <PageFooter loading={false} failed onRetry={retry} what="requests" testID="requests-failed" />
          ) : more || crews.invitesCursor ? (
            <View style={styles.footer}>
              <Button kind="tertiary" size="sm" label="Show more requests" loading={inbox.requestsLoadingMore} onPress={loadMore} testID="requests-more" />
            </View>
          ) : null
        }
        contentContainerStyle={[styles.content, { paddingTop: bar.contentTop }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        {...bar.scrollProps}
      />
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="Requests" sub={waiting ? `${waiting} waiting` : undefined} state={bar.state} onBack={() => router.back()} testID="requests-top" />
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
