/**
 * @deprecated Supabase client - DEPRECATED
 *
 * This module has been deprecated. The app now uses the admin backend API
 * via lib/apiClient.ts for all data operations.
 *
 * This file is kept as a stub to prevent import errors from legacy code.
 * All exports are no-ops that log warnings.
 */

import { Logger } from './logger'

const DEPRECATION_WARNING = 'Supabase is deprecated. Use apiClient instead.'

// Stub supabase client that logs deprecation warnings
export const supabase = {
  auth: {
    getUser: async () => {
      Logger.warn('supabase', DEPRECATION_WARNING)
      return { data: { user: null }, error: new Error(DEPRECATION_WARNING) }
    },
    getSession: async () => {
      Logger.warn('supabase', DEPRECATION_WARNING)
      return { data: { session: null }, error: new Error(DEPRECATION_WARNING) }
    },
    signOut: async () => {
      Logger.warn('supabase', DEPRECATION_WARNING)
      return { error: null }
    },
    startAutoRefresh: () => {},
    stopAutoRefresh: () => {},
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: () => ({
    select: () => ({ data: null, error: new Error(DEPRECATION_WARNING) }),
    insert: () => ({ data: null, error: new Error(DEPRECATION_WARNING) }),
    update: () => ({ data: null, error: new Error(DEPRECATION_WARNING) }),
    delete: () => ({ data: null, error: new Error(DEPRECATION_WARNING) }),
  }),
  rpc: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return { data: null, error: new Error(DEPRECATION_WARNING) }
  },
}

// Stub exports to prevent import errors
export const queuedRequest = {
  add: async <T>(): Promise<T> => { throw new Error(DEPRECATION_WARNING) },
  addAuth: async <T>(): Promise<T> => { throw new Error(DEPRECATION_WARNING) },
  addCritical: async <T>(): Promise<T> => { throw new Error(DEPRECATION_WARNING) },
  addBackground: async <T>(): Promise<T> => { throw new Error(DEPRECATION_WARNING) },
  getStats: () => ({ queueLength: 0, activeRequests: 0, totalRequests: 0, errorCount: 0, errorRate: 0 }),
  clear: () => {},
}

export async function callRpc(): Promise<{ data: null; error: Error }> {
  Logger.warn('supabase', DEPRECATION_WARNING)
  return { data: null, error: new Error(DEPRECATION_WARNING) }
}

export async function runQuery<T>(): Promise<T> {
  throw new Error(DEPRECATION_WARNING)
}

export const supabaseWithTimeout = {
  query: async <T>(): Promise<T> => { throw new Error(DEPRECATION_WARNING) },
  getUser: async () => ({ data: { user: null }, error: new Error(DEPRECATION_WARNING) }),
}

export const AuthHelper = {
  getCurrentUser: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return null
  },
  getUserWithFallback: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return { data: { user: null }, error: new Error(DEPRECATION_WARNING) }
  },
}

export const EventCheckout = {
  checkoutFromEvent: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return { success: false, message: DEPRECATION_WARNING }
  },
  getCheckinStatus: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return { status: 'error' }
  },
  checkoutFromAllEvents: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return { success: false, message: DEPRECATION_WARNING }
  },
  ensureNoActiveCheckins: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return { success: false, message: DEPRECATION_WARNING }
  },
}

export const ensureNoActiveCheckins = EventCheckout.ensureNoActiveCheckins

export const EventChat = {
  ensureUserInEventChat: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return null
  },
  checkoutFromAllEvents: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return { success: false, message: DEPRECATION_WARNING }
  },
  leaveAllEventChats: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return { success: false, message: DEPRECATION_WARNING }
  },
}

export const EventInterest = {
  toggleInterest: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return null
  },
  getUserInterestedEventIds: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return new Set<string>()
  },
  getEventInterestCounts: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return {}
  },
  getSingleEventInterestCount: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return 0
  },
  isInterested: async () => {
    Logger.warn('supabase', DEPRECATION_WARNING)
    return false
  },
}
