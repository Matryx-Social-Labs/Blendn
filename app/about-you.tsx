import { ScreenProfiler } from '../lib/perf'
import { router, useLocalSearchParams } from 'expo-router'
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
import { MatchingFields, type Intent } from '../components/profile/MatchingFields'
import { apiClient } from '../lib/apiClient'
import { needsInterestedInPicker, type Gender, type Orientation } from '../lib/dating'
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



/** The rule the server enforces on every write path. Mirrored for the copy only. */
const DATING_MIN_AGE = 18

function AboutYouInner() {
  const { user } = useAuth()

  /*
   * The same screen, twice: once as the signup step, once as the only way back.
   *
   * These five fields — intent, work field, gender, orientation, interested_in
   * — decide everything matching does, and until now they were writable here
   * and nowhere else, on a screen reachable exactly once. Somebody who picked
   * "networking" at signup and later wanted dating had no path at all, which
   * made the subtitle below ("You can change any of it later") false.
   *
   * Reached from Settings as `/about-you?edit=1`. A separate screen was the
   * obvious alternative and the wrong one: every rule here is conditional —
   * dating needs a gender AND an orientation, `interested_in` is asked only
   * when the pair is ambiguous, `just_here` excludes the rest — and a second
   * copy of that is a second copy that drifts. The two modes differ only in
   * their wording and where they go afterwards.
   */
  const { edit } = useLocalSearchParams<{ edit?: string }>()
  const isEdit = edit === '1'

  const [intents, setIntents] = useState<Intent[]>([])
  const [workField, setWorkField] = useState<string | null>(null)
  const [workFields, setWorkFields] = useState<{ slug: string; label: string }[]>([])
  const [interestIds, setInterestIds] = useState<string[]>([])

  const [gender, setGender] = useState<Gender | null>(null)
  const [orientations, setOrientations] = useState<Orientation[]>([])
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
  const askInterestedIn = needsInterestedInPicker(gender, orientations, intents)

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
          setOrientations([])
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
      /*
       * The bug that made dating silently inert.
       *
       * Nothing required these, and the save below drops them when they are
       * absent (`...(wantsDating && orientations.length ? ... : {})`). So a
       * user could tick Dating, continue, and land with `gender: man`,
       * no orientations, `interested_in: []` — at which point
       * `matchCompatibleForDating` fails closed, no card can ever carry a
       * dating tag, and nothing anywhere says why. That is exactly what device
       * testing found.
       *
       * Refusing here is the whole fix: these are not optional extras, they are
       * the entire input to dating compatibility.
       */
      if (!gender) return 'Pick how you identify so dating matches can work.'
      if (!orientations.length) return 'Pick who you are interested in so dating matches can work.'
      if (askInterestedIn && interestedIn.length === 0) {
        // `deriveInterestedIn` returns null for genuinely ambiguous pairs
        // (non-binary + straight, queer, pansexual, prefer-not-to-say), so for
        // these the server has nothing to fall back on.
        return 'Pick who you would like to meet.'
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
        ...(wantsDating && orientations.length ? { orientations } : {}),
        // Sent only when the app asked directly. Otherwise the server derives
        // it, and a client-supplied value always wins over derivation.
        ...(wantsDating && askInterestedIn && interestedIn.length > 0
          ? { interested_in: interestedIn }
          : {}),
      })

      if (!result.success) throw new Error(result.error || 'Could not save')

      if (isEdit) {
        // Back to Settings, not onward into the app. Nothing to clear either:
        // this account finished signing up a long time ago.
        router.back()
        return
      }

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
          <Text style={styles.title}>{isEdit ? 'You and matching' : 'A bit about you'}</Text>
          <Text style={styles.subtitle}>
            {isEdit
              ? 'What matching uses. Changing it affects who you see from now on, not rooms you have already been in.'
              : 'This is what matching uses. You can change any of it later.'}
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

          <MatchingFields
            intents={intents}
            onToggleIntent={toggleIntent}
            workField={workField}
            onChangeWorkField={setWorkField}
            workFields={workFields}
            gender={gender}
            onChangeGender={setGender}
            orientations={orientations}
            onChangeOrientations={setOrientations}
            interestedIn={interestedIn}
            onChangeInterestedIn={setInterestedIn}
            afterIntents={
              needsAge ? (
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
              ) : null
            }
          />

          <Text style={styles.section}>What are you into?</Text>
          <InterestPicker selected={interestIds} onChange={setInterestIds} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={save}
            disabled={saving}
            style={[styles.primary, saving && styles.primaryBusy]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Continue'}
            </Text>
          </Pressable>

          {/*
            No skip when editing. "Skip for now" means "ask me later" during
            signup; on a settings screen it would read as "discard", which is
            what Back already does and says more clearly.
          */}
          {!isEdit ? (
            <Pressable onPress={skip} disabled={saving} accessibilityRole="button">
              <Text style={styles.skip}>Skip for now</Text>
            </Pressable>
          ) : null}
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
  // Opacity only, so a chip that becomes unreachable keeps its width and the
  // row does not re-wrap under the finger that just filled the set.
  chipDisabled: { opacity: 0.35 },
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


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function AboutYou() {
  return (
    <ScreenProfiler id="about-you">
      <AboutYouInner />
    </ScreenProfiler>
  )
}
