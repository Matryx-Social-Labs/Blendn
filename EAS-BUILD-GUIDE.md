# Complete EAS Build Guide (No Xcode Required!)

## What is EAS Build?

EAS (Expo Application Services) builds your app in the cloud:
- ✅ No Xcode required
- ✅ No local compilation
- ✅ Handles Apple code signing automatically
- ✅ Installs directly on device (like TestFlight)
- ⏱️ Takes ~15-20 minutes per build

---

## Prerequisites

- [ ] Expo account (you have: `hemanthr04`)
- [ ] Apple Developer account (your new one)
- [ ] Fixed Google OAuth config (see [BEFORE-YOU-BUILD.md](BEFORE-YOU-BUILD.md))

---

## Step-by-Step Guide

### 1. Install EAS CLI

```bash
npm install -g eas-cli
```

**Verify installation**:
```bash
eas --version
```

---

### 2. Login to Expo

```bash
eas login
```

Enter credentials:
- Username: `hemanthr04`
- Password: Your Expo password

---

### 3. Configure EAS (First Time Only)

```bash
cd /Users/hemanth/Developer/blendn
eas build:configure
```

This will:
- Check your `eas.json` (already exists ✅)
- Update `app.json` with EAS project ID (already done ✅)

---

### 4. Register Bundle ID in Apple Developer Portal

**Important**: Do this before building!

1. Go to: https://developer.apple.com/account/resources/identifiers/add/bundleId
2. Register:
   - Description: `Blendn`
   - Bundle ID: `com.matryxsociallabs.blendn`
   - Capabilities:
     - ✅ Push Notifications
     - ✅ Associated Domains

---

### 5. Start Your First Build

You have two options:

#### Option A: Build for Physical Device (Recommended) ⭐

```bash
eas build --profile preview --platform ios
```

**What happens**:
1. EAS analyzes your project
2. Asks for Apple ID credentials
3. Generates certificates and provisioning profiles
4. Uploads code and builds in cloud
5. Provides download link when done

**First-time prompts**:
```
? Log in to your Apple account
  Email: your-apple-dev-account@email.com
  Password: [App-specific password]

? Generate a new Apple Distribution Certificate?
  → Yes

? Generate a new Apple Provisioning Profile?
  → Yes

? Add your own devices for internal distribution?
  → Yes (then follow instructions to register device UDID)
```

#### Option B: Build for Simulator (Faster, No Signing)

```bash
eas build --profile development --platform ios
```

**Benefits**:
- No Apple credentials needed
- No code signing
- Faster (~10-15 minutes)
- **Limitation**: Can only run in iOS Simulator, not real device

---

### 6. Get Your iPhone's UDID (For Physical Device Builds)

EAS needs your iPhone's UDID to create provisioning profile.

**Method 1: Using Finder (macOS Catalina+)**
1. Connect iPhone to Mac
2. Open **Finder**
3. Click your iPhone in sidebar
4. Click on text below phone name to cycle through info
5. Find **UDID** (long string like: `00008030-001234567890ABCD`)
6. Right-click and copy

**Method 2: Using Terminal**
```bash
system_profiler SPUSBDataType | grep "Serial Number:" | grep -v "0x" | head -1 | awk '{print $3}'
```

**Add to EAS**:
When EAS asks "Add devices?":
- Choose **Yes**
- Paste your UDID
- Give it a name (e.g., "My iPhone")

---

### 7. Create App-Specific Password for Apple ID

EAS needs this to access your Apple Developer account:

1. Go to: https://appleid.apple.com/account/manage
2. Sign in with Apple Developer account
3. **Security** section → **App-Specific Passwords**
4. Click: **Generate Password**
5. Label: `EAS Build for Blendn`
6. **Copy the password** (format: `xxxx-xxxx-xxxx-xxxx`)
7. Use this when EAS asks for Apple password

---

### 8. Monitor Build Progress

After starting build:

1. **In Terminal**: Shows build URL and progress
2. **In Browser**: https://expo.dev/accounts/hemanthr04/projects/blendn/builds

**Build stages**:
- 🟡 Queued
- 🔵 In Progress (5-15 minutes)
- 🟢 Finished
- 🔴 Failed (check logs)

