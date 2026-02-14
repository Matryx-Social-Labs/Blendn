import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppHeader from '../components/AppHeader'
import PhotoManager from '../components/PhotoManager'
import { SkeletonBlock, SkeletonLine } from '../components/Skeleton'
import { apiClient } from '../lib/apiClient'
import { useGradientOverlay } from '../lib/gradientOverlay'
import { useAuth } from '../lib/useAuth'

interface UserProfile {
  id: string
  name?: string
  age?: number
  location?: string
  phone?: string
  interests?: string[]
  display_name?: string
  bio?: string
  profile_photos?: string[]
  goals?: string[]
  looking_for?: string[]
}

type TagInputMode = 'goal' | 'lookingFor' | 'interest'

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
  const [bio, setBio] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [goals, setGoals] = useState<string[]>([])
  const [lookingFor, setLookingFor] = useState<string[]>([])
  const [photos, setPhotos] = useState<string[]>([])
  const [tagModalVisible, setTagModalVisible] = useState(false)
  const [tagInputValue, setTagInputValue] = useState('')
  const [tagInputTitle, setTagInputTitle] = useState('')
  const [tagInputPlaceholder, setTagInputPlaceholder] = useState('')
  const [tagInputMode, setTagInputMode] = useState<TagInputMode>('interest')
  const { setScrollProgress } = useGradientOverlay()

  useEffect(() => {
    if (authUser) {
      loadProfile()
    }
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
        console.error('EditProfile: Profile load error', { error: result.error })
      }

      const profileData = result.data || {}

      // Combine with auth user data
      const combinedProfile = {
        id: authUser.id,
        name: profileData.name || authUser.name || '',
        age: profileData.age || '',
        location: profileData.location || '',
        phone: profileData.phone || '',
        interests: profileData.interests || [],
        display_name: profileData.display_name || '',
        bio: profileData.bio || '',
        profile_photos: profileData.photos || profileData.profile_photos || [],
        goals: profileData.goals || [],
        looking_for: profileData.looking_for || []
      }

      setProfile(combinedProfile)

      // Set form values
      setName(combinedProfile.name || '')
      setAge(combinedProfile.age?.toString() || '')
      setLocation(combinedProfile.location || '')
      setPhone(combinedProfile.phone || '')
      setBio(combinedProfile.bio || '')
      setInterests(combinedProfile.interests || [])
      setGoals(combinedProfile.goals || [])
      setLookingFor(combinedProfile.looking_for || [])
      setPhotos(combinedProfile.profile_photos || [])

    } catch (error) {
      console.error('EditProfile: Load profile error', { error })
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
    } else {
      setTagInputTitle('Add Interest')
      setTagInputPlaceholder('Enter a new interest')
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
    } else {
      if (!interests.includes(value)) {
        setInterests(prev => [...prev, value])
      }
    }

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

  const handleAddInterest = () => {
    openTagInput('interest')
  }

  const handleRemoveInterest = (interest: string) => {
    setInterests(prev => prev.filter(i => i !== interest))
  }

  const handleSave = async () => {
    if (!authUser) return

    setSaving(true)
    try {
      // Validate required fields
      if (!name.trim()) {
        Alert.alert('Validation Error', 'Name is required')
        setSaving(false)
        return
      }

      const ageNum = parseInt(age)
      if (age && (isNaN(ageNum) || ageNum < 18 || ageNum > 120)) {
        Alert.alert('Validation Error', 'Please enter a valid age (18-120)')
        setSaving(false)
        return
      }

      // Update profile via API
      const updateData: any = {}
      if (name !== profile?.name) updateData.name = name
      if (ageNum !== profile?.age) updateData.age = ageNum
      if (location !== profile?.location) updateData.location = location
      if (phone !== profile?.phone) updateData.phone = phone
      if (JSON.stringify(interests) !== JSON.stringify(profile?.interests)) {
        updateData.interests = interests
      }

      const result = await apiClient.updateProfile(authUser.id, updateData)

      if (!result.success) {
        console.error('EditProfile: Profile update error', { error: result.error })
        throw new Error(result.error || 'Failed to update profile')
      }

      console.log('EditProfile: Profile updated successfully', { userId: authUser.id })
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
      console.error('EditProfile: Save profile error', { error })
      Alert.alert('Error', 'Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const renderGoals = () => (
    <View style={styles.tagsContainer}>
      {goals.map((goal, index) => (
        <TouchableOpacity
          key={index}
          style={styles.tag}
          onPress={() => handleRemoveGoal(goal)}
        >
          <Text style={styles.tagText}>{goal}</Text>
          <Ionicons name="close" size={16} color="#FFFFFF" style={styles.tagIcon} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.addTag} onPress={handleAddGoal}>
        <Ionicons name="add" size={16} color="#FF6B6B" />
        <Text style={styles.addTagText}>Add Goal</Text>
      </TouchableOpacity>
    </View>
  )

  const renderLookingFor = () => (
    <View style={styles.tagsContainer}>
      {lookingFor.map((pref, index) => (
        <TouchableOpacity
          key={index}
          style={styles.tag}
          onPress={() => handleRemoveLookingFor(pref)}
        >
          <Text style={styles.tagText}>{pref}</Text>
          <Ionicons name="close" size={16} color="#FFFFFF" style={styles.tagIcon} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.addTag} onPress={handleAddLookingFor}>
        <Ionicons name="add" size={16} color="#FF6B6B" />
        <Text style={styles.addTagText}>Add Preference</Text>
      </TouchableOpacity>
    </View>
  )

  const renderInterests = () => (
    <View style={styles.interestsContainer}>
      {interests.map((interest, index) => (
        <TouchableOpacity
          key={index}
          style={styles.interestTag}
          onPress={() => handleRemoveInterest(interest)}
        >
          <Text style={styles.interestText}>{interest}</Text>
          <Ionicons name="close" size={16} color="#666" />
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={styles.addInterestButton}
        onPress={handleAddInterest}
      >
        <Ionicons name="add" size={16} color="#FF6B6B" />
        <Text style={styles.addInterestText}>Add Interest</Text>
      </TouchableOpacity>
    </View>
  )

  const isLoading = loading

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photos</Text>
            {isLoading ? (
              <SkeletonBlock width={'100%'} height={160} borderRadius={12} style={styles.photoManager} />
            ) : authUser ? (
              <PhotoManager
                userId={authUser.id}
                maxPhotos={6}
                editable={true}
                onPhotosChange={handlePhotosChange}
                style={styles.photoManager}
              />
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            
            {isLoading ? (
              <>
                <SkeletonLine width={'30%'} style={{ marginBottom: 8 }} />
                <SkeletonBlock width={'100%'} height={48} borderRadius={12} style={{ marginBottom: 16 }} />
                <SkeletonLine width={'20%'} style={{ marginBottom: 8 }} />
                <SkeletonBlock width={'100%'} height={48} borderRadius={12} style={{ marginBottom: 16 }} />
                <SkeletonLine width={'25%'} style={{ marginBottom: 8 }} />
                <SkeletonBlock width={'100%'} height={48} borderRadius={12} style={{ marginBottom: 16 }} />
                <SkeletonLine width={'22%'} style={{ marginBottom: 8 }} />
                <SkeletonBlock width={'100%'} height={48} borderRadius={12} style={{ marginBottom: 16 }} />
              </>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter your name"
                    maxLength={50}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Age</Text>
                  <TextInput
                    style={styles.input}
                    value={age}
                    onChangeText={setAge}
                    placeholder="Enter your age"
                    keyboardType="numeric"
                    maxLength={3}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Location</Text>
                  <TextInput
                    style={styles.input}
                    value={location}
                    onChangeText={setLocation}
                    placeholder="City, State"
                    maxLength={100}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Phone</Text>
                  <TextInput
                    style={styles.input}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Phone number"
                    keyboardType="phone-pad"
                    maxLength={20}
                  />
                </View>
              </>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About You</Text>
            {isLoading ? (
              <>
                <SkeletonLine width={'20%'} style={{ marginBottom: 8 }} />
                <SkeletonBlock width={'100%'} height={100} borderRadius={12} />
              </>
            ) : (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Bio</Text>
                <TextInput
                  style={[styles.input, styles.bioInput]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell people about yourself..."
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
                <Text style={styles.characterCount}>{bio.length}/500</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interests</Text>
            <Text style={styles.sectionSubtitle}>What are you into?</Text>
            {isLoading ? (
              <View style={styles.interestsContainer}>
                {[...Array(5)].map((_, i) => (
                  <SkeletonBlock key={`sk-i-${i}`} width={120} height={32} borderRadius={20} />
                ))}
              </View>
            ) : (
              renderInterests()
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
                placeholderTextColor="#9CA3AF"
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#d1d5db',
    marginBottom: 16,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  photoSlot: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  removePhotoOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
  },
  addPhotoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  bioInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  characterCount: {
    textAlign: 'right',
    fontSize: 12,
    color: '#e5e7eb',
    marginTop: 4,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  interestText: {
    fontSize: 14,
    color: '#333',
  },
  addInterestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderColor: '#FF6B6B',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  addInterestText: {
    fontSize: 14,
    color: '#FF6B6B',
  },
  bottomPadding: {
    height: 32,
  },
  photoManager: {
    marginVertical: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  tagText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  tagIcon: {
    marginLeft: 2,
  },
  addTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#FF6B6B',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  addTagText: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#FFFFFF',
    backgroundColor: '#1F2937',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalCancelText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FF6B6B',
  },
  modalSubmitButtonDisabled: {
    opacity: 0.5,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
})
