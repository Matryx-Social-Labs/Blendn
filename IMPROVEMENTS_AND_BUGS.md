# 🐛 Bugs & 🚀 Improvements for Blendn App

## 🚨 **Critical Bugs to Fix**

### **Authentication Issues**
- [x] **Infinite auth loops**: Guarded redirects prevent re-entrant navigation loops
- [x] **Session persistence**: Initialization waits for INITIAL_SESSION to stabilize persisted sessions
- [x] **Onboarding bypass**: Tabs layout now gates and redirects non-onboarded users
 - [x] **Missing Supabase envs**: If `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` are missing, the app now fails fast with a clear error instead of using an invalid fallback

### **Database Connection**
- [ ] **Column name mismatch**: Some SQL functions still reference old column names
- [ ] **RLS policy gaps**: Users might access data they shouldn't
- [ ] **Connection timeouts**: No retry logic for failed database calls
 - [x] **Invalid endpoint fallback**: Startup now halts with a clear fatal error when Supabase URL/key are missing

### **Navigation**
- [ ] **Route warnings**: Console shows warnings about missing routes
- [ ] **Deep linking**: App doesn't handle deep links properly
- [ ] **Back button**: Inconsistent back navigation behavior

### **Notifications**
- [x] **Non-standard handler fields**: Use only supported keys in foreground handler
- [x] **Tapped notification routing**: Implemented navigation mapping for chat, event, and match screens

### **Caching/Batching**
- [x] **Unimplemented batch queries**: Implemented `batchQuery` execution using Supabase with common filters

### **Onboarding Completion**
- [ ] **No explicit navigation**: Completing onboarding updates the DB but does not navigate; relies on outer layout detection, which can leave users stuck if a rerender doesn’t occur

---

## ⚡ **High Priority Improvements**

### **Core Dating Features Missing**
- [ ] **Profile Photos**: No real photo upload/management system
- [ ] **Photo Verification**: No way to verify profile photos are real
- [ ] **Profile Editing**: Can't edit profile after onboarding
- [ ] **Match Filters**: No age, distance, or interest filters
- [ ] **Undo Swipe**: No way to undo accidental swipes
- [ ] **Super Likes**: Placeholder only, not implemented
- [ ] **Match Expiration**: Matches never expire

### **Events System Gaps**
- [ ] **Event Creation**: Users can't create their own events
- [ ] **RSVP System**: No way to RSVP to events without checking in
- [ ] **Event Search**: No search or filtering by location/category
- [ ] **Event Favorites**: Can't bookmark interesting events
- [ ] **Real Distance**: Distance calculation returns 0 (placeholder)
- [ ] **Event Categories**: No category filtering system
 - [ ] **Check-in accuracy enforcement**: Check-in uses hardcoded fallback coordinates when permission is denied; enforce permission and a minimum GPS accuracy threshold before allowing check-in

### **Chat & Messaging**
- [ ] **Private Messaging**: Not implemented yet (shows "Coming Soon")
- [ ] **Image Sharing**: Can't send photos in chats
- [ ] **Message Reactions**: No emoji reactions or likes
- [ ] **Typing Indicators**: No real-time typing status
- [ ] **Read Receipts**: Can't see if messages were read
- [ ] **Message Search**: No way to search chat history
- [ ] **Chat Notifications**: No push notifications for new messages
 - [x] **Unread counts**: Implemented per-conversation unread counts with local last-read tracking
 - [ ] **Realtime updates**: Chat list doesn’t subscribe to new messages; items don’t refresh until manual reload
 - [x] **RPC response robustness**: Normalized RPC responses (array/object) in chat and safety flows

### **Location & Check-ins**
- [ ] **Check-in History**: No way to see past check-ins
- [ ] **Attendee List**: Can't see who else checked into an event
- [ ] **Location Spoofing**: No protection against fake GPS
- [ ] **Offline Check-ins**: No handling for poor connectivity during check-in

---

## 🎨 **UX/UI Improvements**

### **User Experience**
- [ ] **Loading States**: Many screens lack proper loading indicators
- [ ] **Empty States**: Some empty states are not helpful enough
- [ ] **Error Messages**: Generic error messages instead of specific help
- [ ] **Onboarding Flow**: Placeholder data instead of real input collection
- [ ] **Pull to Refresh**: Missing on many list screens
- [ ] **Infinite Scroll**: Events list doesn't paginate
 - [ ] **Accessibility labels**: Add `accessibilityLabel` and roles for tappables; improve contrast on dark backgrounds

### **Visual Design**
- [ ] **Dark Mode**: No dark theme option
- [ ] **Profile Pictures**: Using placeholder URLs instead of real photos
- [ ] **Image Loading**: No progressive loading or placeholders
- [ ] **Animations**: Limited micro-interactions and transitions
- [ ] **Accessibility**: No screen reader support or high contrast mode

### **Navigation & Discovery**
- [ ] **Tab Badges**: No unread counts on Chat tab
- [ ] **Search Functionality**: No global search across events/people
- [ ] **Recommendations**: No personalized event or match suggestions
- [ ] **Recently Viewed**: No history of viewed profiles or events

---

## 🔧 **Technical Improvements**

### **Performance**
- [ ] **Image Optimization**: Photos not optimized for mobile
- [ ] **Caching Strategy**: No offline data or image caching
- [ ] **Bundle Size**: App bundle could be optimized
- [ ] **Memory Leaks**: Real-time subscriptions might not clean up properly
- [ ] **Database Optimization**: Some queries could be more efficient
 - [ ] **Enable image transforms**: Turn on Supabase Image Transformations in production and prefer WebP where supported
 - [ ] **Paginate carousels**: Carousels render full arrays; paginate/limit to reduce work on mount

