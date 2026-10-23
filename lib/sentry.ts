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
/**
 * Every query parameter's value: a search term is somebody's words, and `token`, `code`, `key`, `signature` are secrets.
 * The names stay (they say what the request was).
 */
const QUERY_VALUE = /([?&][^=&#\s'"]+=)[^&#\s'"]*/g
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * Any text bound for a crash report — a URL, a message, a console line — with what identifies somebody taken out:
 * board ids (`scrubBoardUrl`, as before), invite tokens in the app's links and the API's, every query parameter's value,
 * and every uuid (a conversation, a room, an event, a person). The one scrubber: every hook below uses it.
 */
export function scrubReportText(text: string): string {
  return scrubBoardUrl(text)
    .replace(API_INVITE, '/friends/invite/:token')
    .replace(APP_INVITE, '/f/:token')
    .replace(QUERY_VALUE, '$1:redacted')
    .replace(UUID, ':id')
}

/** How deep `scrubDeep` goes: further down than any report nests (span data, contexts, a logged object), not forever. */
const SCRUB_DEPTH = 6

/**
 * Every string in a value, at any key, scrubbed, and every key with it: span data, contexts, extras and breadcrumb data are not ours to list.
 * Sentry's traced fetch alone writes `url`, `http.url` and `http.query` (search terms, tokens). Below `SCRUB_DEPTH`, or
 * in a cycle, the rest is dropped rather than sent unread.
 */
export function scrubDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubReportText(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= SCRUB_DEPTH) return '[scrubbed: too deep]'
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item, depth + 1))
  // Keys too: a map keyed by event id, a URL or an invite path is as telling as its values.
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) out[freeKey(out, scrubReportText(key))] = scrubDeep(item, depth + 1)
  return out
}

/** Two keys the same once scrubbed (two uuids are both `:id`) both stay: the second is `:id#2`, the third `:id#3`… */
function freeKey(taken: Record<string, unknown>, key: string): string {
  if (!(key in taken)) return key
  let n = 2
  while (`${key}#${n}` in taken) n += 1
  return `${key}#${n}`
}

const deep = <T,>(value: T): T => scrubDeep(value) as T

type ScrubbableBreadcrumb = { message?: string; data?: { [key: string]: unknown } }

/** A breadcrumb: its message, and every string in its data (a fetch's URL, a navigation's ends, console arguments). */
export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B): B {
  return {
    ...breadcrumb,
    ...(breadcrumb.message ? { message: scrubReportText(breadcrumb.message) } : {}),
    ...(breadcrumb.data ? { data: deep(breadcrumb.data) } : {}),
  }
}

type ScrubbableEvent = {
  request?: object
  message?: string
  transaction?: string
  exception?: { values?: { value?: string }[] }
  breadcrumbs?: ScrubbableBreadcrumb[]
  extra?: object
  contexts?: object
  tags?: object
}

/**
 * A report as it leaves: its message, transaction name and every exception's message; every string in its request,
 * extras (the logger's details), contexts (a transaction's trace data) and tags; and every breadcrumb.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  return {
    ...event,
    ...(event.request ? { request: deep(event.request) } : {}),
    ...(event.message ? { message: scrubReportText(event.message) } : {}),
    ...(event.transaction ? { transaction: scrubReportText(event.transaction) } : {}),
    ...(event.exception?.values
      ? { exception: { ...event.exception, values: event.exception.values.map((v) => (v.value ? { ...v, value: scrubReportText(v.value) } : v)) } }
      : {}),
    ...(event.breadcrumbs ? { breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) } : {}),
    ...(event.extra ? { extra: deep(event.extra) } : {}),
    ...(event.contexts ? { contexts: deep(event.contexts) } : {}),
    ...(event.tags ? { tags: deep(event.tags) } : {}),
  }
}

type ScrubbableTransaction = ScrubbableEvent & { spans?: { description?: string; data?: object }[] }

/** A transaction: everything an event has, and every span's description and every string in its data. */
export function scrubTransaction<T extends ScrubbableTransaction>(event: T): T {
  return {
    ...scrubEvent(event),
    ...(event.spans
      ? {
          spans: event.spans.map((span) => ({
            ...span,
            ...(span.description ? { description: scrubReportText(span.description) } : {}),
            ...(span.data ? { data: deep(span.data) } : {}),
          })),
        }
      : {}),
  }
}

export { Sentry }
