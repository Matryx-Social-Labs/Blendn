import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../../components/ds/Button'
import { Grain } from '../../components/ds/Grain'
import { Banner } from '../../components/ds/Banner'
import { BannerPresence } from '../../components/motion/BannerPresence'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { TopBar } from '../../components/ds/TopBar'
import { IncomingRequestRow } from '../../components/friends/IncomingRequestRow'
import { InviteLinkCard, type InviteSide } from '../../components/friends/InviteLinkCard'
import { PagedFooter } from '../../components/friends/PagedFooter'
import { PersonRow } from '../../components/friends/PersonRow'
import { COLOR, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { groupedCount } from '../../lib/friendsHere'
import { showSheet } from '../../lib/sheet'
import { useAuth } from '../../lib/useAuth'
import { useFriendInvite } from '../../lib/useFriendInvite'
import { useFriendRequests } from '../../lib/useFriendRequests'
import { useTopBarState } from '../../lib/useTopBarState'
import { rowOut, rowReflow } from '../../components/motion/presence'
import { useReducedMotion } from '../../lib/motion'

/**
 * Add friends: your link, and the requests waiting either way.
 *
 * There is no search box, on purpose. Nobody can find anyone here by name, so
 * the link is the only way in — share it where your friends already are.
 *
 * "Not now" is quiet: the request leaves your list and the person who sent it
 * is never told. Your own requests stay "Requested" whatever the other person
 * did, for the same reason.
 */
function AddFriendsScreenContent() {
  const { invite, failed, reload, share, reset } = useFriendInvite()
  const requests = useFriendRequests()
  const { incoming, outgoing, incomingTotal, outgoingPage, busy, respond, withdraw, loadMore } = requests
  const [refreshing, setRefreshing] = useState(false)
  const [reloadingLink, setReloadingLink] = useState(false)
  const bar = useTopBarState()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const { user } = useAuth()
  // Flow 7 1b-A: "Show my QR code" on the empty Friends page opens this screen on the QR side.
  const params = useLocalSearchParams<{ side?: string }>()
  const [side, setSide] = useState<InviteSide>(params.side === 'qr' ? 'qr' : 'link')

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([requests.load(), invite ? Promise.resolve() : reload()])
    setRefreshing(false)
  }

  // The link didn't load: the button that would share it asks again instead.
  const retryLink = async () => {
    setReloadingLink(true)
    await reload()
    setReloadingLink(false)
  }

  // The app's one sheet, not a system alert; a refusal stays in it with Try again.
  const confirmReset = () =>
    showSheet({
      kind: 'actions',
      hue: 'rose',
      title: 'Reset your link?',
      message: 'Your old link will stop working. People who are already your friends stay your friends.',
      actions: [
        {
          label: 'Reset link',
          variant: 'destructive',
          run: async () =>
            (await reset()) ? { ok: true, toast: 'New link ready' } : { ok: false, error: "Your link wasn’t reset. Try again." },
        },
        { label: 'Cancel', cancel: true },
      ],
    })

  return (
    <View style={styles.container}>
      <Grain />
      <TopBar title="Add friends" state={bar.state} onBack={() => router.back()} />
      <Animated.FlatList
        testID="add-friends-list"
        // A withdrawn request fades and the rest close the gap (DS #16, audit M13).
        itemLayoutAnimation={reduceMotion ? undefined : rowReflow}
        {...bar.scrollProps}
        data={outgoing}
        keyExtractor={(request) => request.id}
        renderItem={({ item: request }) => (
          <Animated.View exiting={reduceMotion ? undefined : rowOut}>
            <PersonRow
              person={request.person}
              detail="Requested"
              trailing={
                <Button
                  kind="secondary"
                  size="sm"
                  label="Withdraw"
                  accessibilityLabel={`Withdraw request to ${request.person.name}`}
                  onPress={() => void withdraw(request)}
                  disabled={busy.has(request.id)}
                  style={styles.centred}
                />
              }
            />
          </Animated.View>
        )}
        onEndReachedThreshold={1.5}
        onEndReached={() => void loadMore('outgoing')}
        initialNumToRender={8}
        windowSize={7}
        // No removeClippedSubviews: on iOS it takes a leaving row's view out from under its exit and the reflow, a one-frame cut (SCRUM-1001).
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.head}>
            {/* Flow 7 2-A: the intro on the link side; the QR side is the card alone, for somebody scanning across a table. */}
            {side === 'link' ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.lede} style={[font('lede', bold), styles.intro, styles.introGap]}>
                Nobody can find you by searching. Send your link, or let them scan.
              </Text>
            ) : null}
            <InviteLinkCard url={invite?.url} failed={failed} name={user?.name} photo={user?.image} side={side} onSide={setSide} />
            <View style={styles.shareGap}>
              {failed && !invite ? (
                <Button kind="lit" size="md" icon="rotate-ccw" label="Try again" onPress={() => void retryLink()} loading={reloadingLink} />
              ) : (
                <Button label="Share my link" icon="share" onPress={() => void share()} disabled={!invite} />
              )}
            </View>
            {invite ? <Button kind="tertiary" muted label="Reset link" onPress={confirmReset} style={styles.reset} /> : null}

            {/*
              Requests that didn't load used to leave this half of the screen
              blank — indistinguishable from having none. Said, with a way back.
            */}
            {requests.failed && !requests.loaded ? (
              <BannerPresence style={styles.section}>
                <SectionHeader title="Friend requests" />
                <Banner kind="info" text="Your requests didn’t load." action={{ label: 'Try again', onPress: () => void requests.load() }} testID="requests-failed" />
              </BannerPresence>
            ) : null}

            {/* The first few; the rest are on Friend requests, a page at a time. Never every one of them in a column. */}
            {incoming.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title="Friend requests" count={incomingTotal} />
                <View>
                  {incoming.slice(0, REQUESTS_PREVIEW).map((request) => (
                    <IncomingRequestRow
                      key={request.id}
                      request={request}
                      busy={busy.has(request.id)}
                      onRespond={(action) => void respond(request, action)}
                    />
                  ))}
                </View>
                {incomingTotal > REQUESTS_PREVIEW ? (
                  <Button
                    kind="tertiary"
                    label={`See all ${groupedCount(incomingTotal)}`}
                    accessibilityLabel={`See all ${groupedCount(incomingTotal)} friend requests`}
                    onPress={() => router.push('/friends/requests')}
                    style={styles.seeAll}
                    testID="requests-see-all"
                  />
                ) : null}
              </View>
            ) : null}

            {outgoing.length > 0 ? <SectionHeader title="Sent requests" /> : null}
          </View>
        }
        ListFooterComponent={
          <PagedFooter loading={outgoingPage.loadingMore} failed={outgoingPage.moreFailed} onRetry={() => void loadMore('outgoing')} testID="sent-more" />
        }
      />
    </View>
  )
}

/** Requests answered on this page; the rest are one row away. */
const REQUESTS_PREVIEW = 3

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.gutter, paddingVertical: SPACE.lg },
  head: { paddingBottom: SPACE.xs },
  intro: { color: COLOR.textSecondary },
  // design-exception: Flow 7 2-A's column (fr.js `addA`): intro 14 above the card, Share 14 under it, Reset 2 under Share.
  introGap: { marginBottom: 14 },
  // design-exception: Share my link 14 under the card, Reset link 2 under it (fr.js `addA`)
  shareGap: { marginTop: 14, marginBottom: 2 },
  reset: { alignSelf: 'stretch' },
  // design-exception: the requests header sits 6 under Reset link (fr.js `addA`).
  section: { marginTop: 6, gap: SPACE.sm },
  seeAll: { alignSelf: 'flex-start' },
  centred: { alignSelf: 'center' },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function AddFriendsScreen() {
  return (
    <HueProvider value="rose">
      <AddFriendsScreenContent />
    </HueProvider>
  )
}
