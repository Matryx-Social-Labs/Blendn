# Google Sign In Setup Guide

This guide will help you configure Google Sign In for your React Native app with Supabase.

## 1. Environment Variables

Add these variables to your `.env` file:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Google OAuth Configuration
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id.googleusercontent.com
```

## 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API and Google Sign-In API
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
5. Create credentials for:
   - **Web application** (for Supabase)
   - **Android** (if building for Android)
   - **iOS** (if building for iOS)

### For Web Application:
- Add your Supabase project URL to authorized redirect URIs:
  `https://your-project-ref.supabase.co/auth/v1/callback`

### For Android:
- Add your package name
- Add SHA-1 certificate fingerprint (for development and production)

### For iOS:
- Add your bundle identifier
- Download the `GoogleService-Info.plist` file

## 3. Supabase Configuration

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Providers**
3. Enable **Google** provider
4. Add your Google OAuth credentials:
   - **Client ID**: Web application client ID from Google Cloud Console
   - **Client Secret**: Web application client secret from Google Cloud Console

## 4. React Native Configuration

### For Expo (Development Build):

Add to your `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "@react-native-google-signin/google-signin",
        {
          "iosUrlScheme": "your.bundle.identifier"
        }
      ]
    ]
  }
}
```

### For Bare React Native:

Follow the platform-specific setup in the [React Native Google Sign In documentation](https://react-native-google-signin.github.io/docs/setting-up/get-config-file).

## 5. Testing

1. Create a development build with the Google Sign In plugin
2. Test on a physical device (Google Sign In doesn't work in simulators)
3. Ensure your app is signed with the correct certificate for production

## 6. Common Issues

- **Google Sign In not working**: Make sure you're testing on a physical device
- **idToken not found**: Ensure web client ID is configured correctly
- **Sign in cancelled**: Normal behavior when user cancels the flow
- **Play Services not available**: Only affects Android devices without Google Play Services

## 7. Production Checklist

- [ ] Add production SHA-1 fingerprint to Google Cloud Console
- [ ] Update redirect URIs in Google Cloud Console
- [ ] Test with production build
- [ ] Verify Supabase Google provider is properly configured
- [ ] Test user flow end-to-end 