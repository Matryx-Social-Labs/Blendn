import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
// The library one, like every other screen: react-native's own SafeAreaView
// left the Save button under the home indicator on an iPhone 17 Pro, where
// taps on its centre are the system's, not ours (SCRUM-201).
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated from 'react-native-reanimated'

import ScalePress from '../../components/motion/ScalePress'
import { EmberButton } from '../../components/onboarding/EmberControls'
import { fadeInFast } from '../../components/motion/presence'
import { useToast } from '../../components/Toast'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { MOTION_DURATION, MOTION_EASING } from '../../lib/motion'
import { revealReadiness, type RevealReadiness } from '../../lib/reveal'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, OPACITY, SPACE, SWITCH_COLORS, TYPE } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'

/**
 * Why you are here tonight, and whether people can see who you are.
 *
 * `DESIGN_HANDOFF.md` calls the reveal control "the single most important new
 * screen", because it is the counterpart to the whole pseudonymity model.
 *
 * ## The layout (no longer a placeholder, 2026-09-28)
 *
 * Built to sit beside the rate and forgot-password screens: a close button,
 * two questions as `title`s over `body` explanations, and one accent — Save,
 * pinned under the scroll so it is always in reach and never under the home
 * indicator. Intent options are rows that fill `textPrimary` when chosen (the
 * system's selected treatment). "Just here for the event" stands apart behind
 * an "OR", because choosing it clears the others and that should be visible
 * before it happens. Reveal is a `surface` card with a switch, plain and
 * unweighted: off is not an unfinished state, so nothing about it nags.
 *
 * ## The two things this sets
 *
 * **Intent** — why you are here. A tag and a ranking signal, never a partition:
 * everyone is in one pool. Splitting a new app's pool by intent empties both
 * halves, and "just here for the event" is a first-class answer rather than a
 * failure to choose.
 *
 * **Reveal** — whether your real name and photo are visible in this room.
 * Default off. Per event, deliberately: choosing to be visible at a work meetup
 * is not choosing to be visible at a club, and one global switch would make
 * that decision once for every room you ever enter.
 *
 * ## What the design must not do
 *
 * Do not present reveal as a completeness step, a profile-strength nudge, or
 * anything with a progress bar. Anything that makes staying pseudonymous feel
 * like an unfinished state pressures exactly the people the pseudonym protects.
 * The honest framing is a choice with no default-correct answer.
 *
 * Do not show who else has revealed. That turns a personal choice into a count
 * and makes the last holdout visible.
 */

type Intent = 'dating' | 'networking' | 'friendship' | 'just_here'

const INTENTS: { value: Intent; label: string; hint: string }[] = [
  { value: 'networking', label: 'Networking', hint: 'People to work with or learn from' },
  { value: 'friendship', label: 'Making friends', hint: 'People to spend time with' },
  { value: 'dating', label: 'Dating', hint: 'Something romantic' },
  { value: 'just_here', label: 'Just here for the event', hint: 'Not looking to meet anyone' },
]

/*
 * A choice eases its fill rather than snapping, as on the rate screen. The
 * `transition` shorthand string, not `transitionProperty` & co. (AGENTS.md).
 */
const EASE = `cubic-bezier(${MOTION_EASING.entrance.join(', ')})`
const FILL_TRANSITION = { transition: `background-color ${MOTION_DURATION.fast}ms ${EASE}` }
const LABEL_TRANSITION = { transition: `color ${MOTION_DURATION.fast}ms ${EASE}` }

