import type { LikeRefusal } from './likeRefusal'

/**
 * Waving at someone in a room: the one person-to-person gesture (owner ruling 2026-11-12, SCRUM-1042), which replaced
 * the secret Like. A wave is recorded by the server and shown to them; waving back makes it mutual, and a mutual opens
 * the anonymous conversation. One wave per person per room: there is no "Wave again".
 *
 * Wave → Wave back → ✓ Waved → Say hi. This module is the client's half and pure: what a card says, and whether a tap
 * should send.
 */

export type WaveStatus =
  /** Nothing yet: "Wave". */
  | 'none'
  /** They waved at you here and you have not answered: "Wave back", filled. */
  | 'wavedAtYou'
  /** On its way: the hand swings. */
  | 'sending'
  /** You waved: a still "✓ Waved" until they wave back or the room closes. */
  | 'waved'
  /** You both waved, and the anonymous conversation is open: "Say hi". */
  | 'mutual'

/** 07-motion: the press, three swings of the hand, then a still ✓ Waved at 800 ms. */
export const WAVE_SETTLE_MS = 800
/** 07-motion, Reduce Motion: no swing, a crossfade to ✓ Waved at 230 ms. */
export const WAVE_SETTLE_REDUCED_MS = 230

/**
 * What a card shows, from the deck's flags (`youWaved`, `wavedAtYou`), a conversation this session knows of, a wave
 * heard live, and anything done since.
 *
 * Local wins over the deck for `sending`, `waved` and `mutual`: the deck refetches on every socket event, and a snapshot
 * taken before the mutual must not take Say hi away.
 */
export function waveStatusFor(
  server: { youWaved?: boolean; wavedAtYou?: boolean; conversationId?: string | null; heard?: boolean },
  local: WaveStatus | undefined
): WaveStatus {
  if (local === 'mutual' || server.conversationId) return 'mutual'
  if (local === 'sending') return 'sending'
  if (server.youWaved && server.wavedAtYou) return 'mutual'
  if (local === 'waved' || server.youWaved) return 'waved'
  if (server.wavedAtYou || server.heard) return 'wavedAtYou'
  return 'none'
}

/** Only Wave and Wave back send: in flight would double-post, Waved is final, and a mutual's tap is Say hi. */
export function shouldSendWave(status: WaveStatus): boolean {
  return status === 'none' || status === 'wavedAtYou'
}

/**
 * The state after the server answers. A failure returns `undefined` rather than `'none'`: it clears this session's
 * opinion so the card falls back to the deck, because the request can fail after the wave was stored.
 */
export function waveStateAfter(outcome: { ok: boolean; mutual?: boolean }): WaveStatus | undefined {
  if (!outcome.ok) return undefined
  return outcome.mutual ? 'mutual' : 'waved'
}

const GENERIC = 'That didn’t go through.'
const SLOW_DOWN = 'Slow down a moment, then try again.'
/** The wave caps' own copy (admin `waves/route.ts` `capResponse`): about the sender only, checked before the recipient (W8). */
const SENDER_CAP = /^You[’']ve waved a lot\b/

/**
 * A refused wave, said without ever naming the other person or confirming they are here (anti-spam W8).
 *
 * - The wave caps' sentences are the sender's own and pass through; an API limiter's "Too many requests" does not.
 * - Every recipient refusal is one generic line: "They're not in the room right now" would confirm who they are.
 * - A lapsed check-in offers Check in.
 * - `WAVE_TOO_SOON` (a new wave at the same person in another room within ten minutes) is the server's sender line.
 */
export function waveRefusal(errorCode: string | undefined, serverMessage: string | undefined): LikeRefusal {
  const message = serverMessage?.trim()
  switch (errorCode) {
    case 'RATE_LIMITED':
      return { message: message && SENDER_CAP.test(message) ? message : SLOW_DOWN, variant: 'info' }
    case 'WAVE_TOO_SOON':
      return { message: 'You waved at them a moment ago.', variant: 'info' }
    case 'FORBIDDEN':
    case 'NOT_CHECKED_IN':
      return { message: message || 'Check in to wave at people here.', variant: 'info', checkIn: true }
    default:
      return { message: GENERIC, variant: errorCode === 'NOT_FOUND' || errorCode === 'RECIPIENT_NOT_HERE' ? 'info' : 'error' }
  }
}

/** What the wave control says to a screen reader, in the approved names. */
export function waveAccessibilityLabel(name: string, status: WaveStatus): string {
  switch (status) {
    case 'none':
      return `Wave at ${name}`
    case 'wavedAtYou':
      return `Wave back at ${name}`
    case 'sending':
      return `Waving at ${name}`
    case 'waved':
      return `Waved at ${name}`
    case 'mutual':
      return `You both waved. Say hi to ${name}`
  }
}

/** "4 min" or "2 h" since a wave (ISO), for "Waved at you · 4 min"; null when there is no time to say. */
export function wavedAgo(at: string | number | undefined | null, now: number): string | null {
  const t = typeof at === 'number' ? at : at ? Date.parse(at) : NaN
  if (!Number.isFinite(t)) return null
  const minutes = Math.max(1, Math.floor((now - t) / 60_000))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`
}
