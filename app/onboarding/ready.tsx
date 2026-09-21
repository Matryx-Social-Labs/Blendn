import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { OptimizedImage } from '../../components/OptimizedImage'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { EMBER, EMBER_GRADIENT, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'
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
        {/*
         * The frame's checkmark badge in the top-right corner — a completion
         * marker, not a control. Hidden from screen readers for that reason.
         */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.badge}
        >
          <Ionicons name="checkmark" size={20} color={EMBER.accent} />
        </View>

        {/*
         * `OptimizedImage`, not React Native's `<Image>`.
         *
         * This is a 128pt avatar drawing whatever the person uploaded — which
         * `blendn-admin/docs/MEDIA.md` asks to be 2048 square. RN's Image decodes the file
         * at its native size regardless of the box it is drawn in, so a
         * summary card was holding a four-megapixel bitmap to show a thumbnail,
         * and re-downloading it on every mount because RN's cache is separate
         * from the one the rest of the app warms.
         *
         * `width`/`height` are the decode hint, so the bitmap is the size of
         * the thing on screen.
         */}
        <LinearGradient
          colors={[...EMBER_GRADIENT.colors]}
          start={EMBER_GRADIENT.start}
          end={EMBER_GRADIENT.end}
          style={styles.avatarRing}
        >
          <View style={styles.avatarBorder}>
            {primaryPhoto ? (
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
          </View>
        </LinearGradient>

        <Text style={styles.name}>{name || 'Your name'}</Text>
        {draft.occupation ? <Text style={styles.role}>{draft.occupation}</Text> : null}

        {draft.bio ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.bio}>&ldquo;{draft.bio}&rdquo;</Text>
          </>
        ) : null}
      </View>

      {/* Only what was actually answered. Empty rows labelled "Interests" and
          "Primary hub" would read as data we lost rather than as skipped. */}
      {draft.interests?.length ? (
        <View style={styles.interestsCard}>
          <Text style={styles.interestsHeading}>Interests</Text>
          <View style={styles.interestsRow}>
            {draft.interests.map((interest, index) => (
              <View key={interest} style={styles.chip}>
                {index === 0 ? (
                  <LinearGradient
                    colors={[...EMBER_GRADIENT.colors]}
                    start={EMBER_GRADIENT.start}
                    end={EMBER_GRADIENT.end}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <Text style={index === 0 ? styles.chipAccentText : styles.chipText}>
                  {interest}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {draft.location ? (
        <Summary icon="location" label="Primary Hub" value={draft.location} />
      ) : null}
      {draft.looking_for?.length ? (
        <Summary icon="people" label="Looking For" value={draft.looking_for.join(' · ')} />
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

function Summary({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
}) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryIcon}>
        <Ionicons name={icon} size={22} color={EMBER.textSecondary} />
      </View>
      <View style={styles.summaryText}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  )
}

/** One number, so the box and the decode hint cannot drift apart. */
const AVATAR = 128
/** The gradient ring's own thickness plus the gap between it and the photo. */
const RING = 8

const styles = StyleSheet.create({
  card: {
    backgroundColor: EMBER.surfaceMedia,
    borderRadius: EMBER_RADIUS.card,
    padding: 24,
    alignItems: 'flex-start',
    gap: 12,
  },
  badge: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: 'rgba(45,44,44,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: AVATAR + RING,
    height: AVATAR + RING,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBorder: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: 4,
    borderColor: EMBER.surfaceMedia,
    overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%' },
  avatarEmpty: { backgroundColor: EMBER.surfaceSunken },
  name: { ...EMBER_TYPE.subtitle, fontSize: 28, lineHeight: 34, color: EMBER.textPrimary },
  role: { ...EMBER_TYPE.subtitle, fontSize: 18, color: EMBER.accent },
  divider: { width: 96, height: 1, backgroundColor: 'rgba(238,131,97,0.2)' },
  bio: { ...EMBER_TYPE.subtitle, color: EMBER.textSecondary },

  interestsCard: {
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.card,
    padding: 24,
    gap: 16,
  },
  interestsHeading: { ...EMBER_TYPE.subtitle, fontSize: 18, color: EMBER.textPrimary },
  interestsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  chipText: { ...EMBER_TYPE.helper, fontSize: 14, color: EMBER.textPrimary },
  chipAccentText: { ...EMBER_TYPE.helper, fontSize: 14, fontWeight: '700', color: EMBER.onGradientChip },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: EMBER.surfaceMedia,
    borderRadius: EMBER_RADIUS.card,
    padding: 20,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: { flex: 1, gap: 2 },
  summaryLabel: { ...EMBER_TYPE.helper, fontSize: 13, color: EMBER.textSecondary },
  summaryValue: { ...EMBER_TYPE.subtitle, fontSize: 17, color: EMBER.textPrimary },

  error: { ...EMBER_TYPE.helper, color: '#FF6D8D' },
})
