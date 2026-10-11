import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../components/AppHeader'
import { LoadError } from '../components/LoadError'
import { EmberChip, EmberChipRow, EmberFieldGroup, EmberToggle } from '../components/onboarding/EmberControls'
import { useToast } from '../components/Toast'
import { PlaceholderBanner } from '../components/ui/PlaceholderBanner'
import { Text } from '../components/ui/Text'
import {
  aboutYouFrom,
  aboutYouUpdate,
  answersUpdate,
  answersWithin,
  withinOptions,
  NO_ABOUT_YOU,
  signName,
  toggleLanguage,
  type AboutYou,
  type Choice,
  type ProfileOptions,
  type SignSystem,
} from '../lib/aboutYou'
import { apiClient, ProfileCache } from '../lib/apiClient'
import { Logger } from '../lib/logger'
import { queryCache } from '../lib/queryCache'
import { EMBER, GUTTER, SPACE } from '../lib/theme'
import { refreshAuthUser, useAuth } from '../lib/useAuth'

/**
 * Languages, home state, your sign and this-or-that — matching v2's "about
 * you" (placeholder design — docs/PLACEHOLDER_SCREENS.md §15).
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
 */
export default function EditAboutYouScreen() {
  const { user: authUser } = useAuth()
  const { showToast } = useToast()
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

  const save = async () => {
    if (!authUser || saving) return
    const profileBody = aboutYouUpdate(loaded, form)
    const answerBody = answersUpdate(answersLoaded, answers)
    setSaving(true)
    try {
      if (Object.keys(profileBody).length) {
        const r = await apiClient.updateProfile(authUser.id, profileBody)
        // Three Tier B changes a day: the server's own sentence says when to try again.
        if (!r.success && r.errorCode === 'RATE_LIMITED' && r.error) {
          showToast(r.error, 'error')
          return
        }
        if (!r.success) throw new Error(r.error || 'profile')
      }
      if (Object.keys(answerBody).length) {
        const r = await apiClient.putThisOrThat(answerBody)
        if (!r.success) throw new Error(r.error || 'this-or-that')
      }
      ProfileCache.clear()
      queryCache.invalidate(`profile_${authUser.id}`)
      void refreshAuthUser()
      setLoaded(form)
      setAnswersLoaded(answers)
      showToast('Saved', 'success')
      router.back()
    } catch (error) {
      Logger.error('profile', 'EditAboutYou: save failed', { error })
      showToast("Couldn't save. Try again.", 'error')
    } finally {
      setSaving(false)
    }
  }

  const sign = form.sign
  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <AppHeader
        title="Languages, home & sign"
        onBack={() => router.back()}
        rightTextButton={{ label: 'Save', onPress: save, loading: saving, disabled: saving || !options }}
      />
      {loadFailed ? (
        <LoadError title="Couldn't load this" onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <PlaceholderBanner />
          <Text variant="body" color={EMBER.textSecondary}>
            When you share one of these with someone in a room, their card says so — &quot;You both speak
            Malayalam&quot;, &quot;Both from Kerala&quot;. It never decides who you see.
          </Text>

          {options ? (
            <>
              <EmberFieldGroup label="Languages you speak" helper={`Besides English. Up to ${options.maxLanguages}.`}>
                <EmberChipRow>
                  {options.languages.map((l) => (
                    <EmberChip
                      key={l.slug}
                      label={l.label}
                      selected={form.languages.includes(l.slug)}
                      onPress={() => setForm((f) => ({ ...f, languages: toggleLanguage(f.languages, l.slug, options.maxLanguages) }))}
                    />
                  ))}
                </EmberChipRow>
              </EmberFieldGroup>

              <EmberFieldGroup label="Where you're from" helper="A state, never a town. Tap again to clear.">
                <EmberChipRow>
                  {options.homeStates.map((s) => (
                    <EmberChip
                      key={s.slug}
                      label={s.label}
                      selected={form.homeState === s.slug}
                      onPress={() => setForm((f) => ({ ...f, homeState: f.homeState === s.slug ? null : s.slug }))}
                    />
                  ))}
                </EmberChipRow>
              </EmberFieldGroup>

              <EmberToggle
                label="Show my sign"
                helper={'Your sign shows next to your age. A fun line on cards — "Both Leos ♌" — never used to match you.'}
                value={signOn}
                onValueChange={toggleSign}
              />
              {signOn ? (
                <>
                  <EmberChipRow>
                    <EmberChip label="Western" selected={system === 'western'} onPress={() => chooseSystem('western')} />
                    <EmberChip label="My rashi instead" selected={system === 'rashi'} onPress={() => chooseSystem('rashi')} />
                  </EmberChipRow>
                  {hint && !sign ? (
                    <EmberChip label={`From your birthday: ${signName(hint, 'western')} — tap to use`} selected={false} onPress={() => {
                      setSystem('western')
                      setForm((f) => ({ ...f, sign: { slug: hint.slug, system: 'western' } }))
                    }} />
                  ) : null}
                  <EmberChipRow>
                    {options.signs.map((s) => (
                      <EmberChip
                        key={s.slug}
                        label={signName(s, system)}
                        selected={sign?.slug === s.slug}
                        onPress={() => pickSign(s.slug)}
                      />
                    ))}
                  </EmberChipRow>
                </>
              ) : null}

              <EmberFieldGroup label="This or that" helper="Pick one, or leave it. Tap again to take it back.">
                {options.thisOrThat.map((q) => (
                  <View key={q.slug} style={styles.pair} accessibilityLabel={`${q.a} or ${q.b}`}>
                    <EmberChipRow>
                      <EmberChip label={q.a} selected={answers[q.slug] === 'a'} onPress={() => pick(q.slug, 'a')} />
                      <EmberChip label={q.b} selected={answers[q.slug] === 'b'} onPress={() => pick(q.slug, 'b')} />
                    </EmberChipRow>
                  </View>
                ))}
              </EmberFieldGroup>

              <EmberToggle
                label="Show my badges"
                helper="Earned by checking in — like “Regular here”. Off hides every badge on your card."
                value={form.showBadges}
                onValueChange={(v) => setForm((f) => ({ ...f, showBadges: v }))}
              />

              <EmberToggle
                label="Show “Shows up” on my card"
                helper="Once you've checked in to 80% of the events you said you'd go to (at least 3)."
                value={form.showsUpBadge}
                onValueChange={(v) => setForm((f) => ({ ...f, showsUpBadge: v }))}
              />
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: SPACE.xxl, gap: SPACE.xl },
  pair: { marginBottom: SPACE.sm },
})
