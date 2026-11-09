import { TopBar } from '../../components/ds/TopBar'
import { useTopBarOverlay } from '../../lib/useTopBarState'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'

import { Avatar } from '../../components/ds/Avatar'
import { Button } from '../../components/ds/Button'
import { Dock } from '../../components/ds/Dock'
import { Orbs } from '../../components/ds/Orbs'
import { LookingForCard } from '../../components/ds/LookingForCard'
import { RadioCard } from '../../components/ds/RadioCard'
import { SettingsRow } from '../../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { bannerFadeIn, bannerOut } from '../../components/motion/presence'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { checkInChanged, intentAnswered } from '../../lib/checkIn'
import { COLOR, MAX_FONT_SCALE, SPACE, SPRING } from '../../lib/design/tokens'
import { toggleIntent } from '../../lib/intents'
import { Logger } from '../../lib/logger'
import { firstNameOf } from '../../lib/profileIdentity'
import { revealReadiness, type RevealReadiness } from '../../lib/reveal'
import { myRoomFace, pseudonymFromParam } from '../../lib/roomState'
import { useAuth } from '../../lib/useAuth'
import { RouteModal } from '../../components/system/RouteModal'
import { useReducedMotion } from '../../lib/motion'

/**
 * Why you are here tonight, and whether people can see who you are (Flow 3 `prefs`).
 *
 * `DESIGN_HANDOFF.md` calls the reveal control "the single most important new
 * screen", because it is the counterpart to the whole pseudonymity model.
 *
 * ## Two questions, one primary
 *
 * A glass close at the top, the first question as the screen's `title`, the second as a `heading`,
 * and Save docked on a glass bar so it is always in reach and never under the home indicator. Reveal is two
 * lead `RadioCard`s (Flow 4 `prefs`, SCRUM-1025): Anonymous with your room creature and the pseudonym itself, Named with
 * your face and first name, each value in its own slot. The intents are onboarding's photo tiles, three across, any of
 * them at once. "Just here for the event" stands apart behind an "or", because choosing it clears the others and that
 * should be visible before it happens.
 *
 * ## The two things this sets
 *
 * **Intent** — why you are here. A tag and a ranking signal, never a partition:
 * everyone is in one pool. Splitting a new app's pool by intent empties both
 * halves, and "just here for the event" is a first-class answer rather than a
 * failure to choose.
 *
 * **Reveal** — whether your first name and photo are visible in this room.
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

const ART: Record<Exclude<Intent, 'just_here'>, number> = {
  networking: require('../../assets/onboarding/looking-networking.jpg'),
  friendship: require('../../assets/onboarding/looking-friendship.jpg'),
  dating: require('../../assets/onboarding/looking-dating.jpg'),
}

const AVATAR = 56
/** The anonymous card before the room has given you a pseudonym (opened from check-in, ahead of the room). */
const NO_PSEUDONYM_YET = 'A made-up name'
/** Flow 4 `.sub`, `.rc2`, `.t20`, `.ic3`, `.orl`: the board's gaps between the pieces, which sit off the 4-pt scale. */
const SUB_GAP = SPACE.xs + SPACE.xxs
const CARDS_GAP = SPACE.lg + SPACE.xxs
const SECOND_HEAD_GAP = SPACE.xl + SPACE.xs
const TILES_GAP = SPACE.md + SPACE.xxs
const TILE_GAP = SPACE.sm + SPACE.xxs

/** A section's question and its line: the screen's title when it leads, a heading when it follows (Flow 4 `.t24` / `.t20`). */
function Head({ lead, title, sub, bold }: { lead: boolean; title: string; sub: string; bold: boolean }) {
  const role = lead ? 'title' : 'heading'
  return (
    <View style={styles.head}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE[role]} style={[font(role, bold), styles.ink]}>
        {title}
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.lede} style={[font('lede', bold), styles.secondary]}>
        {sub}
      </Text>
    </View>
  )
}

