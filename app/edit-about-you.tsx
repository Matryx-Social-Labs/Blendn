import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ChipSet } from '../components/ds/ChipSet'
import { FieldLabel, FieldNotes } from '../components/ds/TextField'
import { SegmentedControl } from '../components/ds/SegmentedControl'
import { font, GroundProvider, HueProvider, useBoldText } from '../components/ds/shared'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { useToast } from '../components/Toast'
import { useToastInset } from '../components/toastDock'
import {
  aboutYouFrom,
  aboutYouUpdate,
  answersUpdate,
  answersWithin,
  withinOptions,
  NO_ABOUT_YOU,
  signName,
  splitTierB,
  tierBNames,
  tierBRefusals,
  type TierBField,
  toggleLanguage,
  type AboutYou,
  type Choice,
  type ProfileOptions,
  type SignSystem,
} from '../lib/aboutYou'
import { apiClient, ProfileCache } from '../lib/apiClient'
import { COLOR, DURATION, EASING, RADIUS, SIZE, SPACE } from '../lib/design/tokens'
import { Logger } from '../lib/logger'
import { useReducedMotion } from '../lib/motion'
import { queryCache } from '../lib/queryCache'
import { refreshAuthUser, useAuth } from '../lib/useAuth'

/** Under Reduce Motion the sign card still fades: the change is explained, not moved. */
const REDUCED_FADE_MS = 200
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
/** "up to five" from the server's cap (the design wrote "up to three"; the server's number is the true one). */
const upTo = (n: number) => `up to ${NUMBER_WORDS[n] ?? n}`

/** The two calendars, in the order the control draws them: `SIGN_SYSTEMS[index]`. */
const SIGN_SYSTEMS: readonly SignSystem[] = ['western', 'rashi']
const SIGN_SYSTEM_LABELS = ['Western', 'My rashi instead'] as const
/** Home states drawn before "+n more"; a chosen one beyond them stays drawn. */
const HOME_STATES_SHOWN = 9

/**
 * Languages, home state, your sign and this-or-that — matching v2's "about
 * you" (guidelines/round4/r4d.js `aboutYou`, 6-7; the design keeps these inside
 * Edit profile, and draws the route as it stands: loading, "Couldn't load
 * this", "Couldn't save").
 *
 * Everything here is **shown, never ranked**: a card says "You both speak
 * Malayalam" or "Both from Kerala" when two people share one, and the server
 * never sorts a room by any of it. Before a reveal, one of these at most shows
 * on a card, and none in a room under eight people (the server's budget).
 *
 * The sign is off until turned on, and is the person's own pick — never
 * preselected (step 10 review M4): beside an age a sign narrows a birthday to
 * a month, so the switch says so ("Your sign shows next to your age") and the
 * Western sign of their birth date is offered as a hint they tap to apply.
 * "My rashi instead" swaps the calendar — a rashi is usually the Moon's sign,
 * which a birth date cannot give, so it is only ever chosen.
 *
 * Saves only what changed: opening this screen and saving writes nothing.
 * Nothing on this route asks for or changes a birthday: the 18+ gate is the
 * basics step's and Edit profile's, not this screen's.
 */
