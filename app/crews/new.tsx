import { router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import { ConsentFields, FriendPickRow } from '../../components/crews/CrewParts'
import {
  EmberButton,
  EmberChip,
  EmberChipRow,
  EmberField,
  EmberFieldGroup,
  EmberToggle,
} from '../../components/onboarding/EmberControls'
import { PlaceholderBanner } from '../../components/ui/PlaceholderBanner'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import {
  CREW_BIO_MAX,
  CREW_MAX_MEMBERS,
  CREW_MAX_TAGS,
  CREW_NAME_MAX,
  CREW_TAGS,
  createCrewBody,
  crewMessage,
  NO_CONSENT,
  toggleTag,
  type ConsentState,
} from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import type { Friend } from '../../lib/friends'
import { KEYBOARD_BEHAVIOR } from '../../lib/keyboard'
import { EMBER, GUTTER, SPACE } from '../../lib/theme'

/**
 * Make a crew, from your friends (placeholder design — docs/PLACEHOLDER_SCREENS.md §13).
 *
 * The consent is part of the form, not a step after it: making a crew is
 * joining it, and joining is agreeing that anyone in it can reveal the crew.
 * The button stays off until the person ticks it.
 */
export default function NewCrewScreen() {
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [openToSolo, setOpenToSolo] = useState(false)
  /** null while loading; 'failed' is not "no friends" — it offers a retry. */
  const [friends, setFriends] = useState<Friend[] | null | 'failed'>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [consent, setConsent] = useState<ConsentState>(NO_CONSENT)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /** One create at a time: `sending` lags a fast second tap by a render. */
  const inFlight = useRef(false)

  const loadFriends = useCallback(
    () => apiClient.getFriends().then((r) => (r.success && r.data ? r.data.friends : ('failed' as const))),
    []
  )
  useEffect(() => {
    let live = true
    void loadFriends().then((f) => live && setFriends(f))
    return () => {
      live = false
    }
  }, [loadFriends])
  const retryFriends = () => {
    setFriends(null)
    void loadFriends().then(setFriends)
  }

  const togglePick = (userId: string) =>
    setPicked((p) => (p.includes(userId) ? p.filter((id) => id !== userId) : p.length < CREW_MAX_MEMBERS - 1 ? [...p, userId] : p))

  const make = async () => {
    if (inFlight.current) return
    const body = createCrewBody({ name, bio, tags, openToSolo, inviteUserIds: picked }, consent)
    if ('problem' in body) {
      setProblem(body.problem)
      return
    }
    inFlight.current = true
    setSending(true)
    setProblem(null)
    const result = await crewsApi.create(body)
    inFlight.current = false
    setSending(false)
    if (!result.success || !result.data) {
      // The server's sentence names what it found (a phone number in the bio, the daily cap).
      setProblem(crewMessage(result, 'create', 'Couldn’t make the crew. Try again.'))
      return
    }
    router.replace({
      pathname: '/crews/[crewId]',
      params: { crewId: result.data.crewId, asked: String(result.data.invited) },
    })
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Make a crew" onBack={() => router.back()} />
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <PlaceholderBanner />
          <EmberField
            label="Crew name"
            testID="crew-name"
            value={name}
            onChangeText={setName}
            maxLength={CREW_NAME_MAX}
            placeholder="The Usual Suspects"
            helper="Shown to people you haven’t met. No numbers or handles."
          />
          <EmberField
            label="Bio (optional)"
            value={bio}
            onChangeText={setBio}
            maxLength={CREW_BIO_MAX}
            placeholder="Quiz on Tuesdays, techno on Saturdays"
            helper={`${[...bio].length}/${CREW_BIO_MAX}`}
          />
          <EmberFieldGroup label="Tags" helper={`Up to ${CREW_MAX_TAGS}`}>
            <EmberChipRow>
              {CREW_TAGS.map((t) => (
                <EmberChip
                  key={t.slug}
                  label={t.label}
                  selected={tags.includes(t.slug)}
                  disabled={!tags.includes(t.slug) && tags.length >= CREW_MAX_TAGS}
                  onPress={() => setTags((prev) => toggleTag(prev, t.slug))}
                />
              ))}
            </EmberChipRow>
          </EmberFieldGroup>
          <EmberToggle
            label="Room for one more"
            helper="Somebody on their own who’s open to a crew can match with you — only while you’re 6 or fewer."
            value={openToSolo}
            onValueChange={setOpenToSolo}
          />
          <EmberFieldGroup
            label="Invite friends"
            helper="Pick at least one. Until a friend accepts, the crew is just you. Nobody is told who else was asked."
          >
            {friends === null ? (
              <Text variant="meta">Loading your friends…</Text>
            ) : friends === 'failed' ? (
              <EmberButton label="Your friends didn’t load — try again" variant="secondary" onPress={retryFriends} />
            ) : friends.length === 0 ? (
              <Text variant="meta">Add friends first — a crew is made from your friends.</Text>
            ) : (
              <View>
                {friends.map((f) => (
                  <FriendPickRow key={f.userId} person={f} picked={picked.includes(f.userId)} onToggle={() => togglePick(f.userId)} />
                ))}
              </View>
            )}
          </EmberFieldGroup>
          <ConsentFields value={consent} onChange={setConsent} />
          {problem ? (
            <Text variant="body" color={EMBER.textPrimary} accessibilityLiveRegion="polite">
              {problem}
            </Text>
          ) : null}
          <EmberButton
            label="Make the crew"
            onPress={() => void make()}
            disabled={!consent.consented || name.trim().length === 0 || picked.length === 0}
            busy={sending}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: SPACE.xxxl, gap: SPACE.xl },
})
