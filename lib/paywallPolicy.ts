import AsyncStorage from '@react-native-async-storage/async-storage'

import { Logger } from './logger'

/**
 * When the Blendn+ paywall may open by itself (plan v1 "Upgrade prompts",
 * plan v2 step 11; MN-U06). Pure apart from the remembered memory at the
 * bottom, so it runs in a plain node test.
 *
 * | Trigger | Cooldown |
 * |---|---|
 * | `go_live_expiry` — "stay" refused as Blendn+'s | once a night (the venue day: resets 06:00 local) |
 * | `second_event` / `first_match` — the same offer | 14 days after a dismiss of either |
 * | `recap` — history beyond 3 nights | weekly |
 * | `perk` — a perk chip | passive: only on tap |
 * | `profile` — the Settings row | none: you asked |
 *
 * And over all of them: at most one AUTOMATIC paywall per app session, and
 * never over onboarding, a check-in or a chat. A tap on something that says
 * Blendn+ always opens it — the limits are on the paywall arriving uninvited.
 * The paywall is never what unlocks anything: the server's gates are.
 */

/** What the server accepts as `trigger` (`POST /me/plus/paywall-events`); anything else is a 400. */
export const PAYWALL_TRIGGERS = ['go_live_expiry', 'second_event', 'first_match', 'recap', 'perk', 'profile'] as const
export type PaywallTrigger = (typeof PAYWALL_TRIGGERS)[number]

export function isPaywallTrigger(value: unknown): value is PaywallTrigger {
  return typeof value === 'string' && (PAYWALL_TRIGGERS as readonly string[]).includes(value)
}

/** What the server accepts as `event`. */
export type PaywallEvent = 'shown' | 'dismissed' | 'purchase_started' | 'purchased' | 'restored'

const DAY_MS = 24 * 60 * 60 * 1000
/** `second_event` / `first_match`: this long after a dismiss of either. */
export const DISMISS_COOLDOWN_MS = 14 * DAY_MS
/** `recap`: this long after the last one shown. */
export const RECAP_COOLDOWN_MS = 7 * DAY_MS
/** A night runs to this local hour, as a venue day does. */
export const NIGHT_RESETS_AT_HOUR = 6

/** Triggers that only ever open on a tap. */
const TAP_ONLY: ReadonlySet<PaywallTrigger> = new Set(['perk', 'profile'])

/** When each trigger's paywall was last shown and last dismissed (epoch ms). */
export type PaywallMemory = {
  shown: Partial<Record<PaywallTrigger, number>>
  dismissed: Partial<Record<PaywallTrigger, number>>
}

export const EMPTY_MEMORY: PaywallMemory = { shown: {}, dismissed: {} }

/** The night an instant belongs to: its local date, with 00:00–05:59 counted as the night before. */
export function nightOf(ms: number): string {
  const d = new Date(ms)
  if (d.getHours() < NIGHT_RESETS_AT_HOUR) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * Surfaces the paywall never arrives over by itself: onboarding, a check-in's
 * door (the event screen), a chat, the Blend'n room.
 */
const QUIET_PATHS = /^\/(onboarding|chat|private-chat|room|event)(\/|$)/

export function isQuietSurface(pathname: string | null | undefined, roomOpen: boolean): boolean {
  return roomOpen || QUIET_PATHS.test(pathname ?? '')
}

export type PaywallContext = {
  /** A tap on something that says Blendn+: always opens. */
  userInitiated: boolean
  /** An automatic paywall has already shown since the app started. */
  automaticShownThisSession: boolean
  /** Where the person is (`usePathname`). */
  pathname: string | null
  /** The Blend'n room overlay is open (it is not a route). */
  roomOpen: boolean
}

/** May this trigger's paywall open now. */
export function mayOpenPaywall(trigger: PaywallTrigger, memory: PaywallMemory, now: number, ctx: PaywallContext): boolean {
  if (ctx.userInitiated) return true
  if (TAP_ONLY.has(trigger)) return false
  if (ctx.automaticShownThisSession) return false
  if (isQuietSurface(ctx.pathname, ctx.roomOpen)) return false
  switch (trigger) {
    case 'go_live_expiry': {
      const shown = memory.shown.go_live_expiry
      return shown === undefined || nightOf(shown) !== nightOf(now)
    }
    case 'second_event':
    case 'first_match': {
      // One offer from two moments: a dismiss of either quiets both.
      const dismissed = Math.max(memory.dismissed.second_event ?? -Infinity, memory.dismissed.first_match ?? -Infinity)
      return now - dismissed >= DISMISS_COOLDOWN_MS
    }
    case 'recap': {
      const shown = memory.shown.recap
      return shown === undefined || now - shown >= RECAP_COOLDOWN_MS
    }
    default:
      return false
  }
}

/** The memory after an event: `shown` and `dismissed` stamp the trigger; the rest change nothing. */
export function rememberPaywallEvent(memory: PaywallMemory, trigger: PaywallTrigger, event: PaywallEvent, now: number): PaywallMemory {
  if (event === 'shown') return { ...memory, shown: { ...memory.shown, [trigger]: now } }
  if (event === 'dismissed') return { ...memory, dismissed: { ...memory.dismissed, [trigger]: now } }
  return memory
}

/*
 * The memory, on this phone. ponytail: per device, not per account — a second
 * account on a shared phone inherits the first one's quiet, which only ever
 * means fewer paywalls. Key it by user if that matters.
 */
const MEMORY_KEY = 'blendn.paywall.memory'

export async function readPaywallMemory(): Promise<PaywallMemory> {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<PaywallMemory>) : null
    return { shown: parsed?.shown ?? {}, dismissed: parsed?.dismissed ?? {} }
  } catch (error) {
    Logger.warn('plus', 'Could not read the paywall memory', { error: String(error) })
    return EMPTY_MEMORY
  }
}

export async function writePaywallMemory(memory: PaywallMemory): Promise<void> {
  try {
    await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(memory))
  } catch (error) {
    // Lost, a paywall may come back sooner than it should: never a lock.
    Logger.warn('plus', 'Could not remember the paywall', { error: String(error) })
  }
}
