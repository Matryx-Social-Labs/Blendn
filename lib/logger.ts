// Lightweight structured logger for user journeys
// Use for consistent, searchable logs across the app

type LogLevel = 'info' | 'warn' | 'error'

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function baseLog(level: LogLevel, tag: string, message: string, details?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = {
    t: timestamp,
    level,
    tag,
    message,
    ...(details ? { details } : {}),
  }
  // Keep console output human-friendly while remaining structured
  // eslint-disable-next-line no-console
  const line = `[${payload.t}] ${payload.level.toUpperCase()} ${payload.tag} :: ${payload.message}${details ? ' :: ' + stringify(details) : ''}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const Logger = {
  info(tag: string, message: string, details?: Record<string, unknown>) {
    baseLog('info', tag, message, details)
  },
  warn(tag: string, message: string, details?: Record<string, unknown>) {
    baseLog('warn', tag, message, details)
  },
  error(tag: string, message: string, details?: Record<string, unknown>) {
    baseLog('error', tag, message, details)
  },
  // Journey helper for consistent tagging
  journey(flow: 'checkin' | 'proximity' | 'auth' | 'events' | 'chat', step: string, details?: Record<string, unknown>) {
    baseLog('info', `🧭 JOURNEY:${flow}`, step, details)
  },
}

export type { LogLevel }


