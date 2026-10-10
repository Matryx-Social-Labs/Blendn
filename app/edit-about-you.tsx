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
 * you" (placeholder design — docs/PLACEHOLDER_SCREENS.md §14).
 *
 * Everything here is **shown, never ranked**: a card says "You both speak
 * Malayalam" or "Both from Kerala" when two people share one, and the server
 * never sorts a room by any of it. Before a reveal, one of these at most shows
 * on a card, and none in a room under eight people (the server's budget).
 *
 * The sign is off until turned on, and is the person's own pick: the switch
 * prefills the Western sign of their birth date (`suggested_sun_sign`), and
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
      const mine = aboutYouFrom(p)
      setOptions(opts.data)
      setLoaded(mine)
      setForm(mine)
      setSuggestedSign(typeof p.suggested_sun_sign === 'string' ? p.suggested_sun_sign : null)
      setAnswersLoaded(tot.data?.answers ?? {})
      setAnswers(tot.data?.answers ?? {})
    })()
    return () => {
      cancelled = true
    }
  }, [authUser, attempt])

  const setSignOn = (on: boolean) =>
    setForm((f) => ({
      ...f,
      sign: on ? { slug: f.sign?.slug ?? suggestedSign ?? options?.signs[0]?.slug ?? 'aries', system: f.sign?.system ?? 'western' } : null,
    }))
  const setSystem = (system: SignSystem) => setForm((f) => (f.sign ? { ...f, sign: { ...f.sign, system } } : f))
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
                helper={'A fun line on cards — "Both Leos ♌". Never used to match you.'}
                value={!!sign}
                onValueChange={setSignOn}
              />
              {sign ? (
                <>
                  <EmberChipRow>
                    <EmberChip label="Western" selected={sign.system === 'western'} onPress={() => setSystem('western')} />
                    <EmberChip label="My rashi instead" selected={sign.system === 'rashi'} onPress={() => setSystem('rashi')} />
                  </EmberChipRow>
                  <EmberChipRow>
                    {options.signs.map((s) => (
                      <EmberChip
                        key={s.slug}
                        label={signName(s, sign.system)}
                        selected={sign.slug === s.slug}
                        onPress={() => setForm((f) => (f.sign ? { ...f, sign: { ...f.sign, slug: s.slug } } : f))}
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
