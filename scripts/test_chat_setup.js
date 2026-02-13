// Test script to set up chat data for Blendn app
// You can run this in your browser console or as a test file

// Replace with your actual Supabase credentials
const SUPABASE_URL = 'https://rycftadewrklmsswzviy.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE'; // Get this from your .env file

// User ID from your logs
const USER_ID = '339f7a74-3272-4b36-80e2-941ebea5bc4d';

// Test data setup
const testSetup = {
  // Create a test event
  createTestEvent: async () => {
    const eventData = {
      title: 'Coffee Meetup',
      description: 'Let\'s grab coffee and chat!',
      location: 'Starbucks Downtown',
      start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      end_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
      max_participants: 10,
      is_active: true,
      created_by: USER_ID
    };

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(eventData)
      });

      const event = await response.json();
      console.log('✅ Event created:', event);
      return event;
    } catch (error) {
      console.error('❌ Error creating event:', error);
      return null;
    }
  },

  // Check in user to event
  checkinUser: async (eventId) => {
    const checkinData = {
      user_id: USER_ID,
      event_id: eventId,
      checked_in_at: new Date().toISOString()
    };

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/event_checkins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(checkinData)
      });

      const checkin = await response.json();
      console.log('✅ User checked in:', checkin);
      return checkin;
    } catch (error) {
      console.error('❌ Error checking in user:', error);
      return null;
    }
  },

  // Create chat room
  createChatRoom: async (eventId, eventTitle) => {
    const chatRoomData = {
      event_id: eventId,
      name: `Chat for ${eventTitle}`,
      is_active: true
    };

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/chat_rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(chatRoomData)
      });

      const chatRoom = await response.json();
    console.log('✅ Chat room created:', chatRoom);
      return chatRoom;
    } catch (error) {
      console.error('❌ Error creating chat room:', error);
      return null;
    }
  },

  // Add user to chat participants
  addUserToChat: async (chatRoomId) => {
    const participantData = {
      chat_room_id: chatRoomId,
      user_id: USER_ID,
      joined_at: new Date().toISOString()
    };

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/chat_participants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(participantData)
      });

      const participant = await response.json();
      console.log('✅ User added to chat:', participant);
      return participant;
    } catch (error) {
      console.error('❌ Error adding user to chat:', error);
      return null;
    }
  },

  // Send welcome message
  sendWelcomeMessage: async (chatRoomId, eventTitle) => {
    const messageData = {
      chat_room_id: chatRoomId,
      sender_id: 'system',
      message_text: `Welcome to ${eventTitle}! You've been automatically checked in and added to the group chat.`,
      message_type: 'system'
    };

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/chat_messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(messageData)
      });

      const message = await response.json();
      console.log('✅ Welcome message sent:', message);
      return message;
    } catch (error) {
      console.error('❌ Error sending message:', error);
      return null;
    }
  },

  // Run complete setup
  runCompleteSetup: async () => {
    console.log('🚀 Starting complete chat setup...');
    
    // Step 1: Create event
    const event = await testSetup.createTestEvent();
    if (!event) return;
    
    // Step 2: Check in user
    const checkin = await testSetup.checkinUser(event.id);
    if (!checkin) return;
    
    // Step 3: Create chat room
    const chatRoom = await testSetup.createChatRoom(event.id, event.title);
    if (!chatRoom) return;
    
    // Step 4: Add user to chat
    const participant = await testSetup.addUserToChat(chatRoom.id || chatRoom.chat_room_id);
    if (!participant) return;
    
    // Step 5: Send welcome message
    const message = await testSetup.sendWelcomeMessage(chatRoom.id || chatRoom.chat_room_id, event.title);
    
    console.log('\n🎉 SETUP COMPLETE!');
    console.log(`📅 Event: ${event.title} (ID: ${event.id})`);
    console.log(`💬 Chat Room: ${chatRoom.name} (ID: ${chatRoom.id || chatRoom.chat_room_id})`);
    console.log(`👤 User: ${USER_ID} is checked in and in chat`);
    console.log('\n📱 You can now test the chat in your app!');
  }
};

// Export for use in different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = testSetup;
} else {
  // For browser console usage
  window.testSetup = testSetup;
  console.log('✅ Test setup loaded! Run testSetup.runCompleteSetup() to start.');
} 