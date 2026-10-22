import { TopBar } from '../../components/ds/TopBar'
import { useTopBarOverlay } from '../../lib/useTopBarState'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { LinearTransition, useReducedMotion } from 'react-native-reanimated'

import { Avatar } from '../../components/ds/Avatar'
import { Button } from '../../components/ds/Button'
import { Dock } from '../../components/ds/Dock'
import { Orbs } from '../../components/ds/Orbs'
import { RadioCard } from '../../components/ds/RadioCard'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { SettingsRow } from '../../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { fadeInFast } from '../../components/motion/presence'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { intentAnswered } from '../../lib/checkIn'
import { COLOR, SPACE, SPRING } from '../../lib/design/tokens'
import { toggleIntent } from '../../lib/intents'
import { Logger } from '../../lib/logger'
import { revealReadiness, type RevealReadiness } from '../../lib/reveal'
import { useAuth } from '../../lib/useAuth'

/**
 * Why you are here tonight, and whether people can see who you are (Flow 3 `prefs`).
 *
 * `DESIGN_HANDOFF.md` calls the reveal control "the single most important new
 * screen", because it is the counterpart to the whole pseudonymity model.
 *
 * ## Two questions, one primary
 *
 * A glass close at the top, the first question as the screen's `title`, the second under a `SectionHeader`,
 * and Save docked on a glass bar so it is always in reach and never under the home indicator. Reveal is two
 * `RadioCard`s (Anonymous, Named) with the face each would show; the intents are `RadioCard`s too, each one
 * `deselectable` since a tap on a chosen intent clears it. "Just here for the event" stands apart behind an
 * "or", because choosing it clears the others and that should be visible before it happens.
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

const AVATAR = 56

function EventPreferencesContent() {
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
  // A check-in waits for this question before its room shows (lib/checkIn.ts).
  useEffect(() => (askIntent ? intentAnswered : undefined), [askIntent])
  const { showToast } = useToast()
  const { user } = useAuth()
  const bar = useTopBarOverlay()
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()

  const [intent, setIntent] = useState<Intent[]>([])
  /*
   * Whether the intent cards have been touched at all.
   *
   * There is no GET for per-event preferences, so this screen opens with an
   * empty selection regardless of what the person actually chose. Sending that
   * empty array on save would wipe their intent for the event every time they
   * opened this screen to change the reveal — a silent reset triggered
   * by looking. `undefined` means "leave it alone" server-side, so the intent
   * is only sent once somebody has expressed one here.
   */
  const [intentTouched, setIntentTouched] = useState(false)
  const [revealed, setRevealed] = useState(initialRevealed === '1')
  const [rememberReveal, setRememberReveal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dockHeight, setDockHeight] = useState(0)

  /*
   * Revealing shows a name and a photo. If there is neither, choosing Named would
   * show nothing — and the person would reasonably conclude the feature is
   * broken rather than that their profile is empty.
   */
  const [canReveal, setCanReveal] = useState<RevealReadiness | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
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
        const photos: string[] = Array.isArray(res.data.profile?.photos) ? res.data.profile.photos : []
        setUnder18(typeof age === 'number' && age < 18)
        setPhoto(typeof photos[0] === 'string' ? photos[0] : null)
        setCanReveal(revealReadiness({ name: res.data.profile?.name || res.data.name, photos }))
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

  const onToggleIntent = useCallback((value: Intent) => {
    setIntentTouched(true)
    setIntent((prev) => toggleIntent(prev, value))
  }, [])

  /** Back, or the event itself when this was opened cold (a link or a push) with nothing behind it. */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace({ pathname: '/event/[id]', params: { id: String(eventId) } } as never)
  }, [eventId])

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
        showToast(res.error || 'Could not save. Try again.', 'error', { haptic: 'error' })
        return
      }
      leave()
    } catch (e) {
      Logger.error('match', 'Failed to save match preferences', { error: e })
      showToast('Could not save. Try again.', 'error', { haptic: 'error' })
    } finally {
      setSaving(false)
    }
  }, [askIntent, eventId, intent, intentTouched, leave, rememberReveal, revealed, saving, showToast])

  const intents = under18 ? INTENTS.filter((i) => i.value !== 'dating') : INTENTS
  const lookingIntents = intents.filter((i) => i.value !== 'just_here')
  const justHere = intents.find((i) => i.value === 'just_here')

  const intentOption = (opt: (typeof INTENTS)[number]) => (
    <RadioCard
      key={opt.value}
      title={opt.label}
      hint={opt.hint}
      selected={intent.includes(opt.value)}
      deselectable
      onPress={() => onToggleIntent(opt.value)}
      testID={`prefs-intent-${opt.value}`}
    />
  )

  const blocked = canReveal ? !canReveal.ok : false
  const namedHint = blocked
    ? `Add ${canReveal?.missing} to your profile first. That’s what other people would see.`
    : 'People here see your name and photo.'
  // Layout glides when the "future events" row arrives; Reduce Motion cuts (U-L11).
  const glide = reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)

  const revealBlock = (
    <Animated.View layout={glide} style={styles.section}>
      {askIntent ? (
        <SectionHeader
          title="Can people see who you are?"
          caption="By default you appear as a made-up name, and people see what you have in common rather than who you are. Turning this on shows your real name and photo to people in this room."
        />
      ) : (
        <View style={styles.headline}>
          <Text accessibilityRole="header" style={[font('title', bold), styles.ink]}>
            Can people see who you are?
          </Text>
          <Text style={[font('meta', bold), styles.secondary]}>
            By default you appear as a made-up name, and people see what you have in common rather than who you are. Turning this on shows your real name and photo to people in this room.
          </Text>
        </View>
      )}
      <View style={styles.pair} accessibilityRole="radiogroup">
        <RadioCard
          title="Anonymous"
          hint="Nobody here sees your name or photo."
          avatar={<Avatar kind="creature" pseudonym={String(eventId)} /* the made-up face is seeded on the event, never on the person (lib/pseudonymAvatar.ts) */ size={AVATAR} ring={COLOR.surface} />}
          selected={!revealed}
          onPress={() => setRevealed(false)}
          testID="prefs-anonymous"
        />
        <RadioCard
          title="Named"
          hint={namedHint}
          avatar={photo ? <Avatar kind="photo" uri={photo} size={AVATAR} ring={COLOR.surface} /> : undefined}
          icon={photo ? undefined : 'user'}
          selected={revealed}
          disabled={blocked}
          onPress={() => setRevealed(true)}
          testID="prefs-named"
        />
      </View>
      {revealed ? (
        <Animated.View entering={reduceMotion ? undefined : fadeInFast}>
          <SettingsRow
            icon="history"
            title="Do this at future events too"
            trail="switch"
            value={rememberReveal}
            onValueChange={setRememberReveal}
            testID="prefs-remember"
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  )

  const intentBlock = (
    <View style={styles.section}>
      {askIntent ? (
        <View style={styles.headline}>
          <Text accessibilityRole="header" style={[font('title', bold), styles.ink]}>
            Why do you go out?
          </Text>
          <Text style={[font('meta', bold), styles.secondary]}>
            It shapes who you’re introduced to. We’ll remember this for future events; change it any time from your profile.
          </Text>
        </View>
      ) : (
        <SectionHeader title="Why are you here tonight?" caption="Just for this event. It overrides your usual answer for tonight without changing it." />
      )}
      <View style={styles.options}>{lookingIntents.map(intentOption)}</View>
      {justHere ? (
        <>
          {/* Exclusive of the cards above: choosing it clears them, so it stands apart. */}
          <Text accessibilityElementsHidden importantForAccessibility="no" style={[font('label', bold), styles.or]}>
            OR
          </Text>
          {intentOption(justHere)}
        </>
      ) : null}
    </View>
  )

  const needsAnswer = askIntent && intent.length === 0
  return (
    <View style={styles.screen}>
      <Orbs set="feed" />
      <ScrollView
        testID="prefs-scroll"
        {...bar.scrollProps}
        contentContainerStyle={[styles.scroll, { paddingTop: bar.contentTop + SPACE.md, paddingBottom: dockHeight + SPACE.xl }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        showsVerticalScrollIndicator={false}
      >
        {/*
          * Reveal leads, intent follows — unless intent is the question that brought them here (`askIntent`).
          *
          * This screen is reached from the anonymity chip ("You're anonymous here"), and landing on "Why are you
          * here tonight?" answers a question nobody asked. It is also the more per-event of the two: intent has a
          * person-level default set once, so what appears below is an override for tonight. Reveal has no
          * equivalent — it is deliberately decided per room, every room.
          */}
        {askIntent ? intentBlock : revealBlock}
        <View accessibilityElementsHidden importantForAccessibility="no" style={styles.divider} />
        {askIntent ? revealBlock : intentBlock}
      </ScrollView>
      {/*
        The bar over the scroll (Flow 3 `prefs`: a ✕ and nothing else), so the copy passes under glass when it scrolls and never
        under the ✕ or, on Android, the status bar. Last of the page's pieces in the tree but first to be read: the page is
        modal, and Close is the first thing a screen reader should land on.
      */}
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar close state={bar.state} onBack={leave} testID="prefs-top" />
      </View>
      {/* Docked, not at the end of the scroll: with four intents it fell below the fold. The first-door answer cannot be nothing: an empty save would write an empty default. */}
      <Dock floating onHeight={setDockHeight} testID="prefs-dock">
        <Button
          label="Save"
          kind="primary"
          onPress={() => void save()}
          disabled={needsAnswer}
          loading={saving}
          accessibilityHint={needsAnswer ? 'Choose an answer first' : undefined}
          testID="prefs-save"
        />
      </Dock>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  scroll: { paddingHorizontal: SPACE.gutter, gap: SPACE.xl },
  section: { gap: SPACE.lg },
  headline: { gap: SPACE.sm },
  pair: { flexDirection: 'row', gap: SPACE.md },
  options: { gap: SPACE.md },
  or: { textAlign: 'center', color: COLOR.textTertiary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})

/** Violet world: one hue on this screen (`HueProvider`). */
export default function EventPreferences() {
  return (
    <HueProvider value="violet">
      <EventPreferencesContent />
    </HueProvider>
  )
}
