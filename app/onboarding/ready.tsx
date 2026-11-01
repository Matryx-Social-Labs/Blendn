import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../../components/ds/Avatar'
import { InterestChip } from '../../components/ds/Chip'
import { MomentReady } from '../../components/ds/MomentReady'
import { font, useBoldText, useSelection } from '../../components/ds/shared'
import { OptimizedImage } from '../../components/OptimizedImage'
import { INTENT_LABELS } from '../../components/onboarding/LookingForCards'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { Icon, type IconName } from '../../components/ui/Icon'
import { COLOR, ICON, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { firstNameOf } from '../../lib/profileIdentity'
import { useAuth } from '../../lib/useAuth'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * The payoff, after the five steps: the review, and the only place `onboarded` is written.
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
  const { draft, saving, finish, goBack } = useOnboarding('ready')
  const { user } = useAuth()

  const [celebrating, setCelebrating] = useState(false)

  // Edit my details: finish first, then the one edit screen over the tabs. Mid-flow it would sit outside onboarding (so
  // the tabs' push start-up would run before the ask was deferred), and finishing afterwards would re-send the draft over
  // whatever was just edited. The celebration and Bring your friends are skipped: the person asked to edit, not to party.
  const edit = async () => {
    if (!(await finish())) return
    router.replace('/(tabs)/events')
    router.push('/edit-profile')
  }

  const complete = async () => {
    // The server said yes: the one celebration plays, and it plays the success haptic itself as its mark completes
    // (Reduce Motion: at once), so the haptic always lands on a frame where something moves. Then "Bring your friends"
    // first, then the app (see app/onboarding/friends.tsx). Once per account.
    if (await finish()) setCelebrating(true)
    // On a failure the person stays here, rather than being pushed on regardless: this is the write that decides whether
    // the account is finished, and letting someone through would leave them permanently mid-funnel with no screen left
    // that could fix it. `finish()` has said why, in a toast that plays the one error haptic (this screen's own sentence
    // sat below the fold, so the button looked dead: SCRUM-492).
  }

  // The draft holds a name only once Basics saved one; an account that came with a name (Google, Apple) may never have
  // typed it. The account's name, then; never a placeholder that reads as someone else's card (audit A3).
  const name = draft.name?.trim() || user?.name?.trim() || undefined
  // First name only on the payoff: "You're in, Émilie." reads warmer than a full name (Flow 2 walk).
  const first = name ? firstNameOf(name) : undefined
  const primaryPhoto = draft.photos?.[0]
  const bold = useBoldText()
  const sel = useSelection()

  return (
    <>
      <OnboardingScreen
        step="ready"
        title="You’re in"
        titleAccent={first ? `, ${first}.` : '.'}
        subtitle="Here’s how people will see you once you choose to show who you are."
        ctaLabel="See what’s on"
        ctaBusy={saving}
        onContinue={() => void complete()}
        secondaryLabel="Edit my details"
        onSecondary={() => void edit()}
        onBack={goBack}
      >
        <View style={styles.card}>
          {/*
           * The frame's checkmark badge in the top-right corner — a completion
           * marker, not a control. Hidden from screen readers for that reason.
           */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.badge}>
            <Icon name="check" size={ICON.control} color={COLOR.textPrimary} />
          </View>

          {/*
           * The payoff: a ring around the avatar in the screen's hue (violet: you), a 4 pt surface gap; the gradient stays on the mark
           * and the primary. `OptimizedImage`, not React Native's `<Image>`: this is a 128 pt avatar drawing whatever the person
           * uploaded, which `blendn-admin/docs/MEDIA.md` asks to be 2048 square. `width`/`height` are the decode hint, so the
           * bitmap is the size of the thing on screen.
           */}
          <View style={[styles.avatarRing, { backgroundColor: sel.edge }]}>
            <View style={styles.avatarGap}>
              {primaryPhoto ? (
                <OptimizedImage source={primaryPhoto} style={styles.avatar} width={AVATAR} height={AVATAR} contentFit="cover" />
              ) : (
                // No photo: the DS creature, not an empty disc that reads as a failed upload.
                <Avatar kind="creature" pseudonym={name ?? 'you'} size={AVATAR} testID="ready-avatar" />
              )}
            </View>
          </View>

          {name ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('title', bold), styles.name]}>
              {name}
            </Text>
          ) : null}
          {draft.occupation ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.role]}>
              {draft.occupation}
            </Text>
          ) : null}

          {draft.bio ? (
            <>
              <View style={styles.divider} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.bio]}>{`“${draft.bio}”`}</Text>
            </>
          ) : null}
        </View>

        {/* Only what was actually answered. Empty rows labelled "Interests" and
          "Primary hub" would read as data we lost rather than as skipped. */}
        {draft.interests?.length ? (
          <View style={styles.interestsCard}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.heading} style={[font('heading', bold), styles.heading]}>
              Interests
            </Text>
            <View style={styles.interestsRow}>
              {draft.interests.map((interest) => (
                <InterestChip key={interest} label={interest} />
              ))}
            </View>
          </View>
        ) : null}
        {draft.location ? <Summary icon="map-pin" label="Where you live" value={draft.location} /> : null}
        {draft.intent_default?.[0] ? <Summary icon="users" label="Why you go out" value={INTENT_LABELS[draft.intent_default[0]] ?? ''} /> : null}
      </OnboardingScreen>
      {celebrating ? (
        <MomentReady testID="ready-moment" name={first} onDone={() => router.replace('/onboarding/friends')} />
      ) : null}
    </>
  )
}

function Summary({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const bold = useBoldText()
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.summary}>
      <Icon name={icon} size={ICON.control} color={COLOR.textPrimary} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.summaryLabel]}>
        {label}
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.summaryValue]}>
        {value}
      </Text>
    </View>
  )
}

/** One number, so the box and the decode hint cannot drift apart. */
const AVATAR = 128
/** The ring around it: the avatar, a 4 pt gap on each side, and the ring's own 4. */
const RING = 140
const GAP = 136
const BADGE = 40
const RULE = 96

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: SPACE.sm,
    padding: SPACE.xl,
    borderRadius: RADIUS.card,
    backgroundColor: COLOR.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairline,
  },
  badge: {
    position: 'absolute',
    top: SPACE.lg,
    right: SPACE.lg,
    width: BADGE,
    height: BADGE,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: { width: RING, height: RING, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.sm },
  avatarGap: { width: GAP, height: GAP, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: RADIUS.capsule, overflow: 'hidden' },
  name: { color: COLOR.textPrimary, textAlign: 'center' },
  role: { color: COLOR.textSecondary, textAlign: 'center' },
  divider: { width: RULE, height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairlineStrong, marginVertical: SPACE.sm },
  bio: { color: COLOR.textPrimary, textAlign: 'center' },

  interestsCard: { gap: SPACE.md, padding: SPACE.lg, borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surfaceSunken },
  heading: { color: COLOR.textPrimary },
  interestsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },

  summary: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.xs },
  summaryLabel: { color: COLOR.textSecondary },
  summaryValue: { flex: 1, textAlign: 'right', color: COLOR.textPrimary },
})
