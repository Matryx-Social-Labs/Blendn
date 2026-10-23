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
    beforeBreadcrumb: (breadcrumb) => {
      const scrubbed = breadcrumb.message ? { ...breadcrumb, message: scrubReportText(breadcrumb.message) } : breadcrumb
      return typeof scrubbed.data?.url === 'string'
        ? { ...scrubbed, data: { ...scrubbed.data, url: scrubBoardUrl(scrubbed.data.url) } }
        : scrubbed
    },
    beforeSend: (event) => scrubEvent(event),
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

/** An invite link's token, wherever it is written: `/f/<token>` is a friend invite anyone holding it can use. */
const INVITE_TOKEN = /\/f\/[^/?#\s'"]+/g
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * Text bound for a crash report, with what identifies somebody taken out: invite tokens, and the ids (a conversation, a
 * room, an event, a board post) a path or a message can carry. An error's message is free text; the screen that threw
 * may have put its route in it.
 */
export function scrubReportText(text: string): string {
  return text.replace(INVITE_TOKEN, '/f/:token').replace(UUID, ':id')
}

type ScrubbableEvent = { request?: { url?: string }; message?: string; exception?: { values?: { value?: string }[] } }

/** A report as it leaves: its request URL (board ids), its message and every exception's message scrubbed. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  return {
    ...event,
    ...(event.request?.url ? { request: { ...event.request, url: scrubBoardUrl(event.request.url) } } : {}),
    ...(event.message ? { message: scrubReportText(event.message) } : {}),
    ...(event.exception?.values
      ? { exception: { ...event.exception, values: event.exception.values.map((v) => (v.value ? { ...v, value: scrubReportText(v.value) } : v)) } }
      : {}),
  }
}

export { Sentry }
