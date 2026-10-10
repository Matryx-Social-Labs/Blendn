/**
 * API Client for Blendn Mobile App
 * Replaces direct Supabase calls with admin backend API calls
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AttendancePayload, RsvpEventsPayload, SavedEventsPayload } from './savedEvents'
import { namedList, type NamedList } from './namedList'
import * as SecureStore from 'expo-secure-store'
import { AppState, Platform } from 'react-native'
import { type ResponseHead, TIMEOUT_MESSAGE, fetchWithTimeout, isTimeoutError } from './fetchTimeout'
import type { CityOption } from './city'
import { Logger } from './logger'
import { markOffline, markOnline } from './networkStatus'
import type { NotificationFeed } from './notificationFormat'
import type { Friend, FriendInvite, FriendPerson, FriendProfile, FriendRequest, FriendState } from './friends'
import type { BoardPost, BoardReportReason, BoardRequestStatus, BoardRequests } from './board'
import type { Badge, Choice, Overlap, ProfileOptions } from './aboutYou'
import { markSessionExpired, markSessionStarted } from './sessionEvents'
import { noteServerDate } from './serverClock'
import { getPushTokenRef, setPushTokenRef } from './pushTokenRef'

// API Configuration
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL
const EVENTS_LIST_SWR_TTL = 60 * 1000
const CHAT_LIST_SWR_TTL = 30 * 1000
const REQUESTS_SWR_TTL = 30 * 1000
const CHECKINS_SWR_TTL = 30 * 1000
const CATEGORIES_SWR_TTL = 10 * 60 * 1000
const PARTICIPANTS_SWR_TTL = 30 * 1000
const INTERESTED_USERS_SWR_TTL = 30 * 1000
const EVENT_CHECKINS_SWR_TTL = 30 * 1000

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
class RequestQueue {
  private queue: Array<{
    request: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
    priority: number
    timestamp: number
    type: 'query' | 'mutation' | 'auth'
  }> = []
  private processing = false
  private maxConcurrent = 6
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
      this.currentRequests--
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
    this.currentRequests = 0
    this.processing = false
  }
}

const requestQueue = new RequestQueue()

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

// Token Storage
class TokenStorage {
  private static async secureGet(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      warnUnencryptedWebStorage()
      try {
        return await AsyncStorage.getItem(key)
      } catch {
        return null
      }
    }
    try {
      return await SecureStore.getItemAsync(key, SECURE_OPTIONS)
    } catch (error) {
      // Unexpected on native (e.g. keychain access failure) — fall back but
      // log it so it's visible in Sentry rather than silently swallowed.
      Logger.warn('auth', 'SecureStore read failed, falling back to AsyncStorage', { key, error })
      try {
        return await AsyncStorage.getItem(key)
      } catch {
        return null
      }
    }
  }

  private static async secureSet(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      warnUnencryptedWebStorage()
      await AsyncStorage.setItem(key, value)
      return
    }
    try {
      await SecureStore.setItemAsync(key, value, SECURE_OPTIONS)
      // Clear from AsyncStorage if it was there
      try {
        await AsyncStorage.removeItem(key)
      } catch {}
    } catch (error) {
      Logger.warn('auth', 'SecureStore write failed, falling back to AsyncStorage', { key, error })
      await AsyncStorage.setItem(key, value)
    }
  }

  private static async secureRemove(key: string): Promise<void> {
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

  static async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([this.setAccessToken(accessToken), this.setRefreshToken(refreshToken)])
    markSessionStarted()
  }
}

// Profile Cache - shared across components to avoid duplicate fetches
const PROFILE_CACHE_TTL = 60 * 1000 // 60 seconds
interface ProfileCacheEntry {
  data: UserProfileData
  timestamp: number
  userId: string
}
let profileCache: ProfileCacheEntry | null = null

export const ProfileCache = {
  get(userId: string): UserProfileData | null {
    if (!profileCache) return null
    if (profileCache.userId !== userId) return null
    if (Date.now() - profileCache.timestamp > PROFILE_CACHE_TTL) {
      profileCache = null
      return null
    }
    return profileCache.data
  },
  set(userId: string, data: UserProfileData): void {
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

/** `null` means "withheld", never "zero" — see the server's `lib/disclosure.ts`. */
export type Disclosed<T> = T | null