function EditAboutYouScreenContent() {
  // Opened from Settings' "How you match" row it says so in its bar; from Edit profile it is "About you". A flag, not a
  // title: a route param is whatever a link says, and a bar must not be made to print it.
  const { from } = useLocalSearchParams<{ from?: string }>()
  const { user: authUser } = useAuth()
  const { showToast } = useToast()
  const insets = useSafeAreaInsets()
  const [options, setOptions] = useState<ProfileOptions | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loaded, setLoaded] = useState<AboutYou>(NO_ABOUT_YOU)
  const [form, setForm] = useState<AboutYou>(NO_ABOUT_YOU)
  const [suggestedSign, setSuggestedSign] = useState<string | null>(null)
  const [answersLoaded, setAnswersLoaded] = useState<Record<string, Choice>>({})
  const [answers, setAnswers] = useState<Record<string, Choice>>({})
  const [saving, setSaving] = useState(false)
  /** The switch, apart from the pick: on with no sign chosen saves no sign. */
  const [signOn, setSignOn] = useState(false)
  const [system, setSystem] = useState<SignSystem>('western')
  const [attempt, setAttempt] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  // The bar only needs to hear when the scroll crosses the top, not every frame of it.
  const scrolledRef = useRef(false)
  /** What the server refused, per field, in a sentence under it; cleared when the person changes that field. */
  const [tierBError, setTierBError] = useState<Partial<Record<TierBField, string>>>({})
  const clearError = (field: TierBField) => setTierBError((e) => (e[field] ? { ...e, [field]: undefined } : e))
  const scrollRef = useRef<ScrollView>(null)
  /** Where each card and field sat when laid out, to scroll the first refused one into view. */
  const ys = useRef<Record<string, number>>({})
  const toastInset = useToastInset()
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()

  useEffect(() => {
    if (!authUser) return
    let cancelled = false
    void (async () => {
      setLoadFailed(false)
      const [opts, profile, tot] = await Promise.all([apiClient.getProfileOptions(), apiClient.getProfile(authUser.id), apiClient.getThisOrThat()])
      if (cancelled) return
      if (!opts.success || !opts.data || !profile.success || !tot.success) {
        Logger.warn('profile', 'EditAboutYou: load failed', {
          opts: opts.error,
          profile: profile.error,
          tot: tot.error,
        })
        setLoadFailed(true)
        return
      }
      const p = (profile.data?.profile ?? {}) as Record<string, unknown>
      // Only what the server still offers: a retired slug never rides along (L4).
      const mine = withinOptions(aboutYouFrom(p), opts.data)
      const answered = answersWithin(tot.data?.answers ?? {}, opts.data)
      setOptions(opts.data)
      // The baseline is what the form starts from: a retired value is in neither, so it never rides along (L4) and its absence is no change.
      setLoaded(mine)
      setForm(mine)
      setSignOn(!!mine.sign)
      setSystem(mine.sign?.system ?? 'western')
      setSuggestedSign(typeof p.suggested_sun_sign === 'string' ? p.suggested_sun_sign : null)
      // Retired questions' answers are left as they are: never sent, never read.
      setAnswersLoaded(answered)
      setAnswers(answered)
    })()
    return () => {
      cancelled = true
    }
  }, [authUser, attempt])

  // Off clears the pick; on picks nothing until they tap a sign (M4).
  const toggleSign = (on: boolean) => {
    clearError('sign')
    setSignOn(on)
    if (!on) setForm((f) => ({ ...f, sign: null }))
  }
  const chooseSystem = (next: SignSystem) => {
    clearError('sign')
    setSystem(next)
    setForm((f) => (f.sign ? { ...f, sign: { ...f.sign, system: next } } : f))
  }
  const pickSign = (slug: string) => {
    clearError('sign')
    setForm((f) => ({ ...f, sign: { slug, system } }))
  }
  const hint = suggestedSign ? (options?.signs.find((x) => x.slug === suggestedSign) ?? null) : null
  // A pair's control reports the side (0 or 1), or null when the chosen one is tapped again: the answer is taken back, not stored empty.
  const setAnswer = (q: string, i: number | null) =>
    setAnswers((a) => {
      const next = { ...a }
      if (i === null) delete next[q]
      else next[q] = i === 0 ? 'a' : 'b'
      return next
    })

  const refuse = (text: string) => {
    showToast(text, 'error', { haptic: 'error' })
  }

  /**
   * Three writes, each on its own so one refusal costs only itself: the badge
   * switches, the this-or-that answers, then the Tier B facts (languages, home
   * state, sign) last. The server limits Tier B to three changes a day and
   * refuses the whole request that carries one past it, writing nothing else in
   * it; sent together, a badge switch was lost with a refused language change.
   *
   * What landed is what `loaded` becomes, field by field; what did not stays in
   * the form as the person chose it, and the toast names it. Nothing is shown as
   * saved that was not.
   */
  const save = async () => {
    if (!authUser || saving) return
    const { tierB, other } = splitTierB(aboutYouUpdate(loaded, form))
    const answerBody = answersUpdate(answersLoaded, answers)
    setSaving(true)
    setTierBError({})
    const saved: string[] = []
    let anySaved = false
    try {
      if (Object.keys(other).length) {
        const r = await apiClient.updateProfile(authUser.id, other)
        if (!r.success) throw new Error(r.error || 'profile')
        setLoaded((l) => ({
          ...l,
          showBadges: form.showBadges,
          showsUpBadge: form.showsUpBadge,
        }))
        saved.push('your badge choices')
        anySaved = true
      }
      if (Object.keys(answerBody).length) {
        const r = await apiClient.putThisOrThat(answerBody)
        if (!r.success) throw new Error(r.error || 'this-or-that')
        setAnswersLoaded(answers)
        saved.push('your this-or-that answers')
        anySaved = true
      }
      if (Object.keys(tierB).length) {
        const r = await apiClient.updateProfile(authUser.id, tierB)
        if (!r.success) {
          if (anySaved) invalidate(authUser.id)
          // The sentence goes under the field the server refused (the limit is the server's: three a day); the toast only says what landed.
          const refused = tierBRefusals(tierB, r.errorCode)
          setTierBError(refused)
          scrollToFirstRefused(refused)
          refuse(anySaved ? `Saved, except your ${tierBNames(tierB)}.` : 'Couldn’t save. Try again.')
          return
        }
        setLoaded((l) => ({
          ...l,
          languages: form.languages,
          homeState: form.homeState,
          sign: form.sign,
        }))
        anySaved = true
      }
      invalidate(authUser.id)
      showToast('Saved', 'success', { haptic: 'success' })
      router.back()
    } catch (error) {
      Logger.error('profile', 'EditAboutYou: save failed', { error })
      if (anySaved) invalidate(authUser.id)
      const lead = saved.length ? `Saved ${saved.join(' and ')}. ` : ''
      refuse(`${lead}Couldn’t save the rest. Try again.`)
    } finally {
      setSaving(false)
    }
  }

  /** The first refused field, in the order they are drawn, scrolled to just under the bar. */
  const scrollToFirstRefused = (refused: Partial<Record<TierBField, string>>) => {
    const first = (['languages', 'homeState', 'sign'] as const).find((f) => refused[f])
    if (!first) return
    const y = first === 'sign' ? ys.current.signCard : ys.current.card + (ys.current[first] ?? 0)
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - SPACE.lg), animated: !reduceMotion })
  }

  const invalidate = (userId: string) => {
    ProfileCache.clear()
    queryCache.invalidate(`profile_${userId}`)
    void refreshAuthUser()
  }

  const sign = form.sign
  return (
    <View style={styles.screen}>
      <TopBar
        title={from === 'settings' ? 'How you match' : 'About you'}
        state={scrolled ? 'scrolled' : 'rest'}
        onBack={() => router.back()}
        save={{
          onPress: () => void save(),
          saving,
          disabled: saving || !options,
        }}
        testID="about-you-top"
      />
      {loadFailed ? (
        <View style={styles.state}>
          <StateScreen
            icon="cloud-off"
            title="Couldn’t load this"
            body="Check your connection and try again."
            actions={[{ label: 'Try again', onPress: () => setAttempt((n) => n + 1) }]}
            testID="about-you-failed"
          />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          testID="about-you-scroll"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxl + toastInset }]}
          onScroll={(e) => {
            const past = e.nativeEvent.contentOffset.y > 0
            if (past === scrolledRef.current) return
            scrolledRef.current = past
            setScrolled(past)
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          <Intro />
          {options ? (
            <>
              <GroundProvider value="surface">
                <View style={styles.card} onLayout={(e) => (ys.current.card = e.nativeEvent.layout.y)}>
                  <View onLayout={(e) => (ys.current.languages = e.nativeEvent.layout.y)}>
                    <ChipSet
                      label="Languages you speak"
                      hint={`Besides English, ${upTo(options.maxLanguages)}.`}
                      items={options.languages.map((l) => ({
                        key: l.slug,
                        label: l.label,
                      }))}
                      selection="multi"
                      selected={form.languages}
                      max={options.maxLanguages}
                      // At the cap the rest dim and say why, instead of a tap that does nothing.
                      capHint={`Up to ${NUMBER_WORDS[options.maxLanguages] ?? options.maxLanguages}`}
                      onToggle={(slug) => {
                        clearError('languages')
                        setForm((f) => ({
                          ...f,
                          languages: toggleLanguage(f.languages, slug, options.maxLanguages),
                        }))
                      }}
                      error={tierBError.languages}
                      testID="about-you-languages"
                    />
                  </View>
                  <View onLayout={(e) => (ys.current.homeState = e.nativeEvent.layout.y)}>
                    <ChipSet
                      label="Home state"
                      hint="A state, never a town. Tap again to clear."
                      items={options.homeStates.map((s) => ({
                        key: s.slug,
                        label: s.label,
                      }))}
                      selection="single"
                      selected={form.homeState ? [form.homeState] : []}
                      foldAfter={HOME_STATES_SHOWN}
                      foldNoun="home states"
                      onToggle={(slug) => {
                        clearError('homeState')
                        setForm((f) => ({
                          ...f,
                          homeState: f.homeState === slug ? null : slug,
                        }))
                      }}
                      error={tierBError.homeState}
                      testID="about-you-home-state"
                    />
                  </View>
                  {options.thisOrThat.length ? (
                    <View style={styles.field}>
                      <FieldLabel text="This or that" bold={bold} contrast={false} />
                      {options.thisOrThat.map((q) => (
                        <SegmentedControl
                          key={q.slug}
                          pair
                          items={[q.a, q.b]}
                          selected={answers[q.slug] === 'a' ? 0 : answers[q.slug] === 'b' ? 1 : null}
                          onChange={(i) => setAnswer(q.slug, i)}
                          testID={`about-you-pair-${q.slug}`}
                        />
                      ))}
                      <FieldNotes hint="Pick one, or leave it. Tap again to take it back." bold={bold} />
                    </View>
                  ) : null}
                </View>
              </GroundProvider>

              <SettingsGroup>
                <SettingsRow
                  icon="sparkles"
                  title="Show my sign"
                  hint={'Your sign shows next to your age. A fun line on cards — "Both Leos ♌" — never used to match you.'}
                  trail="switch"
                  value={signOn}
                  onValueChange={toggleSign}
                />
              </SettingsGroup>
              {signOn ? (
                // The calendar and the twelve signs arrive and leave over base, not with a cut; what is below glides.
                <GroundProvider value="surface">
                  <Animated.View
                    testID="about-you-sign-card"
                    entering={reduceMotion ? FadeIn.duration(REDUCED_FADE_MS) : FadeIn.duration(DURATION.base)}
                    exiting={FadeOut.duration(DURATION.quick)}
                    style={styles.card}
                    onLayout={(e) => (ys.current.signCard = e.nativeEvent.layout.y)}
                  >
                    <SegmentedControl
                      semantics="radio"
                      items={SIGN_SYSTEM_LABELS}
                      selected={SIGN_SYSTEMS.indexOf(system)}
                      onChange={(i) => chooseSystem(SIGN_SYSTEMS[i])}
                      testID="about-you-system"
                    />
                    {hint && !sign ? (
                      <BirthdaySign
                        text={`From your birthday: ${signName(hint, 'western')} — tap to use`}
                        onPress={() => {
                          clearError('sign')
                          setSystem('western')
                          setForm((f) => ({
                            ...f,
                            sign: { slug: hint.slug, system: 'western' },
                          }))
                        }}
                      />
                    ) : null}
                    <ChipSet
                      items={options.signs.map((s) => ({
                        key: s.slug,
                        label: signName(s, system),
                      }))}
                      selection="single"
                      selected={sign ? [sign.slug] : []}
                      onToggle={pickSign}
                      error={tierBError.sign}
                      testID="about-you-signs"
                    />
                  </Animated.View>
                </GroundProvider>
              ) : null}

              <Animated.View layout={reduceMotion ? undefined : LinearTransition.duration(DURATION.base).easing(Easing.bezier(...EASING.standard))}>
                <SettingsGroup>
                  <SettingsRow
                    icon="badge-check"
                    title="Show my badges"
                    hint="Earned by checking in — like “Regular here”. Off hides every badge on your card."
                    trail="switch"
                    value={form.showBadges}
                    onValueChange={(v) => setForm((f) => ({ ...f, showBadges: v }))}
                  />
                  <SettingsRow
                    icon="calendar-check"
                    title="Show “Shows up” on my card"
                    hint="Once you've checked in to 80% of the events you said you'd go to (at least 3)."
                    trail="switch"
                    value={form.showsUpBadge}
                    onValueChange={(v) => setForm((f) => ({ ...f, showsUpBadge: v }))}
                  />
                </SettingsGroup>
              </Animated.View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

/** The one line under the title; while loading it is all there is (Save is off). */
function Intro() {
  const bold = useBoldText()
  return (
    <Text style={[font('meta', bold), styles.intro]}>
      Where you’re from, what you speak, your sign. Each shows only to people who may already see who you are.
    </Text>
  )
}

/** The sign of their birth date, offered as a line to tap (never applied by itself): it wraps, where a chip would clip. */
function BirthdaySign({ text, onPress }: { text: string; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={text} style={styles.birthday}>
      <Text style={[font('meta', bold), styles.ink]}>{text}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  content: {
    paddingHorizontal: SPACE.gutter,
    paddingTop: SPACE.sm,
    gap: SPACE.lg,
  },
  state: { flex: 1, paddingHorizontal: SPACE.gutter, justifyContent: 'center' },
  intro: { color: COLOR.textSecondary },
  ink: { color: COLOR.textPrimary },
  birthday: { minHeight: SIZE.targetAndroid, justifyContent: 'center' },
  card: {
    borderRadius: RADIUS.card,
    backgroundColor: COLOR.surface,
    padding: SPACE.lg,
    gap: SPACE.lg,
  },
  field: { gap: SPACE.sm },
})

/** Violet world: one hue on this screen (`HueProvider`). */
export default function EditAboutYouScreen() {
  return (
    <HueProvider value="violet">
      <EditAboutYouScreenContent />
    </HueProvider>
  )
}
