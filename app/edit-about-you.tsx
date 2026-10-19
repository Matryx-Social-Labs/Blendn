import { router } from 'expo-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Chip } from '../components/ds/Chip'
import { SegmentedControl } from '../components/ds/SegmentedControl'
import { font, useBoldText } from '../components/ds/shared'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { StateScreen } from '../components/ds/StateScreen'
import { FieldLabel, FieldNotes } from '../components/ds/TextField'
import { TopBar } from '../components/ds/TopBar'
import { useToast } from '../components/Toast'
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
  toggleLanguage,
  type AboutYou,
  type Choice,
  type ProfileOptions,
  type SignSystem,
} from '../lib/aboutYou'
import { apiClient, ProfileCache } from '../lib/apiClient'
import { COLOR, RADIUS, SIZE, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { Logger } from '../lib/logger'
import { queryCache } from '../lib/queryCache'
import { refreshAuthUser, useAuth } from '../lib/useAuth'

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
/** "up to five" from the server's cap (the design wrote "up to three"; the server's number is the true one). */
const upTo = (n: number) => `up to ${NUMBER_WORDS[n] ?? n}`

/** The two calendars, in the order the control draws them: `SIGN_SYSTEMS[index]`. */
const SIGN_SYSTEMS: readonly SignSystem[] = ['western', 'rashi']
const SIGN_SYSTEM_LABELS = ['Western', 'My rashi instead'] as const

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
export default function EditAboutYouScreen() {
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

  useEffect(() => {
    if (!authUser) return
    let cancelled = false
    void (async () => {
      setLoadFailed(false)
      const [opts, profile, tot] = await Promise.all([
        apiClient.getProfileOptions(),
        apiClient.getProfile(authUser.id),
        apiClient.getThisOrThat(),
      ])
      if (cancelled) return
      if (!opts.success || !opts.data || !profile.success || !tot.success) {
        Logger.warn('profile', 'EditAboutYou: load failed', { opts: opts.error, profile: profile.error, tot: tot.error })
        setLoadFailed(true)
        return
      }
      const p = (profile.data?.profile ?? {}) as Record<string, unknown>
      // Only what the server still offers: a retired slug never rides along (L4).
      const mine = withinOptions(aboutYouFrom(p), opts.data)
      const answered = answersWithin(tot.data?.answers ?? {}, opts.data)
      setOptions(opts.data)
      setLoaded(aboutYouFrom(p))
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
    setSignOn(on)
    if (!on) setForm((f) => ({ ...f, sign: null }))
  }
  const chooseSystem = (next: SignSystem) => {
    setSystem(next)
    setForm((f) => (f.sign ? { ...f, sign: { ...f.sign, system: next } } : f))
  }
  const pickSign = (slug: string) => setForm((f) => ({ ...f, sign: { slug, system } }))
  const hint = suggestedSign ? options?.signs.find((x) => x.slug === suggestedSign) ?? null : null
  const pick = (q: string, c: Choice) =>
    setAnswers((a) => {
      const next = { ...a }
      if (next[q] === c) delete next[q]
      else next[q] = c
      return next
    })

  const refuse = (text: string) => {
    H.error()
    showToast(text, 'error')
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
    const saved: string[] = []
    let anySaved = false
    try {
      if (Object.keys(other).length) {
        const r = await apiClient.updateProfile(authUser.id, other)
        if (!r.success) throw new Error(r.error || 'profile')
        setLoaded((l) => ({ ...l, showBadges: form.showBadges, showsUpBadge: form.showsUpBadge }))
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
          const lead = saved.length ? `Saved ${saved.join(' and ')}. ` : ''
          const why = r.errorCode === 'RATE_LIMITED' && r.error ? r.error : 'Try again.'
          refuse(`${lead}Not saved: your ${tierBNames(tierB)}. ${why}`)
          return
        }
        setLoaded((l) => ({ ...l, languages: form.languages, homeState: form.homeState, sign: form.sign }))
        anySaved = true
      }
      invalidate(authUser.id)
      H.success()
      showToast('Saved', 'success')
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

  const invalidate = (userId: string) => {
    ProfileCache.clear()
    queryCache.invalidate(`profile_${userId}`)
    void refreshAuthUser()
  }

  const sign = form.sign
  return (
    <View style={styles.screen}>
      <TopBar
        title="About you"
        state={scrolled ? 'scrolled' : 'rest'}
        onBack={() => router.back()}
        save={{ onPress: () => void save(), saving, disabled: saving || !options }}
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
          testID="about-you-scroll"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxl }]}
          onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 0)}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          <Intro />
          {options ? (
            <>
              <View style={styles.card}>
                <Field label="Languages you speak" hint={`Besides English, ${upTo(options.maxLanguages)}.`}>
                  {options.languages.map((l) => (
                    <Chip
                      key={l.slug}
                      label={l.label}
                      selected={form.languages.includes(l.slug)}
                      // At the cap the rest dim and say why, instead of a tap that does nothing.
                      dimmed={!form.languages.includes(l.slug) && form.languages.length >= options.maxLanguages}
                      capHint={`Up to ${NUMBER_WORDS[options.maxLanguages] ?? options.maxLanguages}`}
                      onPress={() => setForm((f) => ({ ...f, languages: toggleLanguage(f.languages, l.slug, options.maxLanguages) }))}
                    />
                  ))}
                </Field>
                <Field label="Home state" hint="A state, never a town. Tap again to clear.">
                  {options.homeStates.map((s) => (
                    <Chip
                      key={s.slug}
                      label={s.label}
                      selected={form.homeState === s.slug}
                      onPress={() => setForm((f) => ({ ...f, homeState: f.homeState === s.slug ? null : s.slug }))}
                    />
                  ))}
                </Field>
                {options.thisOrThat.length ? (
                  <Field label="This or that" hint="Pick one, or leave it. Tap again to take it back.">
                    {options.thisOrThat.map((q) => (
                      <View key={q.slug} style={styles.pair} accessibilityLabel={`${q.a} or ${q.b}`}>
                        <Chip label={q.a} selected={answers[q.slug] === 'a'} onPress={() => pick(q.slug, 'a')} />
                        <Chip label={q.b} selected={answers[q.slug] === 'b'} onPress={() => pick(q.slug, 'b')} />
                      </View>
                    ))}
                  </Field>
                ) : null}
              </View>

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
                <View style={styles.card}>
                  <SegmentedControl
                    items={SIGN_SYSTEM_LABELS}
                    selected={SIGN_SYSTEMS.indexOf(system)}
                    onChange={(i) => chooseSystem(SIGN_SYSTEMS[i])}
                    testID="about-you-system"
                  />
                  {hint && !sign ? (
                    <BirthdaySign
                      text={`From your birthday: ${signName(hint, 'western')} — tap to use`}
                      onPress={() => {
                        setSystem('western')
                        setForm((f) => ({ ...f, sign: { slug: hint.slug, system: 'western' } }))
                      }}
                    />
                  ) : null}
                  <View style={styles.chips}>
                    {options.signs.map((s) => (
                      <Chip key={s.slug} label={signName(s, system)} selected={sign?.slug === s.slug} onPress={() => pickSign(s.slug)} />
                    ))}
                  </View>
                </View>
              ) : null}

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

/** A labelled set of chips on the card: the mono label, the chips wrapping, a hint under. */
function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  const bold = useBoldText()
  return (
    <View style={styles.field}>
      <FieldLabel text={label} bold={bold} contrast={false} />
      <View style={styles.chips}>{children}</View>
      <FieldNotes hint={hint} bold={bold} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, gap: SPACE.lg },
  state: { flex: 1, paddingHorizontal: SPACE.gutter, justifyContent: 'center' },
  intro: { color: COLOR.textSecondary },
  ink: { color: COLOR.textPrimary },
  birthday: { minHeight: SIZE.targetAndroid, justifyContent: 'center' },
  card: { borderRadius: RADIUS.card, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.lg },
  field: { gap: SPACE.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
})
