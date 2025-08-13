import { Image } from 'expo-image'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
const placeholderImg = require('../../assets/images/icon.png')

interface UserProfileViewModel {
  id: string
  name?: string
  bio?: string
  age?: number
  interests?: string[]
  profile_photos?: string[]
  goals?: string[]
  looking_for?: string[]
}

export default function Profile() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<UserProfileViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && user) {
    getUserAndProfile()
    } else if (!authLoading && !user) {
      // User not authenticated, redirect to login
      router.replace('/')
    }
  }, [user, authLoading])

  const getUserAndProfile = async () => {
    try {
      console.log('🔍 [PROFILE] Loading profile for user:', user?.id);
      setLoading(true)
      setError(null)

      // Load core profile
      const { data: baseProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, age')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('❌ [PROFILE] Error fetching profile:', profileError)
        setError('Failed to load profile')
        return
      }
      
      if (!baseProfile) {
        console.log('⚠️ [PROFILE] No profile found, redirecting to onboarding')
        router.replace('/onboarding/welcome')
        return
      }
      
      // Load extended onboarding details
      const { data: userProfile, error: userProfileError } = await supabase
        .from('user_profiles')
        .select('bio, interests, profile_photos, photos, goals, looking_for')
        .eq('user_id', user.id)
        .single()

      if (userProfileError) {
        console.warn('⚠️ [PROFILE] user_profiles fetch warning:', userProfileError.message)
      }

      const viewModel: UserProfileViewModel = {
        id: baseProfile.id,
        name: baseProfile.name ?? undefined,
        age: baseProfile.age ?? undefined,
        bio: userProfile?.bio ?? undefined,
        interests: userProfile?.interests ?? undefined,
        profile_photos: (userProfile?.profile_photos && userProfile.profile_photos.length > 0)
          ? userProfile.profile_photos
          : (userProfile?.photos && userProfile.photos.length > 0 ? userProfile.photos : undefined),
        goals: userProfile?.goals ?? undefined,
        looking_for: userProfile?.looking_for ?? undefined,
      }

      console.log('✅ [PROFILE] Profile loaded successfully')
      setProfile(viewModel)

    } catch (error) {
      console.error('💥 [PROFILE] Unexpected error:', error)
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      console.log('🔐 [PROFILE] Signing out...')
              const { error } = await supabase.auth.signOut()
              if (error) {
        console.error('❌ [PROFILE] Sign out error:', error)
                Alert.alert('Error', 'Failed to sign out')
      } else {
        console.log('✅ [PROFILE] Signed out successfully')
        router.replace('/')
      }
    } catch (error) {
      console.error('💥 [PROFILE] Sign out error:', error)
      Alert.alert('Error', 'Failed to sign out')
    }
  }

  const [activePhotoIndex, setActivePhotoIndex] = useState(0)

  // Show loading while auth is loading
  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </SafeAreaView>
    )
  }

  // Show error state
  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top', 'bottom']}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={getUserAndProfile}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const screenWidth = Dimensions.get('window').width

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
      {profile?.profile_photos?.length ? (
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth)
              setActivePhotoIndex(index)
            }}
          >
            {profile.profile_photos.map((url, idx) => {
              const optimized = getOptimizedImageUrl(url, {
                width: Math.round(screenWidth),
                height: 420,
                resize: 'cover',
                quality: 70,
              })
              const sources = optimized ? [{ uri: optimized }, { uri: url }] : [{ uri: url }]
              return (
                <Image
                  key={idx}
                  source={sources as any}
                  placeholder={placeholderImg}
                  style={[styles.carouselImage, { width: screenWidth }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  onError={() => {
                    console.warn('⚠️ [PROFILE] Image failed to load:', url, 'optimized:', optimized)
                  }}
                  transition={200}
                />
              )
            })}
          </ScrollView>
          {profile.profile_photos.length > 1 && (
            <View style={styles.dotsContainer}>
              {profile.profile_photos.map((_, i) => (
                <View key={i} style={[styles.dot, i === activePhotoIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>
      ) : null}

      {profile && (
        <View style={styles.profileSection}>
          <Text style={styles.displayName}>
            {profile.name || 'New User'}{profile.age ? `, ${profile.age}` : ''}
          </Text>

          {!!profile.bio && (
            <Text style={styles.bioText}>{profile.bio}</Text>
          )}

          {!!profile.looking_for?.length && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.subsectionTitle}>Looking for</Text>
              <View style={styles.chipGroup}>
                {profile.looking_for.map((g, idx) => (
                  <View key={`${g}-${idx}`} style={styles.chip}>
                    <Text style={styles.chipText}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {!!profile.goals?.length && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.subsectionTitle}>Goals</Text>
              <View style={styles.chipGroup}>
                {profile.goals.map((g, idx) => (
                  <View key={`${g}-${idx}`} style={styles.chip}>
                    <Text style={styles.chipText}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {!!profile.interests?.length && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.subsectionTitle}>Interests</Text>
              <View style={styles.chipGroup}>
                {profile.interests.map((i, idx) => (
                  <View key={`${i}-${idx}`} style={styles.chip}>
                    <Text style={styles.chipText}>{i}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      <View style={styles.actionsSection}>
        <TouchableOpacity 
          style={styles.primaryActionButton}
          onPress={() => router.push('/edit-profile')}
        >
          <Text style={styles.primaryActionText}>Edit Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryActionButton}
          onPress={handleSignOut}
        >
          <Text style={styles.secondaryActionText}>Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.devActionButton}
          onPress={() => router.push('/test-features')}
        >
          <Text style={styles.devActionText}>Test Features</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
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
    backgroundColor: '#fff',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  carouselImage: {
    height: 420,
    backgroundColor: '#f0f0f0',
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 3,
  },
  dotActive: {
    backgroundColor: '#fff',
  },
  profileSection: {
    padding: 20,
  },
  displayName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#222',
  },
  bioText: {
    marginTop: 8,
    fontSize: 16,
    color: '#444',
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  profileItem: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
  },
  value: {
    fontSize: 16,
    color: '#333',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  photoTile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#eee',
    marginRight: 8,
    marginBottom: 8,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  actionsSection: { padding: 20 },
  primaryActionButton: {
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryActionButton: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
  },
  secondaryActionText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  devActionButton: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#e6f0ff',
  },
  devActionText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '700',
  },
}) 