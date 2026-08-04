import * as Sentry from '@sentry/react-native'

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN

export function initSentry() {
  if (!dsn) {
    if (__DEV__) {
      console.warn('[sentry] EXPO_PUBLIC_SENTRY_DSN not set — error reporting disabled')
    }
    return
  }

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : (process.env.EXPO_PUBLIC_APP_ENV || 'production'),
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
    // Off deliberately: useAuth.ts already scopes Sentry.setUser() to just
    // { id }, not email/IP. sendDefaultPii:true would auto-attach IP
    // addresses and other PII to every event regardless of that, undoing
    // the minimal-PII intent already established there.
    sendDefaultPii: false,
  })
}

export { Sentry }
