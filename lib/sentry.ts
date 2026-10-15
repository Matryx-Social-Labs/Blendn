import * as Sentry from '@sentry/react-native'

import { scrubBoardUrl } from './board'

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
    // Since SDK 56 the global `fetch` is `expo/fetch`, which does not go
    // through XHR. The Sentry defaults instrument only XHR on mobile (RN's old
    // fetch was built on it), so without these every apiClient call would drop
    // out of breadcrumbs and traces. Same-named integrations replace the
    // defaults, not add to them.
    integrations: [
      Sentry.breadcrumbsIntegration({ fetch: true }),
      Sentry.reactNativeTracingIntegration({ traceFetch: true }),
    ],

    // Board URLs name the event, the post and the request; a report carries
    // the user's id. Together they say who asked whom (lib/board.ts). Fetch
    // breadcrumbs, the event's request and traced fetch spans all carry them.
    beforeBreadcrumb: (breadcrumb) =>
      typeof breadcrumb.data?.url === 'string'
        ? { ...breadcrumb, data: { ...breadcrumb.data, url: scrubBoardUrl(breadcrumb.data.url) } }
        : breadcrumb,
    beforeSend: (event) =>
      event.request?.url ? { ...event, request: { ...event.request, url: scrubBoardUrl(event.request.url) } } : event,
    beforeSendTransaction: (event) => ({
      ...event,
      spans: event.spans?.map((span) => ({
        ...span,
        description: span.description ? scrubBoardUrl(span.description) : span.description,
        data: typeof span.data?.url === 'string' ? { ...span.data, url: scrubBoardUrl(span.data.url) } : span.data,
      })),
    }),
  })
}

export { Sentry }
