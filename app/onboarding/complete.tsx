import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import { supabase } from '../../lib/supabase'

export default function Complete() {
  const [loading, setLoading] = useState(false)
  const [animationStep, setAnimationStep] = useState(0)
  const params = useLocalSearchParams()

  // Extract photo URLs from route params
  const photoUrls = params.photoUrls 
    ? JSON.parse(params.photoUrls as string) 
    : []

  useEffect(() => {
    // Simple animation sequence
    const timer = setTimeout(() => {
      if (animationStep < 3) {
        setAnimationStep(prev => prev + 1)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [animationStep])

  const handleComplete = async () => {
    setLoading(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        Alert.alert('Error', 'User not found')
        return
      }

      // Update the profile to mark as onboarded
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          onboarded: true,
        })
        .eq('id', user.id)

      if (profileError) {
        console.error('Profile update error:', profileError)
        Alert.alert('Error', 'Failed to complete onboarding')
        return
      }

      // Mark onboarding completion in user_profiles
      const updates: any = {
        onboarding_step: 'complete',
        onboarding_completed_at: new Date().toISOString(),
      }
      if (photoUrls && photoUrls.length > 0) {
        updates.profile_photos = photoUrls
      }
      const { error: userProfileError } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('user_id', user.id)

      if (userProfileError) {
        console.error('User profile update error:', userProfileError)
        // Don't fail the onboarding if this fails, just log it
        console.log('Photo URLs that failed to save:', photoUrls)
      } else {
        console.log('Successfully saved profile photos:', photoUrls)
      }

      // Navigate to main app
      router.replace('/(tabs)/events' as any)
      
    } catch (error) {
      console.error('Onboarding completion error:', error)
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.mainContent}>
          <View style={styles.animationContainer}>
            <Text style={styles.celebrationEmoji}>
              {animationStep >= 1 ? '🎉' : ''}
            </Text>
            <Text style={styles.celebrationEmoji}>
              {animationStep >= 2 ? '✨' : ''}
            </Text>
            <Text style={styles.celebrationEmoji}>
              {animationStep >= 3 ? '💕' : ''}
            </Text>
          </View>

          <Text style={styles.title}>You're all set! 🚀</Text>
          <Text style={styles.subtitle}>
            Welcome to Blendn! Your profile is ready and you can start discovering amazing events and meeting new people.
          </Text>
          <Text style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>Onboarding 8/8 completed</Text>

          <View style={styles.featuresContainer}>
            <View style={styles.feature}>
              <Text style={styles.checkmark}>✅</Text>
              <Text style={styles.featureText}>Profile created</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.checkmark}>✅</Text>
              <Text style={styles.featureText}>Interests selected</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.checkmark}>
                {photoUrls.length > 0 ? '✅' : '⏳'}
              </Text>
              <Text style={styles.featureText}>
                {photoUrls.length > 0 
                  ? `${photoUrls.length} photo${photoUrls.length !== 1 ? 's' : ''} added`
                  : 'Photos (optional)'
                }
              </Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.checkmark}>✅</Text>
              <Text style={styles.featureText}>Ready to mingle</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity 
            style={[styles.completeButton, loading ? styles.disabledButton : null]} 
            onPress={handleComplete}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
            <Text style={styles.completeButtonText}>Start Exploring Events</Text>
            )}
          </TouchableOpacity>
          
          <Text style={styles.welcomeText}>
            Let's find your next adventure! 🌟
          </Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    height: 60,
  },
  celebrationEmoji: {
    fontSize: 48,
    marginHorizontal: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 48,
    color: '#666',
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  featuresContainer: {
    width: '100%',
    maxWidth: 280,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  checkmark: {
    fontSize: 20,
    marginRight: 16,
  },
  featureText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  bottomSection: {
    paddingBottom: 32,
  },
  completeButton: {
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  welcomeText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
  },
}) 