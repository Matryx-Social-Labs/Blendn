# Testing Blendn with New Apple Developer Account

## Prerequisites Checklist

- [ ] New Apple Developer Account (active subscription)
- [ ] Mac with Xcode installed (latest version recommended)
- [ ] iPhone with iOS 14.0+ for physical device testing
- [ ] Node.js and npm installed
- [ ] Bundle ID registered in new Apple Developer account

## Bundle ID Setup

### Current Configuration
- **Bundle ID**: `com.matryxsociallabs.blendn` (Updated for new account)
- **Old Bundle ID**: `com.matrixsociallabs.blendn` (No longer available)
- **App Name**: Blendn
- **Platform**: iOS & Android

### Register in Apple Developer Portal

1. Go to https://developer.apple.com/account/
2. Navigate to: **Certificates, Identifiers & Profiles** → **Identifiers**
3. Click **+** to add new App ID
4. Configuration:
   - Type: **App IDs** → **App**
   - Description: `Blendn`
   - Bundle ID: `com.matryxsociallabs.blendn` (Explicit)
   - Capabilities to enable:
     - ✅ Push Notifications
     - ✅ Associated Domains (for deep links)
     - ✅ Sign in with Apple (optional)

## Testing Methods

### Method 1: Quick Simulator Test (No Device Needed)

**Pros**: Fast, no device required
**Cons**: No camera, limited GPS, no push notifications

```bash
# Start development server
npm install
npx expo start

# Press 'i' for iOS simulator
```

**Limitations**:
- Camera features won't work
- Location services are simulated
- No push notifications
- No real performance testing

---

### Method 2: Physical Device Testing (Recommended)

**Pros**: Full feature testing, real performance
**Cons**: Requires USB connection and device setup

#### Quick Start

```bash
# Run the test script
./test-on-device.sh
```

#### Manual Steps

1. **Install dependencies**:
   ```bash
   npm install
   cd ios && pod install && cd ..
   ```

2. **Open Xcode workspace**:
   ```bash
   open ios/blendn.xcworkspace
   ```

3. **Configure signing** (first time only):
   - Select **blendn** project in left sidebar
   - Select **blendn** target
   - Go to **Signing & Capabilities** tab
   - Enable **Automatically manage signing**
   - Select your **Team** (new Apple Developer account)
   - Xcode will generate provisioning profiles

4. **Connect iPhone**:
   - Plug in via USB
   - Unlock your iPhone
   - Trust your computer if prompted

5. **Build and Run**:
   - Select your iPhone from device dropdown (top left)
   - Click **Play** button (▶) or press `Cmd + R`
   - Wait for build to complete

6. **Trust developer on iPhone** (first time only):
   - Go to: Settings → General → VPN & Device Management
   - Tap your developer account
   - Tap **Trust**

---

### Method 3: TestFlight Distribution

**Pros**: Easy distribution to beta testers, no USB needed
**Cons**: Requires app archiving and Apple processing time (1-2 hours)

#### Steps

1. **Archive in Xcode**:
   ```bash
   open ios/blendn.xcworkspace
   ```
   - Menu: **Product** → **Archive**
   - Wait for archive to complete (~5-10 minutes)

2. **Upload to App Store Connect**:
   - Click **Distribute App**
   - Select **TestFlight & App Store**
   - Select **Upload**
   - Choose automatic signing
   - Click **Upload**

3. **Configure in App Store Connect**:
   - Go to https://appstoreconnect.apple.com/
   - Select your app (or create new app first)
   - Navigate to **TestFlight** tab
   - Wait for build to process (30-60 minutes)
   - Add internal testers
   - Add build to test group

4. **Testers install**:
   - Testers download TestFlight app from App Store
   - They receive invitation email
   - Open link and install app

---

## Testing Checklist

### Core Features to Test

#### Authentication
- [ ] Google Sign-In works
- [ ] Session persists after app restart
- [ ] Logout functionality
- [ ] Onboarding flow for new users

#### Events
- [ ] View events list
- [ ] Filter by location/category
- [ ] View event details
- [ ] Check-in to event (requires physical proximity)
- [ ] Mark interest in event
- [ ] View checked-in events

#### Location Features
- [ ] Location permissions requested
- [ ] GPS coordinates accurate
- [ ] Check-in validates proximity (within radius)
- [ ] Distance to events calculated
- [ ] Location permission denied handling

