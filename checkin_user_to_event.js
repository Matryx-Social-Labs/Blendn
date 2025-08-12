const { createClient } = require('@supabase/supabase-js');

// Replace with your actual Supabase credentials from your Blendn project
const supabaseUrl = 'https://rycftadewrklmsswzviy.supabase.co';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your actual anon key

const supabase = createClient(supabaseUrl, supabaseKey);

// User ID from your logs
const USER_ID = '339f7a74-3272-4b36-80e2-941ebea5bc4d';

async function checkinUserToEvent() {
  try {
    console.log('🔍 Starting user check-in process...');
    
    // Step 1: Create or find an event
    console.log('📅 Creating/finding an event...');
    const eventData = {
      title: 'Test Event for Chat',
      description: 'This is a test event to demonstrate group chat functionality',
      location: 'Test Location',
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      end_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      max_participants: 50,
      is_active: true
    };

    // Insert event (you might want to check if it exists first)
    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert(eventData)
      .select()
      .single();

    if (eventError) {
      console.error('❌ Error creating event:', eventError);
      return;
    }

    console.log('✅ Event created:', event.id);

    // Step 2: Check in the user to the event
    console.log('✅ Checking in user to event...');
    const checkinData = {
      user_id: USER_ID,
      event_id: event.id,
      checked_in_at: new Date().toISOString()
    };

    const { data: checkin, error: checkinError } = await supabase
      .from('event_checkins')
      .insert(checkinData)
      .select()
      .single();

    if (checkinError) {
      console.error('❌ Error checking in user:', checkinError);
      return;
    }

    console.log('✅ User checked in successfully');

    // Step 3: Create a chat room for the event
    console.log('💬 Creating chat room for event...');
    const chatRoomData = {
      event_id: event.id,
      room_name: `Chat for ${event.title}`,
      is_active: true
    };

    const { data: chatRoom, error: chatRoomError } = await supabase
      .from('chat_rooms')
      .insert(chatRoomData)
      .select()
      .single();

    if (chatRoomError) {
      console.error('❌ Error creating chat room:', chatRoomError);
      return;
    }

    console.log('✅ Chat room created:', chatRoom.chat_room_id);

    // Step 4: Add user to chat participants
    console.log('👥 Adding user to chat participants...');
    const participantData = {
      chat_room_id: chatRoom.chat_room_id,
      user_id: USER_ID,
      joined_at: new Date().toISOString()
    };

    const { data: participant, error: participantError } = await supabase
      .from('chat_participants')
      .insert(participantData)
      .select()
      .single();

    if (participantError) {
      console.error('❌ Error adding user to chat:', participantError);
      return;
    }

    console.log('✅ User added to chat participants');

    // Step 5: Send a welcome message
    console.log('💬 Sending welcome message...');
    const welcomeMessage = {
      chat_room_id: chatRoom.chat_room_id,
      sender_id: 'system',
      message_text: `Welcome to ${event.title}! You've been automatically checked in and added to the group chat.`,
      message_type: 'system'
    };

    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .insert(welcomeMessage)
      .select()
      .single();

    if (messageError) {
      console.error('❌ Error sending welcome message:', messageError);
      return;
    }

    console.log('✅ Welcome message sent');

    // Summary
    console.log('\n🎉 SUCCESS! User has been:');
    console.log(`   ✅ Checked into event: ${event.title}`);
    console.log(`   ✅ Added to chat room: ${chatRoom.room_name}`);
    console.log(`   ✅ Welcome message sent`);
    console.log(`\n📱 You can now test the chat functionality in your app!`);
    console.log(`   Event ID: ${event.id}`);
    console.log(`   Chat Room ID: ${chatRoom.chat_room_id}`);

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

// Run the function
checkinUserToEvent(); 