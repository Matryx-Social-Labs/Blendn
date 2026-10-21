import { Ionicons } from '@expo/vector-icons'
import { router, useNavigation } from 'expo-router'
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation'
import React, { useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { TextArea, TextField } from '../components/ds/TextField'
import { TopBar } from '../components/ds/TopBar'
import PhotoManager from '../components/PhotoManager'
import { MatchingFields, type Intent } from '../components/profile/MatchingFields'
import { mayDate, type Gender, type Orientation } from '../lib/dating'
import { SkeletonBlock, SkeletonLine } from '../components/Skeleton'
import { InterestPicker } from '../components/InterestPicker'
import { apiClient, ProfileCache } from '../lib/apiClient'
import { Logger } from '../lib/logger'
import { useToast } from '../components/Toast'
import { queryCache } from '../lib/queryCache'
import { showSheet } from '../lib/sheet'
import { useTopBarState } from '../lib/useTopBarState'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, OPACITY, SPACE, TYPE } from '../lib/theme'
import { useAuth, refreshAuthUser } from '../lib/useAuth'
import { KEYBOARD_BEHAVIOR } from '../lib/keyboard'
import { profileFormErrors } from '../lib/onboarding'
import { normaliseIntents, toggleIntent } from '../lib/intents'
import { HueProvider } from '../components/ds/shared'

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

type TagInputMode = 'goal' | 'lookingFor'

/** The same cap as the onboarding step and the server's schema (__tests__/onboarding-labels-and-caps). */
const BIO_LIMIT = 500
const NAME_LIMIT = 50
const FIELD_LIMIT = 100
const PHONE_LIMIT = 20
const AGE_DIGITS = 3

/** The add-a-tag sheet's words, per field. */
const TAG_INPUT: Record<TagInputMode, { title: string; placeholder: string }> = {
  goal: { title: 'Add goal', placeholder: 'What are you looking for?' },
  lookingFor: { title: 'Add preference', placeholder: 'What type of person are you looking for?' },
}

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
  gender: string | null
  orientations: string[]
  interestedIn: string[]
}): string {
  return JSON.stringify({ ...f, interestIds: [...f.interestIds].sort() })
}

