/**
 * API Client for Blendn Mobile App
 * Replaces direct Supabase calls with admin backend API calls
 */

import { roundCoordinate } from './coordinates'
import { markCheckIn } from './checkInTiming'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AttendancePayload, RsvpEventsPayload, SavedEventsPayload } from './savedEvents'
import type { PaywallEvent, PaywallTrigger } from './paywallPolicy'
import type { PlusStatus } from './plus'
import { noteBlocked } from './blockEpoch'
import { CONVERSATIONS_PAGE } from './conversationsPage'
import { namedList, type NamedList } from './namedList'
import * as SecureStore from 'expo-secure-store'
import { AppState, Platform } from 'react-native'
import { type ResponseHead, REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE, fetchWithTimeout, isTimeoutError, settleWithin } from './fetchTimeout'
import type { CityOption } from './city'
import { Logger } from './logger'
import { markOffline, markOnline } from './networkStatus'
import type { NotificationFeed } from './notificationFormat'
import { noteFriendGone } from './friendsGone'
import { FRIENDS_PAGE } from './friendsPaging'
import type { FriendInvite, FriendPerson, FriendProfile, FriendRequestsPayload, FriendsPayload, FriendState } from './friends'
import type { BoardPost, BoardReportReason, BoardRequestStatus, BoardRequests } from './board'
import type { Badge, Choice, Overlap, ProfileOptions } from './aboutYou'
import { reasonOf, SESSION_END_CODES } from './sessionEnd'
import { appBuildNumber, appVersionNumber } from './appVersion'
import { isUpdateRefusal, markUpdateRequired } from './updateRequired'
import { markSessionExpired, markSessionStarted } from './sessionEvents'
import { onCriticalPath } from './criticalPath'
import { noteServerDate, serverNow } from './serverClock'
import { msUntilExpiry, REFRESH_SKEW_MS } from './socketAuth'
import { getPushTokenRef, setPushTokenRef } from './pushTokenRef'
import type { ChatReaction } from './chatReactions'
import { SEARCH_TOO_SHORT, searchTermOf } from './searchTerm'

// API Configuration
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL
const EVENTS_LIST_SWR_TTL = 60 * 1000
const CHAT_LIST_SWR_TTL = 30 * 1000
const REQUESTS_SWR_TTL = 30 * 1000
const CHECKINS_SWR_TTL = 30 * 1000
const CATEGORIES_SWR_TTL = 10 * 60 * 1000
const PARTICIPANTS_SWR_TTL = 30 * 1000
/**
 * The oldest a cached answer is still shown while a fresh one is fetched. The cache is in memory for the app's life and an
 * expired entry was served at any age: a room's roster read hours earlier came back once as the room's people (rc7: iOS
 * Room info listed only the organiser of a room of 426, on an app left running through the drive). Past this, a read
 * waits for the server.
 */
export const SWR_STALE_LIMIT_MS = 5 * 60 * 1000

if (!API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL environment variable is not set. ' +
    'Please set it in your .env file (e.g., https://admin.blendn.app for production)'
  )
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'blendn_access_token'
const REFRESH_TOKEN_KEY = 'blendn_refresh_token'
const USER_KEY = 'blendn_user'
/**
 * "Signed out on this phone", in AsyncStorage (Opus review M2). AsyncStorage is its own native module, off Expo's shared
 * queue: written at sign-out before any await, it lands even when SecureStore's deletes are queued behind a stuck call and
 * the app is killed before they run. The launch honours it before restoring anything (`useAuth.initializeAuth`).
 */
const SIGNED_OUT_KEY = 'blendn_signed_out'

// Secure storage options
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'blendn.api.auth',
  requireAuthentication: false,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

/**
 * RequestQueue — priority-based concurrency limiter for API calls.
 *
 * WHY: The mobile API backend has rate limits and connection pooling constraints.
 * Firing dozens of concurrent requests (e.g. on app open) causes timeouts and
 * 503 errors. The queue serialises requests, respects a max-concurrent ceiling,
 * and lets high-priority calls (auth) jump the line.
 *
 * Priority values: lower number = higher priority (auth=1, mutations=3, queries=5).
 * Debounce: batch rapid simultaneous enqueues into a single processing tick.
 */
/** A page by the cursor the page before it handed over (keyset), or by number while the server has none. */
const pageQuery = (page: number, cursor?: string | null): string => (cursor ? `cursor=${encodeURIComponent(cursor)}` : `page=${page}`)

/**
 * How many requests are on the wire at once.
 *
 * Six was tuned for HTTP/1.1. Over HTTP/2 (Railway's edge) the requests share
 * one connection, and a launch burst of 10-12 reads with six slots queued the
 * second half behind the first: one extra ~200-250 ms round trip from Canada.
 */
export const MAX_CONCURRENT_REQUESTS = 10

export class RequestQueue {
  private queue: Array<{
    request: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
    priority: number
    timestamp: number
    type: 'query' | 'mutation' | 'auth'
  }> = []
  private processing = false
  private maxConcurrent = MAX_CONCURRENT_REQUESTS
  private currentRequests = 0
  private lastProcessTime = 0
  private debounceMs = 10
  private requestCount = 0
  private errorCount = 0

  async add<T>(
    request: () => Promise<T>,
    priority: number = 5,
    type: 'query' | 'mutation' | 'auth' = 'query'
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        request: request as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        priority,
        timestamp: Date.now(),
        type,
      })

      // Sort by priority (lower number = higher priority)
      this.queue.sort((a, b) => a.priority - b.priority)

      this.scheduleProcessing()
    })
  }

  private scheduleProcessing() {
    const now = Date.now()
    const timeSinceLastProcess = now - this.lastProcessTime

    if (timeSinceLastProcess < this.debounceMs) {
      setTimeout(() => this.processQueue(), this.debounceMs - timeSinceLastProcess)
    } else {
      this.processQueue()
    }
  }

  private async processQueue() {
    if (this.processing || this.currentRequests >= this.maxConcurrent || this.queue.length === 0) {
      return
    }

    this.processing = true
    this.lastProcessTime = Date.now()

    Logger.debug('api', `Processing queue: ${this.queue.length} pending, ${this.currentRequests} active`)

    while (this.queue.length > 0 && this.currentRequests < this.maxConcurrent) {
      const item = this.queue.shift()
      if (item) {
        this.currentRequests++
        this.executeRequest(item)
      }
    }

    this.processing = false
  }

  private async executeRequest(item: {
    request: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
    priority: number
    timestamp: number
    type: 'query' | 'mutation' | 'auth'
  }) {
    const requestId = ++this.requestCount
    const startTime = Date.now()

    try {
      Logger.debug('api', `Executing ${item.type} request #${requestId}`, {
        priority: item.priority,
        queueTime: startTime - item.timestamp,
      })

      const result = await item.request()

      Logger.debug('api', `Request #${requestId} completed`, {
        duration: Date.now() - startTime,
        type: item.type,
      })

      item.resolve(result)
    } catch (error) {
      this.errorCount++

      Logger.error('api', `Request #${requestId} failed`, {
        error,
        duration: Date.now() - startTime,
        type: item.type,
        errorRate: this.errorCount / this.requestCount,
      })

      item.reject(error)
    } finally {
      // Never below zero: a request that outlived clear() still ends here.
      this.currentRequests = Math.max(0, this.currentRequests - 1)
      setTimeout(() => this.processQueue(), 10)
    }
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.currentRequests,
      totalRequests: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
    }
  }

  clear() {
    Logger.warn('api', 'Clearing request queue', this.getStats())
    this.queue.forEach((item) => {
      item.reject(new Error('Request queue cleared'))
    })
    this.queue = []
    // currentRequests is deliberately NOT reset: what is on the wire stays on the
    // wire and still holds its slot until it settles. Zeroing it here (on every
    // background) let the count go negative as those requests finished, and so
    // admitted more than the ceiling afterwards.
    this.processing = false
  }
}

const requestQueue = new RequestQueue()

/** `?a=1&b=2` from the fields that are set, or '' when none are. */
function toQuery(params: object = {}): string {
  const searchParams = new URLSearchParams()
  for (const [key, raw] of Object.entries(params)) {
    // A `search` the server would refuse (under 2 characters, admin #751) is no search: never sent (`searchTermOf`).
    const value = key === 'search' ? searchTermOf(typeof raw === 'string' ? raw : null) : raw
    if (value === undefined || value === null) continue
    // A position never leaves in a URL at more than ~110 m (`lib/coordinates.ts`): the server logs query strings.
    searchParams.append(key, (key === 'lat' || key === 'lon') && typeof value === 'number' ? String(roundCoordinate(value)) : String(value))
  }
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

// expo-secure-store has no web implementation and always throws there, so on
// web we go straight to AsyncStorage (unencrypted) rather than eating a
// guaranteed failure on every call. Only warn once per session so this
// shows up in logs/Sentry without spamming every token read/write.
let warnedAboutWebStorage = false
function warnUnencryptedWebStorage(): void {
  if (warnedAboutWebStorage) return
  warnedAboutWebStorage = true
  Logger.warn('auth', 'Storing auth tokens in unencrypted AsyncStorage on web — expo-secure-store is unsupported on this platform')
}

/** A keychain call slower than this is logged (`keychain:slow`): the drive reads it from `log stream`. */
export const KEYCHAIN_SLOW_MS = 2000
/** A token refresh slower than this is logged (`refresh:slow`). */
export const REFRESH_SLOW_MS = 5000

function noteKeychain(op: 'get' | 'set', key: string, started: number): void {
  const ms = Date.now() - started
  if (ms > KEYCHAIN_SLOW_MS) Logger.warn('auth', 'keychain:slow', { op, key, ms })
}

/** What a bounded keychain read or refresh gives when it does not finish in time: never `null`, which reads as "signed out". */
export const TIMED_OUT = Symbol('timed out')
/**
 * A token read, on the fetch's own deadline. SecureStore runs on a native queue other modules share (SCRUM-754, SCRUM-733),
 * and a read stuck behind them held a request (and its queue slot) for good. Timed out is not `null`: a caller that treated it
 * as "no token" would clear the session and sign the person out over a slow keychain.
 */
const withinDeadline = <T,>(work: Promise<T>): Promise<T | typeof TIMED_OUT> => settleWithin<T | typeof TIMED_OUT>(work, REQUEST_TIMEOUT_MS, TIMED_OUT)

/** Sign-out waits this long for the keychain, not the request deadline: the person asked to leave, and a restored session's read can hang (SCRUM-733). */
export const SIGN_OUT_READ_MS = 3_000

/**
 * Which session the keychain holds: bumped by a stored sign-in (`keepSession`) and by every way out (`signOut`,
 * `signOutEverywhere`, `deleteAccount`). Work that started in one session never writes into the next (Opus review H1): a
 * refresh in flight across a sign-out does not store the rotated tokens (which would sign the old account back in on the
 * next launch, or overwrite the next account's).
 */
let sessionEpoch = 0
/**
 * A session begins, or the last one ends. Exported for the launch's signed-out marker (`useAuth.initializeAuth`), which
 * clears the keychain outside this module (re-review L2).
 */
export const nextSession = (): number => {
  // The last session's refresh guards are not this one's: a new sign-in is never told 'failed' for the old one's silence.
  lastProactiveRefreshAt = 0
  lastRefreshFailedAt = 0
  return ++sessionEpoch
}

/*
 * Why the reads stay on SecureStore's async API (RC drive D1). expo-secure-store's async functions have no `.runOnQueue`, so
 * they share Expo's one serial `AsyncFunctionQueue` with every module, the notification-permission read included. Its sync
 * API (`getItem` / `setItem`, native `getValueWithKeySync`) runs on the JS thread and never touches that queue: the one
 * supported way off it, without patching the module. Not taken: a keychain call on the JS thread freezes the UI for as long
 * as `securityd` takes, which trades a stuck sign-out for a frozen app, and there is no sync delete. The queue is protected
 * instead: permission reads wait for the critical path (`lib/criticalPath`), are made once and bounded (`lib/pushStatus`).
 *
 * And the session is kept in memory (RC drive 2 D-A): once the queue was stuck anyway (`usernotificationsd` wedged, a
 * permission read made after the grace), every authed request's token read waited behind it, and Me, Banter and Going all
 * read "Couldn't load". The keychain is read once, at the launch's restore, and written at sign-in and refresh; after that
 * every read is answered from memory, and the keychain is only persistence. Writes and deletes set memory before they are
 * queued, so memory is always the newest word: a sign-out empties it at once, whatever the queue is doing.
 */
// Token Storage
class TokenStorage {
  /**
   * What the keychain holds, as this process last read or wrote it. A key not here has not been read yet; `null` is known
   * empty. Only a read that succeeded fills it: a keychain that failed (locked, say) is asked again next time.
   */
  private static memory = new Map<string, string | null>()

  /** A new process (tests' relaunch): memory is gone, the keychain is what is left. */
  static forgetMemory(): void {
    this.memory.clear()
  }

  private static async secureGet(key: string): Promise<string | null> {
    if (this.memory.has(key)) return this.memory.get(key) ?? null
    const value = await this.readStored(key)
    // A write or a clear while the read was out is newer than what it found, and stays. The caller still gets what was
    // read: sign-out queues its reads ahead of its deletes so that the POST carries the session it is ending.
    if (value !== undefined && !this.memory.has(key)) this.memory.set(key, value)
    return value ?? null
  }

  /** The stored value, or `undefined` when the read failed (the fallback's answer, never remembered). */
  private static async readStored(key: string): Promise<string | null | undefined> {
    if (Platform.OS === 'web') {
      warnUnencryptedWebStorage()
      try {
        return await AsyncStorage.getItem(key)
      } catch {
        return undefined
      }
    }
    const started = Date.now()
    try {
      return await SecureStore.getItemAsync(key, SECURE_OPTIONS)
    } catch (error) {
      // Unexpected on native (e.g. keychain access failure) — fall back but
      // log it so it's visible in Sentry rather than silently swallowed.
      Logger.warn('auth', 'SecureStore read failed, falling back to AsyncStorage', { key, error })
      try {
        // A value written there by a failed keychain write is real; nothing there says nothing about the keychain.
        return (await AsyncStorage.getItem(key)) ?? undefined
      } catch {
        return undefined
      }
    } finally {
      noteKeychain('get', key, started)
    }
  }

  private static async secureSet(key: string, value: string): Promise<void> {
    this.memory.set(key, value)
    if (Platform.OS === 'web') {
      warnUnencryptedWebStorage()
      await AsyncStorage.setItem(key, value)
      return
    }
    const started = Date.now()
    try {
      await SecureStore.setItemAsync(key, value, SECURE_OPTIONS)
      // Clear from AsyncStorage if it was there
      try {
        await AsyncStorage.removeItem(key)
      } catch {}
    } catch (error) {
      Logger.warn('auth', 'SecureStore write failed, falling back to AsyncStorage', { key, error })
      await AsyncStorage.setItem(key, value)
    } finally {
      noteKeychain('set', key, started)
    }
  }

  private static async secureRemove(key: string): Promise<void> {
    this.memory.set(key, null)
    if (Platform.OS !== 'web') {
      try {
        await SecureStore.deleteItemAsync(key, SECURE_OPTIONS)
      } catch (error) {
        Logger.warn('auth', 'SecureStore delete failed', { key, error })
      }
    }
    try {
      await AsyncStorage.removeItem(key)
    } catch {}
  }

  static async getAccessToken(): Promise<string | null> {
    return this.secureGet(ACCESS_TOKEN_KEY)
  }

  static async setAccessToken(token: string): Promise<void> {
    return this.secureSet(ACCESS_TOKEN_KEY, token)
  }

  static async getRefreshToken(): Promise<string | null> {
    return this.secureGet(REFRESH_TOKEN_KEY)
  }

  static async setRefreshToken(token: string): Promise<void> {
    // A token stored is a token not yet refused (`refusedRefreshToken`).
    refusedRefreshToken = null
    return this.secureSet(REFRESH_TOKEN_KEY, token)
  }

  static async getUser(): Promise<AuthUser | null> {
    const userStr = await this.secureGet(USER_KEY)
    if (!userStr) return null
    try {
      return JSON.parse(userStr)
    } catch {
      return null
    }
  }

  static async setUser(user: AuthUser): Promise<void> {
    return this.secureSet(USER_KEY, JSON.stringify(user))
  }

  static async clearAll(): Promise<void> {
    await Promise.all([
      this.secureRemove(ACCESS_TOKEN_KEY),
      this.secureRemove(REFRESH_TOKEN_KEY),
      this.secureRemove(USER_KEY),
    ])
  }

  /** Mark this phone signed out (M2): called before any await at sign-out, so the write is issued whatever follows. */
  static markSignedOut(): void {
    AsyncStorage.setItem(SIGNED_OUT_KEY, '1').catch(() => {})
  }

  /** Whether a sign-out here may not have reached the keychain. Unreadable reads as no: never a reason to sign anyone out. */
  static async signedOutHere(): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(SIGNED_OUT_KEY)) === '1'
    } catch {
      return false
    }
  }

  /** The keychain is known clear, or holds a newer session: the marker goes. */
  static async forgetSignedOut(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SIGNED_OUT_KEY)
    } catch {}
  }

  static async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([this.setAccessToken(accessToken), this.setRefreshToken(refreshToken)])
    markSessionStarted()
  }
}

// Profile Cache - shared across components to avoid duplicate fetches
const PROFILE_CACHE_TTL = 60 * 1000 // 60 seconds
interface ProfileCacheEntry {
  data: OwnProfileEnvelope
  timestamp: number
  userId: string
}
let profileCache: ProfileCacheEntry | null = null

export const ProfileCache = {
  get(userId: string): OwnProfileEnvelope | null {
    if (!profileCache) return null
    if (profileCache.userId !== userId) return null
    if (Date.now() - profileCache.timestamp > PROFILE_CACHE_TTL) {
      profileCache = null
      return null
    }
    return profileCache.data
  },
  set(userId: string, data: OwnProfileEnvelope): void {
    profileCache = { data, timestamp: Date.now(), userId }
  },
  clear(): void {
    profileCache = null
  },
}

