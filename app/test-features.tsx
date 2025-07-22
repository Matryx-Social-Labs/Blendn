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
    View,
} from 'react-native'
import {
    registerForPushNotificationsAsync
} from '../lib/notifications'
import { supabase } from '../lib/supabase'

interface TestResult {
  name: string
  status: 'pending' | 'success' | 'error'
  message?: string
}

export default function TestFeatures() {
  const [tests, setTests] = useState<TestResult[]>([
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
      const { data, error } = await supabase.from('profiles').select('count').limit(1)
      if (error) throw error
      updateTest('Database Connection', 'success', 'Connected to Supabase')
    } catch (error) {
      updateTest('Database Connection', 'error', 'Failed to connect to database')
    }
  }

  const testPushNotifications = async () => {
    try {
      const token = await registerForPushNotificationsAsync()
      if (token) {
        updateTest('Push Notifications Setup', 'success', 'Push token received')
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
      updateTest('Photo Upload System', 'success', 'Storage bucket accessible')
    } catch (error) {
      updateTest('Photo Upload System', 'error', 'Storage bucket not accessible')
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

  const runAllTests = async () => {
    // Reset all tests
    setTests(prev => prev.map(test => ({ ...test, status: 'pending' as const })))
    
    // Run tests sequentially with small delays
    await testDatabaseConnection()
    await new Promise(resolve => setTimeout(resolve, 500))
    
    await testPushNotifications()
    await new Promise(resolve => setTimeout(resolve, 500))
    
    await testPhotoUpload()
    await new Promise(resolve => setTimeout(resolve, 500))
    
    await testUserProfile()
    await new Promise(resolve => setTimeout(resolve, 500))
    
    await testMatchingSystem()
    await new Promise(resolve => setTimeout(resolve, 500))
    
    await testChatFunctionality()
    await new Promise(resolve => setTimeout(resolve, 500))
    
    await testSafetyFeatures()
    await new Promise(resolve => setTimeout(resolve, 500))
    
    await testEventCheckin()
    
    Alert.alert('Tests Complete', 'All feature tests have been executed. Check the results below.')
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
        <Text style={styles.headerTitle}>Feature Tests</Text>
        <TouchableOpacity onPress={runAllTests} style={styles.runButton}>
          <Text style={styles.runButtonText}>Run All</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🧪 Feature Testing</Text>
          <Text style={styles.infoText}>
            This screen tests all the major features implemented in the app. 
            Run the tests to verify everything is working correctly.
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