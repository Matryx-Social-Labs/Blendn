# Quick Start Guide - New Developer Account

## Your New Configuration

| Item | Value |
|------|-------|
| **Bundle ID** | `com.matryxsociallabs.blendn` |
| **Old Bundle ID** | ~~`com.matrixsociallabs.blendn`~~ (not available) |
| **App Name** | Blendn |

---

## 5-Step Setup (15 minutes)

### 1️⃣ Rebuild iOS Project (3 min)

```bash
./update-bundle-id.sh
```

This updates your iOS project with the new Bundle ID.

---

### 2️⃣ Register Bundle ID (2 min)

1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Click **+** button
3. Create App ID:
   - **Bundle ID**: `com.matryxsociallabs.blendn`
   - **Capabilities**: Push Notifications ✅, Associated Domains ✅

---

### 3️⃣ Update Google OAuth (3 min)

1. Go to: https://console.cloud.google.com/apis/credentials
2. Create **iOS OAuth Client**:
   - **Bundle ID**: `com.matryxsociallabs.blendn`
3. Copy the **iOS Client ID**
4. Update `.env`:
   ```bash
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=YOUR_NEW_CLIENT_ID_HERE
   ```

---

### 4️⃣ Configure Xcode Signing (2 min)

```bash
open ios/blendn.xcworkspace
```

In Xcode:
1. Select **blendn** target
2. **Signing & Capabilities** tab
3. Check ✅ **Automatically manage signing**
4. Select your **new Team** from dropdown

---

### 5️⃣ Build & Test (5 min)

1. Connect your iPhone via USB
2. Select iPhone in Xcode (top left dropdown)
3. Click **Play** button (▶) or press `Cmd + R`
4. On iPhone: Settings → General → Device Management → **Trust**
5. Launch app and test!

---

## Quick Commands

```bash
# Clean and rebuild everything
./update-bundle-id.sh

# Open Xcode
open ios/blendn.xcworkspace

# Alternative: Build via Expo CLI (after Xcode signing setup)
npx expo run:ios --device
```

---

## Must Test Features

- [ ] Google Sign-In (critical - OAuth config changed!)
- [ ] Location permissions & event check-ins
- [ ] Push notifications
- [ ] Camera & photo upload

---

## Help

- **Detailed guide**: [SETUP-NEW-DEVELOPER-ACCOUNT.md](SETUP-NEW-DEVELOPER-ACCOUNT.md)
- **Full testing**: [TESTING-NEW-ACCOUNT.md](TESTING-NEW-ACCOUNT.md)
- **Troubleshooting**: See setup guide

---

**Ready?** Run `./update-bundle-id.sh` to start! 🚀