// API Response Types
/** What the presence endpoint answers. Mirrors the route's successResponse. */
/**
 * A match card. The server decides what is on it -- notably the identity rules,
 * which `rankMatches` enforces internally so no route and no client can forget
 * them.
 */
/**
 * What an RSVP can come back as.
 *
 * `waitlisted` is the one the app has never handled: you send `going`, a full
 * event answers `waitlisted`, and the UI showed "Going" anyway.
 */
/** Mirrors the route's enum exactly. `harassment` bypasses the average entirely. */
export type PeerRatingIssue = 'none' | 'uncomfortable' | 'no_show' | 'misrepresented' | 'harassment'

export type RsvpStatus = 'going' | 'maybe' | 'not_going' | 'waitlisted'

export interface MatchCard {
  userId: string
  /** Pseudonym unless they revealed for this event. Never the real name otherwise. */
  displayName: string
  /** Null unless they revealed. A photo identifies as surely as a name does. */
  photo: string | null
  /** Category NAMES, ready to render: "you both picked Techno and Board games". */
  sharedInterests: string[]
  /**
   * The shared subset only, so "Both here to network" is literally true.
   *
   * `dating` appears here only when the server has already checked mutual
   * compatibility, which is what lets the card say it without ever stating
   * anyone's gender. `just_here` never appears — "we are both merely present"
   * is not something to say to anybody.
   */
  sharedIntents: string[]
  /**
   * A label like "Design" — never a slug, never an employer.
   *
   * Null when they have not said, and null in rooms under eight people, where
   * an age, a city and a field of work together name one person. The server
   * applies that floor; the client only renders what arrives.
   */
  workField: string | null
  /**
   * Whether they work in *your* field — the SAME FIELD box on the card.
   *
   * Server-decided, and deliberately not derivable here. The obvious client
   * version — compare `workField` to your own profile — is wrong in exactly the
   * case the server is protecting: below eight people every `workField` is
   * suppressed to null, and a client deriving this from its own profile would
   * put back the attribute the floor withholds.
   *
   * Optional because a client can outlive the deploy that added it.
   */
  sharedWorkField?: boolean
  /** Nights you were both at, before this one. 0 when suppressed. */
  sharedEvents?: number
  /** Future events you are both going to, excluding this one. */
  sharedPlans?: number
  /**
   * Whole years, or null.
   *
   * **Not** suppressed in a small room, unlike `workField`: it is already public
   * on `/profiles/{userId}`, so withholding it here would only make the card
   * disagree with the profile one tap away.
   */
  age?: number | null
  insideNow: boolean
  youLiked: boolean
  /**
   * Matching v2: display-only lines you share, as sentences the server wrote
   * ("Both CSK — in RCB country 💛", "You both speak Malayalam"). Never a
   * ranking: the order of the deck is unchanged by them. At most one
   * origin-like line before a reveal, none in a small room — the server's
   * budget, never re-derived here. Optional: a client outlives a deploy.
   */
  overlaps?: Overlap[]
  /** Their own sign, "Leo ♌", only when they chose to show it and the card allows. */
  sign?: string | null
  /** "Regular here", "Shows up", "5+ nights this month" — earned by check-ins. */
  badges?: Badge[]
}

export interface LikeOutcome {
  mutual: boolean
  /** Present only on a mutual like -- the conversation it just opened. */
  conversationId?: string
  /**
   * Both pseudonyms, on a mutual like only.
   *
   * Connection Success draws a generated mark per person and `pseudonymAvatar`
   * is seeded on the pseudonym, so without these the sheet could not paint
   * without first fetching the conversation -- a round trip in the middle of
   * the one moment that should feel instant.
   */
  pseudonyms?: { you: string; them: string }
}

/**
 * The room from outside it: a number, and how many of them share your taste.
 *
 * `tasteMatchCount` is null under three people — "1 person here shares your
 * taste" in a room of two is that person — and blocked users are excluded
 * server-side, so neither number can be walked back to anybody.
 */
export interface RoomPreview {
  hereCount: number
  tasteMatchCount: number | null
}

/** Counts and whether *you* reacted — never who else did. */
export interface ReactionTally {
  emoji: string
  count: number
  mine: boolean
}

export { CHAT_REACTIONS, type ChatReaction } from './chatReactions'

export interface PresencePing {
  status: 'inside' | 'outside' | 'prompt' | 'checked_out' | 'not_checked_in'
  reason?: string
  shortfallMetres?: number | null
  graceEndsAt?: string | null
  nextPingInSeconds?: number
}

/** What a DM reply quotes; the name is the one you know them by (SCRUM-409). */
export interface DmReplyQuote {
  id: string
  senderName: string
  text: string | null
  mediaType: string | null
  /** Hidden by moderation. */
  unavailable: boolean
}

/** `GET /work-fields`: the coarse fields, and what someone does within each (the server's curated list, never free text). */
export interface WorkFieldsResponse {
  workFields: { slug: string; label: string }[]
  expertiseByField?: Record<string, { slug: string; label: string }[]>
  maxExpertise?: number
}

/**
 * A block that went through moves `lib/blockEpoch`, so every list loaded a page at a time starts over from the server,
 * which now leaves that person out. Here, in the client, so no route to a block (a card, a profile, a board post or ask,
 * a message request, a conversation) can forget it.
 */
function noteBlockedOn<T extends { success: boolean }>(result: T): T {
  if (result.success) noteBlocked()
  return result
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  /**
   * The server's machine-readable reason, when it sends one.
   *
   * `lib/api-response.ts` on the server emits `USER_MUTED`, `CHAT_LOCKED`,
   * `CHAT_CLOSED`, `SPAM_BLOCKED` and `RATE_LIMITED`, and this type had no
   * field to carry any of them — so every refusal arrived as prose that the
   * UI could only render as a generic failure. A muted user retried forever
   * with no idea they were muted.
   */
  errorCode?: string
  /**
   * The specific reason, when the server names one beside an `errorCode` that keeps its old value for builds in the
   * field: `ACCOUNT_SUSPENDED`, `ACCOUNT_STAFF`, `ACCOUNT_DELETED`, `PROFILE_INCOMPLETE`, `AGE_UNKNOWN`, `PASSWORD_RESET`,
   * `SESSION_REVOKED_ELSEWHERE`. Read `reasonCode ?? errorCode` (`reasonOf`, `lib/sessionEnd.ts`).
   */
  reasonCode?: string
  /**
   * Seconds until a `RATE_LIMITED` refusal lifts. `lib/rate-limit.ts` on the
   * server computes it and sends it both in the body and as `Retry-After`;
   * without it a screen that wants to disable a control has to guess how long
   * for, and a guess that is too short just earns another refusal.
   */
  retryAfter?: number
  /**
   * The room a refusal is about. `GET /events/:eventId/chat` answers
   * `LEFT_ROOM` with it, so a screen that only knew the event can still offer
   * the rejoin (`rejoinChatGroup`) without a second lookup.
   */
  chatGroupId?: string
  /** When an event's room opens: `GET /events/:eventId/chat` answers NOT_OPEN_YET (reasonCode) with it, to someone entitled. */
  opensAt?: string
  /**
   * The event a refusal hands off to. Go Live answers `EVENT_LIVE_HERE` with
   * it (`POST /venues/:venueId/live`): check in to that event instead.
   */
  eventId?: string
  /** The form field a refusal is about (`name`, `bio` on a crew); absent when it is the form's. */
  field?: string
  /**
   * A room that has closed, as the server names it to somebody who was in it (`ROOM_CLOSED` on the room's history, rc8
   * #6): its kind and its stored name, so a bare link to a closed Blend or crew chat is not called an event's room.
   */
  roomKind?: string
  roomName?: string
  errors?: Array<{ path: string; message: string }>
}

/**
 * Your own mute of a room's pushes — not the organiser's mute, which stops you
 * posting (`room_state` in the Banter). `until: null` while muted is "until I
 * turn it back on". Sent as `mute` on `GET /events/:eventId/chat` and on each
 * `GET /chat/groups` item.
 */
export interface RoomMute {
  muted: boolean
  until: string | null
}

/** Your rating of an event, or all nulls when you have not rated it. */
export interface MyEventRating {
  rating: number | null
  review: string | null
  ratedAt: string | null
}

/** Who sent an invite link, for somebody not signed in yet: a first name and a photo. */
export interface FriendInvitePreview {
  name: string
  photoUrl: string | null
}



/** One opening in a venue's week (`GET /venues/:venueId` `hours`). */
export type VenueOpening = { day: number; open: string; close: string }

export interface AuthUser {
  id: string
  email: string
  name: string | null
  image: string | null
  emailVerified: string | null
  createdAt: string
  /** What the account can sign in with, from `GET /auth/session` (the sign-in and refresh shapes do not carry it). */
  signInMethod?: 'password' | 'google' | 'apple'
  profile: {
    phone: string | null
    name: string | null
    age: number | null
    location: string | null
    interests: string[]
    onboarded: boolean
    /** Present on the sign-in and session shapes; `image` mirrors `photos[0]`. */
    photos?: string[]
  } | null
}

export interface PaginationMeta {
  page: number
  limit: number
  /** What the server sends: the count for these params, whatever the page. */
  totalCount: number
  totalPages: number
  hasMore?: boolean
}

/** Represents one event item as returned by the mobile API (camelCase). */
export interface EventApiItem {
  id: string
  slug: string
  title: string
  description: string | null
  shortDescription: string | null
  /** Snake-case alias (may appear in transformed data) */
  short_description?: string | null
  coverImageUrl: string | null
  cover_image_url?: string | null
  startTime: string
  start_time?: string
  endTime: string
  end_time?: string
  /**
   * The day "live" is judged by — see `lib/eventSession.ts`. Absent from an
   * older server; null when every day is cancelled.
   */
  session?: { startTime: string; endTime: string } | null
  /**
   * What moved under the people who had heard of the event (blendn-admin #716, `lib/event-change.ts`): when, which, and what
   * the time and place were before. null, [] and null for an event that has not changed. All absent from an older server
   * (`parseEventChange`).
   */
  changedAt?: string | null
  changedFields?: Array<'time' | 'venue' | 'cancelled'>
  changedFrom?: { startTime?: string; endTime?: string; venueName?: string | null; address?: string | null } | null
  /**
   * The days of the run and where `session` is in it (`parseEventDays`, blendn-admin #724): `days` is at most 31 of them from
   * `daysFrom` (1-based), while `dayCount` and `dayNumber` are the whole run. Absent from an older server.
   */
  days?: Array<{ date: string; startTime: string; endTime: string; cancelled: boolean; cancelledAt?: string | null }>
  dayCount?: number
  daysFrom?: number
  dayNumber?: number | null
  timezone: string
  status: string
  visibility: string
  /** The organiser's age floor (the detail route sends it): the Scene's Door tile and its "21+" pill. Absent from an older server. */
  minAge?: number | null
  /** `open`, `guest_list`, `members_only` or `invite_only` (`lib/scarcity.ts`). Absent from an older server. */
  doorPolicy?: string | null
  venueName: string | null
  venue_name?: string | null
  /**
   * The venue the event is linked to, `{ id, name }`, or null when its owner
   * disputed the link, it is archived, or there is none (then say `venueName`).
   * Absent from an older server.
   */
  venue?: { id: string; name: string } | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  postalCode: string | null
  latitude: number | null
  longitude: number | null
  maxCapacity: number | null
  max_capacity?: number | null
  currentCapacity: number
  current_capacity?: number
  checkInRadius: number
  check_in_radius?: number
  isFeatured: boolean
  /**
   * The placement behind a featured event (BUILD-SPEC C1): `promoted` (a paid placement) is labelled "Promoted", `editorial` is not.
   * Absent from a server that does not send it: `isFeatured` (the admin toggle) is all there is.
   */
  featured?: { kind: 'promoted' | 'editorial'; rank: number; by?: string | null } | null
  isRecurring: boolean
  externalLink: string | null
  createdAt: string
  distance: number | null
  isFavorited?: boolean
  favoriteCount?: number
  /** RSVPs going: the card's "{n} going". Absent from an older server. */
  goingCount?: number
  /** Inside now (the Room's rule: checked in, not left): every "N here now". Absent from an older server. */
  hereCount?: number
  /** Came: everybody who checked in, left or not ("attended"). Never "here now". */
  checkInCount?: number
  priceCents?: number
  price_cents?: number
  category?: string
  /** Gallery/media arrays */
  gallery?: string[]
  gallery_photos?: string[]
  pre_event_gallery?: string[]
  images?: string[]
  userCheckin?: {
    id?: string
    status?: string
    check_in_time?: string
    check_out_time?: string
    /** camelCase aliases from event list API */
    checkInId?: string
    checkInTime?: string
    checkOutTime?: string
  } | null
  interestedPreview?: Array<{ id: string; name: string | null; image: string | null }>
  interested_preview?: Array<{ id: string; name: string | null; image: string | null }>
  interestedUsers?: Array<{ id: string; name?: string | null; avatar?: string | null }>
  organizer?: {
    id?: string
    name?: string | null
    image?: string | null
    email?: string
  }
  /**
   * "Running this event? Claim it" — detail endpoint only. `{ url }` for a
   * curated event nobody has claimed, null otherwise (or absent from an older
   * server). The URL is the dashboard's public claim page; read it through
   * `claimUrlFrom`.
   */
  claim?: { url: string } | null
  details?: {
    fullDescription?: string
    houseRules?: string | null
    cancellationPolicy?: string | null
    additionalInfo?: unknown
    faq?: unknown
    accessibilityInfo?: unknown
  }
  categories?: Array<{
    id: string
    name: string
    slug: string
    icon?: string | null
    /**
     * The family this leaf belongs to, or null at top level.
     *
     * Events are tagged to leaves — "Classical and Carnatic", never "Music" —
     * so grouping by kind needs this rather than a guess at the leaf's name.
     */
    parent?: { id: string; name: string; slug: string } | null
  }>
  media?: Array<{
    id: string
    type: string
    url: string
    thumbnailUrl?: string | null
    title?: string | null
    order: number
  }>
  /**
   * Curated facilities. **Detail endpoint only** — the Pulse's cards draw none,
   * and `/events` is the hottest endpoint in the product, so the join is not
   * paid for on every list request.
   *
   * Already in the vocabulary's `sort_order`, which the server drops because
   * the array carries it. Do not re-sort: two events with the same facilities
   * must list them the same way.
   */
  amenities?: Array<{
    id: string
    name: string
    slug?: string | null
    subtitle?: string | null
    icon?: string | null
  }>
  chatGroup?: {
    id: string
    name: string
    status: string
    member_count?: number
    memberCount?: number
  }
  stats?: {
    /** Came: everybody who checked in, left or not ("attended"). Never "here now". */
    checkInCount?: number
    /** Inside now (the Room's rule): every "N here now". Absent from an older server. */
    hereCount?: number
    favoriteCount?: number
    /** Seats taken; the Scene's "Going" count before the doors. */
    rsvpCount?: number
    ratingCount?: number
    averageRating?: number | null
  }
  /** The list's own RSVP read (`GET /events`): your status on this event, null when none. Absent from an older server; the detail route's is `userStatus.rsvpStatus`. */
  rsvpStatus?: 'going' | 'maybe' | 'not_going' | 'waitlisted' | null
  userStatus?: {
    isFavorited?: boolean
    isCheckedIn?: boolean
    checkInStatus?: string | null
    checkInId?: string
    userRating?: number | null
    userReview?: string | null
    rsvpStatus?: 'going' | 'maybe' | 'not_going' | 'waitlisted' | null
  }
}

export interface EventsListResponse {
  events: EventApiItem[]
  pagination: PaginationMeta
  activeCheckins?: Array<{ id: string; eventId: string; status: string; [key: string]: unknown }>
  profile?: OwnProfileEnvelope
}

/** One place in the Places list — `GET /api/mobile/venues`. */
export interface VenueListItem {
  id: string
  name: string
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  venueType: string | null
  venueTypeLabel: string
  /** Kilometres from the `lat`/`lon` sent, or null. */
  distance: number | null
  /** The neighbourhood (§C4), named on a row's line in place of the street address. Absent from a server that does not send it. */
  area?: string | null
  upcomingEventCount: number
  /** How many are live here, as a bucket and never a number (D-19); null for somebody the venue page would refuse. */
  liveNow: 'quiet' | '5-9' | '10-19' | '20+' | null
  /**
   * Which stratum the server put the venue in (`?order=live`): live now, open tonight (an event tonight OR
   * its hours cover today) or quiet. Absent from a server that does not send it: the client then judges by
   * `liveNow` and `nextEvent` alone.
   */
  tier?: 'live' | 'open' | 'quiet'
  /**
   * Tonight's opening hours (§C6): wall-clock "HH:MM" strings in the venue's timezone ("18:00", "01:30"; a close at or
   * before the open is past midnight). "Open till" / "Opens" on an Open tonight card.
   * Absent from a server that does not send it: the card then shows its event line, or nothing.
   */
  tonight?: { opensAt: string; closesAt: string } | null
  nextEvent: {
    id: string
    title: string
    slug: string | null
    coverImageUrl: string | null
    startTime: string
    endTime: string
    /** The event's IANA zone (admin #749): its time is said in it. Absent from an older server: the phone's. */
    timezone?: string | null
  } | null
}

export interface VenuesListResponse {
  venues: VenueListItem[]
  /**
   * `order: 'live'` is the server saying it honoured `?order=live`: live now, then open tonight, then the
   * rest, so the strata are all in the first pages. Absent from a server that does not know it.
   */
  pagination: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean; order?: string }
  /** Read too where a server echoes it beside the list rather than in its paging. */
  order?: string
}

/** A page of a venue's coming events — `GET /api/mobile/venues/:venueId/upcoming`. */
export interface VenueUpcomingPage {
  /** As `VenueDetail`'s `upcoming`: no going count (SCRUM-743; admin `lib/venue-upcoming.ts` sends none). */
  events: { id: string; title: string; slug?: string | null; coverImageUrl?: string | null; startTime: string; endTime?: string | null; timezone?: string | null }[]
  pagination: { limit: number; hasMore: boolean; nextCursor: string | null; totalCount: number }
}

