import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { OptimizedImage } from '../../components/OptimizedImage'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { previousStep } from '../../lib/onboarding'
import { EMBER, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Step eight — the review, and the only place `onboarded` is written.
 *
 * That column has existed since the first schema and the dashboard funnel has
 * always counted it. **Nothing had ever set it.** The API has accepted it on
 * `PUT /profiles/:userId` the whole time; no client sent it, so the funnel read
 * zero and the number was mistaken for a product problem.
 *
 * Everything in the draft is re-sent here, not just the flag, so this doubles
 * as the backstop for any per-step save that failed on a bad connection.
 *
 * A review rather than a straight "done", because it is the one moment someone
 * can see what they have actually said about themselves — and the last cheap
 * chance to fix a typo before it is on a card in a room.
 */
export default function ReadyScreen() {
  const { draft, saving, finish, goBack, jumpTo } = useOnboarding('ready')
  const [failed, setFailed] = useState(false)

  const complete = async () => {
    setFailed(false)
    if (await finish()) {
      router.replace('/(tabs)/events')
    } else {
      // Kept here rather than pushed on regardless. This is the write that
      // decides whether the account is finished, and letting someone through
      // on a failure would leave them permanently mid-funnel with no screen
      // left that could fix it.
      setFailed(true)
    }
  }

  const name = draft.name?.trim()
  const primaryPhoto = draft.photos?.[0]

  return (
    <OnboardingScreen
      step="ready"
      title="You're all set"
      titleAccent={name ? `, ${name}` : undefined}
      subtitle="Your profile is ready for the community. Review it before you start blending."
      ctaLabel="Start Blend'n"
      ctaBusy={saving}
      onContinue={() => void complete()}
      secondaryLabel="Edit my details"
      onSecondary={() => jumpTo('basics')}
      onBack={goBack}
    >
      <View style={styles.card}>
        {primaryPhoto ? (
          /*
           * `OptimizedImage`, not React Native's `<Image>`.
           *
           * This is a 96pt avatar drawing whatever the person uploaded — which
           * `docs/MEDIA.md` asks to be 2048 square. RN's Image decodes the file
           * at its native size regardless of the box it is drawn in, so a
           * summary card was holding a four-megapixel bitmap to show a thumbnail,
           * and re-downloading it on every mount because RN's cache is separate
           * from the one the rest of the app warms.
           *
           * `width`/`height` are the decode hint, so the bitmap is the size of
           * the thing on screen.
           */
          <OptimizedImage
            source={primaryPhoto}
            style={styles.avatar}
            width={AVATAR}
            height={AVATAR}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]} />
        )}
        <Text style={styles.name}>{name || 'Your name'}</Text>
        {draft.occupation ? <Text style={styles.role}>{draft.occupation}</Text> : null}
        {draft.bio ? <Text style={styles.bio}>{draft.bio}</Text> : null}
      </View>

      {/* Only what was actually answered. Empty rows labelled "Interests" and
          "Primary hub" would read as data we lost rather than as skipped. */}
      {draft.interests?.length ? (
        <Summary label="Interests" value={draft.interests.join(' · ')} />
      ) : null}
      {draft.location ? <Summary label="Primary hub" value={draft.location} /> : null}
      {draft.looking_for?.length ? (
        <Summary label="Looking for" value={draft.looking_for.join(' · ')} />
      ) : null}

      {failed ? (
        <Text style={styles.error}>
          We could not finish setting up your profile. Check your connection and try again — nothing
          you entered has been lost.
        </Text>
      ) : null}
    </OnboardingScreen>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  )
}

/** One number, so the box and the decode hint cannot drift apart. */
const AVATAR = 96

const styles = StyleSheet.create({
  card: {
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.card,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: EMBER_RADIUS.pill },
  avatarEmpty: { backgroundColor: EMBER.surfaceSunken },
  name: { ...EMBER_TYPE.subtitle, fontSize: 24, lineHeight: 32, color: EMBER.textPrimary },
  role: { ...EMBER_TYPE.subtitle, color: EMBER.accent },
  bio: { ...EMBER_TYPE.subtitle, textAlign: 'center' },

  summary: {
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.card,
    padding: 20,
    gap: 6,
  },
  summaryLabel: EMBER_TYPE.fieldLabel,
  summaryValue: { ...EMBER_TYPE.subtitle, color: EMBER.textPrimary },

  error: { ...EMBER_TYPE.helper, color: '#FF6D8D' },
})
