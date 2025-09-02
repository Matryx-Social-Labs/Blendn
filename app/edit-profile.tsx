import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
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
import { supabase } from '../lib/supabase'

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

export default function EditProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)

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

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'Please sign in to edit your profile')
        router.back()
        return
      }

      setCurrentUser(user)

      // Load profiles data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error loading profile:', profileError)
      }

      // Load user_profiles data
      const { data: userProfileData, error: userProfileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (userProfileError && userProfileError.code !== 'PGRST116') {
        console.error('EditProfile: User profile load error', { error: userProfileError })
      }

      // Combine data
      const combinedProfile = {
        id: user.id,
        name: profileData?.name || user.user_metadata?.full_name || '',
        age: profileData?.age || userProfileData?.age || '',
        location: profileData?.location || '',
        phone: profileData?.phone || '',
        interests: profileData?.interests || userProfileData?.interests || [],
        display_name: userProfileData?.display_name || '',
        bio: userProfileData?.bio || '',
        profile_photos: userProfileData?.profile_photos || [],
        goals: userProfileData?.goals || [],
        looking_for: userProfileData?.looking_for || []
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

  const handleAddGoal = () => {
    Alert.prompt(
      'Add Goal',
      'What are you looking for?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: (value) => {
            if (value && value.trim()) {
              const newGoal = value.trim()
              if (!goals.includes(newGoal)) {
                setGoals(prev => [...prev, newGoal])
              }
            }
          }
        }
      ],
      'plain-text'
    )
  }

  const handleRemoveGoal = (goal: string) => {
    setGoals(prev => prev.filter(g => g !== goal))
  }

  const handleAddLookingFor = () => {
    Alert.prompt(
      'Add Preference',
      'What type of person are you looking for?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: (value) => {
            if (value && value.trim()) {
              const newPref = value.trim()
              if (!lookingFor.includes(newPref)) {
                setLookingFor(prev => [...prev, newPref])
              }
            }
          }
        }
      ],
      'plain-text'
    )
  }

  const handleRemoveLookingFor = (pref: string) => {
    setLookingFor(prev => prev.filter(p => p !== pref))
  }

  const handleAddInterest = () => {
    Alert.prompt(
      'Add Interest',
      'Enter a new interest:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: (value) => {
            if (value && value.trim()) {
              const newInterest = value.trim()
              if (!interests.includes(newInterest)) {
                setInterests(prev => [...prev, newInterest])
              }
            }
          }
        }
      ],
      'plain-text'
    )
  }

  const handleRemoveInterest = (interest: string) => {
    setInterests(prev => prev.filter(i => i !== interest))
  }

  const handleSave = async () => {
    if (!currentUser) return

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

      // Update profiles table
      const profileUpdates: any = {}
      if (name !== profile?.name) profileUpdates.name = name
      if (ageNum !== profile?.age) profileUpdates.age = ageNum
      if (location !== profile?.location) profileUpdates.location = location
      if (phone !== profile?.phone) profileUpdates.phone = phone
      if (JSON.stringify(interests) !== JSON.stringify(profile?.interests)) {
        profileUpdates.interests = interests
      }

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', currentUser.id)

        if (profileError) {
          console.error('EditProfile: Profile update error', { error: profileError })
          throw profileError
        }
      }

      // Update user_profiles table
      const userProfileUpdates: any = {}
      if (bio !== profile?.bio) userProfileUpdates.bio = bio
      if (JSON.stringify(photos) !== JSON.stringify(profile?.profile_photos)) {
        userProfileUpdates.profile_photos = photos
      }
      if (JSON.stringify(goals) !== JSON.stringify(profile?.goals)) {
        userProfileUpdates.goals = goals
      }
      if (JSON.stringify(lookingFor) !== JSON.stringify(profile?.looking_for)) {
        userProfileUpdates.looking_for = lookingFor
      }

      if (Object.keys(userProfileUpdates).length > 0) {
        const { error: userProfileError } = await supabase
          .from('user_profiles')
          .update(userProfileUpdates)
          .eq('user_id', currentUser.id)

        if (userProfileError) {
          console.error('EditProfile: User profile update error', { error: userProfileError })
          throw userProfileError
        }
      }

      console.log('EditProfile: Profile updated successfully', { userId: currentUser.id })
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

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photos</Text>
            {isLoading ? (
              <SkeletonBlock width={'100%'} height={160} borderRadius={12} style={styles.photoManager} />
            ) : (
              <PhotoManager
                userId={currentUser.id}
                maxPhotos={6}
                editable={true}
                onPhotosChange={handlePhotosChange}
                style={styles.photoManager}
              />
            )}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
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
    color: '#333',
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
    color: '#666',
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
}) 