/**
 * The binary's own version ("1.0.0"), read where the native module exists and "unknown" where it does not (a test, a
 * preview). A module of its own so `apiClient` can name the build on every request without importing the native modules
 * `lib/support.ts` does.
 */
export function appVersionNumber(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const application = require('expo-application') as typeof import('expo-application')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const constants = require('expo-constants').default as typeof import('expo-constants').default
    return application.nativeApplicationVersion ?? constants.expoConfig?.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