/** One venue — `GET /api/mobile/venues/:venueId`, as the place screen reads it. */
export interface VenueDetail {
  venue: {
    id: string
    name: string
    address: string | null
    city: string | null
    latitude: number | null
    longitude: number | null
    /** The venue_type key ("pub_bar"): which plate the page draws when tonight has no cover. */
    venueType?: string | null
    venueTypeLabel: string
    /** The venue's IANA zone (`venues.timezone`): its hours and its day are read in it, never the phone's. Absent from an older server. */
    timezone?: string | null
    /** False: "Own this place? Claim it" applies. */
    claimed: boolean
    /*
     * Not sent yet (the design's ⚑ fields, guidelines/places/fullpages.js). The
     * page draws each only when it is here and says nothing when it is not:
     * see docs/PLACES.md for the shapes asked of the server.
     */
    /** A fire-safety number: stated as a size, never as scarcity. */
    capacity?: number | null
    /** The venue day starts at this local hour; "Reset 06:00". */
    dayResetHour?: number | null
    /**
     * The week's opening hours as the server sends them (`venues.hours`, `lib/venue-hours.ts`): one row per opening,
     * `day` 0 (Sunday) to 6, wall-clock "HH:MM" in the venue's own timezone, a close at or before the open is past
     * midnight. Null: not given. Read through `tonightOpening`.
     */
    hours?: VenueOpening[] | null
    /** The owner's words about the place. */
    description?: string | null
    /** Good to know: the names of what the owner ticked (the server sends `string[]`, no ids). */
    amenities?: string[] | null
    /** Upcoming events here, soonest first: the server's first few (the page shows three), as it sends them, no going count; the rest are `getVenueUpcoming`'s. */
    upcoming?: { id: string; title: string; slug?: string | null; coverImageUrl?: string | null; startTime: string; endTime?: string | null; timezone?: string | null }[] | null
    /** How many there are in all, whatever `upcoming` holds. Absent from a server that does not send it. */
    upcomingTotal?: number | null
    /** Where `getVenueUpcoming` resumes after `upcoming`; null when `upcoming` is all of them. */
    upcomingNextCursor?: string | null
  }
  live: {
    /** Whether going live here would be accepted now, the fence aside. */
    open: boolean
    closedReason: 'event_live_here' | 'no_check_in_area' | null
    /** The event that has the place, when `closedReason` is `event_live_here`. */
    eventId: string | null
    liveNow: VenueListItem['liveNow']
    youAreLive: boolean
    /** Your window's end. Count down from this, never from a tap. */
    expiresAt?: string | null
    stay?: boolean
    venueDayId?: string | null
    chatGroupId?: string | null
    /** A "stay" window's hard end (4 hours from its start, cut at the day's reset); not sent yet. */
    stayUntil?: string | null
  }
  /**
   * The public claim page, when the place is unclaimed and the server offers
   * one (`{ url }`, built on the dashboard host). Read through `claimUrlFrom`.
   */
  claim?: { url?: unknown } | null
  tonight: { id: string; title: string; startTime: string; endTime: string; coverImageUrl?: string | null; timezone?: string | null } | null
}

/** `POST /api/mobile/venues/:venueId/live` — your window at a place. */
export interface GoLiveResult {
  venueDayId: string
  chatGroupId: string | null
  expiresAt: string
  stay: boolean
  stayUntil: string | null
  checkIn: { id: string; status: string; checkInTime: string }
  revealSuggestion: boolean
  intentNeeded: boolean
}

/** The fields of the nested `profile` object (`GET /profiles/:id`). */
export interface ProfileFields {
    /*
     * The five matching fields, declared because the editor needs to *show*
     * them, not just write them.
     *
     * They were always in the payload for your own profile -- the route spreads
     * `selfProfileFields`, the whole row minus `date_of_birth` -- and were
     * simply never typed or read, so `about-you` opened with every chip blank
     * whatever you had already chosen. The route's "withheld from everyone"
     * rule governs the *public* branch; self is the exception it is written
     * against.
     */
    intent_default?: ('dating' | 'networking' | 'friendship' | 'just_here')[]
    work_field?: string | null
    /** Your own profile only: the slugs you picked within the field (the route sends labels to everyone else). */
    expertise?: string[]
    gender?: 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say' | null
    orientations?: string[]
    interested_in?: ('woman' | 'man' | 'non_binary' | 'prefer_not_to_say')[]
    id?: string
    phone?: string
    name?: string
    age?: number
    location?: string
    bio?: string
    occupation?: string
    education?: string
    interests?: string[]
    photos?: string[]
    profile_photos?: string[]
    onboarded?: boolean
    goals?: string[]
    looking_for?: string[]
    /**
     * Returned to the owner only. Off means counted and not listed in any
     * room — the roster and the grid leave you out — and the room banner
     * says so (SCRUM-141).
     */
    show_online?: boolean
    /**
     * `GET /profiles/:id` (blendn-admin #716): what check-ins earned, for you and for anyone who may see who you are. Absent when
     * the person turned badges off, for a viewer the profile is anonymous to, and from an older server (`parseBadges`).
     */
    badges?: Badge[]
    /**
     * Your own profile only: `photos` in order, each `pulled: false`, then the photos moderation took down in the last 7 days,
     * `pulled: true` with `url: null` (the object is withdrawn) and `was_main`. Absent from an older server (`pulledPhotos`).
     */
    photo_states?: Array<{ url: string | null; pulled: boolean; pulled_at: string | null; was_main: boolean }>
    created_at?: string
    updated_at?: string
  }

/**
 * `GET /profiles/:id`: the NESTED shape. The profile is `data.profile`; a top-level `photos` or `name` is not here (that is
 * `GET /users/:id`, `PublicProfile`). Two endpoints used to share one type, which is how a top-level `photos` read compiled
 * against the wrong one (SYS-19, O1).
 */
export interface OwnProfileEnvelope {
  id?: string
  email?: string
  name?: string
  image?: string | null
  createdAt?: string
  /** Whether to offer "Add friend" (`parseFriendOffer`). */
  friend?: unknown
  profile?: ProfileFields | null
  /** The interests as structured rows (the editor's chips); `profile.interests` is the labels. */
  interests?: { id: string; name: string; slug: string; icon: string | null }[]
}

/**
 * `GET /users/:id`: the FLAT shape, what a profile page draws for anyone. Photos, bio and occupation are sent only when
 * `identityVisible` (the server's one answer to "revealed?").
 */
export interface PublicProfile {
  id?: string
  user_id?: string
  email?: string
  name?: string
  display_name?: string
  image?: string
  age?: number
  bio?: string
  location?: string
  occupation?: string
  education?: string
  interests?: Array<string | { id?: string; name?: string; slug?: string; icon?: string }>
  photos?: string[]
  profile_photos?: string[]
  goals?: string[]
  looking_for?: string[]
  memberSince?: string
  stats?: {
    eventsAttended: number
    eventsFavorited: number
    eventsOrganized: number
  }
  isOwnProfile?: boolean
  /**
   * `GET /users/:id` only: whether you may see who this is (`maySeeIdentity`).
   * The server's one answer to "revealed?"; photos, bio and occupation are
   * sent only when it is true. Absent from an older server — read as false.
   */
  identityVisible?: boolean
  onboarded?: boolean
  /**
   * `GET /users/:id` only: where you stand with them, decided by the server
   * (SCRUM-371). A profile opened from a room is keyed on an `rh_` handle,
   * which no conversation or request list carries, so the client cannot work
   * this out itself. Sent only when you may see who they are; absent
   * otherwise, and from an older server.
   */
  connection?: { conversationId: string | null; request: 'sent' | 'received' | null }
  /**
   * Whether to offer "Add friend" (SCRUM-750): `{ state, canAdd }`, read through `parseFriendOffer`. Top-level beside the
   * profile, as `badges` is: the profile page reads both from this one request.
   */
  friend?: unknown
  /** Their badges (`{ kind, label }[]`), top-level beside `friend` for whoever may see who they are; read through `parseBadges`. */
  badges?: unknown
}

/** @deprecated the flat `GET /users/:id` shape; name `PublicProfile`. Delete once `app/user/[id].tsx` imports the new name (SYS-19). */
export type UserProfileData = PublicProfile

export interface ChatMessageData {
  id: string
  chatGroupId?: string
  userId?: string
  content?: string
  type?: string
  createdAt?: string
  [key: string]: unknown
}

export interface CheckInResult {
  checkInId?: string
  check_in_id?: string
  status?: string
  checkedIn?: boolean
  checked_in?: boolean
  distanceMeters?: number
  distance_meters?: number
  message?: string
  /**
   * Offer to name them here. A **suggestion**, never a state.
   *
   * True when this account has `reveal_by_default` set. Check-in always creates
   * `revealed: false` — it used to seed from that default, which meant walking
   * into a room could name you — so this is the server handing back the
   * preference for the app to *ask* about. A tap applies it; anything else,
   * including killing the app, leaves them anonymous.
   */
  revealSuggestion?: boolean
  /**
   * Ask "why do you go out?" now, and save the answer as the default.
   *
   * True while `profiles.intent_default` is empty and this room has no answer
   * of its own. Onboarding never wrote the default, so every account that came
   * through it was refused the board for a field it was never asked. The app
   * asks at the first door and sends the answer with `rememberIntent: true`;
   * after that this is false everywhere.
   */
  intentNeeded?: boolean
  [key: string]: unknown
}

export interface EventChatData {
  chatGroupId?: string
  /** Your mute of this room's pushes. Absent from a server older than it. */
  mute?: RoomMute
  chatGroupName?: string
  id?: string
  name?: string
  /** The room's own state, `active` or `locked` (the organiser's lock), for everyone in it. */
  status?: string
  memberCount?: number
  /** You as this room names you (yours only). */
  you?: { pseudonym: string | null }
  /** This caller's answer to "may I write here": `reason` names their mute, ban or the room's state; `message` is the closed sentence. */
  write?: { allowed: boolean; reason: string | null; message: string | null; closesAt?: string | null; eventEndedAt?: string | null }
  [key: string]: unknown
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthResult {
  user: AuthUser
  accessToken: string
  refreshToken: string
  isNewUser?: boolean
}

// Token refresh state
let refreshPromise: Promise<RefreshOutcome> | null = null

/**
 * `rejected` is the server saying no; `failed` is the request not completing
 * — a timeout or a dropped connection. They used to be one `false`, and the
 * 401 path cleared the session on either. Driven on an emulator: one refresh
 * timed out while the server had already rotated, and thirty minutes in the
 * app was at the sign-in screen. A refresh that did not complete leaves the
 * tokens alone; the next 401 tries again, and the server re-issues on a
 * replay inside its grace window.
 */
export type RefreshOutcome = 'ok' | 'rejected' | 'failed'

/**
 * After a refresh that never completed: try again at 2 s, 5 s and 10 s, in
 * the background, then stop until the next 401.
 *
 * A lost response is the case the server's grace window exists for — it
 * re-issues on a replay of the old token for twenty minutes, provided the
 * successor was never used. Waiting for the next tap to present that token
 * (which could be an hour later, on the walk home) is what left a phone at
 * the sign-in screen overnight. The caller that hit the failure is told the
 * transport failed, as before; the recovery just no longer waits for them.
 */
/** What a request that failed for no reason we can name says to a person. */
const GENERIC_FAILURE_MESSAGE = 'Something went wrong. Try again.'
/** An authed request with no session behind it (signed out, or the session it was made in has ended). */
const NOT_SIGNED_IN_MESSAGE = 'You’re not signed in.'

export const REFRESH_RETRY_DELAYS_MS = [2000, 5000, 10000] as const
/** The whole refresh: the keychain read and the fetch, each on the fetch deadline. */
export const REFRESH_DEADLINE_MS = 2 * REQUEST_TIMEOUT_MS
/**
 * At most one *proactive* refresh per this window.
 *
 * A phone whose clock is wrong reads every token as dead. `serverNow()` corrects
 * for that once any response has carried a `Date` header, but the very first
 * request has none, and a token that is genuinely short-lived would otherwise
 * refresh on every call. The 401 path is not rate-limited by this: it only
 * governs refreshing *before* we know the token is bad.
 */
const PROACTIVE_REFRESH_MIN_GAP_MS = 30_000
let lastProactiveRefreshAt = 0
/**
 * When a refresh last came back 'failed' (the server never answered), or 0.
 *
 * On a cold start against a hung server the proactive refresh times out, then the
 * session read, then the launch path asked for a refresh again: a third deadline
 * for the same silence. `refreshSessionOutcome` reads this and does not ask again
 * inside the window; the background retries and the 401 path still do.
 */
const FAILED_REFRESH_COOLDOWN_MS = 10_000
let lastRefreshFailedAt = 0
/**
 * The refresh token the server last refused (401/403). It is dead: a launch that
 * refreshed it ahead of `/auth/session` asked again from that request's 401 and
 * sent it twice (drive 2026-10-27). Asked about it again, the answer is the same.
 */
let refusedRefreshToken: string | null = null
let refreshRetryAttempt = 0
let refreshRetryTimer: ReturnType<typeof setTimeout> | null = null
/** The server's sentence from the last rejected refresh, if it gave one. */
let rejectedReason: string | undefined
/** The refresh's `errorCode` when it is one of the reasons the server names (`lib/sessionEnd.ts`), 401 or 403. */
let rejectedCode: string | undefined

// API Client Class
/** The Android channel set this build creates (lib/notifications): 2 = the Flow 9 channels. Bump with the set. */
export const PUSH_CHANNEL_SET = 2

/**
 * The first page each paged list asks for (admin #724: `?limit=` 1-100, `pagination.nextCursor` for the next). With no
 * `limit` and no `cursor` the server answers in its legacy mode for installed builds; new code always says how many.
 * Friends and the requests page on by `pagination.nextCursor` (`lib/friendsPaging.ts`); `count` stays the whole list.
 */
export const LIST_PAGE = { conversations: CONVERSATIONS_PAGE, friends: FRIENDS_PAGE, friendRequests: 50, blocked: 100 } as const

/**
 * Said on every request, from the one constant the push token posts: a build that knows `event_changed` declares it, and
 * `GET /notifications` serves a build that does not the old `event_update` row so its tap opens the event (blendn-admin #716,
 * SCRUM-739). Web sends it too: the server's CORS allow-list names `X-Channel-Set`.
 */
export const CHANNEL_SET_HEADER = { 'X-Channel-Set': String(PUSH_CHANNEL_SET) } as const

/** `X-App-Build` and `X-App-Platform`: the build number the server's per-build minimum judges (SYS-14). Nothing when the build has no plain number. */
function buildHeaders(): Record<string, string> {
  const build = appBuildNumber()
  return build ? { 'X-App-Build': build, 'X-App-Platform': Platform.OS } : {}
}

class ApiClientClass {
  private baseUrl: string
  private inFlight = new Map<string, Promise<ApiResponse<unknown>>>()
  /**
   * Bumped by `forgetEventMatches`. A response to a request sent before the
   * bump answers an older question than the event that forgot it, so it is
   * returned to its caller but not cached.
   *
   * ponytail: one counter for every key, so a forget also stops unrelated reads
   * in flight at that moment from caching — each costs one extra fetch later.
   * Per-key epochs if that ever shows up.
   */
  private cacheEpoch = 0
  private responseCache = new Map<string, { data: ApiResponse<unknown>; timestamp: number; ttl: number }>()

  /**
   * The ceiling on `responseCache`.
   *
   * It had none. Entries were added on every cached GET, never evicted -- an
   * expired entry is still *returned* as stale-and-refresh rather than deleted,
   * so nothing removed anything -- and `clearResponseCache()` had no callers. The map
   * grew for the lifetime of the process, holding a full response body per
   * distinct request key, and the keys include query strings, so browsing with
   * filters mints a new one on every combination.
   *
   * 500, matching `lib/queryCache.ts` in this same directory, which has had a
   * bound and an eviction pass since it was written. The fix was one file over.
   */
  private readonly MAX_CACHED_RESPONSES = 500

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private buildRequestKey(endpoint: string, options: RequestInit, requireAuth: boolean): string {
    const method = (options.method || 'GET').toUpperCase()
    const body = options.body ? String(options.body) : ''
    return `${method}:${requireAuth ? 'auth' : 'anon'}:${endpoint}:${body}`
  }

  private getCached<T>(key: string): { data: ApiResponse<T>; isFresh: boolean; tooOld: boolean } | null {
    const entry = this.responseCache.get(key)
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    return { data: entry.data as ApiResponse<T>, isFresh: age < entry.ttl, tooOld: age > SWR_STALE_LIMIT_MS }
  }

  /**
   * Drop the cached `/checkins/active`, so the next read asks the server.
   *
   * Called after a check-in or check-out (`lib/checkIn.ts`). The list is SWR-
   * cached for 30s, so without this the tab bar's re-read right after leaving a
   * room was answered from the cache that still had you in it.
   */
  forgetActiveCheckins(): void {
    this.forgetMatching((key) => key.includes(':/api/mobile/checkins/active:'))
  }

  /**
   * Drop what is known about places' detail, so the next `getVenue` asks the
   * server. Not cached, but a read already on the wire was answered before
   * the change (a Go Live, an extend, `live:ended`) and must not be joined.
   */
  forgetVenues(): void {
    this.forgetMatching((key) => /:\/api\/mobile\/venues\/[^/:?]+:/.test(key))
  }

  /**
   * Forget every cached and in-flight read `matches` picks, and make a read
   * that started before now unable to refill the cache — `forgetEventMatches`'s
   * rule, for every list a change makes stale (step 5 review, H2).
   */
  private forgetMatching(matches: (key: string) => boolean): void {
    this.cacheEpoch++
    for (const key of this.responseCache.keys()) if (matches(key)) this.responseCache.delete(key)
    for (const key of this.inFlight.keys()) if (matches(key)) this.inFlight.delete(key)
  }

  /**
   * Drop the cached detail of one event, so the next `getEvent` asks the server.
   *
   * Called after a check-in or check-out (`lib/checkIn.ts`). The detail carries
   * `userStatus.isCheckedIn` and is SWR-cached, and SWR serves an expired entry
   * as-is while it refreshes in the background — so the event screen's re-read
   * right after a check-in got the pre-check-in answer and put "Blend in" back
   * over the optimistic "You're in". Only the detail itself, with any query:
   * `/events/:id?include=…`, not `/events/:id/checkins`.
   */
  forgetEvent(eventId: string): void {
    const detail = `:/api/mobile/events/${eventId}`
    for (const key of this.responseCache.keys()) {
      if (key.includes(`${detail}:`) || key.includes(`${detail}?`)) this.responseCache.delete(key)
    }
  }

