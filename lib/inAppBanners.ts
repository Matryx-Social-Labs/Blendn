import type { NotificationVisualSpec } from '../components/ds/NotificationRow'
import { GLYPH } from './notificationRows'

/**
 * Which push becomes an in-app banner (Flow 9 · 9.4) and which does not.
 *
 * In the foreground there is no system banner and no sound: a glass capsule at the top does the telling
 * (`components/notifications/ForegroundBanners`). It is shown for people (a DM or a room reply when that
 * thread is not open, requests, matches, reveals, board replies), a crew (an invite, "We're here", a Blend)
 * and today's event changes. It is not shown for announcements, ratings, waitlist or accepted-request
 * confirmations, which only fill the bell. Anywhere the capsule cannot draw (a pushed screen is over the
 * tabs, signed out) the system banner stays; on the Notifications screen nothing shows: the row is
 * inserted instead.
 *
 * Pure but for the claim stack, so the choice is pinned without a render.
 */
export type BannerHost = 'tabs' | 'notifications'
export type Presentation = 'system' | 'in-app' | 'none'

const claims: { host: BannerHost }[] = []

/** The screen draws banners (or is the Notifications screen) while it is focused; give the claim back when it is not. */
export function claimBannerHost(host: BannerHost): () => void {
  const claim = { host }
  claims.push(claim)
  return () => {
    const at = claims.indexOf(claim)
    if (at !== -1) claims.splice(at, 1)
  }
}

const currentHost = (): BannerHost | null => claims[claims.length - 1]?.host ?? null

const PEOPLE = ['friend_request', 'match', 'reveal_request', 'reveal', 'message_request', 'board_request', 'private_message', 'group_message']
const CREW = ['crew_invite', 'crew_here', 'blend']
const EVENT = ['event_update']
/** They land in the bell and nowhere else while the app is open. */
const SILENT = ['announcement', 'rating_request', 'waitlist_promoted', 'message_request_response', 'board_request_accepted', 'friend_accepted']

export type PushContent = { title: string; body: string; data: Record<string, unknown> }

const typeOf = (data: Record<string, unknown>): string => (typeof data.type === 'string' ? data.type : '')
const isBannerKind = (type: string) => [...PEOPLE, ...CREW, ...EVENT].includes(type)

/** How a push that arrives with the app open is shown. */
export function bannerPresentation(data: Record<string, unknown> | undefined): Presentation {
  const host = currentHost()
  if (host === null) return 'system'
  if (host === 'notifications') return 'none'
  const type = typeOf(data ?? {})
  if (isBannerKind(type)) return 'in-app'
  return SILENT.includes(type) ? 'none' : 'system'
}

export type BannerSpec = {
  /** One per arrival: a new key mounts a new banner, so it lands (and announces) as one. */
  key: string
  type: string
  visual: NotificationVisualSpec
  title: string
  context: string
  data: Record<string, string | undefined>
  /** How many same-kind arrivals this stands for (1: itself). */
  merged: number
  at: number
}

/** A same-kind banner within this long of the last merges into one ("2 new matches"). */
export const MERGE_WINDOW_MS = 4000
const MERGED_TITLE: Record<string, (n: number) => string> = {
  match: (n) => `${n} new matches`,
  friend_request: (n) => `${n} friend requests`,
  crew_here: (n) => `${n} crewmates are here`,
}

const NOW = 'Just now'
const asStrings = (data: Record<string, unknown>): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'string')) as Record<string, string | undefined>

/** The capsule for a push, or null for one that is not shown as one. Names only what the push itself carries. */
export function bannerFor(content: PushContent, now: number): BannerSpec | null {
  const type = typeOf(content.data)
  if (!isBannerKind(type)) return null
  const data = asStrings(content.data)
  const base = { key: `${type}:${now}`, type, data, merged: 1, at: now }
  if (type === 'event_update') {
    return {
      ...base,
      visual: { type: 'event', cover: null, badge: data.reason === 'venue' ? 'map-pin' : 'clock', cancelled: data.reason === 'cancelled' },
      title: content.body || content.title,
      context: `${content.title} · ${NOW.toLowerCase()}`,
    }
  }
  const messages = type === 'private_message' || type === 'group_message'
  return {
    ...base,
    visual: { type: 'glyph', icon: GLYPH[type] ?? 'bell' },
    // The crew's push is titled with its name; in the app it can say so.
    title: type === 'crew_here' && content.title ? `Someone from ${content.title} is here` : content.title,
    // A DM's body is the message; everywhere else the body is a sentence for the lock screen, and "now" is the line.
    context: messages ? content.body : NOW,
  }
}

/** The next banner given the one on screen: a same-kind arrival inside the window merges into it. */
export function nextBanner(current: BannerSpec | null, incoming: BannerSpec): BannerSpec {
  const mergeTitle = MERGED_TITLE[incoming.type]
  if (!current || !mergeTitle || current.type !== incoming.type || incoming.at - current.at > MERGE_WINDOW_MS) return incoming
  const merged = current.merged + 1
  return { ...incoming, merged, title: mergeTitle(merged), context: NOW, data: {} }
}