function EventPreferencesContent() {
  // `revealed` arrives from the status chip, which already knows it. There is
  // no GET for per-event preferences, and adding a round trip to learn
  // something the caller is holding would be the wrong trade.
  const { eventId, revealed: initialRevealed, askIntent: askIntentParam, pseudonym: pseudonymParam } = useLocalSearchParams<{
    eventId: string
    revealed?: string
    askIntent?: string
    /** From the room (`roomSettingsRoute`): this screen cannot ask, because `GET /events/:id/chat` joins the room. */
    pseudonym?: string
  }>()
  const pseudonym = pseudonymFromParam(pseudonymParam)
  /*
   * "Why do you go out?" — asked at the door of the first room.
   *
   * Onboarding now asks it ("Why you go out", OUT-01), but older accounts and
   * anyone who skipped that step have no `intent_default`, and the board refuses
   * them ("add … why you go out") for it. No backfill (E14): this is their ask.
   * Check-in says `intentNeeded` while there is no
   * default; the events tab sends people here with this flag, the intent
   * leads, and the answer is saved as the default in the same write.
   */
  const askIntent = askIntentParam === '1'
  // A check-in waits for this question before its room shows (lib/checkIn.ts). Closed for a link, the wait has already
  // settled `abandoned` before this unmounts; this says `closed` only for the person's own way out (save, ×, back).
  useEffect(() => (askIntent ? () => intentAnswered('closed') : undefined), [askIntent])
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
  const [firstName, setFirstName] = useState<string | null>(null)
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
        const name: unknown = res.data.profile?.name || res.data.name
        setPhoto(typeof photos[0] === 'string' ? photos[0] : null)
        setFirstName(typeof name === 'string' && name.trim() ? firstNameOf(name) : null)
        setCanReveal(revealReadiness({ name: typeof name === 'string' ? name : undefined, photos }))
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
        showToast(res.error || 'Couldn’t save that. Try again.', 'error', { haptic: 'error' })
        return
      }
      // The Room and the tab bar read the reveal from caches this just made stale: say so, don't wait on a poll (ROOM-03).
      checkInChanged(String(eventId))
      leave()
    } catch (e) {
      Logger.error('match', 'Failed to save match preferences', { error: e })
      showToast('Couldn’t save that. Try again.', 'error', { haptic: 'error' })
    } finally {
      setSaving(false)
    }
  }, [askIntent, eventId, intent, intentTouched, leave, rememberReveal, revealed, saving, showToast])

  const intents = under18 ? INTENTS.filter((i) => i.value !== 'dating') : INTENTS
  const lookingIntents = intents.filter((i) => i.value !== 'just_here')
  const justHere = intents.find((i) => i.value === 'just_here')

  const tile = (opt: (typeof INTENTS)[number]) => (
    <LookingForCard
      key={opt.value}
      size="tall"
      label={opt.label}
      image={ART[opt.value as Exclude<Intent, 'just_here'>]}
      selected={intent.includes(opt.value)}
      onPress={() => onToggleIntent(opt.value)}
      testID={`prefs-intent-${opt.value}`}
    />
  )

  const blocked = canReveal ? !canReveal.ok : false
  const namedHint = blocked
    ? `Add ${canReveal?.missing} to your profile first. That’s what other people would see.`
    : 'Your first name and photo.'
  // Layout glides when the "future events" row arrives; Reduce Motion cuts (U-L11).
  const glide = reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)

  const revealBlock = (
    <Animated.View layout={glide} style={askIntent ? styles.second : undefined}>
      <Head lead={!askIntent} title="Can people see who you are?" sub="Just for this room." bold={bold} />
      <View style={styles.pair} accessibilityRole="radiogroup">
        <RadioCard
          layout="lead"
          title="Anonymous"
          detail={pseudonym ?? NO_PSEUDONYM_YET}
          hint="That’s all people here see, plus what you have in common."
          // The room's own face for you (lib/roomState.ts): your pseudonym's creature, or the room's stand-in before it has one.
          avatar={<Avatar {...myRoomFace({ revealed: false, photo: null, pseudonym, eventId: String(eventId) })} size={AVATAR} ring={COLOR.surface} />}
          selected={!revealed}
          onPress={() => setRevealed(false)}
          testID="prefs-anonymous"
        />
        <RadioCard
          layout="lead"
          title="Named"
          detail={firstName ?? undefined}
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
        // M16: the line fades in and out; opacity only, so Reduce Motion keeps it.
        <Animated.View entering={bannerFadeIn} exiting={bannerOut} style={styles.remember}>
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
    <Animated.View layout={glide} style={askIntent ? undefined : styles.second}>
      {askIntent ? (
        <Head lead title="Why do you go out?" sub="It shapes who you’re introduced to. We’ll remember this for future events; change it any time from your profile." bold={bold} />
      ) : (
        <Head lead={false} title="Why are you here tonight?" sub="Only for tonight. Your usual answer stays as it is." bold={bold} />
      )}
      <View style={styles.tiles}>{lookingIntents.map(tile)}</View>
      {justHere ? (
        <>
          {/* Exclusive of the tiles above: choosing it clears them, so it stands apart. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.or}>
            <View style={styles.orLine} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
              or
            </Text>
            <View style={styles.orLine} />
          </View>
          <RadioCard
            layout="row"
            title={justHere.label}
            hint={justHere.hint}
            selected={intent.includes('just_here')}
            deselectable
            onPress={() => onToggleIntent('just_here')}
            testID="prefs-intent-just_here"
          />
        </>
      ) : null}
    </Animated.View>
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
  scroll: { paddingHorizontal: SPACE.gutter },
  head: { gap: SUB_GAP },
  second: { marginTop: SECOND_HEAD_GAP },
  pair: { flexDirection: 'row', gap: SPACE.md, marginTop: CARDS_GAP },
  remember: { marginTop: SPACE.md },
  tiles: { flexDirection: 'row', gap: TILE_GAP, marginTop: TILES_GAP },
  or: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginVertical: SPACE.lg },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairlineStrong },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})

/** Violet world: one hue on this screen (`HueProvider`). */
export default function EventPreferences() {
  return (
    <HueProvider value="violet">
      <RouteModal>
        <EventPreferencesContent />
      </RouteModal>
    </HueProvider>
  )
}
