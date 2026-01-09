# Complete Setup Guide: New Apple Developer Account

## What Changed

Your old Bundle ID `com.matrixsociallabs.blendn` was not available, so we've updated to:

**New Bundle ID**: `com.matryxsociallabs.blendn`

Files updated:
- ✅ [app.json](app.json) - iOS and Android bundle identifiers
- ✅ [ios/blendn/Info.plist](ios/blendn/Info.plist) - URL schemes
- ⏳ iOS Xcode project (will be regenerated)

---

## Step-by-Step Setup Process

### Step 1: Rebuild iOS Project with New Bundle ID

Run this script to regenerate your iOS project:

```bash
./update-bundle-id.sh
```

This will:
- Clean old build artifacts
- Regenerate iOS project with new Bundle ID using `expo prebuild`
- Install CocoaPods dependencies

**Time required**: ~2-3 minutes

**Alternative (manual method)**:
```bash
# Clean
rm -rf ios/build ios/Pods ios/Podfile.lock

# Regenerate
npx expo prebuild --platform ios --clean

# Install pods
cd ios && pod install && cd ..
```

---

### Step 2: Register Bundle ID in Apple Developer Portal

1. **Go to Apple Developer Portal**:
   - URL: https://developer.apple.com/account/
   - Sign in with your **NEW Apple Developer account**

2. **Navigate to Identifiers**:
   - Click: **Certificates, Identifiers & Profiles**
   - Click: **Identifiers**
   - Click the **+** button (top right)

3. **Register App ID**:
   - Select: **App IDs**
   - Select: **App**
   - Click: **Continue**

4. **Configure App ID**:
   ```
   Description: Blendn
   Bundle ID: com.matryxsociallabs.blendn
   Type: Explicit
   ```

5. **Enable Capabilities**:
   - ✅ **Push Notifications** (for message notifications)
   - ✅ **Associated Domains** (for deep links)
   - ✅ **Sign in with Apple** (optional, if you plan to use it)

6. **Complete Registration**:
   - Click: **Continue**
   - Review settings
   - Click: **Register**

**Time required**: ~2 minutes

---

### Step 3: Update Xcode Signing

1. **Open Xcode workspace**:
   ```bash
   open ios/blendn.xcworkspace
   ```

2. **Select Project**:
   - Click **blendn** project in left sidebar (blue icon)
   - Select **blendn** target (under TARGETS)

3. **Go to Signing & Capabilities**:
   - Click the **Signing & Capabilities** tab at top

4. **Update Team**:
   - Check ✅ **Automatically manage signing**
   - From **Team** dropdown, select your **new Apple Developer account**
   - Xcode will automatically:
     - Generate new provisioning profiles
     - Configure code signing
     - Update Bundle Identifier

5. **Verify Bundle ID**:
   - Confirm it shows: `com.matryxsociallabs.blendn`
   - Status should show: "Signing Certificate: Apple Development"

**Time required**: ~1 minute

---

### Step 4: Update Google OAuth (Important!)

Since your Bundle ID changed, you need to update Google OAuth configuration.

#### Option A: Create New iOS OAuth Client (Recommended)

1. **Go to Google Cloud Console**:
   - URL: https://console.cloud.google.com/
   - Select your project

2. **Create iOS OAuth Client**:
   - Navigate to: **APIs & Services** → **Credentials**
   - Click: **+ CREATE CREDENTIALS** → **OAuth client ID**
   - Application type: **iOS**
   - Name: `Blendn iOS (New)`
   - Bundle ID: `com.matryxsociallabs.blendn`
   - Click: **CREATE**

3. **Copy the new iOS Client ID**:
   - It will look like: `XXXXXX-YYYYYY.apps.googleusercontent.com`

4. **Update your .env file**:
   ```bash
   # Update this line in .env
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=YOUR_NEW_IOS_CLIENT_ID
   ```

5. **Update the reversed client ID in app.json**:
   The reversed client ID (for URL scheme) will be shown in Google Console.
   ```json
   "iosUrlScheme": "com.googleusercontent.apps.XXXXXX-YYYYYY"
   ```

#### Option B: Update Existing OAuth Client

1. Go to Google Cloud Console → Credentials
2. Edit your existing iOS OAuth client
3. Update Bundle ID to: `com.matryxsociallabs.blendn`

**Time required**: ~3 minutes

---

### Step 5: Test on Physical Device

1. **Connect iPhone**:
   - Plug in via USB cable
   - Unlock your iPhone
   - Trust computer if prompted

2. **Select Device in Xcode**:
   - In Xcode, click device dropdown (top left, next to Play button)
   - Select your iPhone

3. **Build and Run**:
   - Click **Play** button (▶) or press `Cmd + R`
   - Xcode will build and install on your iPhone
   - First build takes ~3-5 minutes

4. **Trust Developer Certificate** (First time only):
   - On your iPhone, go to: **Settings** → **General** → **VPN & Device Management**
   - Find your developer account
   - Tap it and tap **Trust**

5. **Launch App**:
   - Open Blendn from your iPhone home screen
   - Test all features!