  /**
   * Drop one room's cached matches, so the next `getEventMatches` asks the server.
   *
   * Called when somebody checks in or out of that room (`lib/socketClient.ts`).
   * The event marks the room dirty, and the sync that follows read the
   * 30-second SWR entry from before it — which put somebody who had just walked
   * back in down as "Was here" again (SCRUM-502).
   *
   * The room's preview goes too: it is the same question asked as a number.
   * That sync also re-seeds the Room's "here now" from `getRoomPreview`, whose
   * 15-second entry still held the count from before the event, and put it
   * back over the `hereCount` the event had just set. The open Room stayed at
   * 7 while the database said 4 (SCRUM-617).
   */
  forgetEventMatches(eventId: string): void {
    const room = `:/api/mobile/events/${eventId}`
    // A read already on the wire was answered before the event: the next one
    // must not join it.
    this.forgetMatching((key) =>
      key.includes(`${room}/matches:`) || key.includes(`${room}/matches?`) || key.includes(`${room}/room-preview:`))
  }

  private setCache<T>(key: string, data: ApiResponse<T>, ttl: number) {
    if (this.responseCache.size >= this.MAX_CACHED_RESPONSES) this.evictExpiredOrOldest()
    this.responseCache.set(key, { data: data as ApiResponse<unknown>, timestamp: Date.now(), ttl })
  }

  /**
   * Make room. Expired entries first, then the oldest.
   *
   * Expired-first matters because an expired entry is still *served* here (as
   * stale, while a refresh runs), so the map is mostly entries nobody would
   * miss. Dropping those before touching anything live means the common case
   * costs a caller nothing.
   *
   * Map preserves insertion order, so the first key is the oldest inserted --
   * the same property `queryCache.evictOldest` relies on. Insertion order, not
   * access order: this is not an LRU, and a true one would need a re-insert on
   * every read for a gain this does not need.
   */
  private evictExpiredOrOldest(): void {
    const now = Date.now()
    let freed = 0
    for (const [key, entry] of this.responseCache) {
      if (now - entry.timestamp > entry.ttl) {
        this.responseCache.delete(key)
        freed++
      }
    }
    if (freed > 0) return

    // Nothing had expired, so drop a tenth of the oldest rather than one entry
    // -- evicting a single key on a full cache means paying this scan on every
    // subsequent write.
    const drop = Math.max(1, Math.floor(this.MAX_CACHED_RESPONSES / 10))
    let dropped = 0
    for (const key of this.responseCache.keys()) {
      this.responseCache.delete(key)
      if (++dropped >= drop) break
    }
  }

  private refreshCacheInBackground<T>(endpoint: string, key: string, ttl: number) {
    const epoch = this.cacheEpoch
    this.queuedRequest<T>(endpoint).then((result) => {
      if (result.success && epoch === this.cacheEpoch) {
        this.setCache(key, result, ttl)
      }
    }).catch(() => {})
  }

  private buildErrorMessage(
    response: ResponseHead,
    payload: unknown,
    endpoint: string
  ): string {
    if (payload && typeof payload === 'object') {
      const anyPayload = payload as {
        error?: string
        message?: string
        errors?: Array<{ message?: string }>
      }
      if (anyPayload.error) return anyPayload.error
      if (anyPayload.message) return anyPayload.message
      if (Array.isArray(anyPayload.errors) && anyPayload.errors.length > 0) {
        const first = anyPayload.errors.find((err) => err?.message)
        if (first?.message) return first.message
      }
    }
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    return `HTTP ${response.status}${statusText} (${endpoint})`
  }

  private async parseResponse<T>(
    response: ResponseHead,
    raw: string,
    endpoint: string
  ): Promise<ApiResponse<T>> {
    // A Go Live counts down to the server's clock, not this phone's (lib/serverClock.ts).
    noteServerDate(response.headers?.get?.('date'))
    if (!raw) {
      if (response.ok) {
        return { success: true } as ApiResponse<T>
      }
      if (isUpdateRefusal(response.status, undefined)) markUpdateRequired()
      return { success: false, error: this.buildErrorMessage(response, null, endpoint) }
    }

    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      if (response.ok) {
        return { success: true, data: raw as unknown as T }
      }
      return {
        success: false,
        error: `Invalid JSON response (${response.status}) (${endpoint})`,
      }
    }

    if (!response.ok) {
      // A build the server no longer serves: the whole app says so (Flow 15 15.14), not this one screen.
      if (
        isUpdateRefusal(
          response.status,
          reasonOf({
            errorCode: typeof parsed.errorCode === 'string' ? parsed.errorCode : undefined,
            reasonCode: typeof parsed.reasonCode === 'string' ? parsed.reasonCode : undefined,
          })
        )
      )
        markUpdateRequired()
      return {
        success: false,
        // Carried through so a screen can branch on the reason rather than
        // guess from the sentence. See ApiResponse.errorCode.
        errorCode: typeof parsed.errorCode === 'string' ? parsed.errorCode : undefined,
        ...(typeof parsed.reasonCode === 'string' ? { reasonCode: parsed.reasonCode } : {}),
        // Body first, then the header, because only the body survives a proxy
        // that strips Retry-After.
        retryAfter: typeof parsed.retryAfter === 'number'
          ? parsed.retryAfter
          : Number(response.headers.get('Retry-After')) || undefined,
        ...(typeof parsed.chatGroupId === 'string' ? { chatGroupId: parsed.chatGroupId } : {}),
        ...(typeof parsed.opensAt === 'string' ? { opensAt: parsed.opensAt } : {}),
        ...(typeof parsed.eventId === 'string' ? { eventId: parsed.eventId } : {}),
        ...(typeof parsed.field === 'string' ? { field: parsed.field } : {}),
        ...(typeof parsed.roomKind === 'string' ? { roomKind: parsed.roomKind } : {}),
        ...(typeof parsed.roomName === 'string' ? { roomName: parsed.roomName } : {}),
        error: this.buildErrorMessage(response, parsed, endpoint),
        errors: parsed?.errors as Array<{ path: string; message: string }> | undefined,
      }
    }

    if (parsed && typeof parsed === 'object' && 'success' in parsed) {
      return parsed as unknown as ApiResponse<T>
    }

    return { success: true, data: parsed as T }
  }

