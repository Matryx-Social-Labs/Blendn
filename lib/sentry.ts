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

    // A report carries the user's id; a URL or a message can carry who they asked, an invite anyone can use, a room.
    // Every string a report sends that could hold one goes through `scrubReportText` (below).
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubTransaction(event),
  })
}

/** The app's invite links (`/f/<token>`) and the API's (`/friends/invite/<token>`): anyone holding one can use it. */
const APP_INVITE = /\/f\/[^/?#\s'"]+/g
const API_INVITE = /\/friends\/invite\/[^/?#\s'"]+/g
/** A query parameter whose name says it is a secret: `token`, `access_token`, `code`, `api_key`, `X-Amz-Signature`… */
const SECRET_PARAM = /([?&][^=&#\s]*(?:token|code|key|signature)=)[^&#\s'"]*/gi
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * Any text bound for a crash report — a URL, a message, a console line — with what identifies somebody taken out:
 * board ids (`scrubBoardUrl`, as before), invite tokens in the app's links and the API's, secret-looking query
 * parameters, and every uuid (a conversation, a room, an event, a person). The one scrubber: every hook below uses it.
 */
export function scrubReportText(text: string): string {
  return scrubBoardUrl(text)
    .replace(API_INVITE, '/friends/invite/:token')
    .replace(APP_INVITE, '/f/:token')
    .replace(SECRET_PARAM, '$1:token')
    .replace(UUID, ':id')
}

const scrubMaybe = <T,>(value: T): T => (typeof value === 'string' ? (scrubReportText(value) as T) : value)

/** A console argument: a string scrubbed, anything else written out first and scrubbed (an object can hold a URL). */
function scrubArgument(value: unknown): unknown {
  if (typeof value === 'string') return scrubReportText(value)
  if (value === null || typeof value !== 'object') return value
  try {
    return scrubReportText(JSON.stringify(value))
  } catch {
    return '[unserialisable]'
  }
}

type ScrubbableBreadcrumb = { message?: string; data?: { [key: string]: unknown } }

/** A breadcrumb: its message, the URL of a fetch, both ends of a navigation, and a console call's arguments. */
export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B): B {
  const { data } = breadcrumb
  return {
    ...breadcrumb,
    ...(breadcrumb.message ? { message: scrubReportText(breadcrumb.message) } : {}),
    ...(data
      ? {
          data: {
            ...data,
            ...('url' in data ? { url: scrubMaybe(data.url) } : {}),
            ...('to' in data ? { to: scrubMaybe(data.to) } : {}),
            ...('from' in data ? { from: scrubMaybe(data.from) } : {}),
            ...(Array.isArray(data.arguments) ? { arguments: data.arguments.map(scrubArgument) } : {}),
          },
        }
      : {}),
  }
}

type ScrubbableEvent = {
  request?: { url?: string }
  message?: string
  transaction?: string
  exception?: { values?: { value?: string }[] }
  breadcrumbs?: ScrubbableBreadcrumb[]
}

/** A report as it leaves: its request URL, its message, its transaction name, every exception's message and breadcrumb. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  return {
    ...event,
    ...(event.request?.url ? { request: { ...event.request, url: scrubReportText(event.request.url) } } : {}),
    ...(event.message ? { message: scrubReportText(event.message) } : {}),
    ...(event.transaction ? { transaction: scrubReportText(event.transaction) } : {}),
    ...(event.exception?.values
      ? { exception: { ...event.exception, values: event.exception.values.map((v) => (v.value ? { ...v, value: scrubReportText(v.value) } : v)) } }
      : {}),
    ...(event.breadcrumbs ? { breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) } : {}),
  }
}

type ScrubbableTransaction = ScrubbableEvent & { spans?: { description?: string; data?: { [key: string]: unknown } }[] }

/** A transaction: everything an event has, and every span's description and URL (traced fetches name their URL). */
export function scrubTransaction<T extends ScrubbableTransaction>(event: T): T {
  return {
    ...scrubEvent(event),
    ...(event.spans
      ? {
          spans: event.spans.map((span) => ({
            ...span,
            ...(span.description ? { description: scrubReportText(span.description) } : {}),
            ...(span.data && 'url' in span.data ? { data: { ...span.data, url: scrubMaybe(span.data.url) } } : {}),
          })),
        }
      : {}),
  }
}

export { Sentry }
