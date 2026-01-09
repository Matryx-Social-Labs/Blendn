# Fix Google Sign-In for New Bundle ID

## The Problem

Your Bundle ID changed from:
- ❌ Old: `com.matrixsociallabs.blendn`
- ✅ New: `com.matryxsociallabs.blendn`

But your Google OAuth client is still configured for the **old Bundle ID**, causing sign-in to fail.

---

## Quick Fix (5 minutes)

### Step 1: Create New iOS OAuth Client

1. **Go to Google Cloud Console**:
   - URL: https://console.cloud.google.com/apis/credentials
   - Sign in to your Google account

2. **Create OAuth Client ID**:
   - Click: **+ CREATE CREDENTIALS**
   - Select: **OAuth client ID**
   - Application type: **iOS**
   - Configuration:
     ```
     Name: Blendn iOS (New)
     Bundle ID: com.matryxsociallabs.blendn
     ```
   - Click: **CREATE**

3. **Copy the Client IDs**:
   After creation, you'll see:
   - **iOS Client ID**: Something like `123456-abc.apps.googleusercontent.com`
   - **iOS URL scheme**: `com.googleusercontent.apps.123456-abc`

---

### Step 2: Update Your .env File

Edit `/Users/hemanth/Developer/blendn/.env`:

```bash
# Keep these the same
EXPO_PUBLIC_SUPABASE_URL=https://rycftadewrklmsswzviy.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5Y2Z0YWRld3JrbG1zc3d6dml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxODA1MzUsImV4cCI6MjA2ODc1NjUzNX0.IPzOzYrGthMKXkj9glTHZ_T9e-25fbrjjJ6KAh7gwjg

# Update these with NEW values from Google Console
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_NEW_WEB_CLIENT_ID_HERE
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=YOUR_NEW_IOS_CLIENT_ID_HERE
```

**Important**: Replace with the actual new client IDs you just created!

---

### Step 3: Update app.json

Edit `/Users/hemanth/Developer/blendn/app.json`:

Find the Google Sign-In plugin section (around line 61) and update the `iosUrlScheme`:

```json
[
  "@react-native-google-signin/google-signin",
  {
    "iosUrlScheme": "YOUR_NEW_IOS_URL_SCHEME_HERE"
  }
]
```

Replace `YOUR_NEW_IOS_URL_SCHEME_HERE` with the iOS URL scheme from Google Console.
It should look like: `com.googleusercontent.apps.123456-abc`

---

### Step 4: Rebuild iOS Project

Since you updated configuration, you need to regenerate the iOS project:

```bash
# Clean and rebuild
rm -rf ios/build ios/Pods ios/Podfile.lock

# Regenerate with new config
npx expo prebuild --platform ios --clean

# Install pods
cd ios && pod install && cd ..
```

---

### Step 5: Test Sign-In

Now test using one of these methods:

#### Option A: Use iOS Simulator (Easiest)

```bash
npx expo start

# Press 'i' for iOS simulator
```

#### Option B: Use EAS Build (No Xcode needed)

```bash
# Install EAS CLI if not already installed
npm install -g eas-cli

# Login
eas login

# Build for simulator (no signing needed)
eas build --profile development --platform ios

# Download and install the .app file when done
```

#### Option C: Use Physical Device (Requires device registration)

Only if you've already registered your device UDID in Apple Developer Portal.

---

## Alternative: Use Web Client ID (Quick Workaround)

If you want to test immediately without creating new OAuth clients, you can try using just the Web Client ID:

**Edit** `app/index.tsx` around line 25:

```typescript
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
  // Comment out iosClientId temporarily
  // iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
  offlineAccess: true,
})
```

This makes Google Sign-In use the web flow instead of native iOS SDK. Less ideal, but works for testing.

---

## Verification Checklist

After making changes:

- [ ] Created new iOS OAuth client in Google Cloud Console
- [ ] Updated `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in `.env`
- [ ] Updated `iosUrlScheme` in `app.json`
- [ ] Ran `npx expo prebuild --platform ios --clean`
- [ ] Tested sign-in (simulator or device)

---

## Testing Sign-In

1. **Start the app**
2. **Tap "Get Started"**
3. **Check terminal for logs**:
   - Look for: `🔐 [INDEX] Starting Google Sign In...`
   - Success: `✅ [INDEX] Google Sign In successful`
   - Error: Will show specific error code

4. **Common errors**:
   - `SIGN_IN_CANCELLED`: User cancelled (normal)
   - `DEVELOPER_ERROR`: Bundle ID mismatch (need to update OAuth client)
   - `NO_ID_TOKEN`: Configuration issue

---

## Still Not Working?

### Check Supabase Configuration

Make sure Google Sign-In is enabled in Supabase:

1. Go to: https://supabase.com/dashboard/project/rycftadewrklmsswzviy
2. Navigate to: **Authentication** → **Providers**
3. Find: **Google**
4. Verify it's enabled and has the correct Client ID/Secret

### Check Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Verify you have:
   - **Web client** (for Supabase backend)
   - **iOS client** (for your app with new Bundle ID)

---

## Why This Happened

When you changed your Bundle ID from `com.matrixsociallabs.blendn` to `com.matryxsociallabs.blendn`, Google OAuth stopped working because:

1. OAuth clients are tied to specific Bundle IDs for security
2. Your old client: `com.matrixsociallabs.blendn` ❌
3. Your new app: `com.matryxsociallabs.blendn` ✅
4. Mismatch = Sign-in rejected by Google

**Solution**: Create new OAuth client for the new Bundle ID!

---

## Quick Test Without Google Sign-In

Want to test the rest of your app without fixing Google Sign-In first?

Create a test account directly in Supabase:

```typescript
// Temporary - add this to your sign-in screen for testing
const testSignIn = async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'testpassword123'
  })

  if (error) console.error(error)
}
```

Then create the user in Supabase Dashboard:
- Go to: Authentication → Users → Add User
- Email: `test@example.com`
- Password: `testpassword123`

This lets you test the rest of your app while you fix Google Sign-In!
