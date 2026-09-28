import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { LoadError } from '../../components/LoadError'
import { OptimizedImage } from '../../components/OptimizedImage'
import { EmberButton } from '../../components/onboarding/EmberControls'
import { useToast } from '../../components/Toast'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import { inviteCta, inviteLine, type FriendPerson, type FriendState } from '../../lib/friends'
import { isGone } from '../../lib/loadFailure'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'

/** The photo's box and decode hint. */
const PHOTO = 160

/**
 * Where an invite link lands: `https://www.blendn.app/f/<token>`, or
 * `blendn://f/<token>` from the web page's "Open in Blend'n".
 *
 * Signed out, the root guard holds this route and opens it after sign-in (or
 * after onboarding, for a new account) — see `app/_layout.tsx`.
 *
 * Shows the person who sent the link, because sending it was their choice. A
 * link that does not work says only that: never whether it was reset, whether
 * they blocked you, or whether the account still exists.
 *
 * "Doesn't work" is the server's 404 and nothing else. A link opened on a bad
 * connection is a link that didn't load, and gets Try again — telling
 * somebody their friend's link is dead because the train went into a tunnel
 * sends them off to ask for a new one they don't need.
 */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const { showToast } = useToast()
  const [person, setPerson] = useState<FriendPerson | null>(null)
  const [state, setState] = useState<FriendState | null>(null)
  const [dead, setDead] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [asking, setAsking] = useState(false)

  const settle = useCallback((result: Awaited<ReturnType<typeof apiClient.openFriendInvite>>) => {
    if (result.success && result.data) {
      setPerson(result.data.person)
      setState(result.data.state)
      setFailed(false)
    } else if (isGone(result)) {
      setDead(true)
    } else {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    let live = true
    apiClient.openFriendInvite(String(token)).then((result) => {
      if (live) settle(result)
    })
    return () => {
      live = false
    }
  }, [token, settle])

  const retry = async () => {
    setRetrying(true)
    settle(await apiClient.openFriendInvite(String(token)))
    setRetrying(false)
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/events'))

  const act = async () => {
    if (!person || !state) return
    const { action } = inviteCta(state)
    if (action === 'open') {
      router.replace({ pathname: '/friends/[userId]', params: { userId: person.userId } })
      return
    }
    if (action === 'share') {
      router.replace('/friends/add')
      return
    }
    if (action !== 'ask') return
    setAsking(true)
    const result = await apiClient.sendFriendRequest({ token: String(token) })
    setAsking(false)
    if (result.success && result.data) {
      setState(result.data.state)
      if (result.data.state === 'friends') showToast(`You and ${person.name} are friends`, 'success')
    } else {
      showToast("That didn't go through. Try again.", 'error')
    }
  }

  const cta = state ? inviteCta(state) : null

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.bar}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={SPACE.md}
          style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={ICON.lg} color={EMBER.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {dead ? (
          <>
            <Ionicons name="link-outline" size={ICON.lg} color={EMBER.textTertiary} />
            <Text variant="title" style={styles.centerText}>This link doesn&apos;t work</Text>
            <Text variant="body" color={EMBER.textSecondary} style={styles.centerText}>
              Ask the person who sent it for a new one.
            </Text>
          </>
        ) : failed && !person ? (
          <LoadError title="This link didn't open" onRetry={() => void retry()} retrying={retrying} />
        ) : !person || !cta ? (
          <ActivityIndicator color={EMBER.textSecondary} />
        ) : (
          <>
            {/* Decorative: the name under it says who this is. */}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {person.photo ? (
                <OptimizedImage source={person.photo} style={styles.photo} width={PHOTO} height={PHOTO} contentFit="cover" />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]}>
                  <Text variant="display">{(person.name[0] ?? '?').toUpperCase()}</Text>
                </View>
              )}
            </View>
            <Text variant="title" style={styles.centerText} accessibilityRole="header">{person.name}</Text>
            <Text variant="body" color={EMBER.textSecondary} style={styles.centerText}>
              {state ? inviteLine(state) : null}
            </Text>
          </>
        )}
      </View>

      {cta && !dead ? (
        <View style={styles.footer}>
          <EmberButton label={cta.label} onPress={() => void act()} busy={asking} disabled={cta.action === null} />
        </View>
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  bar: { paddingHorizontal: GUTTER, paddingVertical: SPACE.md, flexDirection: 'row' },
  barButton: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.surface,
  },
  pressed: { opacity: 0.6 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.lg, paddingHorizontal: GUTTER },
  photo: { width: PHOTO, height: PHOTO, borderRadius: EMBER_RADIUS.pill },
  photoEmpty: { backgroundColor: EMBER.surface, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  footer: { paddingHorizontal: GUTTER, paddingBottom: SPACE.lg },
})
