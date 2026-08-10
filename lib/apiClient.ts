/**
 * API Client for Blendn Mobile App
 * Replaces direct Supabase calls with admin backend API calls
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { AppState, Platform } from 'react-native'
import { Logger } from './logger'
import { markOffline, markOnline } from './networkStatus'
import { markSessionExpired } from './sessionEvents'

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
  sharedIntents: string[]
  insideNow: boolean
  youLiked: boolean
}

export interface LikeOutcome {
  mutual: boolean
  /** Present only on a mutual like -- the conversation it just opened. */
  conversationId?: string
}

export interface PresencePing {
  status: 'inside' | 'outside' | 'prompt' | 'checked_out' | 'not_checked_in'
  reason?: string
  shortfallMetres?: number | null
  graceEndsAt?: string | null
  nextPingInSeconds?: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  errors?: Array<{ path: string; message: string }>
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
  timezone: string
  status: string
  visibility: string
  venueName: string | null
  venue_name?: string | null
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
  details?: {
    fullDescription?: string
    houseRules?: string | null
    cancellationPolicy?: string | null
    additionalInfo?: unknown
    faq?: unknown
    accessibilityInfo?: unknown
  }
  categories?: Array<{ id: string; name: string; slug: string; icon?: string | null }>
  media?: Array<{
    id: string
    type: string
    url: string
    thumbnailUrl?: string | null
    title?: string | null
    order: number
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
  onboarded?: boolean
  /** Nested profile object from /api/mobile/profiles/[userId] */
  profile?: {
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
  [key: string]: unknown
}

export interface EventChatData {
  chatGroupId?: string
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
let refreshPromise: Promise<boolean> | null = null

// API Client Class
class ApiClientClass {
  private baseUrl: string
  private inFlight = new Map<string, Promise<ApiResponse<unknown>>>()
  private responseCache = new Map<string, { data: ApiResponse<unknown>; timestamp: number; ttl: number }>()

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

  private setCache<T>(key: string, data: ApiResponse<T>, ttl: number) {
    this.responseCache.set(key, { data: data as ApiResponse<unknown>, timestamp: Date.now(), ttl })
  }

  private refreshCacheInBackground<T>(
    endpoint: string,
    options: RequestInit,
    requireAuth: boolean,
    priority: number,
    key: string,
    ttl: number
  ) {
    this.queuedRequest<T>(endpoint, options, requireAuth, priority).then((result) => {
      if (result.success) {
        this.setCache(key, result, ttl)
      }
    }).catch(() => {})
  }

  private buildErrorMessage(
    response: Response,
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
    response: Response,
    endpoint: string
  ): Promise<ApiResponse<T>> {
    const raw = await response.text()
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
        const delay = Math.min(800 * Math.pow(2, attempt - 1), 6000)
        Logger.debug('api', `Retry ${attempt}/${MAX_RETRIES} for ${endpoint} in ${delay}ms`)
        await new Promise<void>((resolve) => setTimeout(resolve, delay))
      }

      try {
        const response = await fetch(url, { ...options, headers })

        // Handle 401 - try to refresh token
        if (response.status === 401 && requireAuth) {
          const refreshed = await this.refreshTokens()
          if (refreshed) {
            const newAccessToken = await TokenStorage.getAccessToken()
            if (newAccessToken) {
              headers['Authorization'] = `Bearer ${newAccessToken}`
            }
            const retryResponse = await fetch(url, { ...options, headers })
            return this.parseResponse<T>(retryResponse, endpoint)
          } else {
            await TokenStorage.clearAll()
            markSessionExpired()
            return { success: false, error: 'Session expired. Please sign in again.' }
          }
        }

        // Retry on 5xx server errors for GET requests only
        if (isGet && response.status >= 500 && attempt < MAX_RETRIES) {
          Logger.warn('api', `Server error ${response.status}, retrying`, { endpoint, attempt })
          continue
        }

        const result = await this.parseResponse<T>(response, endpoint)
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
        return {
          success: false,
          error: error instanceof Error ? error.message : `Network error (${endpoint})`,
        }
      }
    }

    return { success: false, error: `Request failed after retries (${endpoint})` }
  }

  private async refreshTokens(): Promise<boolean> {
    // If a refresh is already in flight, join it — don't start a second one.
    // We return the existing promise so all concurrent callers share one result.
    if (isRefreshing && refreshPromise) {
      return refreshPromise
    }

    isRefreshing = true
    // Store promise BEFORE any await so concurrent callers see it immediately.
    const p: Promise<boolean> = (async () => {
      try {
        const refreshToken = await TokenStorage.getRefreshToken()
        if (!refreshToken) {
          return false
        }

        const response = await fetch(`${this.baseUrl}/api/mobile/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })

        if (!response.ok) {
          return false
        }

        const data: ApiResponse<{ accessToken: string; refreshToken: string }> =
          await response.json()

        if (data.success && data.data) {
          await TokenStorage.setTokens(data.data.accessToken, data.data.refreshToken)
          return true
        }

        return false
      } catch (error) {
        Logger.error('api', 'Token refresh failed', { error })
        return false
      }
    })()

    refreshPromise = p

    // Reset flags after all awaiting callers have received the result (next microtask).
    p.finally(() => {
      isRefreshing = false
      refreshPromise = null
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
        this.inFlight.delete(key)
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

    const result = await this.queuedRequest<T>(endpoint, options, requireAuth, priority)
    if (result.success) {
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
    deviceInfo?: { platform?: string; device?: string; appVersion?: string }
  ): Promise<ApiResponse<AuthResult>> {
    const result = await this.request<AuthResult>(
      '/api/mobile/auth/signup',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, name, deviceInfo }),
      },
      false
    )

    if (result.success && result.data) {
      await TokenStorage.setTokens(result.data.accessToken, result.data.refreshToken)
      await TokenStorage.setUser(result.data.user)
    }

    return result
  }

  async deleteAccount(): Promise<ApiResponse<{ deleted: boolean }>> {
    const result = await this.request<{ deleted: boolean }>('/api/mobile/account', {
      method: 'DELETE',
    })

    if (result.success) {
      await TokenStorage.clearAll()
      requestQueue.clear()
    }

    return result
  }

  async signOut(revokeAll: boolean = false): Promise<ApiResponse<void>> {
    const refreshToken = await TokenStorage.getRefreshToken()
    const result = await this.request<void>('/api/mobile/auth/signout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: revokeAll ? undefined : refreshToken }),
    })

    await TokenStorage.clearAll()
    requestQueue.clear()

    return result
  }

  async getSession(): Promise<ApiResponse<AuthUser>> {
    return this.request<AuthUser>('/api/mobile/auth/session')
  }

  async refreshSession(): Promise<boolean> {
    return this.refreshTokens()
  }

  // === EVENT ENDPOINTS ===

  async getEvents(params?: {
    page?: number
    limit?: number
    search?: string
    lat?: number
    lon?: number
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

  async toggleFavorite(eventId: string): Promise<ApiResponse<{ favorited: boolean }>> {
    return this.queuedRequest<{ favorited: boolean }>(
      `/api/mobile/events/${eventId}/favorite`,
      {
        method: 'POST',
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
      location?: string
      bio?: string
      occupation?: string
      education?: string
      interests?: string[]
      photos?: string[]
      goals?: string[]
      looking_for?: string[]
      onboarded?: boolean
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
     * `ProfileCache` has a 60s TTL and the root layout reads `profile.onboarded`
     * through it to decide where to route. Finishing onboarding writes
     * `onboarded: true` and then, well inside those 60 seconds, the gate reads
     * back a cached `false` and sends the user round the flow again. The
     * `lastRedirectRef` de-dupe absorbs the bounce today, which is luck rather
     * than design — and a brand-new account signing up and onboarding in one
     * sitting is the case most likely to hit it.
     */
    if (result.success) ProfileCache.clear()
    return result
  }

  async getProfileInterests(userId: string): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    return this.queuedRequest<Array<Record<string, unknown>>>(`/api/mobile/profiles/${userId}/interests`)
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

  async getUserFavorites(userId: string): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    return this.queuedRequest<Array<Record<string, unknown>>>(`/api/mobile/users/${userId}/favorites`)
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
    metadata?: Record<string, unknown>
  ): Promise<ApiResponse<ChatMessageData>> {
    return this.queuedRequest<ChatMessageData>(
      `/api/mobile/chat/groups/${chatGroupId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ content, type, metadata }),
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
   * Your intent and reveal flag for this event.
   *
   * `revealed` is per event on purpose: choosing to be visible at a work
   * meetup is not choosing to be visible at a club.
   */
  async setMatchPreferences(
    eventId: string,
    prefs: { intent?: Array<'dating' | 'networking' | 'friendship' | 'just_here'>; revealed?: boolean; remember?: boolean }
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
    return this.cachedRequest<Array<Record<string, unknown>>>(
      '/api/mobile/categories',
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

  // === PRIVATE CONVERSATIONS ===

  async getConversations(options?: { force?: boolean }): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const endpoint = '/api/mobile/conversations'
    if (options?.force) {
      return this.queuedRequest<Array<Record<string, unknown>>>(endpoint)
    }
    return this.cachedRequest<Array<Record<string, unknown>>>(endpoint, { ttl: CHAT_LIST_SWR_TTL, swr: true })
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
    otherUser: { id: string; name: string | null; image: string | null }
    createdAt: string
    lastMessageAt: string | null
  }>> {
    return this.queuedRequest(`/api/mobile/conversations/${conversationId}`)
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
      createdAt: string
    }>
    hasMore: boolean
    nextCursor: string | null
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
    data: { text?: string; mediaUrl?: string; mediaType?: 'image' | 'video' }
  ): Promise<ApiResponse<{
    id: string
    conversationId: string
    senderId: string
    sender: { id: string; name: string | null; image: string | null }
    text: string | null
    mediaUrl: string | null
    mediaType: string | null
    isRead: boolean
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