### **Real-time Features**
- [ ] **Connection Status**: No indication of real-time connection status
- [ ] **Retry Logic**: Failed real-time messages don't retry
- [ ] **Subscription Cleanup**: Memory leaks from unclosed subscriptions
- [ ] **Offline Queueing**: Messages sent offline don't queue for later
 - [ ] **Centralized teardown**: Ensure all channels are removed on unmount; standardize unsubscribe to prevent leaks across screens

### **Data Management**
- [ ] **Data Validation**: Frontend validation missing for many inputs
- [ ] **Optimistic Updates**: UI doesn't update optimistically
- [ ] **Conflict Resolution**: No handling of concurrent data changes
- [ ] **Data Synchronization**: Potential race conditions in real-time updates
 - [ ] **Per-device tokens**: Store push tokens per-device (e.g., `user_devices` table) instead of a single `profiles.push_token`
 - [ ] **Photo deletion**: Removing a photo in onboarding only clears local state; also delete from storage and update DB atomically

---

## 🛡️ **Security & Safety**

### **User Safety**
- [ ] **User Blocking**: No way to block inappropriate users
- [ ] **Report System**: No reporting mechanism for bad behavior
- [ ] **Content Moderation**: No filtering of inappropriate messages/photos
- [ ] **Age Verification**: No verification that users are 18+
- [ ] **Location Privacy**: Location data stored without user control

### **Technical Security**
- [ ] **Rate Limiting**: No protection against spam or abuse
- [ ] **Input Sanitization**: Messages could contain malicious content
- [ ] **API Security**: No request signing or advanced authentication
- [ ] **Data Encryption**: Sensitive data might not be encrypted at rest
 - [ ] **Secrets in config**: Google client IDs are committed in `app.json`/code; move to secure env configuration

---

## 📱 **Platform & Production**

### **Mobile Optimization**
- [ ] **App Icons**: Generic Expo icons instead of branded ones
- [ ] **Splash Screen**: Default Expo splash screen
- [ ] **App Store Optimization**: No metadata for app stores
- [ ] **Device Permissions**: Permission requests could be more explanatory
- [ ] **Background App Refresh**: No background updates for messages
 - [ ] **Push token saving**: Avoid saving development/simulator tokens to user profile; only persist real device tokens

### **Analytics & Monitoring**
- [ ] **Crash Reporting**: No crash analytics (Sentry, Bugsnag)
- [ ] **User Analytics**: No tracking of user behavior or engagement
- [ ] **Performance Monitoring**: No performance metrics
- [ ] **A/B Testing**: No experimentation framework
- [ ] **Feature Flags**: No way to toggle features remotely

### **Deployment & DevOps**
- [ ] **Environment Management**: No staging environment
- [ ] **CI/CD Pipeline**: No automated testing or deployment
- [ ] **Database Migrations**: No versioning of database changes
- [ ] **Backup Strategy**: No automated database backups
- [ ] **Monitoring**: No uptime or performance monitoring
 - [ ] **Config hygiene**: Move Google Sign-In client IDs and similar values to env/remote config; avoid hardcoding in `app.json`/source

---

## 🎯 **Feature Additions**

### **Advanced Dating Features**
- [ ] **Video Profiles**: Short video introductions
- [ ] **Voice Messages**: Audio messages in chat
- [ ] **Date Planning**: Built-in date planning tools
- [ ] **Mutual Friends**: Show connections through events
- [ ] **Compatibility Scores**: Algorithm-based matching scores

### **Social Features**
- [ ] **Friend Referrals**: Invite friends to join
- [ ] **Group Events**: Create group hangouts
- [ ] **Event Reviews**: Rate and review past events
- [ ] **Social Proof**: Show mutual connections or interests
- [ ] **Activity Feed**: See what friends are attending

### **Gamification**
- [ ] **Achievement System**: Badges for app engagement
- [ ] **Streak Tracking**: Daily login or activity streaks
- [ ] **Leaderboards**: Most active users or event attendees
- [ ] **Points System**: Rewards for profile completion, check-ins

---

## 🏆 **Priority Implementation Order**

### **Week 1-2: Critical Fixes**
1. Fix authentication loops and session persistence
2. Implement real profile photo uploads
3. Add proper error handling throughout app
4. Fix database column name issues

### **Week 3-4: Core Features**
1. Private messaging system
2. Profile editing functionality
3. Event search and filtering
4. Match filters (age, distance, interests)

### **Week 5-6: UX Improvements**
1. Better loading and empty states
2. Push notifications for messages and matches
3. Image sharing in chats
4. Pull-to-refresh on all lists

### **Week 7-8: Advanced Features**
1. User blocking and reporting
2. Event creation by users
3. Check-in history and attendee lists
4. Real distance calculations

### **Beyond: Polish & Scale**
1. Dark mode and accessibility
2. Analytics and crash reporting  
3. Performance optimizations
4. Advanced matching algorithms

---

## 🔍 **Testing Recommendations**

### **Automated Testing**
- [ ] Unit tests for RPC functions
- [ ] Integration tests for critical user flows
- [ ] End-to-end testing with multiple users
- [ ] Load testing for real-time chat

### **Manual Testing**
- [ ] Test with poor network conditions
- [ ] Test location accuracy in different environments
- [ ] Test with multiple simultaneous users
- [ ] Test edge cases (empty data, long messages, etc.)

---

**💡 Overall Assessment: The app has a solid foundation with all core systems working, but needs polish, safety features, and user experience improvements to be production-ready for a real dating app.** 