/**
 * API Client for Blendn Mobile App
 * Replaces direct Supabase calls with admin backend API calls
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { AppState } from 'react-native'
import { Logger } from './logger'

// API Configuration
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000'

if (!API_BASE_URL) {
  console.warn('EXPO_PUBLIC_API_BASE_URL not set, using localhost')
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

// Request Queue for network resilience
class RequestQueue {
  private queue: Array<{
    request: () => Promise<any>
    resolve: (value: any) => void
    reject: (error: any) => void
    priority: number
    timestamp: number
    type: 'query' | 'mutation' | 'auth'
  }> = []
  private processing = false
  private maxConcurrent = 3
  private currentRequests = 0
  private lastProcessTime = 0
  private debounceMs = 50
  private requestCount = 0
  private errorCount = 0

  async add<T>(
    request: () => Promise<T>,
    priority: number = 5,
    type: 'query' | 'mutation' | 'auth' = 'query'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        request,
        resolve,
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
    request: () => Promise<any>
    resolve: (value: any) => void
    reject: (error: any) => void
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

// Token Storage
class TokenStorage {
  private static async secureGet(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key, SECURE_OPTIONS)
    } catch {
      // Fallback to AsyncStorage
      try {
        return await AsyncStorage.getItem(key)
      } catch {
        return null
      }
    }
  }

  private static async secureSet(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value, SECURE_OPTIONS)
      // Clear from AsyncStorage if it was there
      try {
        await AsyncStorage.removeItem(key)
      } catch {}
    } catch {
      // Fallback to AsyncStorage
      await AsyncStorage.setItem(key, value)
    }
  }

  private static async secureRemove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key, SECURE_OPTIONS)
    } catch {}
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

  static async getUser(): Promise<any | null> {
    const userStr = await this.secureGet(USER_KEY)
    if (!userStr) return null
    try {
      return JSON.parse(userStr)
    } catch {
      return null
    }
  }

  static async setUser(user: any): Promise<void> {
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

// API Response Types
export interface ApiResponse<T = any> {
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

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    // Add auth header if required
    if (requireAuth) {
      const accessToken = await TokenStorage.getAccessToken()
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      // Handle 401 - try to refresh token
      if (response.status === 401 && requireAuth) {
        const refreshed = await this.refreshTokens()
        if (refreshed) {
          // Retry the request with new token
          const newAccessToken = await TokenStorage.getAccessToken()
          if (newAccessToken) {
            headers['Authorization'] = `Bearer ${newAccessToken}`
          }
          const retryResponse = await fetch(url, {
            ...options,
            headers,
          })
          return retryResponse.json()
        } else {
          // Refresh failed, clear tokens and return error
          await TokenStorage.clearAll()
          return { success: false, error: 'Session expired. Please sign in again.' }
        }
      }

      const data = await response.json()
      return data
    } catch (error) {
      Logger.error('api', 'Request failed', { endpoint, error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }

  private async refreshTokens(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (isRefreshing) {
      return refreshPromise || Promise.resolve(false)
    }

    isRefreshing = true
    refreshPromise = (async () => {
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
      } finally {
        isRefreshing = false
        refreshPromise = null
      }
    })()

    return refreshPromise
  }

  // Queue wrapper for requests
  async queuedRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = true,
    priority: number = 5
  ): Promise<ApiResponse<T>> {
    return requestQueue.add(
      () => this.request<T>(endpoint, options, requireAuth),
      priority,
      options.method === 'GET' ? 'query' : 'mutation'
    )
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
  }): Promise<ApiResponse<{ events: any[]; pagination: any }>> {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
    }
    const query = searchParams.toString()
    return this.queuedRequest<{ events: any[]; pagination: any }>(
      `/api/mobile/events${query ? `?${query}` : ''}`
    )
  }

  async getEvent(
    eventId: string,
    params?: { lat?: number; lon?: number }
  ): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params) {
      if (params.lat !== undefined) searchParams.append('lat', String(params.lat))
      if (params.lon !== undefined) searchParams.append('lon', String(params.lon))
    }
    const query = searchParams.toString()
    return this.queuedRequest<any>(`/api/mobile/events/${eventId}${query ? `?${query}` : ''}`)
  }

  async checkIn(
    eventId: string,
    data: { latitude: number; longitude: number; deviceInfo?: any }
  ): Promise<ApiResponse<any>> {
    return this.queuedRequest<any>(
      `/api/mobile/events/${eventId}/checkin`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true,
      2 // High priority
    )
  }

  async checkOut(eventId: string): Promise<ApiResponse<any>> {
    return this.queuedRequest<any>(
      `/api/mobile/events/${eventId}/checkout`,
      {
        method: 'POST',
      },
      true,
      2 // High priority
    )
  }

  async getEventCheckins(eventId: string): Promise<ApiResponse<any[]>> {
    return this.queuedRequest<any[]>(`/api/mobile/events/${eventId}/checkins`)
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

  async rateEvent(
    eventId: string,
    rating: number,
    review?: string
  ): Promise<ApiResponse<any>> {
    return this.queuedRequest<any>(
      `/api/mobile/events/${eventId}/rating`,
      {
        method: 'POST',
        body: JSON.stringify({ rating, review }),
      },
      true,
      5
    )
  }

  // === PROFILE ENDPOINTS ===

  async getProfile(userId: string): Promise<ApiResponse<any>> {
    return this.queuedRequest<any>(`/api/mobile/profiles/${userId}`)
  }

  async updateProfile(
    userId: string,
    data: {
      name?: string
      phone?: string
      age?: number
      location?: string
      interests?: string[]
      onboarded?: boolean
    }
  ): Promise<ApiResponse<any>> {
    return this.queuedRequest<any>(
      `/api/mobile/profiles/${userId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
      true,
      2
    )
  }

  async getProfileInterests(userId: string): Promise<ApiResponse<any[]>> {
    return this.queuedRequest<any[]>(`/api/mobile/profiles/${userId}/interests`)
  }

  async addProfileInterest(userId: string, categoryId: string): Promise<ApiResponse<any>> {
    return this.queuedRequest<any>(
      `/api/mobile/profiles/${userId}/interests`,
      {
        method: 'POST',
        body: JSON.stringify({ categoryId }),
      },
      true,
      3
    )
  }

  async removeProfileInterest(userId: string, categoryId: string): Promise<ApiResponse<void>> {
    return this.queuedRequest<void>(
      `/api/mobile/profiles/${userId}/interests/${categoryId}`,
      {
        method: 'DELETE',
      },
      true,
      3
    )
  }

  // === USER ENDPOINTS ===

  async getPublicProfile(userId: string): Promise<ApiResponse<any>> {
    return this.queuedRequest<any>(`/api/mobile/users/${userId}`)
  }

  async getUserFavorites(userId: string): Promise<ApiResponse<any[]>> {
    return this.queuedRequest<any[]>(`/api/mobile/users/${userId}/favorites`)
  }

  // === CHAT ENDPOINTS ===

  async getChatGroups(): Promise<ApiResponse<any[]>> {
    return this.queuedRequest<any[]>('/api/mobile/chat/groups')
  }

  async getEventChat(eventId: string): Promise<ApiResponse<any>> {
    return this.queuedRequest<any>(`/api/mobile/events/${eventId}/chat`)
  }

  async sendChatMessage(
    chatGroupId: string,
    content: string,
    type: 'text' | 'image' | 'video' = 'text',
    metadata?: any
  ): Promise<ApiResponse<any>> {
    return this.queuedRequest<any>(
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
  ): Promise<ApiResponse<any[]>> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.append('limit', String(params.limit))
    if (params?.before) searchParams.append('before', params.before)
    const query = searchParams.toString()
    return this.queuedRequest<any[]>(
      `/api/mobile/chat/groups/${chatGroupId}/messages${query ? `?${query}` : ''}`
    )
  }

  // === NOTIFICATION ENDPOINTS ===

  async registerPushToken(
    token: string,
    platform: 'ios' | 'android'
  ): Promise<ApiResponse<void>> {
    return this.queuedRequest<void>(
      '/api/mobile/notifications/token',
      {
        method: 'POST',
        body: JSON.stringify({ token, platform }),
      },
      true,
      3
    )
  }

  // === UPLOAD ENDPOINTS ===

  async getPresignedUploadUrl(
    filename: string,
    contentType: string,
    folder: 'profile' | 'chat' = 'profile'
  ): Promise<ApiResponse<{ uploadUrl: string; publicUrl: string }>> {
    return this.queuedRequest<{ uploadUrl: string; publicUrl: string }>(
      '/api/mobile/uploads/presigned-url',
      {
        method: 'POST',
        body: JSON.stringify({ filename, contentType, folder }),
      },
      true,
      3
    )
  }

  // === CATEGORIES ===

  async getCategories(): Promise<ApiResponse<any[]>> {
    return this.queuedRequest<any[]>('/api/mobile/categories')
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
