import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { apiClient } from '../../lib/apiClient'
import { revealReadiness, type RevealReadiness } from '../../lib/reveal'
import { useAuth } from '../../lib/useAuth'
import { Logger } from '../../lib/logger'
import { useToast } from '../../components/Toast'
import { APP_COLORS } from '../../lib/theme'

/**
 * Why you are here tonight, and whether people can see who you are.
 *
 * ## DESIGN IS A PLACEHOLDER — LOGIC IS NOT
 *
 * `DESIGN_HANDOFF.md` calls the reveal control "the single most important new
 * screen", because it is the counterpart to the whole pseudonymity model. This
 * is a functional stand-in so the flow exists and can be audited; the layout is
 * meant to be replaced.
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

export default function EventPreferences() {
  // `revealed` arrives from the status chip, which already knows it. There is
  // no GET for per-event preferences, and adding a round trip to learn
  // something the caller is holding would be the wrong trade.
  const { eventId, revealed: initialRevealed } = useLocalSearchParams<{
    eventId: string
    revealed?: string
  }>()
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

  useEffect(() => {
    let cancelled = false
    if (!user) return
    apiClient
      .getProfile(user.id)
      .then((res) => {
        if (cancelled || !res.success || !res.data) return
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
        showToast('Could not save. Try again.', 'error')
        return
      }
      router.back()
    } catch (e) {
      Logger.error('match', 'Failed to save match preferences', { error: e })
      showToast('Could not save. Try again.', 'error')
    } finally {
      setSaving(false)
    }
  }, [eventId, intent, intentTouched, rememberReveal, revealed, saving, showToast])

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.placeholderBanner}>
          PLACEHOLDER DESIGN — logic is final, layout is not
        </Text>

        <Text style={styles.h1}>Why are you here tonight?</Text>
        <Text style={styles.body}>
          Pick any that fit. This helps us suggest people, and you can change it at any
          point during the event.
        </Text>

        {INTENTS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.option, intent.includes(opt.value) && styles.optionSelected]}
            onPress={() => toggleIntent(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: intent.includes(opt.value) }}
          >
            <Text style={styles.optionText}>{opt.label}</Text>
            <Text style={styles.optionHint}>{opt.hint}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.divider} />

        <Text style={styles.h1}>Can people see who you are?</Text>
        <Text style={styles.body}>
          By default you appear as a made-up name, and people see what you have in common
          rather than who you are. Turning this on shows your real name and photo to people
          in this room.
        </Text>
        <Text style={styles.bodyEmphasis}>
          This is for this event only. It does not change anything anywhere else.
        </Text>

        <View style={styles.switchRow}>
          <Text style={styles.optionText}>Show my name and photo here</Text>
          <Switch
            value={revealed}
            onValueChange={setRevealed}
            disabled={canReveal ? !canReveal.ok : false}
            accessibilityLabel="Show my real name and photo at this event"
          />
        </View>

        {canReveal && !canReveal.ok && (
          /*
           * Names what is missing, because "disabled" on its own is the least
           * useful state in an interface. `matching.ts` shows the real name and
           * photo and nothing else, so these two fields are literally all that
           * revealing exposes — and with neither, turning it on would show
           * nothing at all.
           */
          <Text style={styles.bodyEmphasis}>
            Add {canReveal.missing} to your profile first — that&apos;s what other people
            would see.
          </Text>
        )}

        {revealed && (
          <View style={styles.switchRow}>
            <Text style={styles.optionText}>Do this at future events too</Text>
            <Switch value={rememberReveal} onValueChange={setRememberReveal} />
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

/** Placeholder styling. Replace wholesale; nothing here is a decision. */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_COLORS.backgroundBase },
  scroll: { padding: 20, gap: 8 },
  placeholderBanner: {
    color: APP_COLORS.destructive,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  h1: { color: APP_COLORS.textPrimary, fontSize: 22, fontWeight: '700', marginTop: 8 },
  body: { color: APP_COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  bodyEmphasis: {
    color: APP_COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  option: { padding: 14, borderRadius: 10, backgroundColor: APP_COLORS.backgroundCard },
  optionSelected: { backgroundColor: APP_COLORS.accent },
  optionText: { color: APP_COLORS.textPrimary, fontSize: 15, flexShrink: 1 },
  optionHint: { color: APP_COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  divider: {
    height: 1,
    backgroundColor: APP_COLORS.separator,
    marginVertical: 24,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  primaryButton: {
    backgroundColor: APP_COLORS.accent,
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButtonText: { color: APP_COLORS.textPrimary, fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
})
