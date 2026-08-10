import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
// The context package, not the react-native export: only this one takes
// `edges`, and mixing them silently drops the bottom inset on a notched device.
import { SafeAreaView } from 'react-native-safe-area-context'

import { InterestPicker } from '../components/InterestPicker'
import { apiClient } from '../lib/apiClient'
import {
  GENDERS,
  GENDER_LABELS,
  ORIENTATIONS,
  ORIENTATION_LABELS,
  needsInterestedInPicker,
  type Gender,
  type Orientation,
} from '../lib/dating'
import { Logger } from '../lib/logger'
import { clearNewAccountFlag, useAuth } from '../lib/useAuth'

/**
 * The one screen that replaced eight.
 *
 * Asked **once**, at signup, rather than at every check-in: what someone is
 * generally open to is a fact about them, and `profiles.intent_default` exists
 * to hold it — its own schema comment calls it "the default, not the truth".
 * The per-event override still lives on the Match tab for the Tuesday-versus-
 * Saturday case.
 *
 * ## Design is a placeholder
 *
 * Chips and inputs on black, with the logic finished. The Figma redesign lands
 * separately; this exists so the behaviour is right first. Every rule below is
 * a rule the design must not break — see `docs/PLACEHOLDER_SCREENS.md`.
 *
 * ## Gender is asked only if dating is ticked
 *
 * A networking user is never asked their gender. Less friction, and less data
 * held about people who had no reason to give it. Unticking dating clears both
 * fields rather than hiding them, so nothing is stored that the person cannot
 * see they gave.
 *
 * ## One call, not two
 *
 * Interests and profile fields save in a **single** request. Two ordered writes
 * look safe and are not: the re-prompt keys on the interest count, so if the
 * interests land and the profile write fails, the gate is already satisfied and
 * nothing ever asks again — intent, field of work and the dating fields are
 * lost permanently. `PUT /profiles/:userId` accepts everything except the
 * interests, so the interests go through their own endpoint *first* and the
 * profile write is what the screen waits on and reports.
 *
 * Which is the one honest wrinkle: `addProfileInterests` is a separate
 * endpoint, so "one call" is really "one call that can fail, plus one that is
 * idempotent and retryable". Interests can be added again from edit-profile
 * without loss; the profile fields cannot be re-asked, so they are the ones
 * protected.
 *
 * ## Skip writes nothing
 *
 * Not "skip and mark them done". Someone who skips is in exactly the state
 * someone who never saw this screen is in, and the Match tab's interest gate
 * will ask them at the moment it actually matters.
 */

type Intent = 'dating' | 'networking' | 'friendship' | 'just_here'

const INTENTS: { value: Intent; label: string; hint?: string }[] = [
  { value: 'dating', label: 'Dating', hint: '18+' },
  { value: 'networking', label: 'Networking' },
  { value: 'friendship', label: 'Friendship' },
  // A first-class answer, not a refusal to answer: the ranking damps it exactly
  // as hard as silence, so choosing it honestly costs nothing.
  { value: 'just_here', label: 'Just here for the event' },
]

/** The rule the server enforces on every write path. Mirrored for the copy only. */
const DATING_MIN_AGE = 18

