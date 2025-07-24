# 🤖 Simulator Testing Guide

## ⚠️ Known Simulator Limitations

### **Native Module Errors (Expected on Simulators)**

These errors are **normal** when running on iOS Simulator or Android Emulator:

```
Error: Cannot find native module 'ExpoDevice'
Error: Cannot find native module 'ExpoLocation' 
Error: Cannot find native module 'ExpoImageManipulator'
```

### **Why These Happen:**

1. **ExpoDevice** - Simulators don't have real device hardware info
2. **ExpoLocation** - Simulators have fake/limited GPS capabilities
3. **ExpoImageManipulator** - Image processing can be unreliable in simulators

## ✅ **What Works on Simulators:**

- ✅ **UI Navigation** - All screens and routing
- ✅ **Database Operations** - Supabase queries work perfectly
- ✅ **Authentication** - Google Sign-In and session management
- ✅ **Chat/Messaging** - Real-time messaging works
- ✅ **Profile Management** - Data editing (except photo uploads)
- ✅ **Matching Logic** - Swipe functionality and match detection
- ✅ **Basic Notifications** - In-app alerts and navigation

## ⚠️ **Limited on Simulators:**

- ⚠️ **Photo Uploads** - May fail or be unreliable
- ⚠️ **Push Notifications** - Limited testing capability
- ⚠️ **Location/GPS** - Fake coordinates, no real proximity
- ⚠️ **Event Check-ins** - Can't test real location verification

## 📱 **Testing Strategy:**

### **For Core Development (Simulators OK):**
- UI/UX development and styling
- Database schema and queries
- Navigation and user flows
- Chat and messaging features
- Authentication flows
- Profile data management

### **For Hardware Features (Need Real Device):**
- Photo upload and camera access
- Push notification delivery
- GPS/location-based features
- Event proximity check-ins
- Device-specific functionality

## 🧪 **Using the Test Features Screen:**

The app includes a **Test Features** screen (Profile → 🧪 Test Features) that will:

- ✅ **Pass on Simulators**: Database, Chat, Safety Features
- ⚠️ **Show Warnings on Simulators**: Push Notifications, Photo Upload, Location
- ✅ **Pass on Real Devices**: All features should work

## 🔄 **Development Workflow:**

1. **Primary Development**: Use simulators for UI/logic
2. **Hardware Testing**: Test on real devices weekly
3. **Final Testing**: Always test on real devices before production

## 🚀 **When You're Ready for Real Device Testing:**

1. Install **Expo Go** app on your phone
2. Connect to same WiFi as your computer
3. Scan QR code from `expo start`
4. Test all photo, location, and notification features

## 💡 **Pro Tips:**

- **Simulator for Speed**: Faster development and debugging
- **Real Device for Reality**: Actual user experience testing
- **Both are Important**: Use simulators for development, devices for validation

## 📋 **Real Device Test Checklist:**

- [ ] Photo upload during onboarding
- [ ] Camera access and photo selection
- [ ] Push notification permissions
- [ ] GPS location for event check-ins
- [ ] Push notification delivery
- [ ] Device-specific UI elements
- [ ] Performance on actual hardware 