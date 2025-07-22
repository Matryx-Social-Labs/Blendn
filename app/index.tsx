import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'

export default function Index() {
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      console.log('Checking auth status...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        setLoading(false);
        return;
      }
      
      console.log('Session data:', session?.user?.id ? 'User found' : 'No user');
      
      if (session) {
        console.log('User authenticated, checking onboarding status...');
        console.log('User ID:', session.user.id);
        
        try {
          // User is authenticated, now check if they've completed onboarding
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('onboarded')
            .eq('id', session.user.id)
            .single()

          console.log('Profile query completed');
          console.log('Profile data:', profile);
          console.log('Profile error:', profileError);

          if (profileError) {
            console.error('Error checking profile:', profileError)
            // If profile doesn't exist, it will be created by the trigger
            // Route to onboarding
            console.log('Redirecting to onboarding (no profile)...');
            router.replace('/onboarding/welcome' as any)
          } else {
            if (profile && profile.onboarded) {
              // User has completed onboarding, go to main app
              console.log('User is onboarded, redirecting to main app...');
              setIsAuthenticated(true)
              router.replace('/(tabs)/events' as any)
            } else {
              // User needs to complete onboarding
              console.log('User not onboarded, redirecting to onboarding...');
              router.replace('/onboarding/welcome' as any)
            }
          }
        } catch (profileQueryError) {
          console.error('Profile query failed:', profileQueryError);
          console.log('Falling back to onboarding...');
          router.replace('/onboarding/welcome' as any);
        }
      } else {
        // User is not authenticated, stay on login screen
        console.log('User not authenticated, staying on login screen...');
        setIsAuthenticated(false)
      }
    } catch (error) {
      console.error('Error checking auth status:', error)
    } finally {
      console.log('Setting loading to false...');
      setLoading(false)
    }
  }

  const handleLoginPress = () => {
    router.push('/(auth)/google-signin' as any)
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to Blendn</Text>
        <Text style={styles.subtitle}>
          Connect with others using secure Google authentication
        </Text>

        <TouchableOpacity style={styles.loginButton} onPress={handleLoginPress}>
          <Text style={styles.loginButtonText}>Sign in with Google</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </View>
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
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
    lineHeight: 22,
  },
  loginButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
    color: '#999',
    lineHeight: 16,
  },
})
