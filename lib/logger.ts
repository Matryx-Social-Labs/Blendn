// Lightweight structured logger for user journeys
// Use for consistent, searchable logs across the app
// Production-ready with development gating

import Constants from 'expo-constants'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogContext = 'auth' | 'events' | 'chat' | 'match' | 'profile' | 'navigation' | 'network' | 'database' | 'realtime' | 'general'

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
  
  const timestamp = new Date().toISOString()
  const contextEmoji = getContextEmoji(context)
  
  const payload = {
    t: timestamp,
    level,
    context,
    message,
    ...(details ? { details } : {}),
  }
  
  // Keep console output human-friendly while remaining structured
  const line = `${contextEmoji} [${level.toUpperCase()}] ${context.toUpperCase()} :: ${message}${details ? '\n' + stringify(details) : ''}`
  
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else if (level === 'debug' && isDebugEnabled) console.log(`🐛 ${line}`)
  else if (level === 'info') console.log(line)
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
    general: '📱'
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
  // Convenience methods for common patterns
  network: {
    request: (endpoint: string, details?: Record<string, unknown>) => 
      baseLog('debug', 'network', `Request: ${endpoint}`, details),
    response: (endpoint: string, status: number, details?: Record<string, unknown>) => 
      baseLog('debug', 'network', `Response: ${endpoint} [${status}]`, details),
    error: (endpoint: string, error: unknown) => 
      baseLog('error', 'network', `Network Error: ${endpoint}`, { error })
  },
  database: {
    query: (table: string, operation: string, details?: Record<string, unknown>) => 
      baseLog('debug', 'database', `${operation}: ${table}`, details),
    error: (table: string, operation: string, error: unknown) => 
      baseLog('error', 'database', `DB Error: ${operation} ${table}`, { error })
  }
}

export type { LogContext, LogLevel }