export default function EventPreferences() {
  // `revealed` arrives from the status chip, which already knows it. There is
  // no GET for per-event preferences, and adding a round trip to learn
  // something the caller is holding would be the wrong trade.
  const { eventId, revealed: initialRevealed, askIntent: askIntentParam } = useLocalSearchParams<{
    eventId: string
    revealed?: string
    askIntent?: string
  }>()
  /*
   * "Why do you go out?" — asked at the door of the first room.
   *
   * Onboarding never wrote `intent_default`, so every account that came
   * through it was refused the board ("add … why you go out") for a field the
   * flow never asked for. Check-in says `intentNeeded` while there is no
   * default; the events tab sends people here with this flag, the intent
   * leads, and the answer is saved as the default in the same write.
   */
  const askIntent = askIntentParam === '1'
  const { showToast } = useToast()
  const { user } = useAuth()

  const [intent, setIntent] = useState<Intent[]>([])
  /*
   * Whether the intent chips have been touched at all.
   *
   * There is no GET for per-event preferences, so this screen opens with an
   * empty selection regardless of what the person actually chose. Sending that
   * empty array on save would wipe their intent for the event every time they
   * opened this screen to change the reveal switch — a silent reset triggered
   * by looking. `undefined` means "leave it alone" server-side, so the intent
   * is only sent once somebody has expressed one here.
   */
  const [intentTouched, setIntentTouched] = useState(false)
  const [revealed, setRevealed] = useState(initialRevealed === '1')
  const [rememberReveal, setRememberReveal] = useState(false)
  const [saving, setSaving] = useState(false)

  /*
   * Revealing shows a name and a photo. If there is neither, the switch would
   * turn on and show nothing — and the person would reasonably conclude the
   * feature is broken rather than that their profile is empty.
   */
  const [canReveal, setCanReveal] = useState<RevealReadiness | null>(null)
  // Dating is 18+. The server refuses it (403) on this write as everywhere
  // else; hiding the card for a minor turns that refusal into a card they
  // never see rather than an error on the way into their first room.
  const [under18, setUnder18] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!user) return
    apiClient
      .getProfile(user.id)
      .then((res) => {
        if (cancelled || !res.success || !res.data) return
        const age = res.data.profile?.age
        setUnder18(typeof age === 'number' && age < 18)
        setCanReveal(
          revealReadiness({
            name: res.data.profile?.name || res.data.name,
            photos: Array.isArray(res.data.profile?.photos) ? res.data.profile.photos : [],
          })
        )
      })
      .catch(() => {
        // Fail open on the *gate*, not on the reveal: an unreachable profile
        // endpoint should not permanently disable a control, and the server
        // still decides what a card actually shows.
        if (!cancelled) setCanReveal({ ok: true, missing: '' })
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const toggleIntent = useCallback((value: Intent) => {
    setIntentTouched(true)
    setIntent((prev) => {
      // "Just here" is exclusive: it means not looking, so it cannot sit
      // alongside an answer that says you are.
      if (value === 'just_here') return prev.includes('just_here') ? [] : ['just_here']
      const withoutJustHere = prev.filter((i) => i !== 'just_here')
      return withoutJustHere.includes(value)
        ? withoutJustHere.filter((i) => i !== value)
        : [...withoutJustHere, value]
    })
  }, [])

  const save = useCallback(async () => {
    if (!eventId || saving) return
    setSaving(true)
    try {
      const res = await apiClient.setMatchPreferences(String(eventId), {
        // Only when they actually chose something here. See `intentTouched`.
        intent: intentTouched ? intent : undefined,
        // The first-door answer is the default from now on; that is the point.
        ...(askIntent && intentTouched ? { rememberIntent: true } : {}),
        revealed,
        /*
         * `rememberReveal`, not `remember`. The old flag wrote the intent
         * default too, from a switch sitting under the reveal toggle — so
         * agreeing to be named at future events silently overwrote a
         * person-level intent set on a different screen.
         */
        rememberReveal,
      })
      if (!res.success) {
        // The server's sentence when it has one — "Dating is for 18+" is
        // actionable; "could not save" is not.
        showToast(res.error || 'Could not save. Try again.', 'error')
        return
      }
      router.back()
    } catch (e) {
      Logger.error('match', 'Failed to save match preferences', { error: e })
      showToast('Could not save. Try again.', 'error')
    } finally {
      setSaving(false)
    }
  }, [askIntent, eventId, intent, intentTouched, rememberReveal, revealed, saving, showToast])

  const intents = under18 ? INTENTS.filter((i) => i.value !== 'dating') : INTENTS
  const lookingIntents = intents.filter((i) => i.value !== 'just_here')
  const justHere = intents.find((i) => i.value === 'just_here')

  const intentOption = (opt: (typeof INTENTS)[number]) => {
    const selected = intent.includes(opt.value)
    return (
      <ScalePress
        key={opt.value}
        onPress={() => toggleIntent(opt.value)}
        accessibilityRole="button"
        accessibilityLabel={`${opt.label}. ${opt.hint}`}
        accessibilityState={{ selected }}
      >
        <Animated.View style={[styles.option, selected && styles.optionSelected, FILL_TRANSITION]}>
          <View style={styles.optionText}>
            <Animated.Text style={[styles.optionLabel, selected && styles.onSelected, LABEL_TRANSITION]}>
              {opt.label}
            </Animated.Text>
            <Animated.Text style={[styles.optionHint, selected && styles.onSelected, LABEL_TRANSITION]}>
              {opt.hint}
            </Animated.Text>
          </View>
          {selected ? <Ionicons name="checkmark" size={ICON.md} color={EMBER.bg} /> : null}
        </Animated.View>
      </ScalePress>
    )
  }

  const revealBlock = (
    <View style={styles.section}>
      <View style={styles.headline}>
        <Text variant="title" accessibilityRole="header">
          Can people see who you are?
        </Text>
        <Text variant="body" color={EMBER.textSecondary}>
          By default you appear as a made-up name, and people see what you have in common
          rather than who you are. Turning this on shows your real name and photo to people
          in this room.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text variant="bodyStrong">Show my name and photo here</Text>
            <Text variant="meta" color={EMBER.textSecondary}>
              This event only. It does not change anything anywhere else.
            </Text>
          </View>
          <Switch
            value={revealed}
            onValueChange={setRevealed}
            disabled={canReveal ? !canReveal.ok : false}
            accessibilityLabel="Show my real name and photo at this event"
            {...SWITCH_COLORS}
          />
        </View>

        {revealed && (
          <Animated.View entering={fadeInFast} style={[styles.switchRow, styles.switchRowDivided]}>
            <Text variant="bodyStrong" style={styles.switchText}>
              Do this at future events too
            </Text>
            <Switch
              value={rememberReveal}
              onValueChange={setRememberReveal}
              accessibilityLabel="Show my name and photo at future events too"
              {...SWITCH_COLORS}
            />
          </Animated.View>
        )}
      </View>

      {canReveal && !canReveal.ok && (
        /*
         * Names what is missing, because "disabled" on its own is the least
         * useful state in an interface. `matching.ts` shows the real name and
         * photo and nothing else, so these two fields are literally all that
         * revealing exposes — and with neither, turning it on would show
         * nothing at all.
         */
        <Text variant="meta" color={EMBER.textSecondary}>
          Add {canReveal.missing} to your profile first — that&apos;s what other people
          would see.
        </Text>
      )}
    </View>
  )

  const intentBlock = (
    <View style={styles.section}>
      <View style={styles.headline}>
        <Text variant="title" accessibilityRole="header">
          {askIntent ? 'Why do you go out?' : 'Why are you here tonight?'}
        </Text>
        <Text variant="body" color={EMBER.textSecondary}>
          {askIntent
            ? "It shapes who you're introduced to. We'll remember this for future events — change it any time from your profile."
            : 'Just for this event. It overrides your usual answer for tonight without changing it.'}
        </Text>
      </View>

      <View style={styles.options}>{lookingIntents.map(intentOption)}</View>

      {justHere ? (
        <>
          {/* Exclusive of the rows above: choosing it clears them, so it stands apart. */}
          <Text variant="label" color={EMBER.textTertiary} style={styles.or}>
            OR
          </Text>
          {intentOption(justHere)}
        </>
      ) : null}
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={ICON.lg} color={EMBER.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/*
          * Reveal leads, intent follows — and that ordering is a decision.
          *
          * This screen is reached from the anonymity chip ("You're anonymous
          * here"), and landing on "Why are you here tonight?" answers a
          * question nobody asked. Tapping a control about being named should
          * put the control about being named first.
          *
          * It is also the more per-event of the two now. Intent has a
          * person-level default set once on `about-you`, so what appears below
          * is an *override* for tonight. Reveal has no equivalent — it is
          * deliberately decided per room, every room, because being visible at
          * a work meetup is not being visible at a club.
          */}
        {/*
          * Reveal leads, intent follows — unless intent is the question that
          * brought them here. See `askIntent`.
          */}
        {askIntent ? intentBlock : revealBlock}
        <View style={styles.divider} />
        {askIntent ? revealBlock : intentBlock}
      </ScrollView>

      {/* Pinned under the scroll, not at its end: with four intent rows it fell below the fold. */}
      <View style={styles.footer}>
        {/*
          The first-door answer cannot be nothing: an empty save would write
          an empty default and the board would still refuse them.
        */}
        <EmberButton
          label="Save"
          onPress={() => void save()}
          disabled={askIntent && intent.length === 0}
          busy={saving}
          accessibilityHint={askIntent && intent.length === 0 ? 'Choose an answer first' : undefined}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  topBar: {
    height: CONTROL.md,
    paddingHorizontal: GUTTER - SPACE.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: { width: CONTROL.md, height: CONTROL.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: OPACITY.pressed },
  scroll: { paddingHorizontal: GUTTER, paddingTop: SPACE.lg, paddingBottom: SPACE.xxl },

  section: { gap: SPACE.lg },
  headline: { gap: SPACE.sm },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: EMBER.separator,
    marginVertical: SPACE.xxl,
  },

  options: { gap: SPACE.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surface,
  },
  // The system's selected treatment: `textPrimary` fill, `bg` text.
  optionSelected: { backgroundColor: EMBER.textPrimary },
  optionText: { flex: 1, gap: SPACE.xxs },
  optionLabel: { ...TYPE.bodyStrong, color: EMBER.textPrimary },
  optionHint: { ...TYPE.meta, color: EMBER.textSecondary },
  onSelected: { color: EMBER.bg },
  or: { textAlign: 'center' },

  // `surface` on the `bg` page; the off track is `textTertiary`, so it shows.
  card: {
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.md,
    paddingHorizontal: SPACE.lg,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
    paddingVertical: SPACE.lg,
  },
  switchRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: EMBER.separator },
  switchText: { flex: 1, gap: SPACE.xxs },

  footer: { paddingHorizontal: GUTTER, paddingTop: SPACE.md, paddingBottom: SPACE.lg },
})
