import { router, useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import { InviteLinkCard } from '../../components/friends/InviteLinkCard'
import { PersonRow } from '../../components/friends/PersonRow'
import ScalePress from '../../components/motion/ScalePress'
import { EmberButton } from '../../components/onboarding/EmberControls'
import { ProfileHeading } from '../../components/profile/ProfileSections'
import { useToast } from '../../components/Toast'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import type { FriendRequest } from '../../lib/friends'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, SPACE } from '../../lib/theme'
import { useFriendInvite } from '../../lib/useFriendInvite'

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
  const [incoming, setIncoming] = useState<FriendRequest[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([])
  /*
   * Per row, and checked synchronously. One shared id let a tap on another row
   * re-enable this one mid-request; and state alone is read from the render
   * the tap happened in, so a quick second tap before the re-render sent a
   * second answer. The ref decides; the state only greys the buttons.
   */
  const inFlight = useRef(new Set<string>())
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const once = async (id: string, work: () => Promise<void>) => {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    setBusy(new Set(inFlight.current))
    try {
      await work()
    } finally {
      inFlight.current.delete(id)
      setBusy(new Set(inFlight.current))
    }
  }
  const [refreshing, setRefreshing] = useState(false)

  const loadRequests = useCallback(async () => {
    const result = await apiClient.getFriendRequests()
    if (result.success && result.data) {
      setIncoming(result.data.incoming)
      setOutgoing(result.data.outgoing)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadRequests()
    }, [loadRequests])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([loadRequests(), invite ? Promise.resolve() : reload()])
    setRefreshing(false)
  }

  const respond = (request: FriendRequest, action: 'accept' | 'dismiss') =>
    once(request.id, async () => {
      const result = await apiClient.respondToFriendRequest(request.id, action)
      if (!result.success) {
        showToast("That didn't go through. Try again.", 'error')
        return
      }
      setIncoming((list) => list.filter((r) => r.id !== request.id))
      if (action === 'accept') showToast(`You and ${request.person.name} are friends`, 'success')
    })

  const withdraw = (request: FriendRequest) =>
    once(request.id, async () => {
      const result = await apiClient.withdrawFriendRequest(request.id)
      if (result.success) setOutgoing((list) => list.filter((r) => r.id !== request.id))
      else showToast("That didn't go through. Try again.", 'error')
    })

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
          <EmberButton label="Share my link" onPress={() => void share()} disabled={!invite} />
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

        {incoming.length > 0 ? (
          <View style={styles.section}>
            <ProfileHeading title="Requests" />
            {incoming.map((request) => (
              <PersonRow
                key={request.id}
                person={request.person}
                trailing={
                  <View style={styles.actions}>
                    <ScalePress
                      onPress={() => void respond(request, 'dismiss')}
                      disabled={busy.has(request.id)}
                      haptic={false}
                      accessibilityRole="button"
                      accessibilityLabel={`Not now, ${request.person.name}`}
                      style={styles.pill}
                    >
                      <Text variant="bodyStrong">Not now</Text>
                    </ScalePress>
                    <ScalePress
                      onPress={() => void respond(request, 'accept')}
                      disabled={busy.has(request.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Accept ${request.person.name}`}
                      style={[styles.pill, styles.accept]}
                    >
                      <Text variant="bodyStrong" color={EMBER.onGradient}>Accept</Text>
                    </ScalePress>
                  </View>
                }
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
  actions: { flexDirection: 'row', gap: SPACE.sm },
  pill: {
    height: CONTROL.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    justifyContent: 'center',
  },
  accept: { backgroundColor: EMBER.accent },
})