  /**
   * The access token to send, refreshed first if it is about to die.
   *
   * Tokens live 15 minutes, so a cold start or a resume after that sent the
   * stale one, took a 401 (a full round trip, ~200-250 ms from Canada), then
   * refreshed and retried; on foreground four or five requests each burned
   * their own. Reading the expiry costs nothing. A token whose expiry cannot be
   * read is sent as is: the server decides, and the 401 path below still
   * recovers it. Awaiting an in-flight refresh also stops a request that read
   * the old token just before it rotated from 401ing after the refresh settles
   * and starting a second rotation.
   */
  private async freshAccessToken(): Promise<string | null | typeof TIMED_OUT> {
    if (refreshPromise) await refreshPromise
    const token = await withinDeadline(TokenStorage.getAccessToken())
    if (token === TIMED_OUT) return token
    const remaining = msUntilExpiry(token, serverNow())
    if (remaining === null || remaining > REFRESH_SKEW_MS) return token
    // A refresh begun since we read the token is joined, whatever the guard says.
    const now = Date.now()
    if (!refreshPromise) {
      // Read again: the refresh that set the guard may have landed since `token` was read.
      if (now - lastProactiveRefreshAt < PROACTIVE_REFRESH_MIN_GAP_MS) return withinDeadline(TokenStorage.getAccessToken())
      lastProactiveRefreshAt = now
    }
    // 'failed' / 'rejected': send what we have; the 401 path decides what that means.
    await this.refreshTokens()
    return withinDeadline(TokenStorage.getAccessToken())
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`
    const method = (options.method || 'GET').toUpperCase()
    const isGet = method === 'GET'
    // Only retry safe read-only requests to avoid duplicate mutations
    const MAX_RETRIES = isGet ? 2 : 0
    // Out of the queue and about to go: the check-in's clock (lib/checkInTiming.ts).
    if (!isGet && /^\/api\/mobile\/events\/[^/]+\/checkin$/.test(endpoint)) markCheckIn('sent')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Which build is asking, so the server can refuse one it no longer serves (Flow 15 15.14). Not from the web build, which has no native build number to judge (the server's CORS allow-list names this header and `X-Channel-Set`, so a preflight is no reason).
      ...(Platform.OS !== 'web' ? { 'X-App-Version': appVersionNumber(), ...buildHeaders() } : {}),
      ...CHANNEL_SET_HEADER,
      ...(options.headers as Record<string, string>),
    }

    // The session this request was made in, and whether it carried a token at all (M1): see the 401 below.
    const epoch = sessionEpoch
    let sentToken = false
    if (requireAuth) {
      const accessToken = await this.freshAccessToken()
      // The keychain did not answer: a transport-shaped failure, tried again on the next call. Never sent unauthenticated.
      if (accessToken === TIMED_OUT) return { success: false, error: TIMEOUT_MESSAGE }
      // The session ended while the refresh was out (a sign-out, another sign-in): never sent with the next one's token (H1).
      if (epoch !== sessionEpoch) return { success: false, error: NOT_SIGNED_IN_MESSAGE }
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
        sentToken = true
      }
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        /*
         * Jittered, not deterministic.
         *
         * `800 * 2^(n-1)` alone means every client that got a 5xx retries at
         * exactly +800ms and +2400ms — a synchronised herd arriving at a server
         * that is already unwell, which is how a blip becomes an outage. The
         * half-to-full-window spread breaks the lockstep without changing the
         * shape of the backoff.
         */
        const ceiling = Math.min(800 * Math.pow(2, attempt - 1), 6000)
        const delay = Math.round(ceiling * (0.5 + Math.random() * 0.5))
        Logger.debug('api', `Retry ${attempt}/${MAX_RETRIES} for ${endpoint} in ${delay}ms`)
        await new Promise<void>((resolve) => setTimeout(resolve, delay))
      }

      try {
        // Every fetch in this class goes through fetchWithTimeout. A deadline
        // on the first call alone still hangs the queue on the other two.
        const { response, body } = await fetchWithTimeout(url, { ...options, headers })

        // Handle 401 - try to refresh token
        if (response.status === 401 && requireAuth) {
          /*
           * Not this request's session to refresh or to end (Opus review M1): it ended while the request was out (a sign-out
           * the person chose, another sign-in), or the request carried no token because nobody is signed in. Either way a
           * refusal here is not a session the server ended, and must never write "You were signed out".
           */
          if (epoch !== sessionEpoch || !sentToken) return { success: false, error: NOT_SIGNED_IN_MESSAGE }
          const refreshed = await this.refreshTokens()
          if (refreshed === 'ok') {
            const newAccessToken = await withinDeadline(TokenStorage.getAccessToken())
            if (newAccessToken === TIMED_OUT) return { success: false, error: TIMEOUT_MESSAGE }
            if (newAccessToken) {
              headers['Authorization'] = `Bearer ${newAccessToken}`
            }
            const retry = await fetchWithTimeout(url, { ...options, headers })
            return this.parseResponse<T>(retry.response, retry.body, endpoint)
          }
          if (refreshed === 'failed') {
            // Not signed out: the server never answered. Reported as the
            // transport problem it is, and tried again on the next call.
            return { success: false, error: TIMEOUT_MESSAGE }
          }
          await TokenStorage.clearAll()
          markSessionExpired(rejectedReason, rejectedCode)
          rejectedReason = undefined
          rejectedCode = undefined
          return { success: false, error: 'Session expired. Please sign in again.' }
        }

        // Retry on 5xx server errors for GET requests only
        if (isGet && response.status >= 500 && attempt < MAX_RETRIES) {
          Logger.warn('api', `Server error ${response.status}, retrying`, { endpoint, attempt })
          continue
        }

        const result = await this.parseResponse<T>(response, body, endpoint)
        if (result.success) markOnline()
        return result
      } catch (error) {
        const isNetworkError = error instanceof TypeError
        if (isNetworkError && attempt < MAX_RETRIES) {
          Logger.warn('api', `Network error, retry ${attempt + 1}/${MAX_RETRIES}`, { endpoint })
          continue
        }

        Logger.error('api', 'Request failed', { endpoint, error })
        if (isNetworkError) {
          markOffline()
          return {
            success: false,
            error: 'No internet connection. Check your network and try again.',
          }
        }
        /*
         * A timeout is not "no internet" and must not be reported as one.
         *
         * The device is online — something upstream accepted the connection and
         * went quiet. Telling someone to check their wifi when their wifi is
         * fine sends them to fix the wrong thing, and `markOffline()` would put
         * the whole app into an offline state on the strength of one slow
         * endpoint.
         */
        if (isTimeoutError(error)) {
          return { success: false, error: TIMEOUT_MESSAGE }
        }
        /*
         * A sentence for a person, not the exception or the route. This
         * string reaches toasts and error lines as-is, and it used to read
         * "Network error (/api/mobile/events/…)" or a raw JS message. The
         * endpoint and the error are in the log line above.
         */
        return { success: false, error: GENERIC_FAILURE_MESSAGE }
      }
    }

    Logger.error('api', 'Request failed after retries', { endpoint })
    return { success: false, error: GENERIC_FAILURE_MESSAGE }
  }

  private async refreshTokens(): Promise<RefreshOutcome> {
    // If a refresh is already in flight, join it — don't start a second one.
    // We return the existing promise so all concurrent callers share one result.
    if (refreshPromise) {
      return refreshPromise
    }

    // Store promise BEFORE any await so concurrent callers see it immediately.
    const started = Date.now()
    // The session this refresh is for: once it has ended (a sign-out, another sign-in), what it gets is not stored (H1).
    const epoch = sessionEpoch
    const work: Promise<RefreshOutcome> = (async () => {
      try {
        const refreshToken = await withinDeadline(TokenStorage.getRefreshToken())
        // A keychain that did not answer is not a missing token: 'failed', tried again, never the sign-out a 'rejected' is.
        if (refreshToken === TIMED_OUT) return 'failed'
        if (!refreshToken || refreshToken === refusedRefreshToken) {
          return 'rejected'
        }

        // Deliberately on a deadline too. A hung refresh is the worst version
        // of this bug: `refreshPromise` gates every other caller behind one
        // promise, so a single stalled refresh silently blocks re-auth for the
        // whole app until it is killed.
        const { response, body: raw } = await fetchWithTimeout(`${this.baseUrl}/api/mobile/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...CHANNEL_SET_HEADER },
          body: JSON.stringify({ refreshToken }),
        })

        if (!response.ok) {
          // 5xx is the server being unwell, not the token being bad.
          if (response.status >= 500) return 'failed'
          // A 403 is the server saying why — suspended, or a staff account
          // in the attendee app. Keep the sentence for the entry screen.
          if (response.status === 403) {
            try {
              const body = JSON.parse(raw) as { error?: unknown; errorCode?: unknown; reasonCode?: unknown }
              if (typeof body?.error === 'string') rejectedReason = body.error
              const code = reasonOf({
                errorCode: typeof body?.errorCode === 'string' ? body.errorCode : undefined,
                reasonCode: typeof body?.reasonCode === 'string' ? body.reasonCode : undefined,
              })
              if (code) rejectedCode = code
            } catch {}
          } else if (response.status === 401) {
            // A 401's sentence ("Invalid or expired refresh token") is not for a person; only a named reason is kept.
            try {
              const body = JSON.parse(raw) as { errorCode?: unknown; reasonCode?: unknown }
              const code = reasonOf({
                errorCode: typeof body?.errorCode === 'string' ? body.errorCode : undefined,
                reasonCode: typeof body?.reasonCode === 'string' ? body.reasonCode : undefined,
              })
              if (code && code in SESSION_END_CODES) rejectedCode = code
            } catch {}
          }
          refusedRefreshToken = refreshToken
          return 'rejected'
        }

        const data: ApiResponse<{ accessToken: string; refreshToken: string }> = JSON.parse(raw)

        if (data.success && data.data) {
          if (epoch !== sessionEpoch) {
            // The session it was for is over: storing these would sign that account back in. Not a refusal either.
            Logger.info('api', 'refresh:stale', { reason: 'session ended while it was in flight' })
            return 'failed'
          }
          /*
           * In memory now, before anything else runs, so every request from here sends them; the keychain is written behind
           * (RC drive 2 D-A). Awaited, a native queue stuck behind another module failed the refresh and every request after.
           */
          void TokenStorage.setTokens(data.data.accessToken, data.data.refreshToken).catch((error) =>
            Logger.warn('auth', 'Refreshed tokens not persisted', { error }))
          return 'ok'
        }

        return 'rejected'
      } catch (error) {
        Logger.error('api', 'Token refresh failed', { error })
        return 'failed'
      }
    })()
    /*
     * Bounded as a whole: the token read, the fetch and the write each on its deadline, and the lot within REFRESH_DEADLINE_MS.
     * A refresh that hung kept `refreshPromise` set, and every later 401 joined the dead promise for good. Timed out it is
     * 'failed' and the promise is released (below); the work, if it ever lands, still stores what the server sent.
     */
    // On the critical path (D1): no notification-permission read is queued ahead of the token write.
    const p: Promise<RefreshOutcome> = onCriticalPath(() => settleWithin(work, REFRESH_DEADLINE_MS, 'failed'))

    refreshPromise = p

    // Reset flags after all awaiting callers have received the result (next microtask).
    p.finally(() => {
      refreshPromise = null
    })
    p.then((outcome) => {
      const ms = Date.now() - started
      if (ms > REFRESH_SLOW_MS) Logger.warn('api', 'refresh:slow', { ms, outcome })
    })

    p.then((outcome) => {
      lastRefreshFailedAt = outcome === 'failed' ? Date.now() : 0
      if (outcome !== 'failed') {
        refreshRetryAttempt = 0
        return
      }
      const delay = REFRESH_RETRY_DELAYS_MS[refreshRetryAttempt]
      if (delay === undefined) {
        refreshRetryAttempt = 0
        return
      }
      refreshRetryAttempt += 1
      if (refreshRetryTimer) clearTimeout(refreshRetryTimer)
      Logger.info('api', `Refresh did not complete; retrying in ${delay}ms`)
      refreshRetryTimer = setTimeout(() => {
        refreshRetryTimer = null
        void this.refreshTokens()
      }, delay)
    })

    return p
  }

  // Queue wrapper for requests
  async queuedRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = true,
    priority: number = 5
  ): Promise<ApiResponse<T>> {
    const method = (options.method || 'GET').toUpperCase()
    const isGet = method === 'GET'
    const key = isGet ? this.buildRequestKey(endpoint, options, requireAuth) : ''

    if (isGet && this.inFlight.has(key)) {
      return this.inFlight.get(key) as Promise<ApiResponse<T>>
    }

    const promise = requestQueue.add(
      () => this.request<T>(endpoint, options, requireAuth),
      priority,
      method === 'GET' ? 'query' : 'mutation'
    )

    if (isGet) {
      this.inFlight.set(key, promise as Promise<ApiResponse<unknown>>)
      promise.finally(() => {
        // Only its own entry: a forget may have let a newer read take the key.
        if (this.inFlight.get(key) === promise) this.inFlight.delete(key)
      })
    }

    return promise
  }

  /** An authed GET, stale-while-revalidate: a stale entry is served while it refreshes. */
  async cachedRequest<T>(endpoint: string, ttl: number): Promise<ApiResponse<T>> {
    const key = this.buildRequestKey(endpoint, {}, true)
    const cached = this.getCached<T>(key)

    // Too old to show even for a moment: asked again and awaited, as if never cached (`SWR_STALE_LIMIT_MS`).
    if (cached && !cached.tooOld) {
      if (!cached.isFresh) this.refreshCacheInBackground<T>(endpoint, key, ttl)
      return cached.data
    }

    const epoch = this.cacheEpoch
    const result = await this.queuedRequest<T>(endpoint)
    if (result.success && epoch === this.cacheEpoch) {
      this.setCache(key, result, ttl)
    }
    return result
  }

  // === AUTH ENDPOINTS ===

  /** Store the tokens and user of a successful sign-in or sign-up. */
  private async keepSession(result: ApiResponse<AuthResult>): Promise<ApiResponse<AuthResult>> {
    if (result.success && result.data) {
      // A new session: a refresh still in flight from the last one does not store over it (H1).
      nextSession()
      // Nothing cached, or still in flight, from before this sign-in is served to it.
      this.clearResponseCache()
      await TokenStorage.setTokens(result.data.accessToken, result.data.refreshToken)
      await TokenStorage.setUser(result.data.user)
      // Only once this session is in the keychain: dropped earlier, a kill before the writes land restored the last one (M2).
      await TokenStorage.forgetSignedOut()
    }
    return result
  }

  async signInWithGoogle(
    idToken: string,
    deviceInfo?: { platform?: string; device?: string; appVersion?: string }
  ): Promise<ApiResponse<AuthResult>> {
    return this.keepSession(await this.request<AuthResult>(
      '/api/mobile/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ idToken, deviceInfo }),
      },
      false
    ))
  }

  async signInWithApple(
    identityToken: string,
    fullName?: { givenName?: string | null; familyName?: string | null },
    deviceInfo?: { platform?: string; device?: string; appVersion?: string }
  ): Promise<ApiResponse<AuthResult>> {
    return this.keepSession(await this.request<AuthResult>(
      '/api/mobile/auth/apple',
      {
        method: 'POST',
        body: JSON.stringify({ identityToken, fullName, deviceInfo }),
      },
      false
    ))
  }

  async signInWithEmail(
    email: string,
    password: string,
    deviceInfo?: { platform?: string; device?: string; appVersion?: string }
  ): Promise<ApiResponse<AuthResult>> {
    return this.keepSession(await this.request<AuthResult>(
      '/api/mobile/auth/signin',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, deviceInfo }),
      },
      false
    ))
  }

  async signUp(
    email: string,
    password: string,
    name?: string,
    deviceInfo?: { platform?: string; device?: string; appVersion?: string },
    /*
     * Optional here because it is optional on the server, and both are
     * deliberate. The API accepts an age and does not require one, so that a
     * build without this field could never be 400'd by a newer server. Google
     * and Apple create accounts with no age at all, which is why `about-you`
     * asks for it when it is missing rather than relying on this path.
     */
    age?: number
  ): Promise<ApiResponse<AuthResult>> {
    return this.keepSession(await this.request<AuthResult>(
      '/api/mobile/auth/signup',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, name, age, deviceInfo }),
      },
      false
    ))
  }

  /**
   * Request a password reset link.
   *
   * Not under `/api/mobile` — this is the same route the dashboard uses, and
   * duplicating a working, rate-limited, tested endpoint to give it a mobile
   * prefix would buy nothing. Two details make it reachable from here:
   * `middleware.ts` only guards `/api/auth/callback/credentials`, and
   * `parseResponse` falls through to `{ success: true, data }` for a body with
   * no `success` key, which is the bare `{ ok, message }` this route returns.
   *
   * The emailed link opens the **web** reset page in a browser. Deep-linking it
   * back into the app needs associated domains, DNS and a native rebuild, and
   * an https link is required anyway because a custom scheme is unreliable in
   * mail and dead if the app is not installed.
   *
   * The server answers identically whether or not the address exists, so there
   * is nothing here to distinguish the two — deliberately.
   */
  async forgotPassword(email: string): Promise<ApiResponse<{ ok?: boolean; message?: string }>> {
    return this.request<{ ok?: boolean; message?: string }>(
      '/api/auth/forgot-password',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
      false
    )
  }

  /** `appleAuthorizationCode`: a fresh Sign in with Apple code, so the server can revoke the Apple grant (lib/appleRevocation). */
  async deleteAccount(appleAuthorizationCode?: string): Promise<ApiResponse<{ deleted: boolean }>> {
    const result = await this.request<{ deleted: boolean }>('/api/mobile/account', {
      method: 'DELETE',
      ...(appleAuthorizationCode ? { body: JSON.stringify({ appleAuthorizationCode }) } : {}),
    })

    if (result.success) {
      nextSession()
      TokenStorage.markSignedOut()
      // Bounded like sign-out's (D1): a keychain stuck behind another native call clears when it frees.
      await withinDeadline(TokenStorage.clearAll())
      requestQueue.clear()
      // Same reason as signOut(): the response cache is not per user, and a
      // stale entry is served before it is corrected. Deletion is the more
      // sensitive of the two exits and did not do this.
      this.clearResponseCache()
    }

    return result
  }

  /**
   * Sign out, and take the push token with it.
   *
   * `pushToken` rides along in this request rather than being removed by a
   * separate call, because the separate call could never work: this method
   * clears the access token below, so anything fired afterwards is
   * unauthenticated and 401s. The row survived, and because the server's unique
   * is `(user_id, token)` it simply co-existed with the next person to sign in
   * on the phone — who then received the previous account's notifications, with
   * message text in the body.
   *
   * One authenticated request, so there is no ordering to get wrong.
   *
   * If the token is null (a cold start loses the module-level ref) the server
   * clears every token this user holds instead. That is the deliberate choice:
   * a re-registration on their other device is cheaper than a stranger reading
   * their DMs.
   */
  /**
   * Every session this account has, this one too (`POST /auth/signout` naming no refresh token). Unlike `signOut`, nothing
   * is cleared until the server has said it ended them: a phone that could not reach the server is still signed in
   * everywhere, and says so rather than looking signed out.
   */
  async signOutEverywhere(): Promise<ApiResponse<void>> {
    const result = await this.request<void>('/api/mobile/auth/signout', {
      method: 'POST',
      body: JSON.stringify({ pushToken: getPushTokenRef() ?? undefined }),
    })
    if (!result.success) return result
    nextSession()
    TokenStorage.markSignedOut()
    setPushTokenRef(null)
    await TokenStorage.clearAll()
    requestQueue.clear()
    this.clearResponseCache()
    return result
  }

  /**
   * Sign out: always finishes, and always clears this phone (SCRUM-733: a restored session spun for minutes on a keychain
   * read before the POST, and the sheet could not be left).
   *
   * The keychain is read and cleared FIRST, then the server is told (RC drive D1 security review). SecureStore runs its
   * calls in the order they are made, so queuing the two token reads and then the deletes in one go means the reads still
   * get the tokens, and the deletes are queued before the network is touched: an app killed during the POST relaunches
   * signed out, never back into the session the person left. A sign-in after this queues its writes after the deletes, so
   * it is never wiped. The POST carries the tokens it read (a 401 refreshes with them, unstored).
   *
   * Each read is bounded. When the refresh token does not come back, the server is not asked (without it, the POST would
   * end every session, not this one) and the result says the server did not confirm.
   */
  async signOut(revokeAll: boolean = false): Promise<ApiResponse<void>> {
    nextSession()
    // First, and before any await (M2): if the keychain deletes below never run, the next launch still knows.
    TokenStorage.markSignedOut()
    /*
     * The push token rides in the POST, and nothing else may use it (Opus review M1): the root layout's sign-out
     * `removePushTokenFromProfile` ran with the ref still set, 401'd with no token, and its refresh found none, so a sign-out
     * the person chose came back as "You were signed out". Taken now, before any await.
     */
    const pushToken = getPushTokenRef() ?? undefined
    setPushTokenRef(null)
    /*
     * Drop the cached responses and the queued requests now. `clearResponseCache` also stops a read already in flight
     * from refilling the cache with this account's data for the next one (its epoch).
     */
    requestQueue.clear()
    this.clearResponseCache()
    const rawAccess = TokenStorage.getAccessToken()
    const rawRefresh = TokenStorage.getRefreshToken()
    const accessRead = settleWithin<string | null | typeof TIMED_OUT>(rawAccess, SIGN_OUT_READ_MS, TIMED_OUT)
    const refreshRead = settleWithin<string | null | typeof TIMED_OUT>(rawRefresh, SIGN_OUT_READ_MS, TIMED_OUT)
    const cleared = settleWithin<unknown>(TokenStorage.clearAll(), SIGN_OUT_READ_MS, TIMED_OUT)
    const [accessToken, refreshToken] = await Promise.all([accessRead, refreshRead])
    let result: ApiResponse<void>
    if ((refreshToken === TIMED_OUT && !revokeAll) || accessToken === TIMED_OUT) {
      result = { success: false, error: TIMEOUT_MESSAGE }
      /*
       * The keychain is slow, not empty: this phone is signed out now, and the server is told (best effort) when the tokens
       * arrive. The reads were queued ahead of the deletes, so they still return the session that is being left.
       */
      void Promise.all([rawAccess, rawRefresh])
        .then(([access, refresh]) => (access ? this.postSignOut(access, refresh, !revokeAll, pushToken) : undefined))
        .catch(() => {})
    } else if (!accessToken) {
      // Nothing stored: there is no session here for the server to end.
      result = { success: true }
    } else {
      const held = refreshToken === TIMED_OUT ? null : refreshToken
      // Everywhere names no refresh token (the server then ends every session), but an expired access token still refreshes with it (L2).
      result = await this.postSignOut(accessToken, held, !revokeAll, pushToken)
    }
    await cleared
    return result
  }

  /**
   * `POST /auth/signout` with tokens already read: an expired access token is refreshed once with `refreshToken`, unstored.
   * `name`: the body names the refresh token (this session only); off for sign out everywhere, which still refreshes with it.
   */
  private async postSignOut(accessToken: string, refreshToken: string | null, name: boolean, pushToken: string | undefined): Promise<ApiResponse<void>> {
    const endpoint = '/api/mobile/auth/signout'
    const send = (access: string, refresh: string | null) =>
      fetchWithTimeout(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(Platform.OS !== 'web' ? { 'X-App-Version': appVersionNumber(), ...buildHeaders() } : {}),
          ...CHANNEL_SET_HEADER,
          Authorization: `Bearer ${access}`,
        },
        body: JSON.stringify({ refreshToken: name ? refresh ?? undefined : undefined, pushToken }),
      })
    try {
      let { response, body } = await send(accessToken, refreshToken)
      if (response.status === 401 && refreshToken) {
        const fresh = await this.refreshUnstored(refreshToken)
        // The refresh rotated the token: the one to end now is the new one.
        if (fresh) ({ response, body } = await send(fresh.accessToken, fresh.refreshToken))
      }
      return await this.parseResponse<void>(response, body, endpoint)
    } catch (error) {
      if (isTimeoutError(error)) return { success: false, error: TIMEOUT_MESSAGE }
      return { success: false, error: GENERIC_FAILURE_MESSAGE }
    }
  }

  /** A refresh whose tokens are only for the caller: never stored, never the shared `refreshTokens`. */
  private async refreshUnstored(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
    try {
      const { response, body } = await fetchWithTimeout(`${this.baseUrl}/api/mobile/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...CHANNEL_SET_HEADER },
        body: JSON.stringify({ refreshToken }),
      })
      if (!response.ok) return null
      const data = JSON.parse(body) as ApiResponse<{ accessToken: string; refreshToken: string }>
      return data.success && data.data ? data.data : null
    } catch {
      return null
    }
  }

  async getSession(): Promise<ApiResponse<AuthUser>> {
    return this.request<AuthUser>('/api/mobile/auth/session')
  }

  async refreshSession(): Promise<boolean> {
    return (await this.refreshTokens()) === 'ok'
  }

  /**
   * The same refresh, with the three answers kept apart.
   *
   * `refreshSession` folds 'failed' into `false`, and a caller deciding
   * whether to sign somebody out cannot use that: a launch on a train read
   * "no answer" as "refused" and cleared a perfectly good session.
   */
  async refreshSessionOutcome(): Promise<RefreshOutcome> {
    if (!refreshPromise && Date.now() - lastRefreshFailedAt < FAILED_REFRESH_COOLDOWN_MS) return 'failed'
    return this.refreshTokens()
  }

  // === EVENT ENDPOINTS ===

  async getEvents(params?: {
    page?: number
    limit?: number
    search?: string
    /** Scopes the list. Values come from `getEventCities()`. */
    city?: string
    lat?: number
    lon?: number
    /**
     * A hard cut in km. **Leave it undefined for browsing.**
     *
     * The server no longer defaults this, and passing it here is what used to
     * blank the home screen: `lat`/`lon` alone sort and label by distance
     * without excluding anything, which is what a browse list wants.
     */
    radius?: number
    categoryId?: string
    categorySlug?: string
    startDate?: string
    endDate?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    include?: string
    interestedPreviewLimit?: number
    /** At most five published, public, age-gated, not-ended events, in the server's `featured.rank` order (BUILD-SPEC C1). */
    featured?: boolean
  }, options?: { force?: boolean }): Promise<ApiResponse<EventsListResponse>> {
    const endpoint = `/api/mobile/events${toQuery(params)}`
    const result = options?.force
      ? await this.queuedRequest<EventsListResponse>(endpoint)
      : await this.cachedRequest<EventsListResponse>(endpoint, EVENTS_LIST_SWR_TTL)
    // A search the server still found too short (its count and ours disagreed) is no search, never an error state: the
    // normal list, asked again without it.
    if (!result.success && result.reasonCode === SEARCH_TOO_SHORT && params?.search !== undefined) {
      return this.getEvents({ ...params, search: undefined }, options)
    }
    return result
  }

  /**
   * Places — `GET /venues`. Takes the Pulse's vocabulary (`city`, `lat`/`lon`,
   * no default radius). A venue an event has taken over is not in it; its
   * event's card names the venue instead.
   */
  async getVenues(
    params: { page?: number; limit?: number; city?: string; lat?: number; lon?: number; sortBy?: 'name' | 'distance'; venueType?: string; order?: 'live'; search?: string; radius?: number },
    options?: { force?: boolean }
  ): Promise<ApiResponse<VenuesListResponse>> {
    const endpoint = `/api/mobile/venues${toQuery(params)}`
    if (options?.force) return this.queuedRequest<VenuesListResponse>(endpoint)
    return this.cachedRequest<VenuesListResponse>(endpoint, EVENTS_LIST_SWR_TTL)
  }

  /** One venue — `GET /venues/:venueId`. Not cached: it carries the live count. */
  async getVenue(venueId: string): Promise<ApiResponse<VenueDetail>> {
    return this.queuedRequest<VenueDetail>(`/api/mobile/venues/${encodeURIComponent(venueId)}`)
  }

  /** The rest of a venue's coming events, a page at a time, soonest first: `cursor` is the last page's `nextCursor`. */
  async getVenueUpcoming(venueId: string, cursor?: string | null, limit = 20): Promise<ApiResponse<VenueUpcomingPage>> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    return this.queuedRequest<VenueUpcomingPage>(`/api/mobile/venues/${encodeURIComponent(venueId)}/upcoming?${params}`)
  }

  /**
   * Go Live at a place for 20, 45 or 60 minutes, or "stay". Going live again
   * while live extends, never shortens. `gpsAccuracy` rides in `deviceInfo`,
   * the key the server reads (as for check-in). A mutation: never retried.
   */
  async goLive(
    venueId: string,
    body: { latitude: number; longitude: number; deviceInfo?: Record<string, unknown> } & ({ minutes: 20 | 45 | 60 } | { stay: true })
  ): Promise<ApiResponse<GoLiveResult>> {
    return this.queuedRequest<GoLiveResult>(
      `/api/mobile/venues/${encodeURIComponent(venueId)}/live`,
      { method: 'POST', body: JSON.stringify(body) },
      true,
      2
    )
  }

  /**
   * The cities that currently have events, busiest first.
   *
   * Server-owned rather than derived on the device: a reverse-geocode on the
   * cold path can fail and leave a new install with nothing to show, and a
   * second naming authority would disagree with the server's about spelling.
   * GPS still gets to *suggest* a city; it never decides what can be seen.
   *
   * Cached for longer than the event list — a city gaining its first event is
   * not something the picker has to notice within seconds.
   */
  async getEventCities(): Promise<ApiResponse<{ cities: CityOption[] }>> {
    return this.cachedRequest<{ cities: CityOption[] }>(
      '/api/mobile/events/cities',
      5 * 60 * 1000
    )
  }

  /**
   * "I'm here and there's nothing on."
   *
   * Fire-and-forget: the caller must not await this to render anything, and a
   * failure is not worth surfacing — a lost demand signal costs a data point,
   * and a spinner over it would cost a user.
   *
   * Send at most once per session. The server counts *people* per city, not
   * opens, so a second call from the same user changes nothing.
   */
  async recordCityDemand(city: string, country?: string): Promise<void> {
    try {
      await this.queuedRequest('/api/mobile/events/demand', {
        method: 'POST',
        body: JSON.stringify(country ? { city, country } : { city }),
      })
    } catch {
      // Deliberately silent. See above.
    }
  }

  async getEvent(
    eventId: string,
    params?: { lat?: number; lon?: number; include?: string; interestedLimit?: number }
  ): Promise<ApiResponse<EventApiItem>> {
    const searchParams = new URLSearchParams()
    if (params) {
      if (params.lat !== undefined) searchParams.append('lat', String(roundCoordinate(params.lat)))
      if (params.lon !== undefined) searchParams.append('lon', String(roundCoordinate(params.lon)))
      if (params.include) searchParams.append('include', params.include)
      if (params.interestedLimit !== undefined) {
        searchParams.append('interestedLimit', String(params.interestedLimit))
      }
    }
    const query = searchParams.toString()
    return this.cachedRequest<EventApiItem>(
      `/api/mobile/events/${eventId}${query ? `?${query}` : ''}`,
      30 * 1000
    )
  }

  async checkIn(
    eventId: string,
    data: { latitude: number; longitude: number; deviceInfo?: Record<string, unknown> }
  ): Promise<ApiResponse<CheckInResult>> {
    return this.queuedRequest<CheckInResult>(
      `/api/mobile/events/${eventId}/checkin`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true,
      2 // High priority
    )
  }

  async checkOut(eventId: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.queuedRequest<Record<string, unknown>>(
      `/api/mobile/events/${eventId}/checkout`,
      {
        method: 'POST',
      },
      true,
      2 // High priority
    )
  }

  /**
   * `POST /favorite` is an upsert — it saves, and saving twice is a no-op. It
   * never removes; the Going tab's Remove chip called this and then read a
   * `favorited` field the server does not send (it says `isFavorited`), so the
   * card vanished and the row stayed (SCRUM-175). Use `removeFavorite` to
   * remove, or `toggleInterest` to flip.
   */
  async addFavorite(eventId: string): Promise<ApiResponse<{ isFavorited: boolean; favoriteCount: number }>> {
    return this.queuedRequest<{ isFavorited: boolean; favoriteCount: number }>(
      `/api/mobile/events/${eventId}/favorite`,
      {
        method: 'POST',
      },
      true,
      3
    )
  }

  /** Never refused — not on age, not on status (API: SCRUM-176). */
  async removeFavorite(eventId: string): Promise<ApiResponse<{ isFavorited: boolean; favoriteCount: number }>> {
    return this.queuedRequest<{ isFavorited: boolean; favoriteCount: number }>(
      `/api/mobile/events/${eventId}/favorite`,
      {
        method: 'DELETE',
      },
      true,
      3
    )
  }

  async toggleInterest(
    eventId: string
  ): Promise<ApiResponse<{ interested: boolean; interestCount: number }>> {
    return this.queuedRequest<{ interested: boolean; interestCount: number }>(
      `/api/mobile/events/${eventId}/interest`,
      {
        method: 'POST',
      },
      true,
      3
    )
  }

  /**
   * RSVP. Note the return can be `waitlisted`, which you did not ask for.
   *
   * A full event returns `waitlisted` rather than `going` (API 0.51.0) and
   * promotes whoever waited longest when a seat frees. Sending `going` and
   * assuming you got `going` back is the bug this signature exists to prevent.
   *
   * This is not a door policy: check-in still refuses nobody, and the geofence
   * deliberately covers the queue outside. Capacity is a signal to the
   * organiser, not a bouncer.
   */
  async rsvpToEvent(
    eventId: string,
    status: 'going' | 'maybe' | 'not_going'
  ): Promise<ApiResponse<{ rsvpStatus: RsvpStatus; rsvpCount: number }>> {
    return this.queuedRequest<{ rsvpStatus: RsvpStatus; rsvpCount: number }>(
      `/api/mobile/events/${eventId}/rsvp`,
      {
        method: 'POST',
        body: JSON.stringify({ status }),
      },
      true,
      2
    )
  }

  async cancelRsvp(
    eventId: string
  ): Promise<ApiResponse<{ rsvpStatus: null; rsvpCount: number }>> {
    return this.queuedRequest<{ rsvpStatus: null; rsvpCount: number }>(
      `/api/mobile/events/${eventId}/rsvp`,
      {
        method: 'DELETE',
      },
      true,
      2
    )
  }

  async rateEvent(
    eventId: string,
    rating: number,
    review?: string
  ): Promise<ApiResponse<Record<string, unknown>>> {
    return this.queuedRequest<Record<string, unknown>>(
      `/api/mobile/events/${eventId}/rating`,
      {
        method: 'POST',
        body: JSON.stringify({ rating, review }),
      },
      true,
      5
    )
  }

  /**
   * Your own rating of this event — `rating: null` when you have not rated it.
   * Yours only: no route returns anybody else's. 404 `NOT_FOUND` for an event
   * that does not exist.
   */
  async getMyEventRating(eventId: string): Promise<ApiResponse<MyEventRating>> {
    return this.queuedRequest<MyEventRating>(`/api/mobile/events/${encodeURIComponent(eventId)}/rating`)
  }

  // === PROFILE ENDPOINTS ===

  /**
   * `cache: false` reads fresh and leaves the cache alone: the cache holds one profile, and reading somebody else's must not
   * replace your own.
   */
  async getProfile(userId: string, options: { cache?: boolean } = {}): Promise<ApiResponse<OwnProfileEnvelope>> {
    const useCache = options.cache !== false
    // Check cache first for instant response
    const cached = useCache ? ProfileCache.get(userId) : null
    if (cached) {
      return { success: true, data: cached }
    }

    const result = await this.queuedRequest<OwnProfileEnvelope>(`/api/mobile/profiles/${userId}`)

    // Cache successful responses
    if (useCache && result.success && result.data) {
      ProfileCache.set(userId, result.data)
    }

    return result
  }

  async updateProfile(
    userId: string,
    data: {
      name?: string
      phone?: string
      age?: number

      /*
       * `YYYY-MM-DD`. Supersedes `age`, which was a snapshot taken at signup
       * that nothing ever rewrote — someone who joined at 17 stayed 17 in the
       * table and was refused every 18+ event a year later. Write-only: no
       * response carries it back, not even to its owner.
       */
      dateOfBirth?: string

      location?: string
      bio?: string
      occupation?: string
      education?: string
      interests?: string[]
      photos?: string[]
      /** The blurred copy of `photos[0]`, sent with every new primary (SCRUM-478). */
      blur_photo?: string | null
      goals?: string[]
      looking_for?: string[]
      onboarded?: boolean

      /*
       * What ranking reads. Snake_case, because that is what the route
       * validates — the four preference booleans below were sent in twelve
       * camelCase spellings and matched none, and these are the same shape of
       * mistake waiting to happen.
       *
       * `interested_in` is sent only when the app asked directly (an ambiguous
       * gender/orientation pair). When it is omitted the server derives it, and
       * a client-supplied value always wins — so sending it can only make the
       * stored value more accurate, never less.
       */
      intent_default?: ('dating' | 'networking' | 'friendship' | 'just_here')[]
      gender?: 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say' | null
      /*
       * Up to three, distinct, and `prefer_not_to_say` cannot be combined with
       * anything. `interested_in` derives from the **union**, so a second label
       * never narrows who the person is shown.
       *
       * The singular `orientation` the server still accepts is deliberately not
       * typed here — it is a compatibility shim for builds already in the
       * field, not a shape new code should reach for.
       */
      orientations?: string[]
      /*
       * Show `orientations` to people who already passed the identity gate —
       * matches, open conversations, rooms you revealed yourself in. Never to
       * every caller: the server gates it twice, and this flag is only the
       * first of the two.
       */
      show_orientation?: boolean
      /*
       * How you enter rooms. A suggestion the room re-asks by way of a tap —
       * the server creates every check-in `revealed: false` regardless.
       */
      reveal_by_default?: boolean
      interested_in?: ('woman' | 'man' | 'non_binary' | 'prefer_not_to_say')[]
      /** A slug from `getWorkFields()`, never free text. */
      work_field?: string | null
      /** Up to `maxExpertise` slugs from `getWorkFields().expertiseByField[work_field]`; the server prunes any that leave their field. */
      expertise?: string[]
      /*
       * The four preference columns, named exactly as the route validates them.
       *
       * These were declared here in camelCase -- pushEnabled, showOnlineStatus,
       * shareReadReceipts, locationSharing -- plus a free-form `preferences`
       * bag, and the route accepts none of those. The settings screen was
       * sending twelve spellings and matching zero, so every toggle persisted
       * nothing and read back its default of `true`.
       *
       * Note the asymmetry, which is what made guessing fail: the UI concept
       * "show online status" is the column `show_online`, "share read receipts"
       * is `read_receipts`, and "location sharing" is `share_location`.
       */
      push_enabled?: boolean
      show_online?: boolean
      read_receipts?: boolean
      share_location?: boolean
      /** Off by default: friends see a pseudonym in rooms unless this is on. */
      friends_see_me_in_rooms?: boolean
      /*
       * Matching v2, display only — slugs from `getProfileOptions()`. A sign
       * travels with its calendar: both set, or both null to take it off.
       */
      languages?: string[]
      home_state?: string | null
      sun_sign?: string | null
      sign_system?: 'western' | 'rashi' | null
      shows_up_badge?: boolean
      show_badges?: boolean
    }
  ): Promise<ApiResponse<Record<string, unknown>>> {
    const result = await this.queuedRequest<Record<string, unknown>>(
      `/api/mobile/profiles/${userId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
      true,
      2
    )

    /*
     * The write invalidates the read. This was missing, and only
     * `edit-profile.tsx` cleared the cache by hand.
     *
     * `ProfileCache` has a 60s TTL, and the routing gate that read
     * `profile.onboarded` through it is gone — so the specific bounce this was
     * written for (finish onboarding, gate reads back a cached `false`, round
     * you go again) can no longer happen.
     *
     * The invalidation stays, because the reason generalises: the profile tab,
     * the events header and the match gate all read this cache, and a save that
     * leaves them showing the old value for up to a minute is the same bug
     * wearing a different screen.
     */
    if (result.success) ProfileCache.clear()
    return result
  }

  /**
   * `{ interests: [...] }`, not a bare array — the server wraps it. The
   * signature said `Array<...>` for as long as nothing called it; the first
   * caller (onboarding's interest sync) would have read `.map` off an object.
   */
  async getProfileInterests(
    userId: string
  ): Promise<ApiResponse<{ interests: { id: string; name: string; slug: string }[] }>> {
    return this.queuedRequest<{ interests: { id: string; name: string; slug: string }[] }>(
      `/api/mobile/profiles/${userId}/interests`
    )
  }

  /*
   * Both of these take an ARRAY, because the server does.
   *
   * They were written singular and neither worked. `addProfileInterest` sent
   * `{ categoryId }` where the route validates `{ categoryIds: string[] }` with
   * `.min(1)`, so every call would have failed validation. `removeProfileInterest`
   * built `/interests/:categoryId`, a path that does not exist -- the server
   * takes DELETE on `/interests` with the ids in the body.
   *
   * Neither had a call site, so nothing broke in production. They would have
   * broken the moment anyone wired up the interest picker, which is exactly what
   * this change does. Renamed to plural so the mistake cannot be repeated by
   * someone reading the signature.
   */
  async addProfileInterests(
    userId: string,
    categoryIds: string[]
  ): Promise<ApiResponse<Record<string, unknown>>> {
    return this.queuedRequest<Record<string, unknown>>(
      `/api/mobile/profiles/${userId}/interests`,
      {
        method: 'POST',
        body: JSON.stringify({ categoryIds }),
      },
      true,
      3
    )
  }

  async removeProfileInterests(userId: string, categoryIds: string[]): Promise<ApiResponse<void>> {
    return this.queuedRequest<void>(
      `/api/mobile/profiles/${userId}/interests`,
      {
        method: 'DELETE',
        body: JSON.stringify({ categoryIds }),
      },
      true,
      3
    )
  }

  // === USER ENDPOINTS ===

  async getPublicProfile(userId: string): Promise<ApiResponse<PublicProfile>> {
    return this.queuedRequest<PublicProfile>(`/api/mobile/users/${userId}`)
  }

  /**
   * `{ events, pagination }`, not a bare array — the server wraps it, the same
   * way `getProfileInterests` is wrapped. This was typed as the array and the
   * Going tab mapped over the envelope (SCRUM-175).
   */
  async getUserFavorites(userId: string, page = 1, limit = 20, cursor?: string | null): Promise<ApiResponse<SavedEventsPayload>> {
    return this.queuedRequest<SavedEventsPayload>(`/api/mobile/users/${userId}/favorites?${pageQuery(page, cursor)}&limit=${limit}`)
  }

  /**
   * Your upcoming `going` and `waitlisted` RSVPs, soonest first. `/me`-scoped:
   * there is no way to ask for somebody else's. A server older than this route
   * answers 404, which the Going tab reads as "no section", not as a failure.
   */
  async getMyRsvps(page = 1, cursor?: string | null): Promise<ApiResponse<RsvpEventsPayload>> {
    return this.queuedRequest<RsvpEventsPayload>(`/api/mobile/me/rsvps?${pageQuery(page, cursor)}&limit=50`)
  }

  /** The events you attended, most recent first. `/me`-scoped, like the above. */
  async getMyAttendance(limit = 10, page = 1, cursor?: string | null): Promise<ApiResponse<AttendancePayload>> {
    return this.queuedRequest<AttendancePayload>(`/api/mobile/me/attendance?limit=${limit}&${pageQuery(page, cursor)}`)
  }

  /** Whether you have Blendn+ — the server's answer, the only one that unlocks anything. Never cached. */
  async getMyPlus(): Promise<ApiResponse<PlusStatus>> {
    return this.queuedRequest<PlusStatus>('/api/mobile/me/plus')
  }

  /** The paywall's analytics. Lowest priority; nothing waits on it. */
  async logPaywallEvent(event: PaywallEvent, trigger: PaywallTrigger): Promise<ApiResponse<{ recorded: true }>> {
    return this.queuedRequest<{ recorded: true }>(
      '/api/mobile/me/plus/paywall-events',
      { method: 'POST', body: JSON.stringify({ event, trigger }) },
      true,
      // Last in the queue: lower runs first, and nothing waits on this.
      10
    )
  }

  // === CHAT ENDPOINTS ===

  async getChatGroups(options?: { force?: boolean }): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const endpoint = '/api/mobile/chat/groups'
    if (options?.force) {
      return this.queuedRequest<Array<Record<string, unknown>>>(endpoint)
    }
    return this.cachedRequest<Array<Record<string, unknown>>>(endpoint, CHAT_LIST_SWR_TTL)
  }

  async getEventChat(eventId: string): Promise<ApiResponse<EventChatData>> {
    return this.queuedRequest<EventChatData>(`/api/mobile/events/${eventId}/chat`)
  }

  async sendChatMessage(
    chatGroupId: string,
    content: string,
    type: 'text' | 'image' | 'video' = 'text',
    metadata?: Record<string, unknown>,
    /**
     * The message being replied to. The room screen drew the quote on the
     * optimistic bubble and never sent this, so every reply arrived on the
     * other phones -- and came back on reload -- as a plain message.
     */
    parentId?: string,
    /** This send's own id: a retry with it returns the first write (SCRUM-410). */
    clientId?: string
  ): Promise<ApiResponse<ChatMessageData>> {
    return this.queuedRequest<ChatMessageData>(
      `/api/mobile/chat/groups/${chatGroupId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ content, type, metadata, ...(parentId && { parentId }), ...(clientId && { clientId }) }),
      },
      true,
      2
    )
  }

  async getChatMessages(
    chatGroupId: string,
    params?: { limit?: number; before?: string }
  ): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.append('limit', String(params.limit))
    if (params?.before) searchParams.append('before', params.before)
    const query = searchParams.toString()
    return this.queuedRequest<Array<Record<string, unknown>>>(
      `/api/mobile/chat/groups/${chatGroupId}/messages${query ? `?${query}` : ''}`
    )
  }

  // === UPLOAD ENDPOINTS ===

  async getPresignedUploadUrl(
    filename: string,
    contentType: string,
    folder: 'profile' | 'chat' | 'events' = 'profile',
    /** Bytes the PUT will carry: signed into the URL, so the upload cannot be larger. */
    size?: number
  ): Promise<ApiResponse<{ uploadUrl: string; publicUrl: string; key?: string }>> {
    return this.queuedRequest<{ uploadUrl: string; publicUrl: string; key?: string }>(
      '/api/mobile/uploads/presigned-url',
      {
        method: 'POST',
        body: JSON.stringify({ filename, contentType, folder, size }),
      },
      true,
      3
    )
  }

  // === MATCHES ===

  /**
   * The people in this room, ranked for you.
   *
   * 403 unless you checked in: this is a view of a room you attended, not a
   * directory anyone with a token can browse.
   *
   * Replaces the old use of `getEventCheckins` on the match screen. That
   * endpoint stopped returning `image` and the real `name` in API v0.46.0 when
   * it stopped handing out attendee identities, so the screen rendered blank
   * avatars in production and its card linked to the real profile -- anonymity
   * one tap deep. `matches` is the endpoint built for this, and it already
   * carries `sharedInterests` as names, ready to render.
   */
  async getEventMatches(
    eventId: string,
    options?: { limit?: number; force?: boolean }
  ): Promise<ApiResponse<{ matches: MatchCard[] }>> {
    const query = options?.limit ? `?limit=${options.limit}` : ''
    const endpoint = `/api/mobile/events/${eventId}/matches${query}`
    // force bypasses the cache rather than being passed into it.
    if (options?.force) return this.queuedRequest<{ matches: MatchCard[] }>(endpoint)
    return this.cachedRequest<{ matches: MatchCard[] }>(endpoint, 30_000)
  }

  /**
   * Your friends who are here and let friends see them (`GET /events/:id/friends-here`, plans/friends-in-room.md 4.3).
   * `order=recent` is the Room's first page (last DM, then arrival); `order=name` pages A to Z by `cursor` and filters by `q`.
   * Real ids and names, never room handles. An older server answers 404: the caller shows no section.
   */
  async getFriendsHere(
    eventId: string,
    options: { order?: 'recent' | 'name'; limit?: number; cursor?: string | null; q?: string } = {}
  ): Promise<ApiResponse<{ friends: { userId: string; name: string; photo: string | null }[]; total: number; nextCursor: string | null }>> {
    const params = new URLSearchParams()
    if (options.order) params.set('order', options.order)
    if (options.limit) params.set('limit', String(options.limit))
    if (options.cursor) params.set('cursor', options.cursor)
    if (options.q) params.set('q', options.q)
    const query = params.toString()
    return this.queuedRequest(`/api/mobile/events/${encodeURIComponent(eventId)}/friends-here${query ? `?${query}` : ''}`)
  }

  /**
   * Like someone you were in a room with. Mutual opens a conversation.
   *
   * Nothing in the response reveals who liked you first -- that asymmetry is
   * the whole point of the mutual gate.
   */
  async likeAtEvent(eventId: string, userId: string): Promise<ApiResponse<LikeOutcome>> {
    return this.queuedRequest<LikeOutcome>(
      `/api/mobile/events/${eventId}/matches/likes`,
      { method: 'POST', body: JSON.stringify({ userId }) },
      true,
      3
    )
  }

  /**
   * How many are here, and how many share your taste — for the room you are
   * looking at from outside.
   *
   * Cached briefly: Tonight asks for several events at once and a focus
   * shouldn't re-ask all of them. An older server answers 404, which the
   * caller treats as "no preview" rather than an error.
   */
  async getRoomPreview(
    eventId: string,
    options?: { force?: boolean }
  ): Promise<ApiResponse<RoomPreview>> {
    const endpoint = `/api/mobile/events/${eventId}/room-preview`
    if (options?.force) return this.queuedRequest<RoomPreview>(endpoint)
    return this.cachedRequest<RoomPreview>(endpoint, 15_000)
  }

  /**
   * Wave at somebody in the same room.
   *
   * Lighter than a like and deliberately not private: they are told who waved.
   * One per pair every ten minutes — the server answers `WAVE_TOO_SOON` (429)
   * inside that window, which the caller shows as "already waved" rather than
   * as a failure.
   */
  async sendWave(eventId: string, toUserId: string): Promise<ApiResponse<{ sent: true }>> {
    return this.queuedRequest<{ sent: true }>(
      `/api/mobile/events/${eventId}/waves`,
      { method: 'POST', body: JSON.stringify({ toUserId }) },
      true,
      3
    )
  }

  /**
   * Toggle a reaction on a room message. The server decides add vs remove, so
   * two devices can't disagree about which state you are in; `added` says
   * which it did, and `reactions` is the whole tally with your `mine`.
   */
  async reactToChatMessage(
    chatGroupId: string,
    messageId: string,
    emoji: ChatReaction
  ): Promise<ApiResponse<{ messageId: string; added: boolean; reactions: ReactionTally[] }>> {
    return this.queuedRequest(
      `/api/mobile/chat/groups/${chatGroupId}/messages/${messageId}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji }) },
      true,
      2
    )
  }

  // === ROOM MEMBERSHIP: leave, mute, report ===

  /**
   * Drop the cached room list, so the Banter's next read asks the server.
   * Leaving takes a room out of it and a mute changes a row in it; the list is
   * SWR-cached, and answering from the old copy would put a left room back.
   */
  forgetChatGroups(): void {
    this.forgetMatching((key) => key.includes(':/api/mobile/chat/groups:'))
  }

  /**
   * Leave a room. Idempotent. From then on its history, posts, reactions and
   * socket are refused (`LEFT_ROOM`), and its pushes stop. The way back is
   * `rejoinChatGroup`, or checking in at the event again.
   */
  async leaveChatGroup(chatGroupId: string): Promise<ApiResponse<{ chatGroupId: string; left: true }>> {
    const result = await this.queuedRequest<{ chatGroupId: string; left: true }>(
      `/api/mobile/chat/groups/${encodeURIComponent(chatGroupId)}/leave`,
      { method: 'POST' },
      true,
      2
    )
    if (result.success) this.forgetChatGroups()
    return result
  }

  /**
   * Undo a leave you made yourself. 403 `USER_BANNED`, `CHAT_CLOSED` or
   * `CHAT_LOCKED` when the room will not take you back — the error is the
   * server's sentence for which.
   */
  async rejoinChatGroup(chatGroupId: string): Promise<ApiResponse<{ chatGroupId: string; left: false }>> {
    const result = await this.queuedRequest<{ chatGroupId: string; left: false }>(
      `/api/mobile/chat/groups/${encodeURIComponent(chatGroupId)}/leave`,
      { method: 'DELETE' },
      true,
      2
    )
    if (result.success) this.forgetChatGroups()
    return result
  }

  /**
   * Silence a room's pushes to you, until `until` (ISO) or, with null, until
   * you unmute. Nothing else changes: you still read and post, and nobody is
   * told. 400 `VALIDATION_FAILED` for a time in the past or over a year away.
   */
  async muteChatGroup(
    chatGroupId: string,
    until: string | null
  ): Promise<ApiResponse<{ chatGroupId: string; mute: RoomMute }>> {
    const result = await this.queuedRequest<{ chatGroupId: string; mute: RoomMute }>(
      `/api/mobile/chat/groups/${encodeURIComponent(chatGroupId)}/mute`,
      { method: 'POST', body: JSON.stringify({ until }) },
      true,
      3
    )
    if (result.success) this.forgetChatGroups()
    return result
  }

  async unmuteChatGroup(chatGroupId: string): Promise<ApiResponse<{ chatGroupId: string; mute: RoomMute }>> {
    const result = await this.queuedRequest<{ chatGroupId: string; mute: RoomMute }>(
      `/api/mobile/chat/groups/${encodeURIComponent(chatGroupId)}/mute`,
      { method: 'DELETE' },
      true,
      3
    )
    if (result.success) this.forgetChatGroups()
    return result
  }

  /**
   * Report a whole room — a pile-on, a room gone hostile — which no single
   * message shows. Any member may, including one who left or was banned.
   */
  async reportChatGroup(
    chatGroupId: string,
    reason: string,
    description?: string
  ): Promise<ApiResponse<{ reported: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/chat/groups/${encodeURIComponent(chatGroupId)}/report`,
      { method: 'POST', body: JSON.stringify(description ? { reason, description } : { reason }) },
      true,
      2
    )
  }

  /**
   * Your intent and reveal flag for this event.
   *
   * `revealed` is per event on purpose: choosing to be visible at a work
   * meetup is not choosing to be visible at a club.
   */
  async setMatchPreferences(
    eventId: string,
    prefs: {
      intent?: Array<'dating' | 'networking' | 'friendship' | 'just_here'>
      revealed?: boolean
      /*
       * Two flags, because one of them wrote something it never said.
       *
       * `remember` set BOTH `intent_default` and `reveal_by_default`, and the
       * switch that sent it sits under the reveal toggle labelled "Do this at
       * future events too" — so agreeing to be named at future events silently
       * overwrote a person-level intent. It is still accepted server-side for
       * builds already in the store; nothing new should send it.
       */
      rememberIntent?: boolean
      rememberReveal?: boolean
    }
  ): Promise<ApiResponse<{ intent: string[]; revealed: boolean }>> {
    return this.queuedRequest<{ intent: string[]; revealed: boolean }>(
      `/api/mobile/events/${eventId}/matches/preferences`,
      { method: 'PUT', body: JSON.stringify(prefs) },
      true,
      3
    )
  }

  // === PEER RATINGS ===

  /**
   * Who you may rate for this event.
   *
   * Only people you actually connected with -- a mutual like, so both of you
   * opted in -- and only once the event has ended. Rating anyone who merely
   * shared a room would be a review-bombing surface and a way to punish someone
   * for declining; asked during the night a rating is leverage rather than
   * reflection. The server enforces both, and drops people you have already
   * rated.
   */
  async getRatablePeers(eventId: string): Promise<ApiResponse<{ userIds: string[] }>> {
    return this.queuedRequest<{ userIds: string[] }>(
      `/api/mobile/events/${eventId}/peer-ratings`
    )
  }

  /**
   * Rate someone you met. **Never visible to the person rated.**
   *
   * There is no endpoint that returns it to them and there must never be a
   * screen where it could surface. The person most likely to rate someone badly
   * is the person who felt least safe with them, and showing it would tell him
   * that the woman who met him rated him down -- at an event where he knows who
   * she is and may still be in the room. The feature meant to protect her
   * becomes what exposes her.
   *
   * `harassment` is not a low rating with a label. It routes to moderation and
   * is never averaged into a score: four glowing ratings and one harassment
   * report is not a 4.2.
   */
  async ratePeer(
    eventId: string,
    input: { userId: string; rating: number; issue?: PeerRatingIssue; note?: string }
  ): Promise<ApiResponse<{ recorded: boolean }>> {
    return this.queuedRequest<{ recorded: boolean }>(
      `/api/mobile/events/${eventId}/peer-ratings`,
      { method: 'POST', body: JSON.stringify(input) },
      true,
      3
    )
  }

  // === PRESENCE ===

  /**
   * "Am I still counted as here?"
   *
   * Check-in used to be a one-shot gate: it proved you were at the venue once
   * and nothing revisited the claim, so anyone who left without pressing check
   * out stayed counted forever. Occupancy climbed all night and never fell, on
   * the organiser's live operations screen -- a shipped feature producing a
   * wrong number on someone else's display.
   *
   * The server judges whether the coordinates are still inside. Do NOT
   * reimplement the geofence here: two implementations of one rule will
   * disagree, and the client's is the one an attacker controls.
   *
   * Not queued and not retried. A stale ping is worse than no ping -- it would
   * assert presence at a location and time that have both passed. The next tick
   * is five minutes away and carries fresher truth.
   */
  async sendPresencePing(
    eventId: string,
    coords: { latitude: number; longitude: number; accuracy?: number | null }
  ): Promise<ApiResponse<PresencePing>> {
    return this.request<PresencePing>(
      `/api/mobile/events/${eventId}/presence`,
      { method: 'POST', body: JSON.stringify(coords) },
      true
    )
  }

  // === CATEGORIES ===

  async getCategories(): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    return namedList(
      await this.cachedRequest<NamedList<'categories'>>(
        '/api/mobile/categories',
        CATEGORIES_SWR_TTL
      ),
      'categories'
    )
  }

  /**
   * The coarse fields of work, from the server.
   *
   * Served rather than hardcoded for the reason `profiles.interests` exists as
   * a warning: a list typed into the client is a list two people spell
   * differently and never match on. Same cache treatment as categories — it is
   * eighteen strings, identical for everybody, and changes about once a year.
   */
  /** Matching v2's vocabulary: languages, home states, signs, this-or-that. Static; cached like work fields. */
  async getProfileOptions(): Promise<ApiResponse<ProfileOptions>> {
    return this.cachedRequest<ProfileOptions>('/api/mobile/profile-options', CATEGORIES_SWR_TTL)
  }

  /** Your this-or-that answers, question slug → "a" | "b". */
  async getThisOrThat(): Promise<ApiResponse<{ answers: Record<string, Choice> }>> {
    return this.queuedRequest<{ answers: Record<string, Choice> }>('/api/mobile/me/this-or-that')
  }

  /** Set (`"a"`/`"b"`) or take back (`null`) answers; questions not sent are left alone. */
  async putThisOrThat(answers: Record<string, Choice | null>): Promise<ApiResponse<{ answers: Record<string, Choice> }>> {
    return this.queuedRequest<{ answers: Record<string, Choice> }>(
      '/api/mobile/me/this-or-that',
      { method: 'PUT', body: JSON.stringify({ answers }) },
      true,
      2
    )
  }

  async getWorkFields(): Promise<ApiResponse<WorkFieldsResponse>> {
    return this.cachedRequest<WorkFieldsResponse>(
      '/api/mobile/work-fields',
      CATEGORIES_SWR_TTL
    )
  }

  // === PUSH NOTIFICATIONS ===

  async registerPushToken(
    token: string,
    platform: 'ios' | 'android'
  ): Promise<ApiResponse<{ message: string }>> {
    return this.queuedRequest<{ message: string }>(
      '/api/mobile/notifications/token',
      {
        method: 'POST',
        // `channelSet` tells the server this install created the Flow 9 Android channels (matches, crew, after-the-night);
        // without it the server keeps sending the old ones, so a push never lands in a channel this build lacks.
        body: JSON.stringify({ token, platform, channelSet: PUSH_CHANNEL_SET }),
      },
      true,
      2 // High priority
    )
  }

  async removePushToken(token: string): Promise<ApiResponse<{ message: string }>> {
    return this.queuedRequest<{ message: string }>(
      `/api/mobile/notifications/token?token=${encodeURIComponent(token)}`,
      { method: 'DELETE' },
      true,
      5
    )
  }

  // === NOTIFICATIONS CENTRE ===

  /**
   * The bell's feed, newest first, with the unread count alongside.
   *
   * The count ships with the list so the bell costs **one** request rather than
   * two — it is asked for on a screen somebody opens constantly, and a separate
   * count endpoint would double that traffic for a number the feed already had
   * to compute.
   *
   * Not cached. This is the one list where staleness is the bug: the whole
   * point of the bell is that it knows about things that happened while the app
   * was closed, and a cached read on open would show yesterday's badge.
   */
  async getNotifications(options?: {
    cursor?: string
    limit?: number
    unreadOnly?: boolean
  }): Promise<ApiResponse<NotificationFeed>> {
    const params = new URLSearchParams()
    if (options?.cursor) params.set('cursor', options.cursor)
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.unreadOnly) params.set('unread', 'true')
    const query = params.toString()
    return this.queuedRequest<NotificationFeed>(
      `/api/mobile/notifications${query ? `?${query}` : ''}`
    )
  }

  /**
   * Mark read. No `ids` means all of them.
   *
   * The server keeps `user_id` in the filter either way, so this cannot reach
   * somebody else's row even with a valid uuid.
   */
  async markNotificationsRead(
    ids?: string[]
  ): Promise<ApiResponse<{ marked: number; unreadCount: number }>> {
    return this.queuedRequest<{ marked: number; unreadCount: number }>(
      '/api/mobile/notifications/read',
      { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) },
      true,
      4
    )
  }

  /** "Mark all read" on the inbox: every unread message across your live conversations. */
  async markAllConversationsRead(): Promise<ApiResponse<{ marked: number }>> {
    return this.queuedRequest<{ marked: number }>(
      '/api/mobile/conversations/read',
      { method: 'POST', body: '{}' },
      true,
      4
    )
  }

  async clearNotifications(): Promise<ApiResponse<{ deleted: number }>> {
    return this.queuedRequest<{ deleted: number }>(
      '/api/mobile/notifications',
      { method: 'DELETE' },
      true,
      5
    )
  }

  // === PRIVATE CONVERSATIONS ===

  async getConversations(options?: { force?: boolean }): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const endpoint = `/api/mobile/conversations?limit=${LIST_PAGE.conversations}`
    if (options?.force) {
      return namedList(await this.queuedRequest<NamedList<'conversations'>>(endpoint), 'conversations')
    }
    return namedList(
      await this.cachedRequest<NamedList<'conversations'>>(endpoint, CHAT_LIST_SWR_TTL),
      'conversations'
    )
  }

  async getConversation(conversationId: string): Promise<ApiResponse<{
    id: string
    /**
     * Already resolved by the server: a pseudonym until they reveal, and
     * `image` null until then too. Never re-derive this on the client -- the
     * whole rule lives in one place server-side so it cannot drift.
     */
    otherUser: { id: string; name: string | null; image: string | null }
    /**
     * Opened from a mutual like rather than an accepted message request.
     *
     * Server-supplied and not derivable here: `theyRevealed` is true for BOTH a
     * never-pseudonymous conversation and a revealed match, so it cannot tell
     * them apart. See `lib/matchOpener.ts`.
     */
    fromMatch?: boolean
    /**
     * Whether there is anything left to reveal. False for an accepted message
     * request — real names from the start. Server-supplied; inferring it from
     * the reveal fields being absent drew the match header on a request.
     */
    pseudonymous?: boolean
    /** Whether you have shown them who you are. */
    youRevealed?: boolean
    /** Whether they have shown you. */
    theyRevealed?: boolean
    /** Whether they asked you to. There is no "declined". */
    revealRequested?: boolean
    /**
     * Whether to offer "Add friend" (SCRUM-750). Read it through `parseFriendOffer`; absent from a server that does not
     * send it. `otherUser.id` is a handle until they reveal: only an offer with `canAdd` makes it a real id.
     */
    friend?: unknown
    createdAt: string
    lastMessageAt: string | null
  }>> {
    return this.queuedRequest(`/api/mobile/conversations/${conversationId}`)
  }

  /**
   * Show them who you are. One way -- the server has no path back to false.
   *
   * Refused with `reveal_incomplete` when there is no name or no photo:
   * revealing shows exactly those two things, so without them the switch turns
   * on and their screen is unchanged.
   */
  async revealInConversation(conversationId: string): Promise<ApiResponse<{
    revealed: boolean
    mutual: boolean
  }>> {
    return this.queuedRequest(
      `/api/mobile/conversations/${conversationId}/reveal`,
      { method: 'POST', body: JSON.stringify({}) },
      true,
      3
    )
  }

  /**
   * Ask them to reveal.
   *
   * Idempotent by construction -- it sets one boolean on their side, so asking
   * twice changes nothing and sends nothing. There is deliberately no decline
   * to receive back.
   */
  async requestReveal(conversationId: string): Promise<ApiResponse<{ requested: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/conversations/${conversationId}/reveal`,
      { method: 'POST', body: JSON.stringify({ ask: true }) },
      true,
      3
    )
  }

  /**
   * Leave a conversation, optionally blocking and reporting in the same call.
   *
   * One request rather than two, because composing them client-side can
   * half-fail into the worst state: a closed thread whose evidence is out of
   * reach, or a report with no safety action.
   */
  async leaveConversation(
    conversationId: string,
    options: {
      action?: 'unmatch' | 'block'
      report?: { reason: string; description?: string; messageId?: string }
    } = {}
  ): Promise<ApiResponse<{ closed: boolean; blocked: boolean; reported: boolean }>> {
    const result = await this.queuedRequest<{ closed: boolean; blocked: boolean; reported: boolean }>(
      `/api/mobile/conversations/${conversationId}/leave`,
      { method: 'POST', body: JSON.stringify({ action: options.action ?? 'unmatch', ...options }) },
      true,
      3
    )
    if (options.action === 'block') noteBlockedOn(result)
    return result
  }

  async getConversationMessages(
    conversationId: string,
    options?: { page?: number; limit?: number; before?: string }
  ): Promise<ApiResponse<{
    messages: Array<{
      id: string
      conversationId: string
      senderId: string
      sender: { id: string; name: string | null; image: string | null }
      text: string | null
      mediaUrl: string | null
      mediaType: string | null
      isRead: boolean
      /** Your own messages: when their app got it (✓✓ delivered). */
      deliveredAt?: string | null
      replyTo?: DmReplyQuote | null
      createdAt: string
    }>
    hasMore: boolean
    nextCursor: string | null
    /** First page only: where your unread start, named before the server marked them read. */
    firstUnreadId?: string | null
    unreadCount?: number
  }>> {
    const params = new URLSearchParams()
    if (options?.page) params.set('page', String(options.page))
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.before) params.set('before', options.before)
    const query = params.toString() ? `?${params.toString()}` : ''
    return this.queuedRequest(`/api/mobile/conversations/${conversationId}/messages${query}`)
  }

  async sendPrivateMessage(
    conversationId: string,
    data: {
      text?: string
      mediaUrl?: string
      mediaType?: 'image' | 'video'
      /** The message this one replies to (SCRUM-409). */
      replyToId?: string
      /** This send's own id: a retry with it returns the first write (SCRUM-410). */
      clientId?: string
    }
  ): Promise<ApiResponse<{
    id: string
    conversationId: string
    senderId: string
    sender: { id: string; name: string | null; image: string | null }
    text: string | null
    mediaUrl: string | null
    mediaType: string | null
    isRead: boolean
    deliveredAt?: string | null
    replyTo?: DmReplyQuote | null
    createdAt: string
  }>> {
    return this.queuedRequest(
      `/api/mobile/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true,
      1 // High priority for sending messages
    )
  }

  // === BATCH ENDPOINTS ===

  async getBatchCheckinStatuses(eventIds: string[]): Promise<ApiResponse<{
    statuses: { [eventId: string]: { status: string; checkInId?: string; checkInTime?: string } }
  }>> {
    return this.queuedRequest(
      '/api/mobile/events/checkins/batch',
      {
        method: 'POST',
        body: JSON.stringify({ eventIds }),
      },
      true,
      4
    )
  }

  async getActiveCheckins(options?: { force?: boolean }): Promise<ApiResponse<{
    checkIns: Array<{
      id: string
      eventId: string
      checkInTime: string
      /**
       * Whether **you** are named in this room. Never anyone else's state.
       *
       * The only way the app can know: the roster returns pseudonyms, matches
       * never include the viewer, and there is no GET for per-event
       * preferences. Drives the status chip, which must not guess — a chip that
       * is wrong about your own anonymity is worse than no chip.
       */
      revealed?: boolean
      /** `venue_day`: a Go Live at a place — name it by `event.venueName`, count down to `expiresAt`. */
      kind?: 'event' | 'venue_day'
      /** The place a Go Live is at (`venue_day` only), to extend or go again from anywhere. */
      venueId?: string | null
      /** A Go Live's end; null at an event. */
      expiresAt?: string | null
      stay?: boolean
      event: {
        id: string
        title: string
        slug: string
        coverImageUrl: string | null
        startTime: string
        endTime: string
        venueName: string | null
        address: string | null
        city: string | null
        status: string
      }
    }>
  }>> {
    const endpoint = '/api/mobile/checkins/active'
    if (options?.force) {
      return this.queuedRequest(endpoint)
    }
    return this.cachedRequest(endpoint, CHECKINS_SWR_TTL)
  }

  async getChatParticipants(chatGroupId: string, params?: { limit?: number; offset?: number }): Promise<ApiResponse<{
    participants: Array<{
      userId: string
      name: string | null
      avatar: string | null
      role: string
      status: string
      joinedAt: string
    }>
    totalCount: number
  }>> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.append('limit', String(params.limit))
    if (params?.offset) searchParams.append('offset', String(params.offset))
    const query = searchParams.toString()
    return this.cachedRequest(
      `/api/mobile/chat/groups/${chatGroupId}/participants${query ? `?${query}` : ''}`,
      PARTICIPANTS_SWR_TTL
    )
  }

  async deleteUpload(url: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.queuedRequest(
      '/api/mobile/uploads/delete',
      {
        method: 'DELETE',
        body: JSON.stringify({ url }),
      },
      true,
      5
    )
  }

  // === MESSAGE REQUESTS ===

  async createMessageRequest(recipientId: string, message?: string): Promise<ApiResponse<{
    request: {
      id: string
      recipientId: string
      recipient: { id: string; name: string | null; avatar: string | null }
      message: string | null
      status: string
      createdAt: string
    }
  }>> {
    return this.queuedRequest(
      '/api/mobile/message-requests',
      {
        method: 'POST',
        body: JSON.stringify({ recipientId, message }),
      },
      true,
      2
    )
  }

  async getMessageRequests(
    params?: { status?: string; limit?: number; offset?: number },
    options?: { force?: boolean }
  ): Promise<ApiResponse<{
    requests: Array<{
      id: string
      senderId: string
      sender: { id: string; name: string | null; avatar: string | null }
      message: string | null
      status: string
      createdAt: string
    }>
    totalCount: number
  }>> {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.append('status', params.status)
    if (params?.limit) searchParams.append('limit', String(params.limit))
    if (params?.offset) searchParams.append('offset', String(params.offset))
    const query = searchParams.toString()
    const endpoint = `/api/mobile/message-requests${query ? `?${query}` : ''}`
    if (options?.force) {
      return this.queuedRequest(endpoint)
    }
    return this.cachedRequest(endpoint, REQUESTS_SWR_TTL)
  }

  async respondToMessageRequest(
    requestId: string,
    action: 'accept' | 'decline' | 'block'
  ): Promise<ApiResponse<{
    success: boolean
    status: string
    conversationId: string | null
    sender: { id: string; name: string | null; avatar: string | null }
  }>> {
    const result = await this.queuedRequest<{
      success: boolean
      status: string
      conversationId: string | null
      sender: { id: string; name: string | null; avatar: string | null }
    }>(
      `/api/mobile/message-requests/${requestId}/respond`,
      {
        method: 'POST',
        body: JSON.stringify({ action }),
      },
      true,
      2
    )
    if (action === 'block') noteBlockedOn(result)
    return result
  }

  // === FRIENDS ===
  // No search, by design: see lib/friends.ts. Reads go through `queuedRequest`
  // uncached — these lists change the moment someone taps Accept.

  /**
   * A page of your friends: the first with no cursor, the next with the last page's `pagination.nextCursor`. `count` is the whole
   * list. `q` (1-40 characters) keeps the friends a word of whose name starts with it, and `count` is then the filtered total; a
   * server that does not know `q` ignores it (`localSearch`).
   */
  async getFriends(cursor?: string | null, q?: string | null): Promise<ApiResponse<FriendsPayload>> {
    const more = `${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`
    return this.queuedRequest(`/api/mobile/friends?limit=${LIST_PAGE.friends}${more}`)
  }

  async getFriend(userId: string): Promise<ApiResponse<FriendProfile>> {
    return this.queuedRequest(`/api/mobile/friends/${encodeURIComponent(userId)}`)
  }

  async removeFriend(userId: string): Promise<ApiResponse<{ removed: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/friends/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
      true,
      2
    )
  }

  async openFriendConversation(userId: string): Promise<ApiResponse<{ conversationId: string }>> {
    return this.queuedRequest(
      `/api/mobile/friends/${encodeURIComponent(userId)}/conversation`,
      { method: 'POST' },
      true,
      2
    )
  }

  async getFriendInvite(): Promise<ApiResponse<FriendInvite>> {
    return this.queuedRequest('/api/mobile/friends/invite')
  }

  async resetFriendInvite(): Promise<ApiResponse<FriendInvite>> {
    return this.queuedRequest('/api/mobile/friends/invite', { method: 'POST' }, true, 2)
  }

  async openFriendInvite(token: string): Promise<ApiResponse<{ person: FriendPerson; state: FriendState }>> {
    return this.queuedRequest(`/api/mobile/friends/invite/${encodeURIComponent(token)}`)
  }

  /**
   * Who sent this link, for somebody who is **not signed in** — so it goes
   * without a token. A first name and a photo, nothing else. 404 `NOT_FOUND`
   * when the link does not work; 429 `RATE_LIMITED` per IP.
   */
  async getFriendInvitePreview(token: string): Promise<ApiResponse<FriendInvitePreview>> {
    return this.queuedRequest(`/api/mobile/friends/invite/${encodeURIComponent(token)}/preview`, {}, false)
  }

  /**
   * Both sides' first page, or (`page`) one side's next: `?list=incoming|outgoing&cursor=` answers only that array, its
   * `pagination` named by side.
   */
  async getFriendRequests(page?: { side: 'incoming' | 'outgoing'; cursor: string }): Promise<ApiResponse<FriendRequestsPayload>> {
    const side = page ? `&list=${page.side}&cursor=${encodeURIComponent(page.cursor)}` : ''
    return this.queuedRequest(`/api/mobile/friends/requests?limit=${LIST_PAGE.friendRequests}${side}`)
  }

  async sendFriendRequest(
    to: { token: string } | { userId: string }
  ): Promise<ApiResponse<{ state: 'requested' | 'friends' }>> {
    return this.queuedRequest(
      '/api/mobile/friends/requests',
      { method: 'POST', body: JSON.stringify(to) },
      true,
      2
    )
  }

  async respondToFriendRequest(
    requestId: string,
    action: 'accept' | 'dismiss'
  ): Promise<ApiResponse<{ state?: 'friends'; dismissed?: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/friends/requests/${encodeURIComponent(requestId)}`,
      { method: 'POST', body: JSON.stringify({ action }) },
      true,
      2
    )
  }

  async withdrawFriendRequest(requestId: string): Promise<ApiResponse<{ withdrawn: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/friends/requests/${encodeURIComponent(requestId)}`,
      { method: 'DELETE' },
      true,
      2
    )
  }

  // === THE BOARD ===
  // See lib/board.ts. Uncached, like the friends lists: a board is read to
  // decide, and a stale one offers a seat that has gone. Every refusal on these
  // routes is a sentence for the person (`boardMessage`).

  async getBoard(eventId: string): Promise<ApiResponse<{ posts: BoardPost[] }>> {
    return this.queuedRequest(`/api/mobile/events/${encodeURIComponent(eventId)}/board`)
  }

  async postToBoard(
    eventId: string,
    post: { kind: 'offer' | 'seeking'; body: string; spacesLeft?: number }
  ): Promise<ApiResponse<Pick<BoardPost, 'id' | 'kind' | 'body' | 'spacesLeft' | 'createdAt'>>> {
    return this.queuedRequest(
      `/api/mobile/events/${encodeURIComponent(eventId)}/board`,
      { method: 'POST', body: JSON.stringify(post) },
      true,
      2
    )
  }

  async withdrawBoardPost(eventId: string, postId: string): Promise<ApiResponse<{ id: string; withdrawn: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/events/${encodeURIComponent(eventId)}/board/${encodeURIComponent(postId)}`,
      { method: 'DELETE' },
      true,
      2
    )
  }

  /** No message: asking is one tap, and "can I join?" needs no essay. */
  async askOnBoard(eventId: string, postId: string): Promise<ApiResponse<{ id: string; status: 'pending' }>> {
    return this.queuedRequest(
      `/api/mobile/events/${encodeURIComponent(eventId)}/board/${encodeURIComponent(postId)}/requests`,
      { method: 'POST', body: JSON.stringify({}) },
      true,
      2
    )
  }

  async getBoardRequests(): Promise<ApiResponse<BoardRequests>> {
    return this.queuedRequest('/api/mobile/board/requests')
  }

  /** `conversationId` comes back on accept: the pseudonymous DM it opened. */
  async answerBoardRequest(
    requestId: string,
    action: 'accept' | 'decline' | 'withdraw'
  ): Promise<ApiResponse<{ id: string; status: BoardRequestStatus; conversationId?: string }>> {
    return this.queuedRequest(
      `/api/mobile/board/requests/${encodeURIComponent(requestId)}`,
      { method: 'PATCH', body: JSON.stringify({ action }) },
      true,
      2
    )
  }

  /*
   * Report and block on the board are **by the post or the ask** a person
   * wrote: the board never hands the client a user id, and the server never
   * returns the one it resolves. Reasons are the message-report reasons.
   */
  async reportBoardPost(
    eventId: string,
    postId: string,
    report: { reason: BoardReportReason; description?: string }
  ): Promise<ApiResponse<{ reported: true }>> {
    return this.queuedRequest(
      `/api/mobile/events/${encodeURIComponent(eventId)}/board/${encodeURIComponent(postId)}/report`,
      { method: 'POST', body: JSON.stringify(report) },
      true,
      2
    )
  }

  async blockBoardPost(eventId: string, postId: string): Promise<ApiResponse<{ blocked: boolean }>> {
    return noteBlockedOn(
      await this.queuedRequest<{ blocked: boolean }>(
        `/api/mobile/events/${encodeURIComponent(eventId)}/board/${encodeURIComponent(postId)}/block`,
        { method: 'POST' },
        true,
        2
      )
    )
  }

  async reportBoardRequest(
    requestId: string,
    report: { reason: BoardReportReason; description?: string }
  ): Promise<ApiResponse<{ reported: true }>> {
    return this.queuedRequest(
      `/api/mobile/board/requests/${encodeURIComponent(requestId)}/report`,
      { method: 'POST', body: JSON.stringify(report) },
      true,
      2
    )
  }

  async blockBoardRequest(requestId: string): Promise<ApiResponse<{ blocked: boolean }>> {
    return noteBlockedOn(
      await this.queuedRequest<{ blocked: boolean }>(
        `/api/mobile/board/requests/${encodeURIComponent(requestId)}/block`,
        { method: 'POST' },
        true,
        2
      )
    )
  }

  // === SAFETY ENDPOINTS ===

  async blockUser(userId: string): Promise<ApiResponse<{ blocked: boolean }>> {
    const result = noteBlockedOn(
      await this.queuedRequest<{ blocked: boolean }>(
        `/api/mobile/users/${userId}/block`,
        { method: 'POST' },
        true,
        2
      )
    )
    // A block severs a friendship: Friends drops them from pages it read earlier, whichever screen the block came from.
    if (result.success) noteFriendGone(userId)
    return result
  }

  async unblockUser(userId: string): Promise<ApiResponse<{ blocked: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/users/${userId}/block`,
      { method: 'DELETE' },
      true,
      2
    )
  }

  async getBlockedUsers(): Promise<ApiResponse<{
    users: Array<{
      blocked_id: string
      blocked_user_name: string | null
      blocked_user_photo: string | null
      reason: string | null
      blocked_at: string
    }>
  }>> {
    return this.queuedRequest(`/api/mobile/users/blocked?limit=${LIST_PAGE.blocked}`, undefined, true, 4)
  }

  async reportUser(
    userId: string,
    reason: string,
    description?: string
  ): Promise<ApiResponse<{ reported: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/users/${userId}/report`,
      {
        method: 'POST',
        body: JSON.stringify({ reason, description }),
      },
      true,
      2
    )
  }

  /**
   * Report the event itself.
   *
   * The third subject, and the one that had no path. A person could be
   * reported and a message could be reported; the event — the thing somebody
   * is being asked to physically turn up to — could not.
   *
   * No check-in required, matching the server: two of the three things worth
   * reporting are visible from the listing, and the value is catching them
   * *before* somebody travels to a venue.
   */
  async reportEvent(
    eventId: string,
    reason: string,
    description?: string
  ): Promise<ApiResponse<{ reported: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/events/${eventId}/report`,
      {
        method: 'POST',
        body: JSON.stringify({ reason, description }),
      },
      true,
      2
    )
  }

  async reportMessage(
    messageId: string,
    messageType: 'group' | 'private',
    reason: string,
    description?: string
  ): Promise<ApiResponse<{ reported: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/messages/${messageId}/report`,
      {
        method: 'POST',
        body: JSON.stringify({ messageType, reason, description }),
      },
      true,
      2
    )
  }

  // === HELPER METHODS ===

  async getCurrentUser(): Promise<AuthUser | null> {
    return TokenStorage.getUser()
  }

  clearResponseCache() {
    // A read that started before the clear (another account's, at sign-out) must not refill the cache after it.
    this.cacheEpoch++
    this.responseCache.clear()
    this.inFlight.clear()
    Logger.info('api', 'Response cache cleared')
  }
}

// Export singleton instance
export const apiClient = new ApiClientClass(API_BASE_URL)

// Export TokenStorage for direct access when needed
export { TokenStorage }

// App state listener for queue management
const registerAppStateListener = () => {
  try {
    AppState.addEventListener('change', (state) => {
      try {
        Logger.info('api', `App state changed to: ${state}`)
        if (state !== 'active') {
          // Clear request queue on background to prevent stale requests
          requestQueue.clear()
        }
      } catch (error) {
        Logger.error('api', 'Error handling app state change', { error })
      }
    })
    Logger.info('api', 'App state listener registered for API client')
  } catch (error) {
    Logger.error('api', 'Failed to register app state listener', { error })
  }
}

// Register with a small delay
setTimeout(registerAppStateListener, 1000)