function EditProfileContent() {
  const { user: authUser } = useAuth()
  const { showToast } = useToast()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
  const [gender, setGender] = useState<Gender | null>(null)
  const [orientations, setOrientations] = useState<Orientation[]>([])
  const [interestedIn, setInterestedIn] = useState<Gender[]>([])
  /* What the server had, so the save can send only what actually moved. */
  const [matchingAtLoad, setMatchingAtLoad] = useState<{
    intents: Intent[]
    workField: string | null
    gender: Gender | null
    orientations: Orientation[]
    interestedIn: Gender[]
  }>({ intents: [], workField: null, gender: null, orientations: [], interestedIn: [] })

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
  const [tagModalVisible, setTagModalVisible] = useState(false)
  const [tagInputValue, setTagInputValue] = useState('')
  const [tagInputMode, setTagInputMode] = useState<TagInputMode>('goal')
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
    intents, workField, gender, orientations, interestedIn,
  })
  const dirty = savedSnapshot !== null && currentSnapshot !== savedSnapshot

  const bar = useTopBarState()

  // Discard lifts the guard first, then replays the exit that was stopped.
  const discardChanges = () => setLeaving(pendingLeave.current)

  usePreventRemove(dirty && !leaving, ({ data }) => {
    pendingLeave.current = data.action
    // The app's one sheet: Discard is the destructive confirm, so it plays the one destructive tick like every other.
    showSheet({
      kind: 'actions',
      icon: 'triangle-alert',
      title: 'Discard changes?',
      message: "You have edits that aren't saved. Leave now and they're gone.",
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
        }

        const profileData = result.data || {}
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
          ? (profileData.interests as { id: string }[]).map((i) => String(i.id))
          : []
        setInterestIds(structured)
        setInterestsAtLoad(structured)
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
        const loadedGender = (p2?.gender ?? null) as Gender | null
        const loadedOrientations = (p2?.orientations || []) as Orientation[]
        const loadedInterestedIn = (p2?.interested_in || []) as Gender[]
        setIntents(loadedIntents)
        setWorkField(loadedWorkField)
        setGender(loadedGender)
        setOrientations(loadedOrientations)
        setInterestedIn(loadedInterestedIn)
        setMatchingAtLoad({
          intents: loadedIntents,
          workField: loadedWorkField,
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
          gender: loadedGender,
          orientations: loadedOrientations,
          interestedIn: loadedInterestedIn,
        }))

        const fields = await apiClient.getWorkFields()
        if (fields.success && fields.data?.workFields) setWorkFields(fields.data.workFields)

      } catch (error) {
        Logger.error('profile', 'EditProfile: Load profile error', { error })
        showToast("Couldn't load your profile. Try again.", 'error')
      } finally {
        setLoading(false)
      }
    }

    if (authUser) {
      loadProfile()
    }
  }, [authUser, showToast])

  const openTagInput = (mode: TagInputMode) => {
    setTagInputMode(mode)
    setTagInputValue('')
    setTagModalVisible(true)
  }

  const closeTagModal = () => {
    setTagModalVisible(false)
    setTagInputValue('')
  }

  const submitTagInput = () => {
    const value = tagInputValue.trim()
    if (!value) return

    if (tagInputMode === 'goal') {
      if (!goals.includes(value)) {
        setGoals(prev => [...prev, value])
      }
    } else if (tagInputMode === 'lookingFor') {
      if (!lookingFor.includes(value)) {
        setLookingFor(prev => [...prev, value])
      }
    }

    /*
     * There is no `interest` branch any more. Interests are picked from the
     * server's taxonomy rather than typed, so `TagInputMode` covers only the
     * two fields that are still free text.
     */
    closeTagModal()
  }

  const handleSave = async () => {
    if (!authUser) return

    const trimmedName = name.trim()
    const errors = profileFormErrors({ name, age, storedAge: profile?.age ?? null })
    const parsedAge = errors.years

    setNameError(errors.name)
    setAgeError(errors.age)
    if (errors.name || errors.age) {
      // Both fields are in the Basic Information card. From anywhere lower down
      // a refused Save looked like a dead button, so bring the card into view —
      // its own offset, not 0, which is the photo grid for anyone with photos.
      scrollRef.current?.scrollTo({ y: basicInfoY.current, animated: true })
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

      const result = await apiClient.updateProfile(authUser.id, updateData)

      if (!result.success) {
        Logger.error('profile', 'EditProfile: Profile update error', { error: result.error })
        throw new Error(result.error || 'Failed to update profile')
      }

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
      if (added.length > 0) {
        const r = await apiClient.addProfileInterests(authUser.id, added)
        if (!r.success) throw new Error(r.error || 'Could not save your interests')
      }
      if (removed.length > 0) {
        const r = await apiClient.removeProfileInterests(authUser.id, removed)
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
      showToast('Profile saved', 'success', { haptic: 'success' })
      setLeaveAfterSave(true)

    } catch (error) {
      Logger.error('profile', 'EditProfile: Save profile error', { error })
      // Never the thrown message: it is the server's or the client's wording
      // for a developer ("Failed to update profile"), not for the person.
      showToast("Couldn't save your profile. Try again.", 'error', { haptic: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const renderTags = (
    items: string[],
    onRemove: (item: string) => void,
    onAdd: () => void,
    addLabel: string
  ) => (
    <View style={styles.tagsContainer}>
      {items.map((item) => (
        // The item is the key: add is guarded against duplicates, and an
        // index key hands the next chip the removed one's identity.
        <TouchableOpacity
          key={item}
          style={styles.tag}
          onPress={() => onRemove(item)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item}`}
        >
          <Text style={styles.tagText}>{item}</Text>
          <Ionicons name="close" size={ICON.sm} color={EMBER.textSecondary} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.addTag} onPress={onAdd} accessibilityRole="button" accessibilityLabel={addLabel}>
        <Ionicons name="add" size={ICON.sm} color={EMBER.textPrimary} />
        <Text style={styles.addTagText}>{addLabel}</Text>
      </TouchableOpacity>
    </View>
  )

  const isLoading = loading

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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
          save={{ onPress: handleSave, saving, disabled: saving }}
          testID="edit-profile-top"
        />

        <ScrollView
          ref={scrollRef}
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...bar.scrollProps}
        >
          {/* Photos Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>PHOTOS</Text>
            {isLoading ? (
              <SkeletonBlock width={'100%'} height={160} borderRadius={EMBER_RADIUS.md} />
            ) : authUser ? (
              <PhotoManager userId={authUser.id} maxPhotos={6} />
            ) : null}
          </View>

          {/* Basic Info Card */}
          <View style={styles.card} onLayout={(e) => { basicInfoY.current = e.nativeEvent.layout.y }}>
            <Text style={styles.cardTitle}>BASIC INFORMATION</Text>
            {isLoading ? (
              <>
                <SkeletonLine width={'30%'} style={{ marginBottom: SPACE.sm }} />
                <SkeletonBlock width={'100%'} height={CONTROL.lg} borderRadius={EMBER_RADIUS.pill} style={{ marginBottom: SPACE.lg }} />
                <SkeletonLine width={'20%'} style={{ marginBottom: SPACE.sm }} />
                <SkeletonBlock width={'100%'} height={CONTROL.lg} borderRadius={EMBER_RADIUS.pill} style={{ marginBottom: SPACE.lg }} />
                <SkeletonLine width={'25%'} style={{ marginBottom: SPACE.sm }} />
                <SkeletonBlock width={'100%'} height={CONTROL.lg} borderRadius={EMBER_RADIUS.pill} style={{ marginBottom: SPACE.lg }} />
                <SkeletonLine width={'22%'} style={{ marginBottom: SPACE.sm }} />
                <SkeletonBlock width={'100%'} height={CONTROL.lg} borderRadius={EMBER_RADIUS.pill} />
              </>
            ) : (
              <View style={styles.fields}>
                <TextField
                  label="Name"
                  inputRef={nameInputRef}
                  value={name}
                  onChangeText={(value) => {
                    setName(value.slice(0, NAME_LIMIT))
                    if (nameError && value.trim()) setNameError(null)
                  }}
                  onBlur={() => setNameError(profileFormErrors({ name, age, storedAge: profile?.age ?? null }).name)}
                  error={nameError ?? undefined}
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
                  label="Location"
                  value={location}
                  onChangeText={(value) => setLocation(value.slice(0, FIELD_LIMIT))}
                  placeholder="City, State"
                  testID="edit-profile-location"
                />
                <TextField
                  label="Occupation"
                  value={occupation}
                  onChangeText={(value) => setOccupation(value.slice(0, FIELD_LIMIT))}
                  placeholder="e.g. Software Engineer"
                  testID="edit-profile-occupation"
                />
                <TextField
                  label="Education"
                  value={education}
                  onChangeText={(value) => setEducation(value.slice(0, FIELD_LIMIT))}
                  placeholder="e.g. University of California"
                  testID="edit-profile-education"
                />
                <TextField
                  label="Phone"
                  value={phone}
                  onChangeText={(value) => setPhone(value.slice(0, PHONE_LIMIT))}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  testID="edit-profile-phone"
                />
              </View>
            )}
          </View>

          {/* About Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ABOUT YOU</Text>
            {isLoading ? (
              <>
                <SkeletonLine width={'20%'} style={{ marginBottom: SPACE.sm }} />
                <SkeletonBlock width={'100%'} height={100} borderRadius={EMBER_RADIUS.lg} />
              </>
            ) : (
              <TextArea
                label="Bio"
                value={bio}
                onChangeText={(value) => setBio(value.slice(0, BIO_LIMIT))}
                limit={BIO_LIMIT}
                placeholder="Tell people about yourself..."
                testID="edit-profile-bio"
              />
            )}
          </View>

          {/* Interests Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>INTERESTS</Text>
            {isLoading ? (
              <View style={styles.tagsContainer}>
                {[...Array(5)].map((_, i) => (
                  <SkeletonBlock key={`sk-i-${i}`} width={100} height={CONTROL.md} borderRadius={EMBER_RADIUS.pill} />
                ))}
              </View>
            ) : (
              <InterestPicker selected={interestIds} onChange={setInterestIds} />
            )}
          </View>

          {/*
            You and matching. Its own card and not folded into ABOUT YOU,
            because these are the only fields on this screen that nobody else
            ever reads as text -- they feed `rankMatches` and surface as a tag
            on a card, never as the values behind it.
          */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>YOU AND MATCHING</Text>
            <MatchingFields
              intents={intents}
              onToggleIntent={onToggleIntent}
              workField={workField}
              onChangeWorkField={setWorkField}
              workFields={workFields}
              gender={gender}
              onChangeGender={setGender}
              orientations={orientations}
              onChangeOrientations={setOrientations}
              interestedIn={interestedIn}
              onChangeInterestedIn={setInterestedIn}
              offerDating={mayDate(liveAge)}
            />
            {/*
              Languages, home state, sign and this-or-that: display only, saved
              on their own screen so this form's save stays what it was.
            */}
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => router.push('/edit-about-you')}
              accessibilityRole="button"
              accessibilityLabel="Languages, home state, sign and this or that"
              accessibilityHint="Shown on cards when you share one with someone. Never used to rank."
            >
              <Text style={styles.linkText}>Languages, home, sign &amp; this-or-that</Text>
              <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Goals Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>GOALS</Text>
            {isLoading ? (
              <View style={styles.tagsContainer}>
                {[...Array(3)].map((_, i) => (
                  <SkeletonBlock key={`sk-g-${i}`} width={100} height={CONTROL.md} borderRadius={EMBER_RADIUS.pill} />
                ))}
              </View>
            ) : (
              renderTags(goals, (goal) => setGoals(prev => prev.filter(g => g !== goal)), () => openTagInput('goal'), 'Add Goal')
            )}
          </View>

          {/* Looking For Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>LOOKING FOR</Text>
            {isLoading ? (
              <View style={styles.tagsContainer}>
                {[...Array(3)].map((_, i) => (
                  <SkeletonBlock key={`sk-l-${i}`} width={100} height={CONTROL.md} borderRadius={EMBER_RADIUS.pill} />
                ))}
              </View>
            ) : (
              renderTags(lookingFor, (pref) => setLookingFor(prev => prev.filter(p => p !== pref)), () => openTagInput('lookingFor'), 'Add Preference')
            )}
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>

        <Modal
          visible={tagModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeTagModal}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeTagModal}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>{TAG_INPUT[tagInputMode].title}</Text>
              <TextInput
                style={styles.modalInput}
                value={tagInputValue}
                onChangeText={setTagInputValue}
                placeholder={TAG_INPUT[tagInputMode].placeholder}
                placeholderTextColor={EMBER.textPlaceholder}
                autoFocus
                maxLength={60}
                returnKeyType="done"
                onSubmitEditing={submitTagInput}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelButton} onPress={closeTagModal}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitButton, !tagInputValue.trim() && styles.modalSubmitButtonDisabled]}
                  onPress={submitTagInput}
                  disabled={!tagInputValue.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Add item"
                >
                  <Text style={styles.modalSubmitText}>Add</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>

    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    paddingHorizontal: GUTTER,
  },

  // Card sections
  card: {
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.card,
    padding: SPACE.xl,
    marginTop: SPACE.xl,
  },
  cardTitle: {
    ...TYPE.label,
    color: EMBER.textPrimary,
    marginBottom: SPACE.lg,
  },

  // Form fields: the design system's TextField / TextArea, one gap between them.
  fields: {
    gap: SPACE.lg,
  },

  // Tags: the same chip as MatchingFields, one height and one fill.
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.md,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: EMBER.surface,
    borderWidth: 1,
    borderColor: EMBER.separator,
    paddingHorizontal: SPACE.lg,
    minHeight: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    gap: SPACE.xs,
  },
  tagText: {
    ...TYPE.bodyStrong,
  },
  addTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: EMBER.surface,
    borderColor: EMBER.textTertiary,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: SPACE.lg,
    minHeight: CONTROL.md,
    gap: SPACE.xs,
  },
  addTagText: {
    ...TYPE.bodyStrong,
  },

  bottomPadding: {
    height: SPACE.xxl,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: CONTROL.md,
    marginTop: SPACE.lg,
  },
  linkText: {
    ...TYPE.bodyStrong,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: EMBER.backdrop,
    justifyContent: 'center',
    paddingHorizontal: GUTTER,
  },
  modalCard: {
    borderRadius: EMBER_RADIUS.lg,
    padding: SPACE.xl,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EMBER.separator,
  },
  modalTitle: {
    ...TYPE.title,
    marginBottom: SPACE.lg,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: EMBER.separator,
    borderRadius: EMBER_RADIUS.pill,
    minHeight: CONTROL.lg,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    fontFamily: TYPE.body.fontFamily,
    fontSize: TYPE.body.fontSize,
    color: EMBER.textPrimary,
    backgroundColor: EMBER.surfaceMedia,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACE.md,
    marginTop: SPACE.lg,
  },
  modalCancelButton: {
    minHeight: CONTROL.md,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  modalCancelText: {
    ...TYPE.button,
  },
  modalSubmitButton: {
    minHeight: CONTROL.md,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
  },
  modalSubmitButtonDisabled: {
    opacity: OPACITY.disabled,
  },
  modalSubmitText: {
    ...TYPE.button,
    color: EMBER.onGradient,
  },
})

/** Violet world: one hue on this screen (`HueProvider`). */
export default function EditProfile() {
  return (
    <HueProvider value="violet">
      <EditProfileContent />
    </HueProvider>
  )
}
