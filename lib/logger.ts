// Lightweight structured logger for user journeys
// Use for consistent, searchable logs across the app
// Production-ready with development gating

import Constants from 'expo-constants'
import { isNetworkFailure, isTimeoutError } from './fetchTimeout'
import { Sentry } from './sentry'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogContext = 'auth' | 'events' | 'chat' | 'match' | 'profile' | 'navigation' | 'network' | 'database' | 'realtime' | 'general' | 'api' | 'interested' | 'private-chat' | 'socket' | 'notifications' | 'presence' | 'friends' | 'board' | 'plus' | 'offers'

// Development mode detection
const isDevelopment = __DEV__ || Constants.expoConfig?.extra?.isDevelopment || process.env.NODE_ENV === 'development'
const isDebugEnabled = isDevelopment && !process.env.EXPO_PUBLIC_DISABLE_DEBUG_LOGS

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function shouldLog(level: LogLevel): boolean {
  // Always log warnings and errors
  if (level === 'warn' || level === 'error') return true
  // Only log info and debug in development
  if (level === 'info' || level === 'debug') return isDevelopment
  return false
}

function baseLog(level: LogLevel, context: LogContext, message: string, details?: Record<string, unknown>) {
  if (!shouldLog(level)) return
  
  const contextEmoji = getContextEmoji(context)

  // Keep console output human-friendly while remaining structured
  const line = `${contextEmoji} [${level.toUpperCase()}] ${context.toUpperCase()} :: ${message}${details ? '\n' + stringify(details) : ''}`
  
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else if (level === 'debug' && isDebugEnabled) console.log(`🐛 ${line}`)
  else if (level === 'info') console.log(line)

  if (level === 'error' || level === 'warn') {
    reportToSentry(level, context, message, details)
  }
}

function reportToSentry(level: 'warn' | 'error', context: LogContext, message: string, details?: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category: context,
    message,
    level: level === 'error' ? 'error' : 'warning',
    data: details,
  })

  const errorCandidate = details?.error
  if (level !== 'error') return
  // The network not carrying a request, or our own deadline, is the phone's weather, not a defect: the breadcrumb above is enough.
  if (isNetworkFailure(errorCandidate) || isTimeoutError(errorCandidate)) return
  // One issue per logged sentence: grouped by the stack, a minified frame ("b", "baseLog") split one sentence over many issues.
  const fingerprint = ['logger', context, message]
  if (errorCandidate instanceof Error) {
    Sentry.captureException(errorCandidate, { tags: { context }, extra: { message, ...details }, fingerprint })
  } else {
    Sentry.captureMessage(`[${context}] ${message}`, { level: 'error', tags: { context }, extra: details, fingerprint })
  }
}

function getContextEmoji(context: LogContext): string {
  const emojis: Record<LogContext, string> = {
    auth: '🔐',
    events: '📅',
    chat: '💬',
    match: '💕',
    profile: '👤',
    navigation: '🧭',
    network: '🌐',
    database: '🗄️',
    realtime: '⚡',
    general: '📱',
    api: '🔌',
    interested: '❤️',
    'private-chat': '🔒',
    socket: '🔗',
    notifications: '🔔',
    presence: '📍',
    friends: '🤝',
    board: '📌',
    plus: '➕',
    offers: '🎟️'
  }
  return emojis[context] || '📱'
}

export const Logger = {
  debug(context: LogContext, message: string, details?: Record<string, unknown>) {
    baseLog('debug', context, message, details)
  },
  info(context: LogContext, message: string, details?: Record<string, unknown>) {
    baseLog('info', context, message, details)
  },
  warn(context: LogContext, message: string, details?: Record<string, unknown>) {
    baseLog('warn', context, message, details)
  },
  error(context: LogContext, message: string, details?: Record<string, unknown>) {
    baseLog('error', context, message, details)
  },
  // Journey helper for consistent tagging
  journey(flow: 'checkin' | 'proximity' | 'auth' | 'events' | 'chat' | 'interest', step: string, details?: Record<string, unknown>) {
    const contextMap: Record<string, LogContext> = {
      checkin: 'events',
      proximity: 'events', 
      auth: 'auth',
      events: 'events',
      chat: 'chat',
      interest: 'events'
    }
    baseLog('info', contextMap[flow] || 'general', `JOURNEY:${flow} - ${step}`, details)
  },
}

export type { LogContext, LogLevel }


