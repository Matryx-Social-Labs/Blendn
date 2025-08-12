import React, { useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { AuthHelper, supabase } from '../lib/supabase'

export default function TestFeatures() {
  const [loading, setLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [userChats, setUserChats] = useState<any[]>([])
  const [networkStatus, setNetworkStatus] = useState<string>('Unknown')

  const testNetworkConnectivity = async () => {
    try {
      console.log('🔍 Testing network connectivity...')
      setNetworkStatus('Testing...')
      
      // Test 1: Basic fetch to Supabase URL
      try {
        const response = await fetch('https://rycftadewrklmsswzviy.supabase.co/rest/v1/', {
          method: 'GET',
          headers: {
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`
          }
        })
        
        if (response.ok) {
          setNetworkStatus('Network OK - Supabase reachable')
          console.log('✅ Network test: Supabase is reachable')
        } else {
          setNetworkStatus(`Network Error - Status: ${response.status}`)
          console.log('❌ Network test: Supabase returned error', response.status)
        }
      } catch (fetchError) {
        setNetworkStatus('Network Failed - Cannot reach Supabase')
        console.error('❌ Network test failed:', fetchError)
      }

      // Test 2: Simple Supabase query
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('count')
          .limit(1)

        if (!error) {
          console.log('✅ Supabase query test: Success')
          Alert.alert('Network Test', 'Network connectivity is working! Supabase is reachable.')
        } else {
          console.error('❌ Supabase query test failed:', error)
          Alert.alert('Network Test', `Supabase query failed: ${error.message}`)
        }
      } catch (supabaseError) {
        console.error('❌ Supabase connection failed:', supabaseError)
        Alert.alert('Network Test', `Supabase connection failed: ${supabaseError}`)
      }

    } catch (error) {
      console.error('💥 Network test error:', error)
      setNetworkStatus('Network Test Failed')
      Alert.alert('Network Test', 'Network connectivity test failed')
    }
  }

  const checkSupabaseConfig = async () => {
    try {
      console.log('🔍 Checking Supabase configuration...')
      
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL
      const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      
      let configStatus = ''
      
      if (!url) {
        configStatus += 'Missing SUPABASE_URL\n'
      } else {
        configStatus += `URL: ${url}\n`
      }
      
      if (!key) {
        configStatus += 'Missing SUPABASE_ANON_KEY\n'
      } else {
        configStatus += `Key: ${key.substring(0, 20)}...\n`
      }
      
      // Check if we can create a supabase client
      try {
        const testClient = supabase
        configStatus += 'Client: Created successfully\n'
      } catch (clientError) {
        configStatus += `Client: Failed to create - ${clientError}\n`
      }
      
      Alert.alert('Supabase Configuration', configStatus)
      
    } catch (error) {
      console.error('Error checking config:', error)
      Alert.alert('Configuration Error', 'Failed to check Supabase configuration')
    }
  }

  const checkCurrentUser = async () => {
    try {
      console.log('🔍 Checking current user...')
      
      const { data: { user }, error } = await AuthHelper.getUserWithFallback(3000)
      if (error) {
        console.error('❌ Auth error:', error)
        Alert.alert('Auth Error', `Failed to get user: ${error.message}`)
        return
      }
      
      if (!user) {
        Alert.alert('No User', 'User not authenticated. Please sign in first.')
        return
      }

      setCurrentUser(user)
      console.log('✅ Current user:', user)
      
      Alert.alert(
        'Current User', 
        `Email: ${user.email}\nID: ${user.id}\n\nThis is the user that will be used for testing.`
      )
    } catch (error) {
      console.error('Error checking user:', error)
      Alert.alert('Error', `Failed to get current user: ${error}`)
    }
  }

  const checkExistingChats = async () => {
    try {
      console.log('🔍 Checking existing chats...')
      
      const { data: { user }, error } = await AuthHelper.getUserWithFallback(3000)
      if (error || !user) {
        Alert.alert('Error', `User not authenticated: ${error?.message || 'No user found'}`)
        return
      }

      // Check for group chats
      const { data: groupChats, error: groupError } = await supabase
        .from('chat_participants')
        .select(`
          chat_room_id,
          joined_at,
          chat_rooms!inner(
            room_name,
            is_active,
            events!inner(
              title,
              description
            )
          )
        `)
        .eq('user_id', user.id)

      if (groupError) {
        console.error('❌ Error fetching group chats:', groupError)
        Alert.alert('Database Error', `Failed to fetch group chats: ${groupError.message}`)
        return
      }

      setUserChats(groupChats || [])
      console.log('✅ Found group chats:', groupChats)

      if (groupChats && groupChats.length > 0) {
        const chatList = groupChats.map((chat: any, index) => 
          `${index + 1}. ${chat.chat_rooms.events.title} - ${chat.chat_rooms.room_name}`
        ).join('\n')

        Alert.alert(
          'Existing Group Chats', 
          `Found ${groupChats.length} group chat(s):\n\n${chatList}`
        )
      } else {
        Alert.alert(
          'No Group Chats Found', 
          'No group chats found for this user. Use the "Setup Chat Data" button to create test data.'
        )
      }
    } catch (error) {
      console.error('Error checking chats:', error)
      Alert.alert('Error', `Failed to check existing chats: ${error}`)
    }
  }

  const setupChatDataForCurrentUser = async () => {
    setLoading(true)
    try {
      console.log('🚀 Setting up chat data for current user...')
      
      // Get current user
      const { data: { user }, error: userError } = await AuthHelper.getUserWithFallback(3000)
      if (userError || !user) {
        Alert.alert('Auth Error', `User not authenticated: ${userError?.message || 'No user found'}`)
        return
      }

      console.log('✅ User found:', user.id, user.email)

      // Step 1: Create a test event
      const eventData = {
        title: 'Coffee Meetup Test',
        description: 'Test event for chat functionality',
        location: 'Test Location',
        start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
        end_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
        max_participants: 10,
        is_active: true,
        created_by: user.id
      }

      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert(eventData)
        .select()
        .single()

      if (eventError) {
        console.error('❌ Error creating event:', eventError)
        Alert.alert('Database Error', `Failed to create event: ${eventError.message}`)
        return
      }

      console.log('✅ Event created:', event.id)

      // Step 2: Check in user to event
      const checkinData = {
        user_id: user.id,
        event_id: event.id,
        checked_in_at: new Date().toISOString()
      }

      const { data: checkin, error: checkinError } = await supabase
        .from('event_checkins')
        .insert(checkinData)
        .select()
        .single()

      if (checkinError) {
        console.error('❌ Error checking in user:', checkinError)
        Alert.alert('Database Error', `Failed to check in user: ${checkinError.message}`)
        return
      }

      console.log('✅ User checked in')

      // Step 3: Create chat room
      const chatRoomData = {
        event_id: event.id,
        room_name: `Chat for ${event.title}`,
        is_active: true
      }

      const { data: chatRoom, error: chatRoomError } = await supabase
        .from('chat_rooms')
        .insert(chatRoomData)
        .select()
        .single()

      if (chatRoomError) {
        console.error('❌ Error creating chat room:', chatRoomError)
        Alert.alert('Database Error', `Failed to create chat room: ${chatRoomError.message}`)
        return
      }

      console.log('✅ Chat room created:', chatRoom.chat_room_id)

      // Step 4: Add user to chat participants
      const participantData = {
        chat_room_id: chatRoom.chat_room_id,
        user_id: user.id,
        joined_at: new Date().toISOString()
      }

      const { data: participant, error: participantError } = await supabase
        .from('chat_participants')
        .insert(participantData)
        .select()
        .single()

      if (participantError) {
        console.error('❌ Error adding user to chat:', participantError)
        Alert.alert('Database Error', `Failed to add user to chat: ${participantError.message}`)
        return
      }

      console.log('✅ User added to chat')

      // Step 5: Send welcome message
      const welcomeMessage = {
        chat_room_id: chatRoom.chat_room_id,
        sender_id: 'system',
        message_text: `Welcome to ${event.title}! You've been automatically checked in and added to the group chat.`,
        message_type: 'system'
      }

      const { data: message, error: messageError } = await supabase
        .from('chat_messages')
        .insert(welcomeMessage)
        .select()
        .single()

      if (messageError) {
        console.error('❌ Error sending welcome message:', messageError)
        // Don't fail the whole process for this
      } else {
        console.log('✅ Welcome message sent')
      }

      Alert.alert(
        'Success!', 
        `Chat data setup complete!\n\nEvent: ${event.title}\nChat Room: ${chatRoom.room_name}\n\nYou can now test the chat functionality.`,
        [
          { text: 'OK', onPress: () => console.log('Setup complete') }
        ]
      )

    } catch (error) {
      console.error('💥 Unexpected error:', error)
      Alert.alert('Error', `Something went wrong during setup: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const setupMultiUserChat = async () => {
    setLoading(true)
    try {
      console.log('🚀 Setting up multi-user chat...')
      
      // Get current user
      const { data: { user }, error: userError } = await AuthHelper.getUserWithFallback(3000)
      if (userError || !user) {
        Alert.alert('Auth Error', `User not authenticated: ${userError?.message || 'No user found'}`)
        return
      }

      console.log('✅ Current user found:', user.id, user.email)

      // Step 1: Create a shared event
      const eventData = {
        title: 'Team Collaboration Event',
        description: 'Multi-user test event for chat functionality',
        location: 'Virtual Meeting',
        start_time: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // 1 hour from now
        end_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours from now
        max_participants: 20,
        is_active: true,
        created_by: user.id
      }

      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert(eventData)
        .select()
        .single()

      if (eventError) {
        console.error('❌ Error creating event:', eventError)
        Alert.alert('Database Error', `Failed to create event: ${eventError.message}`)
        return
      }

      console.log('✅ Event created:', event.id)

      // Step 2: Create chat room
      const chatRoomData = {
        event_id: event.id,
        room_name: `Team Chat for ${event.title}`,
        is_active: true
      }

      const { data: chatRoom, error: chatRoomError } = await supabase
        .from('chat_rooms')
        .insert(chatRoomData)
        .select()
        .single()

      if (chatRoomError) {
        console.error('❌ Error creating chat room:', chatRoomError)
        Alert.alert('Database Error', `Failed to create chat room: ${chatRoomError.message}`)
        return
      }

      console.log('✅ Chat room created:', chatRoom.chat_room_id)

      // Step 3: Add current user to chat
      const currentUserParticipant = {
        chat_room_id: chatRoom.chat_room_id,
        user_id: user.id,
        joined_at: new Date().toISOString()
      }

      const { error: currentUserError } = await supabase
        .from('chat_participants')
        .insert(currentUserParticipant)

      if (currentUserError) {
        console.error('❌ Error adding current user to chat:', currentUserError)
        Alert.alert('Database Error', `Failed to add current user to chat: ${currentUserError.message}`)
      } else {
        console.log('✅ Current user added to chat')
      }

      // Step 4: Find and add hemanth@unbothered.studio user
      // First, let's try to find this user in the auth.users table
      const { data: otherUser, error: otherUserError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', 'hemanth@unbothered.studio')
        .single()

      if (otherUserError || !otherUser) {
        console.log('⚠️ User hemanth@unbothered.studio not found, creating placeholder...')
        
        // Create a placeholder user entry (this would normally be done through auth)
        const placeholderUser = {
          id: '00000000-0000-0000-0000-000000000001', // Placeholder UUID
          email: 'hemanth@unbothered.studio'
        }
        
        // Add placeholder user to chat participants
        const placeholderParticipant = {
          chat_room_id: chatRoom.chat_room_id,
          user_id: placeholderUser.id,
          joined_at: new Date().toISOString()
        }

        const { error: placeholderError } = await supabase
          .from('chat_participants')
          .insert(placeholderParticipant)

        if (placeholderError) {
          console.error('❌ Error adding placeholder user:', placeholderError)
        } else {
          console.log('✅ Placeholder user added to chat')
        }
      } else {
        console.log('✅ Found user:', otherUser.email)
        
        // Add the found user to chat participants
        const otherUserParticipant = {
          chat_room_id: chatRoom.chat_room_id,
          user_id: otherUser.id,
          joined_at: new Date().toISOString()
        }

        const { error: otherUserParticipantError } = await supabase
          .from('chat_participants')
          .insert(otherUserParticipant)

        if (otherUserParticipantError) {
          console.error('❌ Error adding other user to chat:', otherUserParticipantError)
        } else {
          console.log('✅ Other user added to chat')
        }
      }

      // Step 5: Send welcome messages
      const welcomeMessage1 = {
        chat_room_id: chatRoom.chat_room_id,
        sender_id: 'system',
        message_text: `Welcome to ${event.title}! This is a multi-user chat room.`,
        message_type: 'system'
      }

      const welcomeMessage2 = {
        chat_room_id: chatRoom.chat_room_id,
        sender_id: 'system',
        message_text: `Users ${user.email} and hemanth@unbothered.studio are now in this chat.`,
        message_type: 'system'
      }

      await supabase.from('chat_messages').insert(welcomeMessage1)
      await supabase.from('chat_messages').insert(welcomeMessage2)

      console.log('✅ Welcome messages sent')

      Alert.alert(
        'Multi-User Chat Setup Complete!', 
        `Event: ${event.title}\nChat Room: ${chatRoom.room_name}\n\nUsers in chat:\n- ${user.email}\n- hemanth@unbothered.studio\n\nYou can now test multi-user chat functionality.`,
        [
          { text: 'OK', onPress: () => console.log('Multi-user setup complete') }
        ]
      )

    } catch (error) {
      console.error('💥 Unexpected error:', error)
      Alert.alert('Error', `Something went wrong during multi-user setup: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Test Features</Text>
      
      <TouchableOpacity
        style={[styles.button, styles.warningButton]}
        onPress={testNetworkConnectivity}
      >
        <Text style={styles.buttonText}>Test Network Connectivity</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.infoButton]}
        onPress={checkSupabaseConfig}
      >
        <Text style={styles.buttonText}>Check Supabase Config</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.button}
        onPress={checkCurrentUser}
      >
        <Text style={styles.buttonText}>Check Current User</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={checkExistingChats}
      >
        <Text style={styles.buttonText}>Check Existing Chats</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.button, styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={setupChatDataForCurrentUser}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Setting up...' : 'Setup Chat Data (Current User)'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.secondaryButton, loading && styles.buttonDisabled]}
        onPress={setupMultiUserChat}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Setting up...' : 'Setup Multi-User Chat'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.description}>
        Start with "Test Network Connectivity" to diagnose connection issues. Then use other buttons to check your user and create test data.
      </Text>

      {networkStatus !== 'Unknown' && (
        <View style={styles.networkInfo}>
          <Text style={styles.networkInfoTitle}>Network Status:</Text>
          <Text style={styles.networkInfoText}>{networkStatus}</Text>
        </View>
      )}

      {currentUser && (
        <View style={styles.userInfo}>
          <Text style={styles.userInfoTitle}>Current User:</Text>
          <Text style={styles.userInfoText}>Email: {currentUser.email}</Text>
          <Text style={styles.userInfoText}>ID: {currentUser.id}</Text>
        </View>
      )}

      {userChats.length > 0 && (
        <View style={styles.chatInfo}>
          <Text style={styles.chatInfoTitle}>Existing Chats ({userChats.length}):</Text>
          {userChats.map((chat, index) => (
            <Text key={index} style={styles.chatInfoText}>
              {index + 1}. {chat.chat_rooms.events.title}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: '#333',
  },
  button: {
    backgroundColor: '#6c757d',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  primaryButton: {
    backgroundColor: '#FF6B6B',
  },
  secondaryButton: {
    backgroundColor: '#28a745',
  },
  warningButton: {
    backgroundColor: '#ffc107',
  },
  infoButton: {
    backgroundColor: '#17a2b8',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 20,
  },
  networkInfo: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#ffeaa7',
  },
  networkInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  networkInfoText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 5,
  },
  userInfo: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  userInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  userInfoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  chatInfo: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chatInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  chatInfoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
}) 