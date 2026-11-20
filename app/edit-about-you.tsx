import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../components/ds/Button'
import { ChipSet } from '../components/ds/ChipSet'
import { WhoSees } from '../components/profile/WhoSees'
import { FieldLabelCase, FieldNotes } from '../components/ds/TextField'
import { SegmentedControl } from '../components/ds/SegmentedControl'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { Sheet } from '../components/ds/Sheet'
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
import { COLOR, SIZE, SPACE, MAX_FONT_SCALE } from '../lib/design/tokens'
import { Logger } from '../lib/logger'
import { useReducedMotion } from '../lib/motion'
import { queryCache } from '../lib/queryCache'
import { refreshAuthUser, useAuth } from '../lib/useAuth'
import { useHomeCountry } from '../lib/homeCity'

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
/** "up to five" from the server's cap (the design wrote "up to three"; the server's number is the true one). */
const upTo = (n: number) => `up to ${NUMBER_WORDS[n] ?? n}`

/** The two calendars, in the order the control draws them: `SIGN_SYSTEMS[index]`. */
const SIGN_SYSTEMS: readonly SignSystem[] = ['western', 'rashi']
const SIGN_SYSTEM_LABELS = ['Western', 'My rashi instead'] as const
/** The calendar as the Sign row names it: "Leo ♌ · Western". */
const SIGN_SYSTEM_NAME: Record<SignSystem, string> = { western: 'Western', rashi: 'Rashi' }
/** Home states drawn before "+n more"; a chosen one beyond them stays drawn. */
const HOME_STATES_SHOWN = 9
/** Languages fold like Home state, after the same nine (D-L9); a picked one is always shown (`foldedItems`). */
export const LANGUAGES_SHOWN = HOME_STATES_SHOWN

