import { router, useNavigation } from 'expo-router'
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation'
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { FieldLabelCase, TextArea, TextField } from '../components/ds/TextField'
import { TopBar } from '../components/ds/TopBar'
import PhotoManager from '../components/PhotoManager'
import { WhoSees } from '../components/profile/WhoSees'
import { INTENTS, listLine, MatchingFields, type Intent } from '../components/profile/MatchingFields'
import { Sheet } from '../components/ds/Sheet'
import { RepositionHost } from '../components/profile/Reposition'
import { OfflineStrip, useOffline } from '../components/profile/OfflineStrip'
import { TagsField } from '../components/profile/TagsField'
import { mayDate, type Gender, type Orientation } from '../lib/dating'
import { SkeletonBlock, SkeletonLine } from '../components/Skeleton'
import { useSkeletonCrossfade } from '../components/motion/useSkeletonCrossfade'
import { InterestPicker, MAX_INTERESTS } from '../components/InterestPicker'
import { MIN_INTERESTS } from '../lib/meProfile'
import { apiClient, ProfileCache } from '../lib/apiClient'
import { Logger } from '../lib/logger'
import { useToast } from '../components/Toast'
import { queryCache } from '../lib/queryCache'
import { showSheet } from '../lib/sheet'
import { useTopBarState } from '../lib/useTopBarState'
import { COLOR, FONT_FAMILY, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../lib/design/tokens'
import { useAuth, refreshAuthUser } from '../lib/useAuth'
import { KEYBOARD_BEHAVIOR } from '../lib/keyboard'
import { profileFormErrors } from '../lib/onboarding'
import { counterLimit, limitErrors, PROFILE_LIMITS, serverLength } from '../lib/profileLimits'
import { normaliseIntents, toggleIntent } from '../lib/intents'
import { SettingsRow } from '../components/ds/SettingsRow'
import { useReducedMotion } from '../lib/motion'

interface UserProfile {
  id: string
  name?: string
  age?: number
  location?: string
  phone?: string
  occupation?: string
  education?: string
  /*
   * No `interests` here any more. It held free text written to
   * `profiles.interests`, which matching does not read; the structured ids live
   * in `interestIds` and are saved through the interests endpoints.
   */
  bio?: string
  goals?: string[]
  looking_for?: string[]
}

const AGE_DIGITS = 3
/** D20 (D-M14): the free occupation field, named for what it is and who sees it; the matching chip is "What do you do?". */
export const JOB_TITLE_LABEL = 'Job title · shown once you reveal'

/**
 * Everything the form edits, as one comparable string.
 *
 * Photos are not in it: `PhotoManager` saves each change as it is made, so
 * there is nothing of theirs to lose by leaving. Interests are sorted because
 * the picker's order is not a change.
 */
function formSnapshot(f: {
  name: string
  age: string
  location: string
  phone: string
  occupation: string
  education: string
  bio: string
  interestIds: string[]
  goals: string[]
  lookingFor: string[]
  intents: string[]
  workField: string | null
  expertise: string[]
  gender: string | null
  orientations: string[]
  interestedIn: string[]
}): string {
  return JSON.stringify({ ...f, interestIds: [...f.interestIds].sort() })
}

function EditProfileContent() {
  const bold = useBoldText()
  const { user: authUser } = useAuth()
  const reduceMotion = useReducedMotion()
  const { showToast } = useToast()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /*
   * The profile could not be read (5xx, 401, no signal). The form stays blank, and Save stays off until a retry reads it: a blank
   * form saved is a blanked profile (YOU-05). `loadAttempt` is what Try again bumps to run the load effect once more.
   */
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  // Form state
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [location, setLocation] = useState('')
  const [phone, setPhone] = useState('')
  const [occupation, setOccupation] = useState('')
  const [education, setEducation] = useState('')
  const [bio, setBio] = useState('')
  /*
   * Structured category ids, not free text.
   *
   * This screen wrote strings to `profiles.interests` — the column
   * `lib/interest-coverage.ts` exists to warn nobody reads. Matching ranks on
   * `user_interests -> categories`, so every interest typed here was invisible
   * to the one feature it was for. `interestsAtLoad` is kept so saving can send
   * the difference: the endpoints are add and remove, not replace.
   */
  const [interestIds, setInterestIds] = useState<string[]>([])
  /** Each interest's name, for the row's summary: from the profile as it loads, then from the picker's list once it opens. */
  const [interestNames, setInterestNames] = useState<Record<string, string>>({})
  /** Which matching row's sheet is up (A 03). The kind outlives `open` so the sheet keeps its content while it slides away. */
  const [matchingSheet, setMatchingSheet] = useState<{ kind: MatchingRow; open: boolean }>({ kind: 'into', open: false })
  const [interestsAtLoad, setInterestsAtLoad] = useState<string[]>([])
  const [goals, setGoals] = useState<string[]>([])
  const [lookingFor, setLookingFor] = useState<string[]>([])

  /*
   * The five fields matching runs on. They used to live on their own screen,
   * reachable only from Settings -> Discovery -> "You and matching", so the app
   * had two profile editors and one of them was three taps deep under a heading
   * that did not name it.
   */
  const [intents, setIntents] = useState<Intent[]>([])
  const [workField, setWorkField] = useState<string | null>(null)
  const [workFields, setWorkFields] = useState<{ slug: string; label: string }[]>([])
  // Step 2 of the field of work: what they do within it (14.3, served by `GET /work-fields`).
  const [expertise, setExpertise] = useState<string[]>([])
  const [expertiseByField, setExpertiseByField] = useState<Record<string, { slug: string; label: string }[]>>({})
  const [maxExpertise, setMaxExpertise] = useState(3)
  /** The fields of work could not be read: the heading says so, and its line reads them again (6-3). */
  const [workFieldsFailed, setWorkFieldsFailed] = useState(false)
  const [workFieldsRetrying, setWorkFieldsRetrying] = useState(false)
  const loadWorkFields = useCallback(async () => {
    const fields = await apiClient.getWorkFields()
    if (fields.success && fields.data?.workFields) {
      setWorkFields(fields.data.workFields)
      setExpertiseByField(fields.data.expertiseByField ?? {})
      if (fields.data.maxExpertise) setMaxExpertise(fields.data.maxExpertise)
      setWorkFieldsFailed(false)
    } else {
      setWorkFieldsFailed(true)
    }
  }, [])
  const [gender, setGender] = useState<Gender | null>(null)
  const [orientations, setOrientations] = useState<Orientation[]>([])
  const [interestedIn, setInterestedIn] = useState<Gender[]>([])
  // `show_orientation` as the server has it (read-only here): on, orientation reaches everyone who may see who you are, and the line says so.
  const [showOrientation, setShowOrientation] = useState(false)
  /* What the server had, so the save can send only what actually moved. */
  const [matchingAtLoad, setMatchingAtLoad] = useState<{
    intents: Intent[]
    workField: string | null
    expertise: string[]
    gender: Gender | null
    orientations: Orientation[]
    interestedIn: Gender[]
  }>({ intents: [], workField: null, expertise: [], gender: null, orientations: [], interestedIn: [] })

  /*
   * The age dating is offered on: the one being typed in this form when it is a
   * whole number, else the one the server holds. Reading only the loaded age
   * kept Dating on screen after someone corrected their age to 17, and hid it
   * from someone adding an adult age for the first time (SCRUM-294 review).
   */
  const typedAge = Number(age)
  const liveAge = age.trim() && Number.isInteger(typedAge) ? typedAge : profile?.age

  const onToggleIntent = (value: Intent) => setIntents((prev) => toggleIntent(prev, value))
  const [nameError, setNameError] = useState<string | null>(null)
  const [ageError, setAgeError] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const basicInfoY = useRef(0)
  const nameInputRef = useRef<TextInput>(null)
  const ageInputRef = useRef<TextInput>(null)

  /*
   * Unsaved edits, and leaving with them.
   *
   * Back and swipe-back used to drop a half-written bio without a word. The
   * form is compared with what it held when it loaded (or last saved); while
   * they differ, leaving by any route — the header's back, the swipe, Android's
   * back — stops and asks. Null until the profile has loaded, so a slow load is
   * never "dirty".
   */
  const navigation = useNavigation()
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<NavigationAction | null>(null)
  const pendingLeave = useRef<NavigationAction | null>(null)
  const currentSnapshot = formSnapshot({
    name, age, location, phone, occupation, education, bio, interestIds, goals, lookingFor,
    intents, workField, expertise, gender, orientations, interestedIn,
  })
  const dirty = savedSnapshot !== null && currentSnapshot !== savedSnapshot

  const bar = useTopBarState()
  const insets = useSafeAreaInsets()
  const offline = useOffline()
  // A photo is in the hand: the page does not scroll under it.
  const [dragging, setDragging] = useState(false)

  // Discard lifts the guard first, then replays the exit that was stopped.
  const discardChanges = () => setLeaving(pendingLeave.current)

  usePreventRemove(dirty && !leaving, ({ data }) => {
    pendingLeave.current = data.action
    // The app's one sheet: Discard is the destructive confirm, so it plays the one destructive tick like every other.
    showSheet({
      kind: 'actions',
      hue: 'violet',
      icon: 'triangle-alert',
      title: 'Discard changes?',
      message: "You have edits that aren’t saved. Leave now and they’re gone.",
      actions: [
        { label: 'Discard', variant: 'destructive', then: discardChanges },
        { label: 'Keep editing', cancel: true },
      ],
    })
  })

  useEffect(() => {
    if (leaving) navigation.dispatch(leaving)
  }, [leaving, navigation])

  /*
   * Saved: leave once the render that moved the baseline has landed. Calling
   * `router.back()` in the save handler itself ran before `savedSnapshot`
   * updated, so the guard above still saw a dirty form and asked "Discard
   * changes?" about changes that had just been saved.
   */
  const [leaveAfterSave, setLeaveAfterSave] = useState(false)
  useEffect(() => {
    if (leaveAfterSave && !dirty) router.back()
  }, [leaveAfterSave, dirty])

  // Declared inside the effect: it sets state only after its requests return.
  useEffect(() => {
    const loadProfile = async () => {
      try {
        if (!authUser) {
          showToast('Sign in to edit your profile.', 'error')
          router.back()
          return
        }

        // Load profile data via API
        const result = await apiClient.getProfile(authUser.id)

        if (!result.success || !result.data) {
          Logger.error('profile', 'EditProfile: Profile load error', { error: result.error })
          setLoadFailed(true)
          showToast('Couldn’t load your profile.', 'error', {
            haptic: 'error',
            action: { label: 'Try again', onPress: () => { setLoading(true); setLoadAttempt((n) => n + 1) } },
          })
          return
        }
        setLoadFailed(false)

        const profileData = result.data
        const p = profileData.profile || {}

        // Combine with auth user data
        // API returns { name, profile: { age, location, phone, bio, ... } }
        const combinedProfile = {
          id: authUser.id,
          name: profileData.name || authUser.name || '',
          // `p.age || ''` typed this `string | number` against an `age?: number`
          // field. It only ever fed `.toString()` below, so undefined is both
          // correct and what the type has always said.
          age: typeof p.age === 'number' ? p.age : undefined,
          location: p.location || '',
          phone: p.phone || '',
          occupation: p.occupation || '',
          education: p.education || '',
          bio: p.bio || '',
          goals: p.goals || [],
          looking_for: p.looking_for || []
        }

        setProfile(combinedProfile)

        // Set form values
        setName(combinedProfile.name || '')
        setAge(combinedProfile.age?.toString() || '')
        setLocation(combinedProfile.location || '')
        setPhone(combinedProfile.phone || '')
        setOccupation(combinedProfile.occupation || '')
        setEducation(combinedProfile.education || '')
        setBio(combinedProfile.bio || '')
        /*
         * `profileData.interests` is the structured list the server joins from
         * `user_interests`; `profile.interests` is the legacy free-text column.
         * They have the same name one level apart, which is exactly how this
         * screen came to write the wrong one.
         */
        const structured = Array.isArray(profileData.interests)
          ? profileData.interests.map((i) => String(i.id))
          : []
        setInterestIds(structured)
        setInterestsAtLoad(structured)
        if (Array.isArray(profileData.interests)) {
          const loadedNames = Object.fromEntries(profileData.interests.map((i) => [String(i.id), i.name]))
          setInterestNames((prev) => ({ ...prev, ...loadedNames }))
        }
        setGoals(combinedProfile.goals || [])
        setLookingFor(combinedProfile.looking_for || [])

        /*
         * Pre-filled, which the old screen never did: it read only name and age,
         * so every chip opened blank and you could not tell "networking" from
         * "nothing chosen".
         */
        const p2 = profileData.profile
        const loadedIntents = normaliseIntents((p2?.intent_default || []) as Intent[])
        const loadedWorkField = p2?.work_field ?? null
        const loadedExpertise = Array.isArray(p2?.expertise) ? (p2.expertise as string[]) : []
        const loadedGender = (p2?.gender ?? null) as Gender | null
        const loadedOrientations = (p2?.orientations || []) as Orientation[]
        const loadedInterestedIn = (p2?.interested_in || []) as Gender[]
        setIntents(loadedIntents)
        setShowOrientation((p2 as { show_orientation?: boolean } | undefined)?.show_orientation === true)
        setWorkField(loadedWorkField)
        setExpertise(loadedExpertise)
        setGender(loadedGender)
        setOrientations(loadedOrientations)
        setInterestedIn(loadedInterestedIn)
        setMatchingAtLoad({
          intents: loadedIntents,
          workField: loadedWorkField,
          expertise: loadedExpertise,
          gender: loadedGender,
          orientations: loadedOrientations,
          interestedIn: loadedInterestedIn,
        })
        // The form as loaded: what "unsaved changes" is measured against.
        setSavedSnapshot(formSnapshot({
          name: combinedProfile.name || '',
          age: combinedProfile.age?.toString() || '',
          location: combinedProfile.location || '',
          phone: combinedProfile.phone || '',
          occupation: combinedProfile.occupation || '',
          education: combinedProfile.education || '',
          bio: combinedProfile.bio || '',
          interestIds: structured,
          goals: combinedProfile.goals || [],
          lookingFor: combinedProfile.looking_for || [],
          intents: loadedIntents,
          workField: loadedWorkField,
          expertise: loadedExpertise,
          gender: loadedGender,
          orientations: loadedOrientations,
          interestedIn: loadedInterestedIn,
        }))

        await loadWorkFields()

      } catch (error) {
        Logger.error('profile', 'EditProfile: Load profile error', { error })
        setLoadFailed(true)
        showToast('Couldn’t load your profile.', 'error', {
          haptic: 'error',
          action: { label: 'Try again', onPress: () => { setLoading(true); setLoadAttempt((n) => n + 1) } },
        })
      } finally {
        setLoading(false)
      }
    }

    if (authUser) {
      loadProfile()
    }
  }, [authUser, showToast, loadWorkFields, loadAttempt])

  /** A new field clears what they do within the old one, silently: the server prunes the same way, so a stale chip never saves. */
  const changeWorkField = (slug: string | null) => {
    setWorkField(slug)
    const keep = new Set((slug ? expertiseByField[slug] : [])?.map((e) => e.slug))
    setExpertise((prev) => prev.filter((e) => keep.has(e)))
  }

  const closeMatchingSheet = () => setMatchingSheet((prev) => ({ ...prev, open: false }))
  /** What each matching row says it holds (A 03): the picks by name, "Not set" for none; interests under two say why it matters. */
  const fieldLabel = workFields.find((f) => f.slug === workField)?.label
  const expertiseLabels = (workField ? expertiseByField[workField] ?? [] : []).filter((e) => expertise.includes(e.slug)).map((e) => e.label)
  // In the order they were picked ("Friendship, Networking" on the board); dating only where it is offered.
  const offeredIntents = intents
    .filter((v) => v !== 'dating' || mayDate(liveAge))
    .flatMap((v) => INTENTS.filter((i) => i.value === v))
  const matchingHints: Record<MatchingRow, string> = {
    into: interestIds.length < MIN_INTERESTS
      ? INTERESTS_FLOOR
      : listLine(interestIds.map((id) => interestNames[id]).filter((n): n is string => !!n)) ?? `${interestIds.length} picked`,
    do: fieldLabel ? [fieldLabel, expertiseLabels.join(', ')].filter(Boolean).join(' · ') : MATCHING_UNSET,
    open: listLine(offeredIntents.map((i) => i.label), INTENTS.length) ?? MATCHING_UNSET,
  }

  /** Never cut for the person: a value over the server's cap stays on screen with its count, and Save waits. */
  const overCap = limitErrors({ name, location, occupation, education, phone, bio })
  const overCapped = Object.keys(overCap).length > 0

  const handleSave = async () => {
    if (!authUser || overCapped || loadFailed) return

    const trimmedName = name.trim()
    const errors = profileFormErrors({ name, age, storedAge: profile?.age ?? null })
    const parsedAge = errors.years

    setNameError(errors.name)
    setAgeError(errors.age)
    if (errors.name || errors.age) {
      // Both fields are in the Basic Information card. From anywhere lower down
      // a refused Save looked like a dead button, so bring the card into view —
      // its own offset, not 0, which is the photo grid for anyone with photos.
      scrollRef.current?.scrollTo({ y: basicInfoY.current, animated: !reduceMotion })
      // The field says its own error to a screen reader (TextField's assertive note); put focus on the
      // field that needs fixing rather than leaving it on Save.
      ;(errors.name ? nameInputRef : ageInputRef).current?.focus()
      return
    }

    setSaving(true)
    try {
      // Update profile via API
      const updateData: any = {}
      if (trimmedName !== profile?.name) updateData.name = trimmedName
      if (parsedAge !== undefined && parsedAge !== profile?.age) updateData.age = parsedAge
      // Trimmed like the name: a bio typed as "text " saved the space, and a
      // field cleared to whitespace saved " " rather than null.
      const texts = [['location', location], ['phone', phone], ['occupation', occupation], ['education', education], ['bio', bio]] as const
      for (const [key, value] of texts) {
        const trimmed = value.trim()
        if (trimmed !== (profile?.[key] || '')) updateData[key] = trimmed || null
      }
      if (JSON.stringify(goals) !== JSON.stringify(profile?.goals)) {
        updateData.goals = goals
      }
      if (JSON.stringify(lookingFor) !== JSON.stringify(profile?.looking_for)) {
        updateData.looking_for = lookingFor
      }
      /*
       * Sent only when changed. A blanket send would write `intent_default: []`
       * for anyone who opened this screen and saved without touching the chips,
       * which is how you silently turn off somebody's matching.
       */
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
      // A Dating intent this age may not hold is not sent (the chip is hidden).
      const savedIntents = mayDate(liveAge) ? intents : intents.filter((i) => i !== 'dating')
      if (!same(savedIntents, matchingAtLoad.intents)) updateData.intent_default = savedIntents
      if (workField !== matchingAtLoad.workField) updateData.work_field = workField
      if (!same(expertise, matchingAtLoad.expertise)) updateData.expertise = expertise
      /*
       * The dating three are sent only while dating is ticked -- untick it and
       * they stop being asked, so continuing to write them would keep
       * special-category data current for somebody who just opted out of it.
       */
      if (savedIntents.includes('dating')) {
        if (gender && gender !== matchingAtLoad.gender) updateData.gender = gender
        if (!same(orientations, matchingAtLoad.orientations)) updateData.orientations = orientations
        if (!same(interestedIn, matchingAtLoad.interestedIn)) updateData.interested_in = interestedIn
      }

      /*
       * The field of work is limited to three changes a day, and one refused PUT writes nothing: at the limit a new bio was
       * lost with it. So it goes alone, with its expertise (the server prunes one against the other), after the rest.
       */
      const { work_field: newWorkField, ...rest } = updateData
      const fieldOfWork = newWorkField === undefined ? null : { work_field: newWorkField, expertise }
      if (fieldOfWork) delete rest.expertise
      const result = fieldOfWork && !Object.keys(rest).length ? { success: true as const } : await apiClient.updateProfile(authUser.id, rest)

      if (!result.success) {
        Logger.error('profile', 'EditProfile: Profile update error', { error: result.error })
        throw new Error(result.error || 'Failed to update profile')
      }
      const fieldResult = fieldOfWork ? await apiClient.updateProfile(authUser.id, fieldOfWork) : null
      if (fieldResult && !fieldResult.success && fieldResult.errorCode !== 'RATE_LIMITED') {
        Logger.error('profile', 'EditProfile: Field of work update error', { error: fieldResult.error })
        throw new Error(fieldResult.error || 'Failed to update profile')
      }
      const fieldRefused = fieldResult?.success === false

      /*
       * Interests are a separate pair of endpoints, and a diff rather than a
       * replace — `POST` adds, `DELETE` removes, and neither accepts an empty
       * array, so both calls are skipped when there is nothing to say.
       */
      const added = interestIds.filter((id) => !interestsAtLoad.includes(id))
      const removed = interestsAtLoad.filter((id) => !interestIds.includes(id))
      /*
       * Both results checked, and the baseline moves only if both held. The
       * first version discarded them and moved `interestsAtLoad` anyway, so a
       * rejected write still showed "Profile Updated" and the NEXT save
       * diffed against a state the server never reached — the interest the
       * person thought they had added was never sent again.
       */
      // Remove first, as onboarding does (`syncInterests`): the server checks an add against what is held, so a swap at the cap of ten was refused.
      if (removed.length > 0) {
        const r = await apiClient.removeProfileInterests(authUser.id, removed)
        if (!r.success) throw new Error(r.error || 'Could not save your interests')
      }
      if (added.length > 0) {
        const r = await apiClient.addProfileInterests(authUser.id, added)
        if (!r.success) throw new Error(r.error || 'Could not save your interests')
      }
      setInterestsAtLoad(interestIds)
      // Saved: nothing is unsaved any more, so the OK below leaves without asking.
      setSavedSnapshot(currentSnapshot)

      // Invalidate caches so profile tab shows fresh data
      ProfileCache.clear()
      queryCache.invalidate(`profile_${authUser.id}`)
      void refreshAuthUser()

      Logger.info('profile', 'EditProfile: Profile updated successfully', { userId: authUser.id })
      /*
       * A toast and straight back, not an alert with an OK to dismiss first:
       * saving is the whole reason the screen was open, and the Me tab it
       * returns to already shows the change. The baseline moved above, so
       * the leave guard lets this through without asking.
       */
      if (fieldRefused) {
        // The server's sentence: this code is also the per-minute limiter, so "tomorrow" is only true when it says so.
        showToast(`${Object.keys(rest).length ? 'Saved, except your field of work.' : 'Not saved.'} ${fieldResult?.error ?? ''}`.trim(), 'error', { haptic: 'error' })
        // Read the form again: what was saved is the new baseline, and the refused field goes back to what it still is.
        setLoadAttempt((n) => n + 1)
        return
      }
      showToast('Profile saved', 'success', { haptic: 'success' })
      setLeaveAfterSave(true)

    } catch (error) {
      Logger.error('profile', 'EditProfile: Save profile error', { error })
      // Never the thrown message: it is the server's or the client's wording
      // for a developer ("Failed to update profile"), not for the person.
      showToast("Couldn’t save your profile. Try again.", 'error', { haptic: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const isLoading = loading
  /* Each card's skeleton gives way to its fields with the one crossfade (DS #17). */
  const arrive = useSkeletonCrossfade(loading)

  return (
    <View style={styles.container}>
      {/* The reposition step a chosen photo goes through (6.3 #08); it draws nothing until one is asked. */}
      <RepositionHost />
      <KeyboardAvoidingView
        style={styles.container}
        // 'padding' on both platforms (lib/keyboard.ts): an edge-to-edge Android window ignores adjustResize, so the
        // content has to move itself out from under the keyboard.
        behavior={KEYBOARD_BEHAVIOR}
      >
        <TopBar
          title="Edit profile"
          state={bar.state}
          onBack={() => router.back()}
          save={{ onPress: handleSave, saving, disabled: saving || offline || overCapped || loadFailed }}
          testID="edit-profile-top"
        />

        <ScrollView
          ref={scrollRef}
          testID="edit-profile-scroll"
          style={styles.content}
          // The foot clears the home indicator, or Android's navigation bar; the keyboard is the KeyboardAvoidingView's.
          contentContainerStyle={[styles.column, { paddingBottom: insets.bottom + SPACE.xxl }]}
          scrollEnabled={!dragging}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...bar.scrollProps}
        >
          <OfflineStrip offline={offline} />

          {/* Photos: the card heads itself (its count is the grid's). */}
          <EditCard>{authUser ? <PhotoManager userId={authUser.id} maxPhotos={6} onDragging={setDragging} /> : null}</EditCard>

          <EditCard title="You" onLayout={(y) => (basicInfoY.current = y)}>
            {isLoading ? (
              <FieldsSkeleton fields={BASIC_FIELDS} />
            ) : (
              <Animated.View entering={arrive} style={styles.fields}>
                <TextField
                  label="Name"
                  inputRef={nameInputRef}
                  value={name}
                  onChangeText={(value) => {
                    setName(value)
                    if (nameError && value.trim()) setNameError(null)
                  }}
                  onBlur={() => setNameError(profileFormErrors({ name, age, storedAge: profile?.age ?? null }).name)}
                  error={overCap.name ?? nameError ?? undefined}
                  limit={counterLimit(name, PROFILE_LIMITS.name)}
                  measure={serverLength}
                  placeholder="Enter your name"
                  autoComplete="name"
                  textContentType="name"
                  testID="edit-profile-name"
                />
                <TextField
                  label="Age"
                  inputRef={ageInputRef}
                  value={age}
                  onChangeText={(value) => {
                    const sanitized = value.replace(/[^0-9]/g, '').slice(0, AGE_DIGITS)
                    setAge(sanitized)
                    if (ageError && sanitized) setAgeError(null)
                  }}
                  onBlur={() => setAgeError(profileFormErrors({ name, age, storedAge: profile?.age ?? null }).age)}
                  error={ageError ?? undefined}
                  placeholder="Enter your age"
                  keyboardType="numeric"
                  testID="edit-profile-age"
                />
                <TextField
                  label="Where you are"
                  value={location}
                  onChangeText={setLocation}
                  error={overCap.location}
                  limit={counterLimit(location, PROFILE_LIMITS.location)}
                  measure={serverLength}
                  placeholder="Area, city"
                  testID="edit-profile-location"
                />
                {/* D20: "What do you do?" above is the matching chip, seen before a reveal; this is the free title, seen after one. */}
                <TextField
                  label={JOB_TITLE_LABEL}
                  value={occupation}
                  onChangeText={setOccupation}
                  error={overCap.occupation}
                  limit={counterLimit(occupation, PROFILE_LIMITS.occupation)}
                  measure={serverLength}
                  placeholder="e.g. Software Engineer"
                  testID="edit-profile-occupation"
                />
              </Animated.View>
            )}
          </EditCard>

          <EditCard title="About">
            {isLoading ? (
              <SkeletonBlock width="100%" height={ABOUT_SKELETON} borderRadius={RADIUS.mediaInCard} />
            ) : (
              <Animated.View entering={arrive}>
              <TextArea
                label="Bio"
                value={bio}
                onChangeText={setBio}
                limit={PROFILE_LIMITS.bio}
                measure={serverLength}
                error={overCap.bio}
                placeholder="Tell people about yourself…"
                testID="edit-profile-bio"
              />
              </Animated.View>
            )}
          </EditCard>

          {/*
            Matching as three rows (Me + settings A 03, sheet 2/2): the only fields here nobody reads as text -- they feed
            `rankMatches` and surface as a tag on a card. Each row says what it holds and opens its picker in a sheet; a pick
            waits for Save with the rest of the form.
          */}
          <EditCard title="Matching · seen in rooms of 8+">
            {MATCHING_ROWS.map((row) => (
              <SettingsRow
                key={row.kind}
                icon={row.icon}
                title={row.title}
                hint={matchingHints[row.kind]}
                trail="chevron"
                disabled={isLoading}
                onPress={() => setMatchingSheet({ kind: row.kind, open: true })}
                testID={`edit-profile-matching-${row.kind}`}
              />
            ))}
          </EditCard>

          {/*
            One sheet per row, each with its own content and height: a single sheet whose content and detents swapped between
            opens kept the last one's measured height, and on Android drew the next one off screen (drive 2026-11-18).
          */}
          {MATCHING_ROWS.map((row) => (
            <Sheet
              key={row.kind}
              visible={matchingSheet.open && matchingSheet.kind === row.kind}
              onClose={closeMatchingSheet}
              title={row.title}
              headerNote={row.kind === 'into' ? { text: `${interestIds.length} of ${MAX_INTERESTS}` } : undefined}
              // The interests list is long and scrolls; the other two are as tall as their chips.
              detents={row.kind === 'into' ? ['tall'] : undefined}
              actions={[{ label: 'Done', kind: 'secondary', onPress: closeMatchingSheet, testID: `edit-profile-matching-${row.kind}-done` }]}
              testID={`edit-profile-matching-${row.kind}-sheet`}
            >
            {row.kind === 'into' ? (
              <View style={styles.cardBody}>
                {/* Under two, matching can't rank you and the board refuses a post (SCRUM-519): said, never refused. */}
                {interestIds.length < MIN_INTERESTS ? (
                  <Text testID="edit-profile-interests-floor" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.floor]}>
                    {INTERESTS_FLOOR}
                  </Text>
                ) : null}
                <InterestPicker
                  selected={interestIds}
                  onChange={setInterestIds}
                  showCount={false}
                  onNames={(names) => setInterestNames((prev) => ({ ...prev, ...names }))}
                />
                <WhoSees field="interests" />
              </View>
            ) : (
              <MatchingFields
                part={row.kind === 'open' ? 'open' : 'work'}
                intents={intents}
                onToggleIntent={onToggleIntent}
                workField={workField}
                onChangeWorkField={changeWorkField}
                expertiseOptions={workField ? expertiseByField[workField] : undefined}
                expertise={expertise}
                maxExpertise={maxExpertise}
                onChangeExpertise={setExpertise}
                workFields={workFields}
                workFieldsFailed={workFieldsFailed}
                onRetryWorkFields={() => {
                  setWorkFieldsRetrying(true)
                  void loadWorkFields().finally(() => setWorkFieldsRetrying(false))
                }}
                workFieldsRetrying={workFieldsRetrying}
                gender={gender}
                onChangeGender={setGender}
                orientations={orientations}
                onChangeOrientations={setOrientations}
                interestedIn={interestedIn}
                onChangeInterestedIn={setInterestedIn}
                offerDating={mayDate(liveAge)}
                showOrientation={showOrientation}
              />
            )}
            </Sheet>
          ))}

          {/* One name for the about-you screen (A 04): what it holds is shown on cards only when you share one. */}
          <EditCard title="Shown when you share one">
            {/*
              Languages, home state, sign and this-or-that: display only, saved on their own screen so this form's save stays what
              it was.
            */}
            <SettingsRow
              icon="sparkles"
              title="Languages, home & more"
              label="Languages, home region, sign and this or that. Shown on cards only when you share one with someone. Never used to rank."
              trail="chevron"
              onPress={() => router.push('/edit-about-you')}
            />
          </EditCard>

          {/* Details last (A 03): education, shown once you reveal; your phone, which nobody else ever sees. */}
          <EditCard title="Details">
            {isLoading ? (
              <FieldsSkeleton fields={DETAIL_FIELDS} />
            ) : (
              <Animated.View entering={arrive} style={styles.fields}>
                <TextField
                  label="Education"
                  value={education}
                  onChangeText={setEducation}
                  error={overCap.education}
                  limit={counterLimit(education, PROFILE_LIMITS.education)}
                  measure={serverLength}
                  placeholder="e.g. Christ University"
                  testID="edit-profile-education"
                />
                <WhoSees field="college" />
                <TextField
                  label="Phone"
                  value={phone}
                  onChangeText={setPhone}
                  error={overCap.phone}
                  limit={counterLimit(phone, PROFILE_LIMITS.phone)}
                  measure={serverLength}
                  placeholder="Phone number"
                  hint={PHONE_PRIVATE}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  testID="edit-profile-phone"
                />
              </Animated.View>
            )}
          </EditCard>

          {/* Goals and Looking for are not drawn by Flow 6 `edit`; they stay (an owner question), restyled on the DS (audit §3 item 4). */}
          <EditCard title="Goals">
            {isLoading ? (
              <View style={styles.chipsSkeleton}>
                {[...Array(3)].map((_, i) => (
                  <SkeletonBlock key={`sk-g-${i}`} width={CHIP_SKELETON} height={SIZE.tag} borderRadius={RADIUS.capsule} />
                ))}
              </View>
            ) : (
              <Animated.View entering={arrive}>
                <TagsField items={goals} onChange={setGoals} addLabel="Add goal" sheetTitle="Add goal" placeholder="What are you looking for?" testID="edit-profile-goals" />
              </Animated.View>
            )}
          </EditCard>

          <EditCard title="Looking for">
            {isLoading ? (
              <View style={styles.chipsSkeleton}>
                {[...Array(3)].map((_, i) => (
                  <SkeletonBlock key={`sk-l-${i}`} width={CHIP_SKELETON} height={SIZE.tag} borderRadius={RADIUS.capsule} />
                ))}
              </View>
            ) : (
              <Animated.View entering={arrive}>
              <TagsField
                items={lookingFor}
                onChange={setLookingFor}
                addLabel="Add preference"
                sheetTitle="Add preference"
                placeholder="What type of person are you looking for?"
                testID="edit-profile-looking-for"
              />
              </Animated.View>
            )}
          </EditCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

type MatchingRow = 'into' | 'do' | 'open'
/** The three matching rows, in the board's order (A 03 2/2). */
const MATCHING_ROWS: { kind: MatchingRow; title: string; icon: 'sparkles' | 'briefcase' | 'hand' }[] = [
  { kind: 'into', title: 'What you’re into', icon: 'sparkles' },
  { kind: 'do', title: 'What you do', icon: 'briefcase' },
  { kind: 'open', title: 'What you’re open to', icon: 'hand' },
]
/** A matching row with nothing picked. */
const MATCHING_UNSET = 'Not set'
const INTERESTS_FLOOR = `Pick at least ${MIN_INTERESTS} so we can match you.`

/** The You and Details cards while the profile loads: their fields at the final geometry (Flow 6 edit 11). */
const BASIC_FIELDS = 4
const DETAIL_FIELDS = 2
/** Phone is never shown to anyone (A 03): said in the field, since it sits among fields others can see. */
export const PHONE_PRIVATE = 'Only for sign-in. Never shown.'
const ABOUT_SKELETON = 160
const CHIP_SKELETON = 96

function FieldsSkeleton({ fields }: { fields: number }) {
  return (
    <View accessible testID="fields-skeleton" accessibilityLabel="Loading your details" accessibilityState={{ busy: true }} style={styles.fields}>
      {Array.from({ length: fields }, (_, i) => (
        <View key={i} style={styles.skeletonField}>
          <SkeletonLine width="25%" />
          <SkeletonBlock width="100%" height={SIZE.input} borderRadius={RADIUS.capsule} />
        </View>
      ))}
    </View>
  )
}

/** A card of the form (Flow 6 `edit`): `surface` at radius 32, 20 pt in, a mono label and its note above what it holds. */
function EditCard({ title, sub, children, onLayout }: { title?: string; sub?: string; children: ReactNode; onLayout?: (y: number) => void }) {
  const bold = useBoldText()
  return (
    <View style={styles.card} onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}>
      {title ? (
        <View style={styles.cardHeader}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.note} accessibilityRole="header" style={[font('note', bold), styles.cardTitle]}>
            {title}
          </Text>
          {sub ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.cardSub]}>{sub}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  )
}

// design-exception: the frame's card pads 20 and gaps 14, between the 16 and 24 steps
const CARD_PAD = 20
const CARD_GAP = 14

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  content: { flex: 1 },
  column: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, gap: SPACE.lg },
  card: { backgroundColor: COLOR.surface, borderRadius: RADIUS.card, padding: CARD_PAD, gap: CARD_GAP },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  // FieldLabel's inset, so the card's label and the set labels inside it start on one edge (r7 L8).
  cardTitle: { color: COLOR.textSecondary, paddingLeft: SPACE.xs },
  cardSub: { color: COLOR.textTertiary },
  floor: { color: COLOR.textSecondary, paddingLeft: SPACE.xs },
  // Form fields: the design system's TextField / TextArea, one gap between them.
  fields: { gap: SPACE.lg },
  cardBody: { gap: CARD_GAP },
  skeletonField: { gap: SPACE.sm },
  chipsSkeleton: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
})

/** Violet world: one hue on this screen (`HueProvider`). Labels in sentence case, as board A 03 draws them. */
export default function EditProfile() {
  return (
    <HueProvider value="violet">
      <FieldLabelCase.Provider value="sentence">
        <EditProfileContent />
      </FieldLabelCase.Provider>
    </HueProvider>
  )
}
