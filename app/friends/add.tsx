import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import { IncomingRequestRow } from '../../components/friends/IncomingRequestRow'
import { InviteLinkCard } from '../../components/friends/InviteLinkCard'
import { PersonRow } from '../../components/friends/PersonRow'
import ScalePress from '../../components/motion/ScalePress'
import { EmberButton } from '../../components/onboarding/EmberControls'
import { ProfileHeading } from '../../components/profile/ProfileSections'
import { useToast } from '../../components/Toast'
import { Text } from '../../components/ui/Text'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, SPACE } from '../../lib/theme'
import { useFriendInvite } from '../../lib/useFriendInvite'
import { useFriendRequests } from '../../lib/useFriendRequests'

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
export default function AddFriendsScreen() {
  const { invite, failed, reload, share, reset } = useFriendInvite()
  const { showToast } = useToast()
  const requests = useFriendRequests()
  const { incoming, outgoing, busy, respond, withdraw } = requests
  const [refreshing, setRefreshing] = useState(false)
  const [reloadingLink, setReloadingLink] = useState(false)

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

  const confirmReset = () =>
    Alert.alert(
      'Reset your link?',
      'Your old link will stop working. People who are already your friends stay your friends.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset link',
          style: 'destructive',
          onPress: async () => {
            if (await reset()) showToast('New link ready', 'success')
            else showToast("Your link wasn't reset. Try again.", 'error')
          },
        },
      ]
    )

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Add friends" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text variant="body" color={EMBER.textSecondary}>
            Nobody can find you on Blend&apos;n by searching. Share your link, and anyone you send it to can ask to be
            your friend.
          </Text>
          <InviteLinkCard url={invite?.url} failed={failed} />
          {failed && !invite ? (
            <EmberButton label="Try again" onPress={() => void retryLink()} busy={reloadingLink} />
          ) : (
            <EmberButton label="Share my link" onPress={() => void share()} disabled={!invite} />
          )}
          {invite ? (
            <ScalePress
              onPress={confirmReset}
              haptic={false}
              accessibilityRole="button"
              accessibilityLabel="Reset link"
              style={styles.quiet}
            >
              <Text variant="bodyStrong" color={EMBER.textSecondary}>Reset link</Text>
            </ScalePress>
          ) : null}
        </View>

        {/*
          Requests that didn't load used to leave this half of the screen
          blank — indistinguishable from having none. Said, with a way back.
        */}
        {requests.failed && !requests.loaded ? (
          <View style={styles.section}>
            <ProfileHeading title="Requests" />
            <Text variant="body" color={EMBER.textSecondary}>Your requests didn&apos;t load.</Text>
            <ScalePress
              onPress={() => void requests.load()}
              haptic={false}
              accessibilityRole="button"
              accessibilityLabel="Try loading requests again"
              style={[styles.pill, styles.start]}
            >
              <Text variant="bodyStrong">Try again</Text>
            </ScalePress>
          </View>
        ) : null}

        {incoming.length > 0 ? (
          <View style={styles.section}>
            <ProfileHeading title="Requests" />
            {incoming.map((request) => (
              <IncomingRequestRow
                key={request.id}
                request={request}
                busy={busy.has(request.id)}
                onRespond={(action) => void respond(request, action)}
              />
            ))}
          </View>
        ) : null}

        {outgoing.length > 0 ? (
          <View style={styles.section}>
            <ProfileHeading title="Sent" />
            {outgoing.map((request) => (
              <PersonRow
                key={request.id}
                person={request.person}
                detail="Requested"
                trailing={
                  <ScalePress
                    onPress={() => void withdraw(request)}
                    disabled={busy.has(request.id)}
                    haptic={false}
                    accessibilityRole="button"
                    accessibilityLabel={`Withdraw request to ${request.person.name}`}
                    style={styles.pill}
                  >
                    <Text variant="bodyStrong">Withdraw</Text>
                  </ScalePress>
                }
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xxl },
  section: { gap: SPACE.md },
  quiet: { alignSelf: 'center', paddingVertical: SPACE.sm },
  start: { alignSelf: 'flex-start' },
  pill: {
    height: CONTROL.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    justifyContent: 'center',
  },
})