export interface PollOption {
  id: string
  label: string
  position: number
  votes: Disclosed<number>
}

/**
 * One poll as this reader may see it.
 *
 * Counts arrive already disclosed. A client that increments them locally after
 * a vote would show a number the disclosure floor withheld, so the vote call
 * returns this same shape and the screen renders that instead.
 */
export interface PollResults {
  id: string
  question: string
  closesAt: string | null
  closed: boolean
  resultsVisible: boolean
  options: PollOption[]
  total: Disclosed<number>
  suppressed: boolean
  /** What to render in place of the numbers. Null when nothing is withheld. */
  suppressedLabel: string | null
  /** Which option you chose, if any. */
  myVote: string | null
}

/** Counts and whether *you* reacted — never who else did. */
export interface ReactionTally {
  emoji: string
  count: number
  mine: boolean
}

/** The six the server accepts. Anything else is a 400. */
export const CHAT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const
export type ChatReaction = (typeof CHAT_REACTIONS)[number]

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
  /**
   * The event a refusal hands off to. Go Live answers `EVENT_LIVE_HERE` with
   * it (`POST /venues/:venueId/live`): check in to that event instead.
   */
  eventId?: string
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



export interface AuthUser {
  id: string
  email: string
  name: string | null
  image: string | null
  emailVerified: string | null
  createdAt: string
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
  total: number
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
  timezone: string
  status: string
  visibility: string
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
  isRecurring: boolean
  externalLink: string | null
  createdAt: string
  distance: number | null
  isFavorited?: boolean
  favoriteCount?: number
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
    checkInCount?: number
    favoriteCount?: number
    /** Seats taken; the Scene's "Going" count before the doors. */
    rsvpCount?: number
    ratingCount?: number
    averageRating?: number | null
  }
  userStatus?: {
    isFavorited?: boolean
    isCheckedIn?: boolean
    checkInStatus?: string | null
    checkInId?: string
    userRating?: number | null
    userReview?: string | null
    rsvpStatus?: 'going' | 'maybe' | 'not_going' | null
  }
}

export interface EventsListResponse {
  events: EventApiItem[]
  pagination: PaginationMeta
  activeCheckins?: Array<{ id: string; eventId: string; status: string; [key: string]: unknown }>
  profile?: UserProfileData
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
  upcomingEventCount: number
  /** How many are live here, as a bucket and never a number (D-19); null for somebody the venue page would refuse. */
  liveNow: 'quiet' | '5-9' | '10-19' | '20+' | null
  nextEvent: {
    id: string
    title: string
    slug: string | null
    coverImageUrl: string | null
    startTime: string
    endTime: string
  } | null
}

export interface VenuesListResponse {
  venues: VenueListItem[]
  pagination: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean }
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
    venueTypeLabel: string
    /** False: "Own this place? Claim it" applies. */
    claimed: boolean
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
  }
  /**
   * The public claim page, when the place is unclaimed and the server offers
   * one (`{ url }`, built on the dashboard host). Read through `claimUrlFrom`.
   */
  claim?: { url?: unknown } | null
  tonight: { id: string; title: string; startTime: string; endTime: string } | null
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

export interface CheckinPagination {
  page: number
  limit: number
  totalCount: number
  hasMore: boolean
}

export interface CheckinAttendee {
  id: string
  userId: string
  eventId: string
  checkInTime: string
  user?: {
    id: string
    name: string | null
    image: string | null
  }
  [key: string]: unknown
}

export interface UserProfileData {
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
  /** Nested profile object from /api/mobile/profiles/[userId] */
  profile?: {
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
    created_at?: string
    updated_at?: string
  }
}

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
  status?: string
  memberCount?: number
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
let isRefreshing = false
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

export const REFRESH_RETRY_DELAYS_MS = [2000, 5000, 10000] as const
let refreshRetryAttempt = 0
let refreshRetryTimer: ReturnType<typeof setTimeout> | null = null
/** The server's sentence from the last rejected refresh, if it gave one. */
let rejectedReason: string | undefined

