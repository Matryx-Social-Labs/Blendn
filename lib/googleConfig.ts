/** Google Sign-In's one configuration: the sign-in screen and deleting an account (lib/deletionProof) both configure with it. */
export const googleSignInConfig = () => ({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
  offlineAccess: true,
})
