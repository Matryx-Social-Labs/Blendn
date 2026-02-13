# 🧪 Blendn App Testing Guide

## 🎯 Overview
This guide covers testing all major features of the Blendn dating app. We've built a comprehensive system with authentication, events, location-based check-ins, group chat, and matching.

## 📱 Current Features to Test

### ✅ **1. Authentication & Onboarding**
**What it does:** Google Sign-In with multi-step onboarding flow

**Test Steps:**
1. Open the app
2. Tap "Sign in with Google"
3. Complete Google authentication
4. Go through onboarding steps:
   - Welcome screen
   - Basic info (name, age, bio)
   - Interests selection
   - Photo upload (placeholder)
   - Location permissions
   - Complete setup
5. ✅ **Expected:** Redirected to Events tab after completion

---

### ✅ **2. Navigation System**
**What it does:** 4-tab navigation with proper routing

**Test Steps:**
1. Check bottom tab bar shows: Events, Match, Chat, Profile
2. Tap each tab and verify:
   - **Events**: Shows event list
   - **Match**: Shows matching interface  
   - **Chat**: Shows chat list with Group/Personal tabs
   - **Profile**: Shows user profile info
3. ✅ **Expected:** Smooth navigation, no "page not found" errors

---

### ✅ **3. Events System**
**What it does:** Display events, show proximity, enable check-ins

**Test Steps:**
1. Go to **Events tab**
2. Verify events are displayed with:
   - Event titles and descriptions
   - Dates and times
   - Venue information
   - Proximity badges (if location enabled)
3. Tap an event to open details
4. ✅ **Expected:** Event detail page loads with check-in options

---

### ✅ **4. Location-Based Check-In** 
**What it does:** GPS-based event check-in with production validation

**Test Steps:**
1. Open an event detail page
2. Grant location permissions if prompted
3. Check proximity status displayed
4. Try check-in button:
   - **Near event**: Should succeed and show success message
   - **Far from event**: Should show "too far" error
   - **Poor GPS**: Should show accuracy error
5. ✅ **Expected:** Realistic location validation, clear error messages

**🧪 Test Scenarios:**
- **Scenario A**: Real location near event venue
- **Scenario B**: Simulate being far away
- **Scenario C**: Test with poor GPS signal

---

### ✅ **5. Group Chat System**
**What it does:** Auto-join event chats after check-in, real-time messaging

**Test Steps:**
1. Successfully check into an event
2. Accept prompt to "Join Group Chat"
3. Verify chat room opens with:
   - Event name as chat title
   - System welcome message
   - Real-time message input
4. Send test messages
5. Check **Chat tab** shows the event chat
6. ✅ **Expected:** Messages appear instantly, chat list updates

**🧪 Multi-User Test:**
- Get another person to check into same event
- Both users should see each other's messages in real-time

---

### ✅ **6. Matching System**
**What it does:** Swipe on user profiles, detect mutual matches

**Test Steps:**
1. Go to **Match tab**
2. If no profiles appear, this is expected (only 1 user exists)
3. To test with multiple users:
   - Create additional accounts
   - Or check empty state message
4. For future testing with multiple profiles:
   - Swipe left (pass) or right (like)
   - Check for match alerts when mutual likes occur
5. ✅ **Expected:** Smooth swiping, match detection works

**📝 Note:** Limited testing possible with single user. Need multiple accounts for full testing.

---

### ✅ **7. Chat System**
**What it does:** Group and Personal chat tabs, message history

**Test Steps:**
1. Go to **Chat tab**
2. Verify segmented control shows "Group" and "Personal"
3. **Group tab**: Shows event chats you've joined
4. **Personal tab**: Shows private conversations (placeholder)
5. Tap on a group chat to open message history
6. ✅ **Expected:** Tab switching works, chat history loads

---

### ✅ **8. Profile System**
**What it does:** Display user info, edit capabilities

**Test Steps:**
1. Go to **Profile tab**
2. Verify displays:
   - User name and email
   - Age and location
   - Interests
   - Onboarding status
3. Test sign-out functionality
4. ✅ **Expected:** Profile data accurate, sign-out works

---

## 🔄 **Testing Workflows**

### **Complete User Journey Test**
1. **Start**: Fresh app install
2. **Auth**: Sign in with Google
3. **Onboard**: Complete all onboarding steps  
4. **Browse**: Look at events in Events tab
5. **Check-in**: Find nearby event and check in
6. **Chat**: Join group chat and send messages
7. **Match**: Try matching (limited with 1 user)
8. **Profile**: View and potentially edit profile

### **Multi-User Features Test** (Requires 2+ accounts)
1. **Event Check-ins**: Multiple users check into same event
2. **Group Chat**: Multiple users in same chat room
3. **Matching**: Users can swipe and match with each other
4. **Private Chat**: Matched users can start private conversations

---

## 🐛 **Known Limitations for Testing**

### **Single User Constraints:**
- **Matching**: Can't test swiping without other users
- **Group Chat**: Limited interaction without other participants
- **Private Messaging**: No matches to test with

### **Location Testing:**
- **GPS Required**: Real location permissions needed
- **Event Proximity**: Need to be physically near event locations
- **Simulator Limitations**: Location spoofing may be needed

### **Real-time Features:**
- **Chat Updates**: Best tested with multiple devices
- **Match Notifications**: Need simultaneous user actions

---

## 🚀 **Advanced Testing Scenarios**

### **Production Readiness Tests:**
1. **Poor Network**: Test with slow/intermittent internet
2. **Location Edge Cases**: Test GPS accuracy boundaries  
3. **High Load**: Multiple users in same chat room
4. **Error Handling**: Invalid inputs, failed API calls
5. **Permissions**: Denied location/camera permissions

### **Security Tests:**
1. **RLS Policies**: Users can only see their own data
2. **Authentication**: Signed-out users can't access app
3. **Chat Access**: Users can only join chats they're authorized for

---

## 📊 **Test Results Checklist**

### Core Features ✅
- [ ] Authentication works
- [ ] Onboarding completes
- [ ] Navigation functions
- [ ] Events display
- [ ] Location check-in works
- [ ] Group chat functions
- [ ] Profile displays correctly

### Advanced Features ⚡
- [ ] Real-time messaging
- [ ] Match detection
- [ ] GPS accuracy validation
- [ ] Error handling
- [ ] Multi-user interactions

### Production Ready 🚀
- [ ] Performance is smooth
- [ ] No crashes or errors
- [ ] Security policies work
- [ ] Scalable for multiple users

---

## 🛠 **For Developers**

### **Adding Test Users:**
To test multi-user features, create additional Google accounts and sign up through the app. Each new user will go through onboarding and can interact with existing users.

### **Database Inspection:**
Check Supabase dashboard to verify:
- User profiles created correctly
- Swipes recorded in database
- Matches detected properly
- Chat messages stored
- Event check-ins logged

### **Error Monitoring:**
Watch console logs for:
- Database connection issues
- RPC function errors
- Real-time subscription problems
- Location permission failures

---

**🎉 Ready to test! Start with the "Complete User Journey Test" and work through each feature systematically.** 