---

### 9. Download and Install

When build finishes:

**For Physical Device**:
1. EAS provides a download URL
2. **Open URL on your iPhone** (in Safari)
3. Tap "Install"
4. App installs directly (like TestFlight!)
5. Trust developer: Settings → General → Device Management

**For Simulator**:
1. Download `.tar.gz` file from build page
2. Extract to get `.app` file
3. Drag `.app` onto iOS Simulator

---

## Build Profiles Explained

Your `eas.json` has three profiles:

### `development` Profile
```bash
eas build --profile development --platform ios
```
- For iOS Simulator only
- Includes dev tools
- Fast builds
- No code signing needed

### `preview` Profile
```bash
eas build --profile preview --platform ios
```
- For physical devices (internal distribution)
- Like TestFlight but without App Store Connect
- Good for testing with team
- **Recommended for your use case!**

### `production` Profile
```bash
eas build --profile production --platform ios
```
- For App Store submission
- Optimized build
- Auto-increments version

---

## Quick Build Commands

```bash
# Simulator only (no signing, fastest)
eas build --profile development --platform ios

# Physical device (requires Apple account)
eas build --profile preview --platform ios

# Production (App Store ready)
eas build --profile production --platform ios

# Check build status
eas build:list

# View latest build
eas build:view

# Cancel running build
eas build:cancel
```

---

## Troubleshooting

### "Bundle Identifier is not registered"

**Fix**: Register `com.matryxsociallabs.blendn` in Apple Developer Portal first:
https://developer.apple.com/account/resources/identifiers/add/bundleId

### "Invalid Apple ID password"

**Fix**: Use App-Specific Password, not your regular Apple password:
https://appleid.apple.com/account/manage → Security → App-Specific Passwords

### "No devices registered"

**Fix**: Add your iPhone's UDID when prompted, or manually at:
https://developer.apple.com/account/resources/devices/add

### "Google Sign-In not working in build"

**Fix**: Update OAuth config for new Bundle ID. See [BEFORE-YOU-BUILD.md](BEFORE-YOU-BUILD.md)

### Build fails with "Dependencies error"

**Fix**: Try resetting:
```bash
rm -rf node_modules package-lock.json
npm install
eas build --profile preview --platform ios --clear-cache
```

---

## Cost & Free Tier

**Free Tier** (included):
- ✅ Unlimited builds
- ❌ Slower build servers
- ⏱️ Longer wait times

**Paid Tier** ($29/month):
- ✅ Faster builds
- ✅ Priority queue
- ✅ More build minutes

For testing, **free tier is fine!**

---

## After Your First Successful Build

1. **Install on iPhone** from the link
2. **Test all features**, especially:
   - Google Sign-In (if you fixed OAuth)
   - Location permissions
   - Camera/Photos
   - Push notifications

3. **Fix any issues**

4. **Rebuild** with fixes:
   ```bash
   eas build --profile preview --platform ios
   ```

5. **Iterate** until everything works!

---

## Next Steps After Testing

1. **TestFlight Distribution**:
   - Use `eas submit` to upload to App Store Connect
   - Easier than manual Xcode archive/upload

2. **Automatic Builds**:
   - Set up GitHub Actions to build on every push
   - CI/CD for your app

3. **Over-the-Air Updates**:
   - Use `eas update` to push JS/asset changes without rebuilding
   - Users get updates instantly

---

## Recommended Build Flow

```bash
# 1. Fix Google OAuth (see BEFORE-YOU-BUILD.md)

# 2. First build (simulator - fastest test)
eas build --profile development --platform ios

# 3. Second build (your device - full testing)
eas build --profile preview --platform ios

# 4. After testing passes, production build
eas build --profile production --platform ios
```

---

## Support & Resources

- **EAS Build Docs**: https://docs.expo.dev/build/introduction/
- **EAS Dashboard**: https://expo.dev/accounts/hemanthr04/projects/blendn
- **Build Troubleshooting**: https://docs.expo.dev/build-reference/troubleshooting/

---

**Ready to build?** Start with:

```bash
eas login
eas build --profile preview --platform ios
```

🚀 Your app will be ready in ~20 minutes!
