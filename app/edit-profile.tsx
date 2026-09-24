import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  Alert,
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
import { AppHeader } from '../components/AppHeader'
import PhotoManager from '../components/PhotoManager'
import { MatchingFields, type Intent } from '../components/profile/MatchingFields'
import { mayDate, type Gender, type Orientation } from '../lib/dating'
import { SkeletonBlock, SkeletonLine } from '../components/Skeleton'
import { InterestPicker } from '../components/InterestPicker'
import { apiClient, ProfileCache } from '../lib/apiClient'
import { useGradientOverlay } from '../lib/gradientOverlay'
import { Logger } from '../lib/logger'
import { queryCache } from '../lib/queryCache'
import { EMBER, EMBER_FONTS } from '../lib/theme'
import { useAuth, refreshAuthUser } from '../lib/useAuth'
import { KEYBOARD_BEHAVIOR } from '../lib/keyboard'

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
  display_name?: string
  bio?: string
  profile_photos?: string[]
  goals?: string[]
  looking_for?: string[]
}

type TagInputMode = 'goal' | 'lookingFor'

export default function EditProfile() {
  const { user: authUser } = useAuth()
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
  const [, setPhotos] = useState<string[]>([])

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

  const toggleIntent = (value: Intent) =>
    setIntents((prev) => (prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value]))
  const [nameError, setNameError] = useState<string | null>(null)
  const [ageError, setAgeError] = useState<string | null>(null)
  const [tagModalVisible, setTagModalVisible] = useState(false)
  const [tagInputValue, setTagInputValue] = useState('')
  const [tagInputTitle, setTagInputTitle] = useState('')
  const [tagInputPlaceholder, setTagInputPlaceholder] = useState('')
  const [tagInputMode, setTagInputMode] = useState<TagInputMode>('goal')
  const { setScrollProgress } = useGradientOverlay()

  useEffect(() => {
    if (authUser) {
      loadProfile()
    }
    // loadProfile is redefined every render; only authUser should trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser])

  const loadProfile = async () => {
    try {
      if (!authUser) {
        Alert.alert('Error', 'Please sign in to edit your profile')
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
        display_name: p.name || '',
        bio: p.bio || '',
        profile_photos: p.photos || [],
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
      setPhotos(combinedProfile.profile_photos || [])

      /*
       * Pre-filled, which the old screen never did: it read only name and age,
       * so every chip opened blank and you could not tell "networking" from
       * "nothing chosen".
       */
      const p2 = profileData.profile
      const loadedIntents = (p2?.intent_default || []) as Intent[]
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

      const fields = await apiClient.getWorkFields()
      if (fields.success && fields.data?.workFields) setWorkFields(fields.data.workFields)

    } catch (error) {
      Logger.error('profile', 'EditProfile: Load profile error', { error })
      Alert.alert('Error', 'Failed to load profile data')
    } finally {
      setLoading(false)
    }
  }

  const handlePhotosChange = (newPhotos: string[]) => {
    setPhotos(newPhotos)
  }

  const openTagInput = (mode: TagInputMode) => {
    if (mode === 'goal') {
      setTagInputTitle('Add Goal')
      setTagInputPlaceholder('What are you looking for?')
    } else if (mode === 'lookingFor') {
      setTagInputTitle('Add Preference')
      setTagInputPlaceholder('What type of person are you looking for?')
    }
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

  const handleAddGoal = () => {
    openTagInput('goal')
  }

  const handleRemoveGoal = (goal: string) => {
    setGoals(prev => prev.filter(g => g !== goal))
  }

  const handleAddLookingFor = () => {
    openTagInput('lookingFor')
  }

  const handleRemoveLookingFor = (pref: string) => {
    setLookingFor(prev => prev.filter(p => p !== pref))
  }

  const handleSave = async () => {
    if (!authUser) return

    const trimmedName = name.trim()
    const trimmedAge = age.trim()
    const parsedAge = trimmedAge ? parseInt(trimmedAge, 10) : undefined
    const invalidAge = !!trimmedAge && (Number.isNaN(parsedAge) || (parsedAge as number) < 18 || (parsedAge as number) > 120)

    setNameError(trimmedName ? null : 'Name is required')
    setAgeError(invalidAge ? 'Enter a valid age between 18 and 120' : null)
    if (!trimmedName || invalidAge) {
      // The red text under the field is silent to a screen reader; say it.
      AccessibilityInfo.announceForAccessibility(
        !trimmedName ? 'Name is required' : 'Enter a valid age between 18 and 120'
      )
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
      const trimmedLocation = location.trim()
      const trimmedPhone = phone.trim()
      const trimmedOccupation = occupation.trim()
      const trimmedEducation = education.trim()
      const trimmedBio = bio.trim()
      if (trimmedLocation !== (profile?.location || '')) updateData.location = trimmedLocation || null
      if (trimmedPhone !== (profile?.phone || '')) updateData.phone = trimmedPhone || null
      if (trimmedOccupation !== (profile?.occupation || '')) updateData.occupation = trimmedOccupation || null
      if (trimmedEducation !== (profile?.education || '')) updateData.education = trimmedEducation || null
      if (trimmedBio !== (profile?.bio || '')) updateData.bio = trimmedBio || null
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

      // Invalidate caches so profile tab shows fresh data
      ProfileCache.clear()
      queryCache.invalidate(`profile_${authUser.id}`)
      void refreshAuthUser()

      Logger.info('profile', 'EditProfile: Profile updated successfully', { userId: authUser.id })
      Alert.alert(
        'Profile Updated',
        'Your profile has been successfully updated!',
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      )

    } catch (error) {
      Logger.error('profile', 'EditProfile: Save profile error', { error })
      Alert.alert('Error', 'Failed to save profile. Please try again.')
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
          <Ionicons name="close" size={14} color={EMBER.textSecondary} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.addTag} onPress={onAdd} accessibilityRole="button" accessibilityLabel={addLabel}>
        <Ionicons name="add" size={16} color={EMBER.accent} />
        <Text style={styles.addTagText}>{addLabel}</Text>
      </TouchableOpacity>
    </View>
  )

  const isLoading = loading

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        // `undefined` on Android: the window already resizes for the keyboard
        // (adjustResize), and 'height' on top of it double-compensated — the
        // same fix components/onboarding/OnboardingScreen.tsx carries.
        behavior={KEYBOARD_BEHAVIOR}
      >
        <AppHeader
          title="Edit Profile"
          onBack={() => router.back()}
          rightTextButton={{ label: 'Save', onPress: handleSave, loading: saving, disabled: saving }}
        />

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setScrollProgress(e.nativeEvent.contentOffset.y, 320)}
          scrollEventThrottle={16}
        >
          {/* Photos Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>PHOTOS</Text>
            {isLoading ? (
              <SkeletonBlock width={'100%'} height={160} borderRadius={12} />
            ) : authUser ? (
              <PhotoManager
                userId={authUser.id}
                maxPhotos={6}
                editable={true}
                onPhotosChange={handlePhotosChange}
              />
            ) : null}
          </View>

          {/* Basic Info Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>BASIC INFORMATION</Text>
            {isLoading ? (
              <>
                <SkeletonLine width={'30%'} style={{ marginBottom: 8 }} />
                <SkeletonBlock width={'100%'} height={48} borderRadius={12} style={{ marginBottom: 16 }} />
                <SkeletonLine width={'20%'} style={{ marginBottom: 8 }} />
                <SkeletonBlock width={'100%'} height={48} borderRadius={12} style={{ marginBottom: 16 }} />
                <SkeletonLine width={'25%'} style={{ marginBottom: 8 }} />
                <SkeletonBlock width={'100%'} height={48} borderRadius={12} style={{ marginBottom: 16 }} />
                <SkeletonLine width={'22%'} style={{ marginBottom: 8 }} />
                <SkeletonBlock width={'100%'} height={48} borderRadius={12} />
              </>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Name *</Text>
                  <TextInput
                    accessibilityLabel="Name"
                    style={[styles.input, nameError && styles.inputError]}
                    value={name}
                    onChangeText={(value) => {
                      setName(value)
                      if (nameError && value.trim()) setNameError(null)
                    }}
                    placeholder="Enter your name"
                    placeholderTextColor={EMBER.textTertiary}
                    maxLength={50}
                  />
                  {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Age</Text>
                  <TextInput
                    accessibilityLabel="Age"
                    style={[styles.input, ageError && styles.inputError]}
                    value={age}
                    onChangeText={(value) => {
                      const sanitized = value.replace(/[^0-9]/g, '')
                      setAge(sanitized)
                      if (ageError && sanitized) setAgeError(null)
                    }}
                    placeholder="Enter your age"
                    placeholderTextColor={EMBER.textTertiary}
                    keyboardType="numeric"
                    maxLength={3}
                  />
                  {!!ageError && <Text style={styles.errorText}>{ageError}</Text>}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Location</Text>
                  <TextInput
                    accessibilityLabel="Location"
                    style={styles.input}
                    value={location}
                    onChangeText={setLocation}
                    placeholder="City, State"
                    placeholderTextColor={EMBER.textTertiary}
                    maxLength={100}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Occupation</Text>
                  <TextInput
                    accessibilityLabel="Occupation"
                    style={styles.input}
                    value={occupation}
                    onChangeText={setOccupation}
                    placeholder="e.g. Software Engineer"
                    placeholderTextColor={EMBER.textTertiary}
                    maxLength={100}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Education</Text>
                  <TextInput
                    accessibilityLabel="Education"
                    style={styles.input}
                    value={education}
                    onChangeText={setEducation}
                    placeholder="e.g. University of California"
                    placeholderTextColor={EMBER.textTertiary}
                    maxLength={100}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Phone</Text>
                  <TextInput
                    accessibilityLabel="Phone"
                    style={styles.input}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Phone number"
                    placeholderTextColor={EMBER.textTertiary}
                    keyboardType="phone-pad"
                    maxLength={20}
                  />
                </View>
              </>
            )}
          </View>

          {/* About Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ABOUT YOU</Text>
            {isLoading ? (
              <>
                <SkeletonLine width={'20%'} style={{ marginBottom: 8 }} />
                <SkeletonBlock width={'100%'} height={100} borderRadius={12} />
              </>
            ) : (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Bio</Text>
                <TextInput
                  accessibilityLabel="Bio"
                  style={[styles.input, styles.bioInput]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell people about yourself..."
                  placeholderTextColor={EMBER.textTertiary}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
                <Text style={styles.characterCount}>{bio.length}/500</Text>
              </View>
            )}
          </View>

          {/* Interests Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>INTERESTS</Text>
            {isLoading ? (
              <View style={styles.tagsContainer}>
                {[...Array(5)].map((_, i) => (
                  <SkeletonBlock key={`sk-i-${i}`} width={100} height={32} borderRadius={14} />
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
              offerDating={mayDate(liveAge)}
            />
          </View>

          {/* Goals Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>GOALS</Text>
            {isLoading ? (
              <View style={styles.tagsContainer}>
                {[...Array(3)].map((_, i) => (
                  <SkeletonBlock key={`sk-g-${i}`} width={100} height={32} borderRadius={14} />
                ))}
              </View>
            ) : (
              renderTags(goals, handleRemoveGoal, handleAddGoal, 'Add Goal')
            )}
          </View>

          {/* Looking For Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>LOOKING FOR</Text>
            {isLoading ? (
              <View style={styles.tagsContainer}>
                {[...Array(3)].map((_, i) => (
                  <SkeletonBlock key={`sk-l-${i}`} width={100} height={32} borderRadius={14} />
                ))}
              </View>
            ) : (
              renderTags(lookingFor, handleRemoveLookingFor, handleAddLookingFor, 'Add Preference')
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
              <Text style={styles.modalTitle}>{tagInputTitle}</Text>
              <TextInput
                style={styles.modalInput}
                value={tagInputValue}
                onChangeText={setTagInputValue}
                placeholder={tagInputPlaceholder}
                placeholderTextColor={EMBER.textTertiary}
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
    paddingHorizontal: 16,
  },

  // Card sections
  /* 32 and 24, the radii every rebuilt card in the app uses. */
  card: {
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: 32,
    padding: 24,
    marginTop: 16,
  },
  cardTitle: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1.6,
    color: EMBER.accent,
    marginBottom: 16,
  },

  // Form inputs
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    color: EMBER.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(73,71,71,0.3)',
    /* 20, not 12: the app's inputs are softer than its cards, never squarer. */
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    backgroundColor: EMBER.surfaceMedia,
    color: EMBER.textPrimary,
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    marginTop: 6,
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '500',
  },
  bioInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  characterCount: {
    textAlign: 'right',
    fontSize: 12,
    color: EMBER.textSecondary,
    marginTop: 4,
  },

  // Tags (matching profile tab style)
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(45,44,44,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(73,71,71,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    /* Fully round, like every other chip in the app. */
    borderRadius: 9999,
    marginRight: 8,
    marginBottom: 8,
    gap: 4,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
    color: EMBER.textPrimary,
  },
  addTag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: EMBER.accent,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginRight: 8,
    marginBottom: 8,
    gap: 4,
  },
  addTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: EMBER.accent,
  },

  bottomPadding: {
    height: 32,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    borderRadius: 32,
    padding: 16,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(73,71,71,0.3)',
  },
  modalTitle: {
    color: EMBER.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(73,71,71,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: EMBER.textPrimary,
    backgroundColor: EMBER.surfaceMedia,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  modalCancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: EMBER.surfaceMedia,
  },
  modalCancelText: {
    color: EMBER.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: EMBER.accent,
  },
  modalSubmitButtonDisabled: {
    opacity: 0.5,
  },
  modalSubmitText: {
    color: EMBER.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
})
