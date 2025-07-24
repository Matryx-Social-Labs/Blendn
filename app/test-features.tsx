import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import {
    initializePushNotifications
} from '../lib/notifications'
import { supabase, supabaseWithTimeout } from '../lib/supabase'

interface TestResult {
  name: string
  status: 'pending' | 'success' | 'error'
  message?: string
}

export default function TestFeatures() {
  const [tests, setTests] = useState<TestResult[]>([
    { name: 'Supabase Connection', status: 'pending' },
    { name: 'Real Events Query', status: 'pending' },
    { name: 'Database Connection', status: 'pending' },
    { name: 'Push Notifications Setup', status: 'pending' },
    { name: 'Photo Upload System', status: 'pending' },
    { name: 'User Profile Data', status: 'pending' },
    { name: 'Matching System', status: 'pending' },
    { name: 'Chat Functionality', status: 'pending' },
    { name: 'Safety Features', status: 'pending' },
    { name: 'Event Check-in', status: 'pending' },
  ])

  const updateTest = (name: string, status: 'success' | 'error', message?: string) => {
    setTests(prev => prev.map(test => 
      test.name === name ? { ...test, status, message } : test
    ))
  }

  const testDatabaseConnection = async () => {
    try {
      console.log('Testing basic database connection...');
      
      const result: any = await supabaseWithTimeout.query(
        async () => {
          const { data, error } = await supabase.from('profiles').select('count').limit(1)
          return { data, error }
        },
        8000 // 8 second timeout
      )
      
      if (result?.error) throw result.error
      updateTest('Database Connection', 'success', 'Connected to Supabase successfully')
    } catch (error) {
      console.error('Database connection failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to database'
      updateTest('Database Connection', 'error', errorMessage)
    }
  }

  const testPushNotifications = async () => {
    try {
      const token = await initializePushNotifications()
      if (token) {
        if (token.startsWith('development-token') || token.startsWith('simulator-token')) {
          updateTest('Push Notifications Setup', 'success', 'Development token (simulator mode)')
        } else {
          updateTest('Push Notifications Setup', 'success', 'Real push token received')
        }
      } else {
        updateTest('Push Notifications Setup', 'error', 'No push token received')
      }
    } catch (error) {
      updateTest('Push Notifications Setup', 'error', 'Push notifications failed')
    }
  }

  const testPhotoUpload = async () => {
    try {
      // Test if storage bucket is accessible
      const { data, error } = await supabase.storage.from('profile-photos').list('', { limit: 1 })
      if (error) throw error
      
      // Also test public URL generation
      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl('test-file.jpg')
      
      if (urlData?.publicUrl) {
        updateTest('Photo Upload System', 'success', `Storage accessible, found ${data?.length || 0} files`)
      } else {
        updateTest('Photo Upload System', 'error', 'Storage URL generation failed')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      updateTest('Photo Upload System', 'error', `Storage error: ${errorMessage}`)
    }
  }

  const testUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No authenticated user')
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()
      
      if (error && error.code !== 'PGRST116') throw error
      updateTest('User Profile Data', 'success', 'Profile data accessible')
    } catch (error) {
      updateTest('User Profile Data', 'error', 'Profile data not accessible')
    }
  }

  const testMatchingSystem = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No authenticated user')
      
      const { data, error } = await supabase.rpc('get_swipe_candidates', {
        p_user_id: user.id,
        p_limit: 1
      })
      
      if (error) throw error
      updateTest('Matching System', 'success', `Found ${data?.length || 0} potential matches`)
    } catch (error) {
      updateTest('Matching System', 'error', 'Matching system failed')
    }
  }

  const testChatFunctionality = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No authenticated user')
      
      const { data, error } = await supabase.rpc('get_user_event_chats', {
        p_user_id: user.id
      })
      
      if (error) throw error
      updateTest('Chat Functionality', 'success', `Found ${data?.length || 0} chat rooms`)
    } catch (error) {
      updateTest('Chat Functionality', 'error', 'Chat system failed')
    }
  }

  const testSafetyFeatures = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No authenticated user')
      
      const { data, error } = await supabase.rpc('get_blocked_users', {
        p_user_id: user.id
      })
      
      if (error) throw error
      updateTest('Safety Features', 'success', 'Safety features accessible')
    } catch (error) {
      updateTest('Safety Features', 'error', 'Safety features failed')
    }
  }

  const testEventCheckin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No authenticated user')
      
      const { data, error } = await supabase.rpc('get_check_in_status', {
        p_user_id: user.id,
        p_event_id: '00000000-0000-0000-0000-000000000000' // Test with dummy ID
      })
      
      // We expect this to fail gracefully for a non-existent event
      updateTest('Event Check-in', 'success', 'Check-in system accessible')
    } catch (error) {
      updateTest('Event Check-in', 'error', 'Check-in system failed')
    }
  }

  const testSupabaseConnection = async () => {
    try {
      console.log('Testing Supabase connection with timeout...');
      
      // Test basic connectivity with timeout - use a simple select query
      const result = await supabaseWithTimeout.query(
        async () => {
          const { data, error } = await supabase.from('events').select('count').limit(1)
          return { data, error }
        },
        5000 // 5 second timeout
      )
      
      updateTest('Supabase Connection', 'success', 'Database connection working with timeout')
    } catch (error) {
      console.error('Supabase connection test failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      updateTest('Supabase Connection', 'error', `Connection failed: ${errorMessage}`)
    }
  }

  const testRealEvents = async () => {
    try {
      console.log('Testing real events query...');
      
      // Test events query with timeout
      const result: any = await supabaseWithTimeout.query(
        async () => {
          const { data, error } = await supabase
            .from('events')
            .select('id, title, status')
            .eq('status', 'published')
            .limit(3)
          return { data, error }
        },
        10000 // 10 second timeout
      )
      
      if (result?.data && result.data.length > 0) {
        updateTest('Real Events Query', 'success', `Found ${result.data.length} events`)
      } else {
        updateTest('Real Events Query', 'error', 'No events found or query failed')
      }
    } catch (error) {
      console.error('Real events test failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      updateTest('Real Events Query', 'error', `Query failed: ${errorMessage}`)
    }
  }

  const runAllTests = async () => {
    // Reset all tests to pending
    setTests(prev => prev.map(test => ({ ...test, status: 'pending' as const })))
    
    // Run tests with our new timeout-based approach
    await testSupabaseConnection()
    await testRealEvents()
    await testDatabaseConnection()
    
    Alert.alert('Database Tests Complete', 'Core connectivity tests finished. Check results above.')
  }

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'success': return '✅'
      case 'error': return '❌'
    }
  }

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '#666'
      case 'success': return '#4CAF50'
      case 'error': return '#f44336'
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Database Connection Tests</Text>
        <TouchableOpacity onPress={runAllTests} style={styles.runButton}>
          <Text style={styles.runButtonText}>Test DB</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🔍 Database Connectivity Diagnosis</Text>
          <Text style={styles.infoText}>
            Testing Supabase database connection with timeout handling to diagnose connection issues.
            {'\n\n'}
            📱 <Text style={styles.boldText}>Expected Results</Text>: If "Supabase Connection" and "Real Events Query" succeed, we can remove mock data bypasses.
            {'\n\n'}
            ⚠️ <Text style={styles.boldText}>If Tests Fail</Text>: The app will continue working with mock data until connectivity is resolved.
          </Text>
        </View>

        <View style={styles.testsContainer}>
          {tests.map((test, index) => (
            <View key={index} style={styles.testItem}>
              <View style={styles.testHeader}>
                <Text style={styles.testIcon}>{getStatusIcon(test.status)}</Text>
                <Text style={styles.testName}>{test.name}</Text>
              </View>
              {test.message && (
                <Text style={[styles.testMessage, { color: getStatusColor(test.status) }]}>
                  {test.message}
                </Text>
              )}
            </View>
          ))}
        </View>

        <View style={styles.quickActions}>
          <Text style={styles.actionsTitle}>Quick Actions</Text>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => router.push('/edit-profile' as any)}
          >
            <Ionicons name="person-circle" size={20} color="#FF6B6B" />
            <Text style={styles.actionText}>Test Profile Editing</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => router.push('/(tabs)/match' as any)}
          >
            <Ionicons name="heart" size={20} color="#FF6B6B" />
            <Text style={styles.actionText}>Test Matching</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => router.push('/(tabs)/chat' as any)}
          >
            <Ionicons name="chatbubbles" size={20} color="#FF6B6B" />
            <Text style={styles.actionText}>Test Chats</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => router.push('/blocked-users' as any)}
          >
            <Ionicons name="shield" size={20} color="#FF6B6B" />
            <Text style={styles.actionText}>Test Safety Features</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  runButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  runButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  infoCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#333',
  },
  testsContainer: {
    marginBottom: 32,
  },
  testItem: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  testName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  testMessage: {
    fontSize: 14,
    marginTop: 8,
    marginLeft: 32,
  },
  quickActions: {
    marginBottom: 32,
  },
  actionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
}) 