// API Client Class
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

  private getCached<T>(key: string): { data: ApiResponse<T>; isFresh: boolean } | null {
    const entry = this.responseCache.get(key)
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    return { data: entry.data as ApiResponse<T>, isFresh: age < entry.ttl }
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
   */
  forgetEventMatches(eventId: string): void {
    const matches = `:/api/mobile/events/${eventId}/matches`
    const isRoom = (key: string) => key.includes(`${matches}:`) || key.includes(`${matches}?`)
    this.cacheEpoch++
    for (const key of this.responseCache.keys()) if (isRoom(key)) this.responseCache.delete(key)
    // A read already on the wire was answered before the event: the next one
    // must not join it.
    for (const key of this.inFlight.keys()) if (isRoom(key)) this.inFlight.delete(key)
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

  private refreshCacheInBackground<T>(
    endpoint: string,
    options: RequestInit,
    requireAuth: boolean,
    priority: number,
    key: string,
    ttl: number
  ) {
    const epoch = this.cacheEpoch
    this.queuedRequest<T>(endpoint, options, requireAuth, priority).then((result) => {
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
      return {
        success: false,
        // Carried through so a screen can branch on the reason rather than
        // guess from the sentence. See ApiResponse.errorCode.
        errorCode: typeof parsed.errorCode === 'string' ? parsed.errorCode : undefined,
        // Body first, then the header, because only the body survives a proxy
        // that strips Retry-After.
        retryAfter: typeof parsed.retryAfter === 'number'
          ? parsed.retryAfter
          : Number(response.headers.get('Retry-After')) || undefined,
        ...(typeof parsed.chatGroupId === 'string' ? { chatGroupId: parsed.chatGroupId } : {}),
        ...(typeof parsed.eventId === 'string' ? { eventId: parsed.eventId } : {}),
        error: this.buildErrorMessage(response, parsed, endpoint),
        errors: parsed?.errors as Array<{ path: string; message: string }> | undefined,
      }
    }

    if (parsed && typeof parsed === 'object' && 'success' in parsed) {
      return parsed as unknown as ApiResponse<T>
    }

    return { success: true, data: parsed as T }
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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (requireAuth) {
      const accessToken = await TokenStorage.getAccessToken()
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
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
          const refreshed = await this.refreshTokens()
          if (refreshed === 'ok') {
            const newAccessToken = await TokenStorage.getAccessToken()
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
          markSessionExpired(rejectedReason)
          rejectedReason = undefined
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
    if (isRefreshing && refreshPromise) {
      return refreshPromise
    }

    isRefreshing = true
    // Store promise BEFORE any await so concurrent callers see it immediately.
    const p: Promise<RefreshOutcome> = (async () => {
      try {
        const refreshToken = await TokenStorage.getRefreshToken()
        if (!refreshToken) {
          return 'rejected'
        }

        // Deliberately on a deadline too. A hung refresh is the worst version
        // of this bug: `isRefreshing` gates every other caller behind one
        // promise, so a single stalled refresh silently blocks re-auth for the
        // whole app until it is killed.
        const { response, body: raw } = await fetchWithTimeout(`${this.baseUrl}/api/mobile/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })

        if (!response.ok) {
          // 5xx is the server being unwell, not the token being bad.
          if (response.status >= 500) return 'failed'
          // A 403 is the server saying why — suspended, or a staff account
          // in the attendee app. Keep the sentence for the entry screen.
          if (response.status === 403) {
            try {
              const body = JSON.parse(raw) as { error?: unknown }
              if (typeof body?.error === 'string') rejectedReason = body.error
            } catch {}
          }
          return 'rejected'
        }

        const data: ApiResponse<{ accessToken: string; refreshToken: string }> = JSON.parse(raw)

        if (data.success && data.data) {
          await TokenStorage.setTokens(data.data.accessToken, data.data.refreshToken)
          return 'ok'
        }

        return 'rejected'
      } catch (error) {
        Logger.error('api', 'Token refresh failed', { error })
        return 'failed'
      }
    })()

    refreshPromise = p

    // Reset flags after all awaiting callers have received the result (next microtask).
    p.finally(() => {
      isRefreshing = false
      refreshPromise = null
    })

    p.then((outcome) => {
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

  async cachedRequest<T>(
    endpoint: string,
    cache: { ttl: number; swr?: boolean; key?: string },
    options: RequestInit = {},
    requireAuth: boolean = true,
    priority: number = 5
  ): Promise<ApiResponse<T>> {
    const method = (options.method || 'GET').toUpperCase()
    if (method !== 'GET') {
      return this.queuedRequest<T>(endpoint, options, requireAuth, priority)
    }

    const key = cache.key || this.buildRequestKey(endpoint, options, requireAuth)
    const cached = this.getCached<T>(key)

    if (cached) {
      if (cached.isFresh) {
        return cached.data
      }

      if (cache.swr) {
        this.refreshCacheInBackground<T>(endpoint, options, requireAuth, priority, key, cache.ttl)
        return cached.data
      }
    }

    const epoch = this.cacheEpoch
    const result = await this.queuedRequest<T>(endpoint, options, requireAuth, priority)
    if (result.success && epoch === this.cacheEpoch) {
      this.setCache(key, result, cache.ttl)
    }
    return result
  }

  // === AUTH ENDPOINTS ===

  async signInWithGoogle(
    idToken: string,
    deviceInfo?: { platform?: string; device?: string; appVersion?: string }
  ): Promise<ApiResponse<AuthResult>> {
    const result = await this.request<AuthResult>(
      '/api/mobile/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ idToken, deviceInfo }),
      },
      false
    )

    if (result.success && result.data) {
      await TokenStorage.setTokens(result.data.accessToken, result.data.refreshToken)
      await TokenStorage.setUser(result.data.user)
    }

    return result
  }

  async signInWithApple(
    identityToken: string,
    fullName?: { givenName?: string | null; familyName?: string | null },
    deviceInfo?: { platform?: string; device?: string; appVersion?: string }
  ): Promise<ApiResponse<AuthResult>> {
    const result = await this.request<AuthResult>(
      '/api/mobile/auth/apple',
      {
        method: 'POST',
        body: JSON.stringify({ identityToken, fullName, deviceInfo }),
      },
      false
    )

    if (result.success && result.data) {
      await TokenStorage.setTokens(result.data.accessToken, result.data.refreshToken)
      await TokenStorage.setUser(result.data.user)
    }

    return result
  }

  async signInWithEmail(
    email: string,
    password: string,
    deviceInfo?: { platform?: string; device?: string; appVersion?: string }
  ): Promise<ApiResponse<AuthResult>> {
    const result = await this.request<AuthResult>(
      '/api/mobile/auth/signin',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, deviceInfo }),
      },
      false
    )

    if (result.success && result.data) {
      await TokenStorage.setTokens(result.data.accessToken, result.data.refreshToken)
      await TokenStorage.setUser(result.data.user)
    }

    return result
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
    const result = await this.request<AuthResult>(
      '/api/mobile/auth/signup',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, name, age, deviceInfo }),
      },
      false
    )

    if (result.success && result.data) {
      await TokenStorage.setTokens(result.data.accessToken, result.data.refreshToken)
      await TokenStorage.setUser(result.data.user)
    }

    return result
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

  async deleteAccount(): Promise<ApiResponse<{ deleted: boolean }>> {
    const result = await this.request<{ deleted: boolean }>('/api/mobile/account', {
      method: 'DELETE',
    })

    if (result.success) {
      await TokenStorage.clearAll()
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
  async signOut(revokeAll: boolean = false): Promise<ApiResponse<void>> {
    const refreshToken = await TokenStorage.getRefreshToken()
    const result = await this.request<void>('/api/mobile/auth/signout', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: revokeAll ? undefined : refreshToken,
        pushToken: getPushTokenRef() ?? undefined,
      }),
    })

    setPushTokenRef(null)
    await TokenStorage.clearAll()
    requestQueue.clear()
    /*
     * Drop the cached responses too.
     *
     * `clearResponseCache` had no callers, so after signing out the map still
     * held the previous user's response bodies -- their conversations, their
     * matches, their profile -- in memory, keyed by endpoint. The next person to
     * use the device signs in, hits the same endpoint, and `getCached` returns
     * whatever is under that key.
     *
     * The TTL is not a defence: an expired entry is served as stale-while-
     * revalidate rather than dropped, so it is returned first and corrected
     * afterwards. Same shape as the push tokens above -- state that outlives the
     * session it belongs to.
     */
    this.clearResponseCache()

    return result
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
  }, options?: { force?: boolean }): Promise<ApiResponse<EventsListResponse>> {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
    }
    const query = searchParams.toString()
    const endpoint = `/api/mobile/events${query ? `?${query}` : ''}`
    if (options?.force) {
      return this.queuedRequest<EventsListResponse>(endpoint)
    }
    return this.cachedRequest<EventsListResponse>(endpoint, { ttl: EVENTS_LIST_SWR_TTL, swr: true })
  }

  /**
   * Places — `GET /venues`. Takes the Pulse's vocabulary (`city`, `lat`/`lon`,
   * no default radius). A venue an event has taken over is not in it; its
   * event's card names the venue instead.
   */
  async getVenues(
    params: { page?: number; limit?: number; city?: string; lat?: number; lon?: number; sortBy?: 'name' | 'distance' },
    options?: { force?: boolean }
  ): Promise<ApiResponse<VenuesListResponse>> {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) searchParams.append(key, String(value))
    })
    const query = searchParams.toString()
    const endpoint = `/api/mobile/venues${query ? `?${query}` : ''}`
    if (options?.force) return this.queuedRequest<VenuesListResponse>(endpoint)
    return this.cachedRequest<VenuesListResponse>(endpoint, { ttl: EVENTS_LIST_SWR_TTL, swr: true })
  }

  /** One venue — `GET /venues/:venueId`. Not cached: it carries the live count. */
  async getVenue(venueId: string): Promise<ApiResponse<VenueDetail>> {
    return this.queuedRequest<VenueDetail>(`/api/mobile/venues/${encodeURIComponent(venueId)}`)
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
      { ttl: 5 * 60 * 1000, swr: true }
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
      if (params.lat !== undefined) searchParams.append('lat', String(params.lat))
      if (params.lon !== undefined) searchParams.append('lon', String(params.lon))
      if (params.include) searchParams.append('include', params.include)
      if (params.interestedLimit !== undefined) {
        searchParams.append('interestedLimit', String(params.interestedLimit))
      }
    }
    const query = searchParams.toString()
    return this.cachedRequest<EventApiItem>(
      `/api/mobile/events/${eventId}${query ? `?${query}` : ''}`,
      { ttl: 30 * 1000, swr: true }
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

  async getEventCheckins(eventId: string, options?: { force?: boolean; page?: number; limit?: number }): Promise<ApiResponse<{ attendees: CheckinAttendee[]; pagination: CheckinPagination }>> {
    const page = options?.page ?? 1
    const limit = options?.limit ?? 20
    const endpoint = `/api/mobile/events/${eventId}/checkins?page=${page}&limit=${limit}`
    if (options?.force || page > 1) {
      return this.queuedRequest(endpoint)
    }
    return this.cachedRequest(endpoint, { ttl: EVENT_CHECKINS_SWR_TTL, swr: true })
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

  // === ORGANIZER ENDPOINTS ===

  async updateEvent(
    eventId: string,
    data: { title?: string; description?: string; shortDescription?: string; status?: string }
  ): Promise<ApiResponse<EventApiItem>> {
    return this.queuedRequest<EventApiItem>(
      `/api/mobile/events/${eventId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      true,
      2
    )
  }

  async deleteEvent(eventId: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.queuedRequest<{ success: boolean }>(
      `/api/mobile/events/${eventId}`,
      { method: 'DELETE' },
      true,
      2
    )
  }

  async sendAnnouncement(
    eventId: string,
    content: string
  ): Promise<ApiResponse<{ id: string }>> {
    return this.queuedRequest<{ id: string }>(
      `/api/mobile/events/${eventId}/announce`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      },
      true,
      2
    )
  }

  // === PROFILE ENDPOINTS ===

  async getProfile(userId: string): Promise<ApiResponse<UserProfileData>> {
    // Check cache first for instant response
    const cached = ProfileCache.get(userId)
    if (cached) {
      return { success: true, data: cached }
    }

    const result = await this.queuedRequest<UserProfileData>(`/api/mobile/profiles/${userId}`)

    // Cache successful responses
    if (result.success && result.data) {
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

  async getPublicProfile(userId: string): Promise<ApiResponse<UserProfileData>> {
    return this.queuedRequest<UserProfileData>(`/api/mobile/users/${userId}`)
  }

  /**
   * `{ events, pagination }`, not a bare array — the server wraps it, the same
   * way `getProfileInterests` is wrapped. This was typed as the array and the
   * Going tab mapped over the envelope (SCRUM-175).
   */
  async getUserFavorites(userId: string): Promise<ApiResponse<SavedEventsPayload>> {
    return this.queuedRequest<SavedEventsPayload>(`/api/mobile/users/${userId}/favorites`)
  }

  /**
   * Your upcoming `going` and `waitlisted` RSVPs, soonest first. `/me`-scoped:
   * there is no way to ask for somebody else's. A server older than this route
   * answers 404, which the Going tab reads as "no section", not as a failure.
   */
  async getMyRsvps(): Promise<ApiResponse<RsvpEventsPayload>> {
    return this.queuedRequest<RsvpEventsPayload>('/api/mobile/me/rsvps?limit=50')
  }

  /** The events you attended, most recent first. `/me`-scoped, like the above. */
  async getMyAttendance(limit = 10): Promise<ApiResponse<AttendancePayload>> {
    return this.queuedRequest<AttendancePayload>(`/api/mobile/me/attendance?limit=${limit}`)
  }

  // === CHAT ENDPOINTS ===

  async getChatGroups(options?: { force?: boolean }): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const endpoint = '/api/mobile/chat/groups'
    if (options?.force) {
      return this.queuedRequest<Array<Record<string, unknown>>>(endpoint)
    }
    return this.cachedRequest<Array<Record<string, unknown>>>(endpoint, { ttl: CHAT_LIST_SWR_TTL, swr: true })
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
    folder: 'profile' | 'chat' | 'events' = 'profile'
  ): Promise<ApiResponse<{ uploadUrl: string; publicUrl: string; key?: string }>> {
    return this.queuedRequest<{ uploadUrl: string; publicUrl: string; key?: string }>(
      '/api/mobile/uploads/presigned-url',
      {
        method: 'POST',
        body: JSON.stringify({ filename, contentType, folder }),
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
    // Same idiom as getEventCheckins: force bypasses the cache rather than
    // being passed into it.
    if (options?.force) return this.queuedRequest<{ matches: MatchCard[] }>(endpoint)
    return this.cachedRequest<{ matches: MatchCard[] }>(endpoint, { ttl: 30_000, swr: true })
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
    return this.cachedRequest<RoomPreview>(endpoint, { ttl: 15_000, swr: true })
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

  /** One poll, disclosed for you. 403 when you are not in the room. */
  async getPoll(eventId: string, pollId: string): Promise<ApiResponse<PollResults>> {
    return this.queuedRequest<PollResults>(`/api/mobile/events/${eventId}/polls/${pollId}`)
  }

  /**
   * Cast or change your vote. Answers with the poll's disclosed state, which
   * is what the screen should render — never a locally incremented count.
   * 409 carries a sentence the voter can act on ("This poll has closed").
   */
  async votePoll(
    eventId: string,
    pollId: string,
    optionId: string
  ): Promise<ApiResponse<PollResults>> {
    return this.queuedRequest<PollResults>(
      `/api/mobile/events/${eventId}/polls/${pollId}/vote`,
      { method: 'POST', body: JSON.stringify({ optionId }) },
      true,
      2
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
        { ttl: CATEGORIES_SWR_TTL, swr: true }
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
    return this.cachedRequest<ProfileOptions>('/api/mobile/profile-options', { ttl: CATEGORIES_SWR_TTL, swr: true })
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

  async getWorkFields(): Promise<ApiResponse<{ workFields: { slug: string; label: string }[] }>> {
    return this.cachedRequest<{ workFields: { slug: string; label: string }[] }>(
      '/api/mobile/work-fields',
      { ttl: CATEGORIES_SWR_TTL, swr: true }
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
        body: JSON.stringify({ token, platform }),
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
    const endpoint = '/api/mobile/conversations'
    if (options?.force) {
      return namedList(await this.queuedRequest<NamedList<'conversations'>>(endpoint), 'conversations')
    }
    return namedList(
      await this.cachedRequest<NamedList<'conversations'>>(endpoint, { ttl: CHAT_LIST_SWR_TTL, swr: true }),
      'conversations'
    )
  }

  async getOrCreateConversation(otherUserId: string): Promise<ApiResponse<{
    id: string
    otherUser: { id: string; name: string | null; image: string | null }
    createdAt: string
    isNew: boolean
  }>> {
    return this.queuedRequest(
      '/api/mobile/conversations',
      {
        method: 'POST',
        body: JSON.stringify({ otherUserId }),
      },
      true,
      2
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
    return this.queuedRequest(
      `/api/mobile/conversations/${conversationId}/leave`,
      { method: 'POST', body: JSON.stringify({ action: options.action ?? 'unmatch', ...options }) },
      true,
      3
    )
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

  async deleteConversation(conversationId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/conversations/${conversationId}`,
      { method: 'DELETE' },
      true,
      5
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
    return this.cachedRequest(endpoint, { ttl: CHECKINS_SWR_TTL, swr: true })
  }

  async getBatchInterestStatuses(eventIds: string[]): Promise<ApiResponse<{
    interests: { [eventId: string]: boolean }
  }>> {
    return this.queuedRequest(
      '/api/mobile/events/interests/batch',
      {
        method: 'POST',
        body: JSON.stringify({ eventIds }),
      },
      true,
      4
    )
  }

  async getBatchInterestCounts(eventIds: string[]): Promise<ApiResponse<{
    counts: { [eventId: string]: number }
  }>> {
    return this.queuedRequest(
      '/api/mobile/events/interest-counts/batch',
      {
        method: 'POST',
        body: JSON.stringify({ eventIds }),
      },
      true,
      4
    )
  }

  async getInterestedUsers(eventId: string, params?: { limit?: number; offset?: number }): Promise<ApiResponse<{
    users: Array<{ id: string; name: string | null; avatar: string | null }>
    totalCount: number
  }>> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.append('limit', String(params.limit))
    if (params?.offset) searchParams.append('offset', String(params.offset))
    const query = searchParams.toString()
    return this.cachedRequest(
      `/api/mobile/events/${eventId}/interested-users${query ? `?${query}` : ''}`,
      { ttl: INTERESTED_USERS_SWR_TTL, swr: true }
    )
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
      { ttl: PARTICIPANTS_SWR_TTL, swr: true }
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
    return this.cachedRequest(endpoint, { ttl: REQUESTS_SWR_TTL, swr: true })
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
    return this.queuedRequest(
      `/api/mobile/message-requests/${requestId}/respond`,
      {
        method: 'POST',
        body: JSON.stringify({ action }),
      },
      true,
      2
    )
  }

  // === FRIENDS ===
  // No search, by design: see lib/friends.ts. Reads go through `queuedRequest`
  // uncached — these lists change the moment someone taps Accept.

  async getFriends(): Promise<ApiResponse<{ friends: Friend[]; count: number }>> {
    return this.queuedRequest('/api/mobile/friends')
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

  async getFriendRequests(): Promise<ApiResponse<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>> {
    return this.queuedRequest('/api/mobile/friends/requests')
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
    return this.queuedRequest(
      `/api/mobile/events/${encodeURIComponent(eventId)}/board/${encodeURIComponent(postId)}/block`,
      { method: 'POST' },
      true,
      2
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
    return this.queuedRequest(
      `/api/mobile/board/requests/${encodeURIComponent(requestId)}/block`,
      { method: 'POST' },
      true,
      2
    )
  }

  // === SAFETY ENDPOINTS ===

  async blockUser(userId: string): Promise<ApiResponse<{ blocked: boolean }>> {
    return this.queuedRequest(
      `/api/mobile/users/${userId}/block`,
      { method: 'POST' },
      true,
      2
    )
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
    return this.queuedRequest('/api/mobile/users/blocked', undefined, true, 4)
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

  async isAuthenticated(): Promise<boolean> {
    const token = await TokenStorage.getAccessToken()
    return !!token
  }

  getQueueStats() {
    return requestQueue.getStats()
  }

  clearQueue() {
    requestQueue.clear()
  }

  clearResponseCache() {
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
let appStateListenerRegistered = false

const registerAppStateListener = () => {
  if (appStateListenerRegistered) return

  try {
    AppState.addEventListener('change', (state) => {
      try {
        Logger.info('api', `App state changed to: ${state}`)
        if (state !== 'active') {
          // Clear request queue on background to prevent stale requests
          apiClient.clearQueue()
        }
      } catch (error) {
        Logger.error('api', 'Error handling app state change', { error })
      }
    })
    appStateListenerRegistered = true
    Logger.info('api', 'App state listener registered for API client')
  } catch (error) {
    Logger.error('api', 'Failed to register app state listener', { error })
  }
}

// Register with a small delay
setTimeout(registerAppStateListener, 1000)
