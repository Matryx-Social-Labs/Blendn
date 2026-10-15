import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { OptimizedImage } from '../../components/OptimizedImage'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { CONTROL, EMBER, EMBER_RADIUS, ICON, SPACE, TYPE } from '../../lib/theme'
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

  const complete = async () => {
    if (await finish()) {
      // Once per account, and it lands with the fade into the tabs.
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      // "Bring your friends" first, then the app — see app/onboarding/friends.tsx.
      router.replace('/onboarding/friends')
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      // Kept here rather than pushed on regardless. This is the write that
      // decides whether the account is finished, and letting someone through
      // on a failure would leave them permanently mid-funnel with no screen
      // left that could fix it. `finish()` has said why, in a toast: this
      // screen's own sentence sat below the fold, so the button looked dead
      // (SCRUM-492).
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
          <Ionicons name="checkmark" size={ICON.md} color={EMBER.textPrimary} />
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
        <View style={styles.avatarRing}>
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
        </View>

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
            {draft.interests.map((interest) => (
              <View key={interest} style={styles.chip}>
                <Text style={styles.chipText}>{interest}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {draft.location ? (
        <Summary icon="location" label="Where you live" value={draft.location} />
      ) : null}
      {draft.looking_for?.length ? (
        <Summary icon="people" label="Looking for" value={draft.looking_for.join(' · ')} />
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
        <Ionicons name={icon} size={ICON.md} color={EMBER.textSecondary} />
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
/** The ring's own thickness plus the gap between it and the photo. */
const RING = 8

const styles = StyleSheet.create({
  card: {
    backgroundColor: EMBER.surfaceMedia,
    borderRadius: EMBER_RADIUS.card,
    padding: SPACE.xl,
    alignItems: 'flex-start',
    gap: SPACE.md,
  },
  badge: {
    position: 'absolute',
    top: SPACE.lg,
    right: SPACE.lg,
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: AVATAR + RING,
    height: AVATAR + RING,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.textTertiary,
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
  name: TYPE.title,
  role: { ...TYPE.body, color: EMBER.textSecondary },
  divider: { width: 96, height: 1, backgroundColor: EMBER.separator },
  bio: { ...TYPE.body, color: EMBER.textSecondary },

  interestsCard: {
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.card,
    padding: SPACE.xl,
    gap: SPACE.lg,
  },
  interestsHeading: TYPE.heading,
  interestsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    minHeight: CONTROL.sm,
    justifyContent: 'center',
  },
  chipText: TYPE.bodyStrong,

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    backgroundColor: EMBER.surfaceMedia,
    borderRadius: EMBER_RADIUS.md,
    padding: SPACE.xl,
  },
  summaryIcon: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: { flex: 1, gap: SPACE.xxs },
  summaryLabel: TYPE.meta,
  summaryValue: TYPE.bodyStrong,
})