#### Matching
- [ ] View potential matches
- [ ] Swipe left/right functionality
- [ ] View match details
- [ ] Similar interests display
- [ ] User blocking works

#### Chat
- [ ] View chat list
- [ ] Send messages in group event chat
- [ ] Receive real-time messages
- [ ] Unread count updates
- [ ] Private messages (if implemented)

#### Profile
- [ ] View own profile
- [ ] Edit profile information
- [ ] Upload/change profile photos
- [ ] Update bio and interests
- [ ] View settings

#### Push Notifications
- [ ] Notification permissions requested
- [ ] Receive notifications for new messages
- [ ] Tap notification opens correct screen
- [ ] Notification badge updates

### Performance Testing
- [ ] App launch time acceptable
- [ ] Smooth scrolling in lists
- [ ] Images load quickly
- [ ] No crashes during navigation
- [ ] Memory usage reasonable

### Edge Cases
- [ ] Poor network connection handling
- [ ] App backgrounding and foregrounding
- [ ] Device rotation (if applicable)
- [ ] Low battery mode
- [ ] Airplane mode toggle

---

## Common Issues & Solutions

### Issue: "Untrusted Developer"
**Solution**: Settings → General → VPN & Device Management → Trust your developer

### Issue: "Failed to verify code signature"
**Solution**:
1. Clean build folder: Xcode → Product → Clean Build Folder
2. Quit Xcode
3. Delete: `rm -rf ~/Library/Developer/Xcode/DerivedData/*`
4. Re-open and rebuild

### Issue: "No matching provisioning profiles found"
**Solution**:
1. Disable "Automatically manage signing"
2. Re-enable "Automatically manage signing"
3. Select your Team again
4. Let Xcode regenerate profiles

### Issue: "CocoaPods not found"
**Solution**:
```bash
sudo gem install cocoapods
cd ios && pod install && cd ..
```

### Issue: Build succeeds but app crashes on launch
**Solution**:
1. Check Xcode console for error logs
2. Common causes:
   - Missing environment variables in `.env`
   - Supabase configuration incorrect
   - Google Sign-In keys missing

### Issue: Location services not working
**Solution**:
- Simulator: Debug → Location → Custom Location
- Device: Ensure location permissions granted in Settings

---

## Environment Variables Verification

Before testing, verify your `.env` file has all required keys:

```bash
# Check .env file
cat .env
```

Required variables:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`

---

## Production Deployment Checklist

Before deploying to App Store:

### Code Preparation
- [ ] Update version in `app.json`
- [ ] Update bundle version for iOS
- [ ] Remove all console.log statements
- [ ] Enable production error tracking
- [ ] Test all critical user flows

### Apple Developer Setup
- [ ] Create App Store listing in App Store Connect
- [ ] Prepare app screenshots (multiple device sizes)
- [ ] Write app description
- [ ] Set age rating
- [ ] Configure pricing (free/paid)
- [ ] Add privacy policy URL
- [ ] Complete App Review information

### Security & Privacy
- [ ] Move secrets from `.env` to secure storage
- [ ] Enable SSL pinning (if needed)
- [ ] Implement rate limiting
- [ ] Add content moderation
- [ ] Configure App Tracking Transparency

### App Store Submission
- [ ] Archive and upload build
- [ ] Submit for review
- [ ] Monitor review status
- [ ] Respond to rejection feedback (if any)

---

## Quick Commands Reference

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Run on iOS simulator
npx expo start --ios

# Run on connected device (via Xcode)
./test-on-device.sh

# Clean iOS build
cd ios && rm -rf build Pods && pod install && cd ..

# View Expo logs
npx expo start --clear

# Check bundle size
npx expo export --output-dir dist

# Update CocoaPods
cd ios && pod update && cd ..
```

---

## Support Resources

- **Expo Documentation**: https://docs.expo.dev/
- **Apple Developer Portal**: https://developer.apple.com/account/
- **App Store Connect**: https://appstoreconnect.apple.com/
- **TestFlight**: https://developer.apple.com/testflight/
- **Xcode Help**: https://developer.apple.com/xcode/

---

## Next Steps After Testing

1. **Gather Feedback**: Use TestFlight to get user feedback
2. **Fix Critical Bugs**: Address issues found during testing
3. **Implement Analytics**: Add crash reporting and user analytics
4. **Security Audit**: Review security before production
5. **Performance Optimization**: Profile and optimize slow areas
6. **App Store Submission**: Prepare assets and submit for review

---

**Good luck with testing! 🚀**