/** The four fields, each a row that opens its picker in a sheet (board A 04). */
type AboutRow = 'languages' | 'home-state' | 'sign' | 'this-or-that'
const ROW_TITLE: Record<AboutRow, string> = {
  languages: 'Languages you speak',
  'home-state': 'Home region',
  sign: 'Sign',
  'this-or-that': 'This or that',
}
const ROW_ICON = { languages: 'message-circle', 'home-state': 'map-pin', sign: 'star', 'this-or-that': 'sparkles' } as const
/** The Tier B field each row saves, for its refusal. */
const ROW_FIELD = { languages: 'languages', 'home-state': 'homeState', sign: 'sign' } as const
/** A row with nothing picked. */
const UNSET = 'Not set'
const SIGN_LINE = 'Your sign shows next to your age. A fun line on cards — “Both Leos ♌” — never used to match you.'

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
  /** The account's country (undefined while it is still known): the server serves that country's lists (SCRUM-711). */
  const country = useHomeCountry(authUser?.id)
  const shown = options
  const [attempt, setAttempt] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  // The bar only needs to hear when the scroll crosses the top, not every frame of it.
  const scrolledRef = useRef(false)
  /** What the server refused, per field, in a sentence under it; cleared when the person changes that field. */
  const [tierBError, setTierBError] = useState<Partial<Record<TierBField, string>>>({})
  const clearError = (field: TierBField) => setTierBError((e) => (e[field] ? { ...e, [field]: undefined } : e))
  const scrollRef = useRef<ScrollView>(null)
  /** Where the rows sat when laid out, to bring a refused one into view. */
  const rowsY = useRef<number | undefined>(undefined)
  /** One sheet per row, each with its own content and height (Android drew a reused sheet off screen, #585). */
  const [sheet, setSheet] = useState<{ row: AboutRow; open: boolean }>({ row: 'languages', open: false })
  const openSheet = (row: AboutRow) => setSheet({ row, open: true })
  const toastInset = useToastInset()
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()

  useEffect(() => {
    if (!authUser || country === undefined) return
    let cancelled = false
    void (async () => {
      setLoadFailed(false)
      const [opts, profile, tot] = await Promise.all([apiClient.getProfileOptions(country), apiClient.getProfile(authUser.id), apiClient.getThisOrThat()])
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
  }, [authUser, attempt, country])

  // Off clears the pick; on picks nothing until they tap a sign (M4).
  // On with no sign yet opens the Sign sheet, where the twelve are; off clears the pick (M4).
  const toggleSign = (on: boolean) => {
    clearError('sign')
    setSignOn(on)
    if (!on) setForm((f) => ({ ...f, sign: null }))
    else if (!form.sign) openSheet('sign')
  }
  // Closed with no sign picked, the switch goes back off: it never claims a sign that is not there.
  const closeSheet = () => {
    setSheet((prev) => ({ ...prev, open: false }))
    if (sheet.row === 'sign' && !form.sign) setSignOn(false)
  }
  const chooseSystem = (next: SignSystem) => {
    clearError('sign')
    setSystem(next)
    setForm((f) => (f.sign ? { ...f, sign: { ...f.sign, system: next } } : f))
  }
  const pickSign = (slug: string) => {
    clearError('sign')
    setSignOn(true)
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

  /** The rows, where a refusal is said, scrolled to just under the bar. */
  const scrollToFirstRefused = (refused: Partial<Record<TierBField, string>>) => {
    if (!Object.values(refused).some(Boolean)) return
    scrollRef.current?.scrollTo({ y: Math.max(0, (rowsY.current ?? 0) - SPACE.lg), animated: !reduceMotion })
  }

  const invalidate = (userId: string) => {
    ProfileCache.clear()
    queryCache.invalidate(`profile_${userId}`)
    void refreshAuthUser()
  }

  const sign = form.sign
  /** Home region and This or that only where this country has them; a held region always shows, to be cleared. */
  const rows: AboutRow[] = (['languages', 'home-state', 'sign', 'this-or-that'] as const).filter(
    (r) => (r !== 'home-state' || !!shown?.homeStates.length) && (r !== 'this-or-that' || !!shown?.thisOrThat.length)
  )
  /** "Besides English" only where English is not on the list (India's leaves it out; Canada's lists it first). */
  const besidesEnglish = !!shown && !shown.languages.some((l) => l.slug === 'english')
  /** The country's own word for a region, from the server; "region" for an older server that sends none. */
  const regionWord = shown?.regionWord ?? 'region'
  const labelOf = (list: readonly { slug: string; label: string }[] | undefined, slug: string) => list?.find((x) => x.slug === slug)?.label
  const signOption = sign ? options?.signs.find((x) => x.slug === sign.slug) : undefined
  const answered = (shown?.thisOrThat ?? []).flatMap((q) => (answers[q.slug] === 'a' ? [q.a] : answers[q.slug] === 'b' ? [q.b] : []))
  /** What each row holds, as board A 04 writes it: "French, Tamil · besides English, up to 3". */
  const rowHints: Record<AboutRow, string> = {
    languages: `${form.languages.map((l) => labelOf(shown?.languages, l)).filter(Boolean).join(', ') || UNSET} · ${besidesEnglish ? 'besides English, ' : ''}${upTo(options?.maxLanguages ?? 0)}`,
    'home-state': `${(form.homeState && labelOf(shown?.homeStates, form.homeState)) || UNSET} · a ${regionWord}, never a town`,
    sign: signOption && sign ? `${signName(signOption, sign.system)} · ${SIGN_SYSTEM_NAME[sign.system]}` : UNSET,
    'this-or-that': answered.join(' · ') || UNSET,
  }
  /** The server's sentence for a refused field, said on its row (and under its picker in the sheet). */
  const rowError = (row: AboutRow) => (row === 'this-or-that' ? undefined : tierBError[ROW_FIELD[row]])
  const sheetFor = (row: AboutRow) => ({
    visible: sheet.open && sheet.row === row,
    onClose: closeSheet,
    title: ROW_TITLE[row],
    actions: [{ label: 'Done', kind: 'secondary' as const, onPress: closeSheet, testID: `about-you-${row}-done` }],
    testID: `about-you-${row}-sheet`,
  })
  return (
    <View style={styles.screen}>
      <TopBar
        title="Shown when you share one"
        state={scrolled ? 'scrolled' : 'rest'}
        onBack={() => router.back()}
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
          contentContainerStyle={[styles.content, { paddingBottom: SPACE.xxl + toastInset }]}
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
              <View onLayout={(e) => (rowsY.current = e.nativeEvent.layout.y)}>
                <SettingsGroup>
                  {rows.map((row) => (
                    <SettingsRow
                      key={row}
                      icon={ROW_ICON[row]}
                      title={ROW_TITLE[row]}
                      hint={rowError(row) ?? rowHints[row]}
                      error={!!rowError(row)}
                      trail="chevron"
                      onPress={() => openSheet(row)}
                      testID={`about-you-row-${row}`}
                    />
                  ))}
                </SettingsGroup>
              </View>
              <SettingsGroup title="On your card" testID="about-you-on-card">
                <SettingsRow icon="eye" title="Show my sign" trail="switch" value={signOn} onValueChange={toggleSign} />
                <SettingsRow
                  icon="badge-check"
                  title="Show my badges"
                  hint="Never shown in rooms under 8"
                  trail="switch"
                  value={form.showBadges}
                  onValueChange={(v) => setForm((f) => ({ ...f, showBadges: v }))}
                />
                <SettingsRow
                  icon="calendar-check"
                  title="Show “Shows up”"
                  hint="80%+ of your RSVPs became nights, 3 or more"
                  trail="switch"
                  value={form.showsUpBadge}
                  onValueChange={(v) => setForm((f) => ({ ...f, showsUpBadge: v }))}
                />
              </SettingsGroup>
            </>
          ) : null}
        </ScrollView>
      )}
      {loadFailed ? null : (
        // Pinned at the foot (board A 04): the bar's one line keeps the screen's whole name, and Save is the one full gradient.
        <View style={[styles.footer, { paddingBottom: insets.bottom + SPACE.sm }]}>
          <Button kind="primary" size="lg" label="Save" loading={saving} disabled={saving || !options} onPress={() => void save()} testID="about-you-save" />
        </View>
      )}
      {options ? (
        <>
          <Sheet {...sheetFor('languages')}>
            <View style={styles.sheetBody}>
              <ChipSet
                hint={besidesEnglish ? `Besides English, ${upTo(options.maxLanguages)}.` : `${upTo(options.maxLanguages).replace(/^u/, 'U')}.`}
                items={(shown?.languages ?? []).map((l) => ({ key: l.slug, label: l.label }))}
                selection="multi"
                selected={form.languages}
                max={options.maxLanguages}
                // Folds like Home region (D-L9): 21 chips unfolded made a long sheet.
                foldAfter={LANGUAGES_SHOWN}
                foldNoun="languages"
                // At the cap the rest dim and say why, instead of a tap that does nothing.
                capHint={`Up to ${NUMBER_WORDS[options.maxLanguages] ?? options.maxLanguages}`}
                onToggle={(slug) => {
                  clearError('languages')
                  setForm((f) => ({ ...f, languages: toggleLanguage(f.languages, slug, options.maxLanguages) }))
                }}
                error={tierBError.languages}
                testID="about-you-languages"
              />
              <WhoSees field="languages" />
            </View>
          </Sheet>
          {shown?.homeStates.length ? (
            <Sheet {...sheetFor('home-state')}>
              <View style={styles.sheetBody}>
                <ChipSet
                  hint={`A ${regionWord}, never a town. Tap again to clear.`}
                  items={shown.homeStates.map((x) => ({ key: x.slug, label: x.label }))}
                  selection="single"
                  selected={form.homeState ? [form.homeState] : []}
                  foldAfter={HOME_STATES_SHOWN}
                  foldNoun="regions"
                  onToggle={(slug) => {
                    clearError('homeState')
                    setForm((f) => ({ ...f, homeState: f.homeState === slug ? null : slug }))
                  }}
                  error={tierBError.homeState}
                  testID="about-you-home-state"
                />
                <WhoSees field="homeState" />
              </View>
            </Sheet>
          ) : null}
          <Sheet {...sheetFor('sign')}>
            <View style={styles.sheetBody}>
              <FieldNotes hint={SIGN_LINE} bold={bold} />
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
                    setSignOn(true)
                    setForm((f) => ({ ...f, sign: { slug: hint.slug, system: 'western' } }))
                  }}
                />
              ) : null}
              <ChipSet
                items={options.signs.map((x) => ({ key: x.slug, label: signName(x, system) }))}
                selection="single"
                selected={sign ? [sign.slug] : []}
                onToggle={pickSign}
                error={tierBError.sign}
                testID="about-you-signs"
              />
              <WhoSees field="sign" />
            </View>
          </Sheet>
          {shown?.thisOrThat.length ? (
            <Sheet {...sheetFor('this-or-that')}>
              <View style={styles.sheetBody}>
                {shown.thisOrThat.map((q) => (
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
                <WhoSees field="thisOrThat" />
              </View>
            </Sheet>
          ) : null}
        </>
      ) : null}
    </View>
  )
}

/** The one line under the title; while loading it is all there is (Save is off). */
function Intro() {
  const bold = useBoldText()
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.intro]}>
      On cards only when you and someone share one. Never used to rank.
    </Text>
  )
}

/** The sign of their birth date, offered as a line to tap (never applied by itself): it wraps, where a chip would clip. */
function BirthdaySign({ text, onPress }: { text: string; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={text} style={styles.birthday}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink]}>{text}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  footer: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, backgroundColor: COLOR.ink },
  content: {
    paddingHorizontal: SPACE.gutter,
    paddingTop: SPACE.sm,
    gap: SPACE.lg,
  },
  state: { flex: 1, paddingHorizontal: SPACE.gutter, justifyContent: 'center' },
  intro: { color: COLOR.textSecondary },
  ink: { color: COLOR.textPrimary },
  birthday: { minHeight: SIZE.targetAndroid, justifyContent: 'center' },
  sheetBody: { gap: SPACE.md },
})

/** Violet world: one hue on this screen (`HueProvider`). */
export default function EditAboutYouScreen() {
  return (
    <HueProvider value="violet">
      <FieldLabelCase.Provider value="sentence">
      <EditAboutYouScreenContent />
      </FieldLabelCase.Provider>
    </HueProvider>
  )
}
