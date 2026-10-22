import { router } from 'expo-router'
import { useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../../components/ds/Button'
import { Grain } from '../../components/ds/Grain'
import { Orbs } from '../../components/ds/Orbs'
import { Banner } from '../../components/ds/Banner'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { TopBar } from '../../components/ds/TopBar'
import { IncomingRequestRow } from '../../components/friends/IncomingRequestRow'
import { InviteLinkCard } from '../../components/friends/InviteLinkCard'
import { PagedFooter } from '../../components/friends/PagedFooter'
import { PersonRow, PERSON_ROW_HEIGHT } from '../../components/friends/PersonRow'
import { RequestsRow } from '../../components/friends/RequestsRow'
import { SettingsGroup } from '../../components/ds/SettingsRow'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { showSheet } from '../../lib/sheet'
import { useAuth } from '../../lib/useAuth'
import { useFriendInvite } from '../../lib/useFriendInvite'
import { useFriendRequests } from '../../lib/useFriendRequests'
import { useTopBarState } from '../../lib/useTopBarState'

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
  const bold = useBoldText()
  const { user } = useAuth()

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
      <Orbs set="brand" />
      <Grain />
      <TopBar title="Add friends" state={bar.state} onBack={() => router.back()} />
      <FlatList
        testID="add-friends-list"
        {...bar.scrollProps}
        data={outgoing}
        keyExtractor={(request) => request.id}
        renderItem={({ item: request }) => (
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
        )}
        getItemLayout={(_data, index) => ({ length: PERSON_ROW_HEIGHT, offset: PERSON_ROW_HEIGHT * index, index })}
        onEndReachedThreshold={1.5}
        onEndReached={() => void loadMore('outgoing')}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.head}>
            <Text style={[font('body', bold), styles.intro]}>
              Nobody can find you on Blend’n by searching. Share your link, and anyone you send it to can ask to be your friend.
            </Text>
            <InviteLinkCard url={invite?.url} failed={failed} name={user?.name} photo={user?.image} />
            {failed && !invite ? (
              <Button kind="lit" size="md" icon="rotate-ccw" label="Try again" onPress={() => void retryLink()} loading={reloadingLink} />
            ) : (
              <Button label="Share my link" icon="share" onPress={() => void share()} disabled={!invite} />
            )}
            {invite ? <Button kind="tertiary" muted label="Reset link" onPress={confirmReset} style={styles.reset} /> : null}

            {/*
              Requests that didn't load used to leave this half of the screen
              blank — indistinguishable from having none. Said, with a way back.
            */}
            {requests.failed && !requests.loaded ? (
              <View style={styles.section}>
                <SectionHeader title="Requests" />
                <Banner kind="info" text="Your requests didn’t load." action={{ label: 'Try again', onPress: () => void requests.load() }} testID="requests-failed" />
              </View>
            ) : null}

            {/* The first few; the rest are on Requests, a page at a time. Never every one of them in a column. */}
            {incoming.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title="Requests" />
                {incoming.slice(0, REQUESTS_PREVIEW).map((request) => (
                  <IncomingRequestRow
                    key={request.id}
                    request={request}
                    busy={busy.has(request.id)}
                    onRespond={(action) => void respond(request, action)}
                  />
                ))}
                {incomingTotal > REQUESTS_PREVIEW ? (
                  <SettingsGroup>
                    <RequestsRow count={incomingTotal} />
                  </SettingsGroup>
                ) : null}
              </View>
            ) : null}

            {outgoing.length > 0 ? <SectionHeader title="Sent" /> : null}
          </View>
        }
        ListFooterComponent={
          <PagedFooter loading={outgoingPage.loadingMore} failed={outgoingPage.moreFailed} onRetry={() => void loadMore('outgoing')} testID="sent-more" />
        }
      />
    </View>
  )
}

/** Flow 6 `add`: its column sits 20 apart, between the 16 and 24 steps. */
// design-exception: the frame's column gap is 20
const COLUMN_GAP = 20

/** Requests answered on this page; the rest are one row away. */
const REQUESTS_PREVIEW = 3

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.gutter, paddingVertical: SPACE.lg },
  head: { gap: COLUMN_GAP, paddingBottom: SPACE.xs },
  intro: { color: COLOR.textSecondary },
  reset: { alignSelf: 'stretch' },
  section: { gap: SPACE.md },
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
