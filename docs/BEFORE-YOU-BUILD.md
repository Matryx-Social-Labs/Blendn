# ⚠️ Fix This Before Building with EAS

## Critical: Update Google OAuth Configuration

Your build will succeed, but **Google Sign-In will fail** unless you update the OAuth configuration for your new Bundle ID.

---

## Quick Fix (5 minutes)

### 1. Create New Google OAuth Client

1. **Go to**: https://console.cloud.google.com/apis/credentials

2. **Create iOS OAuth Client**:
   - Click: **+ CREATE CREDENTIALS** → **OAuth client ID**
   - Type: **iOS**
   - Name: `Blendn iOS (New Bundle ID)`
   - Bundle ID: `com.matryxsociallabs.blendn` ⚠️ **Must match exactly!**
   - Click: **CREATE**

3. **Copy the new iOS Client ID**:
   - Will look like: `123456-abc.apps.googleusercontent.com`

4. **Note the iOS URL Scheme**:
   - Will look like: `com.googleusercontent.apps.123456-abc`

---

### 2. Update .env File

Edit: `/Users/hemanth/Developer/blendn/.env`

```bash
EXPO_PUBLIC_SUPABASE_URL=https://rycftadewrklmsswzviy.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5Y2Z0YWRld3JrbG1zc3d6dml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxODA1MzUsImV4cCI6MjA2ODc1NjUzNX0.IPzOzYrGthMKXkj9glTHZ_T9e-25fbrjjJ6KAh7gwjg

# ⚠️ UPDATE THESE with your NEW OAuth client IDs:
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_NEW_WEB_CLIENT_ID
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=YOUR_NEW_IOS_CLIENT_ID
```

---

### 3. Update app.json

Edit: `/Users/hemanth/Developer/blendn/app.json`

Find line ~63 and update:

```json
[
  "@react-native-google-signin/google-signin",
  {
    "iosUrlScheme": "YOUR_NEW_IOS_URL_SCHEME"
  }
],
```

Replace with the URL scheme from Google Console (step 1 above).

---

## Then Run EAS Build

After updating OAuth configuration:

```bash
# For physical device (recommended)
eas build --profile preview --platform ios

# OR for simulator only
eas build --profile development --platform ios
```

---

## Alternative: Skip OAuth Fix, Test Other Features

If you want to build now and fix OAuth later:

You can test everything except Google Sign-In. Create a test user in Supabase instead:

1. **Go to**: https://supabase.com/dashboard/project/rycftadewrklmsswzviy/auth/users
2. **Click**: "Add user" → "Create new user"
3. **Create**:
   - Email: `test@example.com`
   - Password: `testpass123`
   - Auto-confirm: ✅ Yes

Then temporarily modify your sign-in screen to add email/password option for testing.

---

## Why Google OAuth Broke

Your Bundle ID changed:
- Old: `com.matrixsociallabs.blendn` ❌
- New: `com.matryxsociallabs.blendn` ✅

Google OAuth clients are tied to Bundle IDs. When Bundle ID changes, you need a new OAuth client!
