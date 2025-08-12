import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

interface UserProfile {
  id: string
  name?: string
  bio?: string
  age?: number
  interests?: string[]
  profile_photos?: string[]
}

export default function Profile() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
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

      // Get user profile from database
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('❌ [PROFILE] Error fetching profile:', profileError)
        setError('Failed to load profile')
        return
      }
      
      if (!profileData) {
        console.log('⚠️ [PROFILE] No profile found, redirecting to onboarding')
        router.replace('/onboarding/welcome')
        return
      }
      
      console.log('✅ [PROFILE] Profile loaded successfully')
      setProfile(profileData)

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

  // Show loading while auth is loading
  if (authLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    )
  }

  // Show error state
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={getUserAndProfile}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      {profile && (
        <View style={styles.profileSection}>
          <Text style={styles.sectionTitle}>Profile Information</Text>
          <View style={styles.profileItem}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>{profile.name || 'Not set'}</Text>
          </View>
          <View style={styles.profileItem}>
            <Text style={styles.label}>Bio:</Text>
            <Text style={styles.value}>{profile.bio || 'Not set'}</Text>
        </View>
          <View style={styles.profileItem}>
            <Text style={styles.label}>Age:</Text>
            <Text style={styles.value}>{profile.age || 'Not set'}</Text>
          </View>
          <View style={styles.profileItem}>
            <Text style={styles.label}>Interests:</Text>
            <Text style={styles.value}>
              {profile.interests?.join(', ') || 'Not set'}
              </Text>
            </View>
          </View>
        )}

      <View style={styles.actionsSection}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => router.push('/edit-profile')}
        >
          <Text style={styles.actionButtonText}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => router.push('/blocked-users')}
          >
          <Text style={styles.actionButtonText}>Blocked Users</Text>
          </TouchableOpacity>

          <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => router.push('/test-features')}
          >
          <Text style={styles.actionButtonText}>🧪 Test Features</Text>
          </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.signOutButton]}
          onPress={handleSignOut}
        >
          <Text style={[styles.actionButtonText, styles.signOutButtonText]}>
            Sign Out
          </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  profileSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
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
  actionsSection: {
    padding: 20,
  },
  actionButton: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  signOutButton: {
    backgroundColor: '#e74c3c',
    borderColor: '#e74c3c',
    marginTop: 20,
  },
  signOutButtonText: {
    color: '#fff',
  },
}) 