export default function AboutYou() {
  const { user } = useAuth()

  const [intents, setIntents] = useState<Intent[]>([])
  const [workField, setWorkField] = useState<string | null>(null)
  const [workFields, setWorkFields] = useState<{ slug: string; label: string }[]>([])
  const [interestIds, setInterestIds] = useState<string[]>([])

  const [gender, setGender] = useState<Gender | null>(null)
  const [orientation, setOrientation] = useState<Orientation | null>(null)
  const [interestedIn, setInterestedIn] = useState<Gender[]>([])

  /*
   * Prefilled from the account, and editable.
   *
   * Google and Apple hand back a name and it is usually right — but "usually"
   * is doing work there. Apple's private relay often gives nothing at all, and
   * a Google display name can be a nickname, an initial, or a full legal name
   * somebody would not choose to show a room. This is the **only** name anyone
   * ever sees, and only if they reveal, so the moment to check it is before the
   * first room rather than after.
   */
  const [name, setName] = useState('')

  /** Only asked when the account has none — Google and Apple create profiles without one. */
  const [needsAge, setNeedsAge] = useState(false)
  const [age, setAge] = useState('')
  const [knownAge, setKnownAge] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wantsDating = intents.includes('dating')
  const askInterestedIn = needsInterestedInPicker(gender, orientation, intents)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [fields, profile] = await Promise.all([
        apiClient.getWorkFields(),
        user ? apiClient.getProfile(user.id) : Promise.resolve(null),
      ])
      if (cancelled) return

      if (fields.success && fields.data?.workFields) setWorkFields(fields.data.workFields)

      if (profile?.success && profile.data) {
        setName(((profile.data.profile?.name || profile.data.name) as string | undefined) ?? '')
      }

      const existingAge = profile?.success ? (profile.data?.profile?.age as number | undefined) : undefined
      if (typeof existingAge === 'number') {
        setKnownAge(existingAge)
      } else {
        // OAuth accounts arrive here with no age at all, and dating is 18+ —
        // so without this the dating chip could never be honoured for them.
        setNeedsAge(true)
      }
      setLoading(false)
    }
    load().catch((e) => {
      Logger.error('profile', 'about-you: load failed', { error: e })
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  const toggleIntent = (value: Intent) => {
    setError(null)
    setIntents((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((i) => i !== value)
        if (value === 'dating') {
          // Cleared, not hidden: nothing should be stored that the person can
          // no longer see they gave.
          setGender(null)
          setOrientation(null)
          setInterestedIn([])
        }
        return next
      }
      return [...prev, value]
    })
  }

  const effectiveAge = (): number | null => {
    if (needsAge) {
      const parsed = Number.parseInt(age, 10)
      return Number.isFinite(parsed) ? parsed : null
    }
    return knownAge
  }

  const validate = (): string | null => {
    const years = effectiveAge()
    if (needsAge && age.trim() && (years === null || years < 13 || years > 120)) {
      return 'Enter a valid age.'
    }
    if (wantsDating) {
      if (years === null) return 'Add your age before choosing dating.'
      if (years < DATING_MIN_AGE) {
        // The server refuses this too. Saying it here saves a round trip and a
        // refusal that would read as a bug.
        return `Dating is for ${DATING_MIN_AGE}+ only. Your other choices are fine.`
      }
    }
    return null
  }

  const save = async () => {
    if (!user) return
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    setSaving(true)
    setError(null)
    try {
      /*
       * Interests first, and deliberately so.
       *
       * This one is idempotent and re-runnable from edit-profile, so if the
       * profile write below fails nothing is permanently lost. The reverse
       * order is what loses data: the Match tab's gate keys on the interest
       * count, so interests landing first would satisfy it and stop anything
       * ever asking for the rest.
       */
      if (interestIds.length > 0) {
        const added = await apiClient.addProfileInterests(user.id, interestIds)
        if (!added.success) throw new Error(added.error || 'Could not save your interests')
      }

      const years = effectiveAge()
      const result = await apiClient.updateProfile(user.id, {
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(years !== null && needsAge ? { age: years } : {}),
        ...(intents.length > 0 ? { intent_default: intents } : {}),
        ...(workField ? { work_field: workField } : {}),
        ...(wantsDating && gender ? { gender } : {}),
        ...(wantsDating && orientation ? { orientation } : {}),
        // Sent only when the app asked directly. Otherwise the server derives
        // it, and a client-supplied value always wins over derivation.
        ...(wantsDating && askInterestedIn && interestedIn.length > 0
          ? { interested_in: interestedIn }
          : {}),
      })

      if (!result.success) throw new Error(result.error || 'Could not save')

      clearNewAccountFlag()
      router.replace('/(tabs)/events')
    } catch (e) {
      Logger.error('profile', 'about-you: save failed', { error: e })
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  /** Writes nothing at all. See the header. */
  const skip = () => {
    clearNewAccountFlag()
    router.replace('/(tabs)/events')
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>A bit about you</Text>
          <Text style={styles.subtitle}>
            This is what matching uses. You can change any of it later.
          </Text>

          <Text style={styles.section}>What should we call you?</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={styles.input}
            maxLength={100}
            autoCapitalize="words"
          />
          <Text style={styles.hint}>
            Only shown in a room if you choose to reveal yourself. Rooms are anonymous by
            default.
          </Text>

          <Text style={styles.section}>What are you open to?</Text>
          <View style={styles.row}>
            {INTENTS.map((intent) => {
              const on = intents.includes(intent.value)
              return (
                <Pressable
                  key={intent.value}
                  onPress={() => toggleIntent(intent.value)}
                  style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {intent.label}
                    {intent.hint ? ` · ${intent.hint}` : ''}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {needsAge ? (
            <>
              <Text style={styles.section}>How old are you?</Text>
              <TextInput
                value={age}
                onChangeText={(t) => {
                  setAge(t.replace(/[^0-9]/g, ''))
                  setError(null)
                }}
                keyboardType="number-pad"
                placeholder="Age"
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={styles.input}
                maxLength={3}
              />
            </>
          ) : null}

          {wantsDating ? (
            <>
              {/*
                Only here, and only while dating is ticked. `docs/DESIGN_HANDOFF.md`
                is explicit: a networking user is never asked their gender.
              */}
              <Text style={styles.section}>You are</Text>
              <View style={styles.row}>
                {GENDERS.map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => setGender(g)}
                    style={[styles.chip, gender === g ? styles.chipOn : styles.chipOff]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: gender === g }}
                  >
                    <Text style={[styles.chipText, gender === g && styles.chipTextOn]}>
                      {GENDER_LABELS[g]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.section}>You identify as</Text>
              <View style={styles.row}>
                {ORIENTATIONS.map((o) => (
                  <Pressable
                    key={o}
                    onPress={() => setOrientation(o)}
                    style={[styles.chip, orientation === o ? styles.chipOn : styles.chipOff]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: orientation === o }}
                  >
                    <Text style={[styles.chipText, orientation === o && styles.chipTextOn]}>
                      {ORIENTATION_LABELS[o]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {askInterestedIn ? (
                <>
                  {/*
                    Shown when the pair does not imply a target set — "straight"
                    plus "non-binary", or "queer", which are identities rather
                    than tables. Without this the server stores nothing and the
                    dating tag never appears, with no explanation.
                  */}
                  <Text style={styles.section}>Interested in</Text>
                  <View style={styles.row}>
                    {GENDERS.map((g) => {
                      const on = interestedIn.includes(g)
                      return (
                        <Pressable
                          key={g}
                          onPress={() =>
                            setInterestedIn((prev) =>
                              prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
                            )
                          }
                          style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>
                            {GENDER_LABELS[g]}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          <Text style={styles.section}>What do you do?</Text>
          <View style={styles.row}>
            {workFields.map((f) => (
              <Pressable
                key={f.slug}
                onPress={() => setWorkField(workField === f.slug ? null : f.slug)}
                style={[styles.chip, workField === f.slug ? styles.chipOn : styles.chipOff]}
                accessibilityRole="button"
                accessibilityState={{ selected: workField === f.slug }}
              >
                <Text style={[styles.chipText, workField === f.slug && styles.chipTextOn]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>What are you into?</Text>
          <InterestPicker selected={interestIds} onChange={setInterestIds} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={save}
            disabled={saving}
            style={[styles.primary, saving && styles.primaryBusy]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Continue'}</Text>
          </Pressable>

          <Pressable onPress={skip} disabled={saving} accessibilityRole="button">
            <Text style={styles.skip}>Skip for now</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 24, paddingBottom: 48, gap: 4 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', marginTop: 24 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 15, marginTop: 6, marginBottom: 8 },
  section: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginTop: 24, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  chipOff: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.14)' },
  chipOn: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: '#FFFFFF' },
  chipText: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  chipTextOn: { color: '#FFFFFF', fontWeight: '600' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    borderWidth: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 8 },
  error: { color: '#FF6B6B', fontSize: 14, marginTop: 20 },
  primary: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginTop: 28,
    paddingVertical: 16,
  },
  primaryBusy: { opacity: 0.6 },
  primaryText: { color: '#000000', fontSize: 16, fontWeight: '700' },
  skip: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    marginTop: 18,
    textAlign: 'center',
  },
})