**Time required**: ~5-10 minutes (first time)

---

## Quick Start Commands

```bash
# 1. Update Bundle ID and rebuild
./update-bundle-id.sh

# 2. Open Xcode to configure signing
open ios/blendn.xcworkspace

# 3. Build and run (after connecting iPhone)
# Click Play button in Xcode

# OR use Expo CLI
npx expo run:ios --device
```

---

## Testing Checklist

After setup, test these critical features:

### Core Functionality
- [ ] App launches successfully
- [ ] No crash on startup
- [ ] UI renders correctly

### Authentication
- [ ] Google Sign-In works (important - new OAuth config!)
- [ ] Session persists after app restart
- [ ] Can sign out

### Location Features
- [ ] Location permission prompt appears
- [ ] GPS coordinates are accurate
- [ ] Event check-in works (requires being near event)
- [ ] Distance to events shows correctly

### Push Notifications
- [ ] Notification permission prompt appears
- [ ] Can receive notifications (test with another device)
- [ ] Tapping notification opens correct screen

### Camera & Photos
- [ ] Camera permission prompt appears
- [ ] Can take photos for profile
- [ ] Can upload photos from library

---

## Troubleshooting

### Error: "No matching provisioning profiles found"

**Solution**:
```bash
# In Xcode:
# 1. Uncheck "Automatically manage signing"
# 2. Re-check "Automatically manage signing"
# 3. Select your Team again
```

### Error: "Signing certificate not found"

**Solution**:
1. Go to Xcode → Preferences → Accounts
2. Select your Apple Developer account
3. Click "Download Manual Profiles"
4. Try building again

### Error: "Bundle ID already registered"

This means someone else owns `com.matryxsociallabs.blendn`.

**Solution**: Choose a different Bundle ID (e.g., add your name):
- `com.hemanth.blendn`
- `com.hemanthdev.blendn`
- `com.yourdomain.blendn`

### Google Sign-In not working

**Likely cause**: Bundle ID changed but OAuth client wasn't updated.

**Solution**:
1. Verify Bundle ID in Google Cloud Console matches: `com.matryxsociallabs.blendn`
2. Update `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in `.env`
3. Rebuild app completely:
   ```bash
   rm -rf ios/build
   npx expo prebuild --platform ios --clean
   cd ios && pod install && cd ..
   ```

### App builds but crashes immediately

**Solution**:
1. Check Xcode console for error message
2. Common causes:
   - Missing environment variables in `.env`
   - Supabase configuration incorrect
   - Network connectivity issues

---

## Google OAuth Configuration Details

### What You Need to Update

| Config Item | Location | Value |
|------------|----------|-------|
| iOS OAuth Client | Google Cloud Console | New client for `com.matryxsociallabs.blendn` |
| iOS Client ID | `.env` file | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...` |
| Reversed Client ID | `app.json` | `iosUrlScheme` in Google Sign-In plugin |
| Info.plist URL Scheme | Auto-generated | Updates automatically via expo prebuild |

### Finding Your Google OAuth Config

1. **Google Cloud Console**: https://console.cloud.google.com/
2. Navigate to: **APIs & Services** → **Credentials**
3. Look for your OAuth 2.0 Client IDs
4. You should have:
   - Web client (for backend)
   - iOS client (for your app)

### Creating New iOS OAuth Client

```
Application Type: iOS
Name: Blendn iOS
Bundle ID: com.matryxsociallabs.blendn
```

After creation, you'll receive:
- **iOS Client ID**: Goes in `.env` as `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- **iOS URL Scheme**: Update in `app.json` plugin config

---

## Summary: Complete Setup Flow

```
1. Run: ./update-bundle-id.sh
   ↓ (rebuilds iOS project)

2. Register: com.matryxsociallabs.blendn
   ↓ (in Apple Developer Portal)

3. Create: New Google OAuth iOS client
   ↓ (update .env with new client ID)

4. Open: Xcode and select Team
   ↓ (auto-generates provisioning profiles)

5. Build: Connect iPhone and press Play
   ↓ (first build takes 3-5 minutes)

6. Trust: Developer certificate on iPhone
   ↓ (Settings → General → Device Management)

7. Test: Launch app and test features
   ✅ (ready to develop!)
```

---

## Next Steps After Setup

1. **Full Feature Testing**: Use the checklist in [TESTING-NEW-ACCOUNT.md](TESTING-NEW-ACCOUNT.md)
2. **TestFlight Beta**: Once testing passes, upload to TestFlight for external testers
3. **Production Prep**: Review security checklist before App Store submission

---

## Support & Resources

- **Expo Prebuild**: https://docs.expo.dev/workflow/prebuild/
- **Apple Developer Portal**: https://developer.apple.com/account/
- **Google OAuth Setup**: https://docs.expo.dev/guides/google-authentication/
- **Xcode Code Signing**: https://developer.apple.com/support/code-signing/

---

**Estimated Total Setup Time**: 15-20 minutes

**Questions?** Check the troubleshooting section above or reach out for help!
