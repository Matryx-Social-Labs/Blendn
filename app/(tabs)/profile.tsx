import { GoogleSignin } from '@react-native-google-signin/google-signin'
import type { User } from '@supabase/supabase-js'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from '../../lib/supabase'

interface UserProfile {
  id: string
  name: string
  age: number
  location: string
  interests: string[]
  onboarded: boolean
  profile_photos?: string[]
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getUserAndProfile()
  }, [])

  const getUserAndProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        // Fetch both profiles table and user_profiles table for complete data
        const [{ data: profileData }, { data: userProfileData }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('user_profiles').select('profile_photos, display_name, bio, interests').eq('user_id', user.id).single()
        ])

        if (profileData) {
          setProfile({
            ...profileData,
            profile_photos: userProfileData?.profile_photos || [],
            // Use display_name from user_profiles if available, fall back to name from profiles
            name: userProfileData?.display_name || profileData.name,
            interests: userProfileData?.interests || []
          })
        }
      }
    } catch (error) {
      console.error('Error getting user:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Sign out from Google
              await GoogleSignin.signOut()
              
              // Sign out from Supabase
              const { error } = await supabase.auth.signOut()
              if (error) {
                Alert.alert('Error', error.message)
              } else {
                router.replace('/')
              }
            } catch (err) {
              console.error('Sign out error:', err)
              Alert.alert('Error', 'Failed to sign out')
            }
          }
        }
      ]
    )
  }

  const handleEditProfile = () => {
    router.push('/edit-profile' as any)
  }

  const renderAvatar = () => {
    const hasPhotos = profile?.profile_photos && profile.profile_photos.length > 0
    const photoUrl = hasPhotos ? profile.profile_photos![0] : null
    const initials = (profile?.name || user?.user_metadata?.full_name || user?.email || 'U')[0].toUpperCase()

    if (photoUrl) {
      return (
        <View style={styles.avatarContainer}>
          <Image 
            source={{ uri: photoUrl }} 
            style={styles.avatarImage}
            onError={() => {
              // If image fails to load, we'll fall back to text avatar
              console.log('Profile photo failed to load:', photoUrl)
            }}
          />
        </View>
      )
    }

    return (
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading profile... ✨</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>My Profile 👤</Text>
        <Text style={styles.subtitle}>Manage your dating profile</Text>
      </View>

      {user && (
        <View style={styles.profileCard}>
          {renderAvatar()}

          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {profile?.name || user.user_metadata?.full_name || 'New User'}
            </Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            {profile?.profile_photos && profile.profile_photos.length > 0 && (
              <Text style={styles.photoCount}>
                {profile.profile_photos.length} photo{profile.profile_photos.length !== 1 ? 's' : ''}
              </Text>
            )}
          </View>

          <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      )}

      {profile && (
        <View style={styles.detailsCard}>
          <Text style={styles.cardTitle}>Profile Details</Text>
          
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Age</Text>
            <Text style={styles.detailValue}>{profile.age || 'Not set'}</Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{profile.location || 'Not set'}</Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Interests</Text>
            <Text style={styles.detailValue}>
              {profile.interests && profile.interests.length > 0 
                ? profile.interests.join(', ') 
                : 'Not set'
              }
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Photos</Text>
            <Text style={styles.detailValue}>
              {profile.profile_photos && profile.profile_photos.length > 0 
                ? `${profile.profile_photos.length} uploaded`
                : 'None uploaded'
              }
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Profile Status</Text>
            <Text style={[
              styles.detailValue,
              { color: profile.onboarded ? '#4CAF50' : '#FF9800' }
            ]}>
              {profile.onboarded ? '✅ Complete' : '⏳ Incomplete'}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.actionsCard}>
        <Text style={styles.cardTitle}>Account</Text>
        
        <TouchableOpacity style={styles.actionItem} onPress={handleEditProfile}>
          <Text style={styles.actionIcon}>✏️</Text>
          <Text style={styles.actionText}>Edit Profile</Text>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionItem} 
          onPress={() => router.push('/blocked-users' as any)}
        >
          <Text style={styles.actionIcon}>🛡️</Text>
          <Text style={styles.actionText}>Blocked Users</Text>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => Alert.alert('Coming Soon!', 'Settings feature will be available soon!')}>
          <Text style={styles.actionIcon}>⚙️</Text>
          <Text style={styles.actionText}>Settings</Text>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => Alert.alert('Coming Soon!', 'Help & Support feature will be available soon!')}>
          <Text style={styles.actionIcon}>❓</Text>
          <Text style={styles.actionText}>Help & Support</Text>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionItem, styles.signOutItem]} onPress={handleSignOut}>
          <Text style={styles.actionIcon}>🚪</Text>
          <Text style={[styles.actionText, styles.signOutText]}>Sign Out</Text>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
  },
  header: {
    marginBottom: 24,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  photoCount: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    flex: 2,
    textAlign: 'right',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  actionIcon: {
    fontSize: 20,
    marginRight: 16,
    width: 24,
  },
  actionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  actionArrow: {
    fontSize: 20,
    color: '#ccc',
  },
  signOutItem: {
    borderBottomWidth: 0,
  },
  signOutText: {
    color: '#ff3b30',
  },
}) 