import { apiClient, type ApiResponse } from './apiClient'
import { calendarDate, clockTime, weekdayIn, WEEKDAYS_LONG } from './time'

/*
 * Offers from the places you keep going back to, and the door pass (step 12;
 * `docs/api/API.md` → "Regulars, offers and the door pass", mirrored from blendn-admin).
 *
 * A venue on Venue Pro sends an offer to its regulars — people who came on 3
 * or more nights in 30. The venue picks the words, the server picks who, and
 * the venue never learns who: it sees how many opened and redeemed. The push
 * names no place; the place and its words are here, after the app opens.
 *
 * Uncached: the pass's code turns every 30 seconds and is the server's alone,
 * and "redeemed" has to appear as soon as staff tap it.
 */

export type OfferState = 'live' | 'redeemed' | 'used_tonight' | 'ended'

export type Offer = {
  id: string
  venue: { id: string; name: string }
  text: string
  sentAt: string
  endsAt: string
  state: OfferState
}

export type OpenedOffer = Offer & {
  /** The code on the pass now and when it turns; only while `live`. */
  pass: { code: string; rotatesAt: string } | null
  /** When staff tapped Redeemed, once they have. Not sent yet (the stamp then reads "Redeemed" alone). */
  redeemedAt?: string | null
}

export type RegularPrefs = {
  /** "Let this place know I'm a regular": an explicit yes to whoever runs it now, off until given. */
  known: boolean
  offersMuted: boolean
  /** Who would see it: the organisation that runs the place on Blendn now; null while nobody does. */
  ownerName: string | null
  /**
   * Owner ruling: regulars are deferred. Every regulars surface (the venue
   * page's section, the offer pass's "know I'm a regular" prompt) is drawn only
   * when the server says the venue turned them on (`regulars.active === true`).
   * Absent is off.
   */
  regulars?: { active?: boolean }
}

/** Whether the regulars prompt may show for this venue: only on the server's explicit yes. */
export const regularsActive = (prefs: Pick<RegularPrefs, 'regulars'> | null | undefined): boolean => prefs?.regulars?.active === true

export type OfferReportReason = 'offensive' | 'misleading' | 'spam' | 'unsafe' | 'other'


const enc = encodeURIComponent

export const offersApi = {
  myOffers(): Promise<ApiResponse<{ offers: Offer[] }>> {
    return apiClient.queuedRequest('/api/mobile/offers')
  },

  /** Opening it is what the venue's "opened" counts, once. */
  open(offerId: string): Promise<ApiResponse<{ offer: OpenedOffer }>> {
    return apiClient.queuedRequest(`/api/mobile/offers/${enc(offerId)}`)
  },

  prefs(venueId: string): Promise<ApiResponse<RegularPrefs>> {
    return apiClient.queuedRequest(`/api/mobile/venues/${enc(venueId)}/regular`)
  },

  /** Only what changed: a choice not given is left as it is ("Maybe later" sends nothing). */
  setPrefs(venueId: string, change: Partial<Pick<RegularPrefs, 'known' | 'offersMuted'>>): Promise<ApiResponse<RegularPrefs>> {
    return apiClient.queuedRequest(`/api/mobile/venues/${enc(venueId)}/regular`, { method: 'PUT', body: JSON.stringify(change) }, true, 2)
  },

  /** Into the reports queue with the offer's words as they read. 409 while an earlier report is pending. */
  report(offerId: string, reason: OfferReportReason, description?: string): Promise<ApiResponse<{ reported: true }>> {
    const body = description ? { reason, description } : { reason }
    return apiClient.queuedRequest(`/api/mobile/offers/${enc(offerId)}/report`, { method: 'POST', body: JSON.stringify(body) }, true, 2)
  },

  /** "Offers from places": one switch for every place. */
  offersFromPlaces(): Promise<ApiResponse<{ enabled: boolean }>> {
    return apiClient.queuedRequest('/api/mobile/me/offers')
  },

  setOffersFromPlaces(enabled: boolean): Promise<ApiResponse<{ enabled: boolean }>> {
    return apiClient.queuedRequest('/api/mobile/me/offers', { method: 'PUT', body: JSON.stringify({ enabled }) }, true, 2)
  },
}

/**
 * What a yes shows the people who run a place, in the app's words -- one source for the venue page and the offer pass.
 * A host sees "A regular · N nights" and never who (SCRUM-887: hosts meet people by pseudonym only), so no line here
 * may promise a name.
 */
export const REGULAR_COPY = {
  sees: 'that a regular was here, and how many nights in the last 30 days',
  wontSee: 'who you are, your chats, who you met, or anywhere else you go',
  why: 'so the staff know when a regular is in',
} as const

/** Who sees a yes, in the app's words: the organisation, and the place it runs. */
export function knownLine(prefs: Pick<RegularPrefs, 'ownerName'>, venueName: string): string {
  const who = prefs.ownerName ? `${prefs.ownerName}, who runs ${venueName} on Blendn,` : venueName
  return `${who} will see ${REGULAR_COPY.sees}.`
}

/** The code on the pass is shown only while it is fresh: two seconds past its turn with no new one, it is hidden (L2). */
export const STALE_GRACE_MS = 2_000
export function codeIsFresh(rotatesAt: string | null | undefined, now: number): boolean {
  return !!rotatesAt && now < new Date(rotatesAt).getTime() + STALE_GRACE_MS
}

/** "Maybe later" is remembered per place, on this phone (L9). Nothing is sent. */
export const maybeLaterKey = (venueId: string) => `blendn.offers.maybeLater.${venueId}`

/** What the screen says under the offer, by state. Null while the pass can be shown. */
export function offerStateLine(state: OfferState, venueName: string): string | null {
  switch (state) {
    case 'live':
      return null
    case 'redeemed':
      return 'Redeemed. Enjoy it.'
    case 'used_tonight':
      return `You’ve used a pass at ${venueName} tonight — one a night. This one works another night.`
    case 'ended':
      return 'This offer has ended.'
  }
}

/** Ask again a second before the code turns, and at least every 10 s so "redeemed" shows soon after the tap. */
export const REFRESH_CEILING_MS = 10_000
export function nextRefreshMs(rotatesAt: string | null | undefined, now: number): number {
  if (!rotatesAt) return REFRESH_CEILING_MS
  const untilTurn = new Date(rotatesAt).getTime() - now - 1_000
  return Math.max(1_000, Math.min(REFRESH_CEILING_MS, untilTurn))
}

/** How much of the code's 30 seconds is left, 0–1, for the bar under it. */
export function codeLife(rotatesAt: string | null | undefined, now: number, stepMs = 30_000): number {
  if (!rotatesAt) return 0
  return Math.max(0, Math.min(1, (new Date(rotatesAt).getTime() - now) / stepMs))
}

/** The code as staff read it: two groups of three. */
export const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`

/** The reasons a report offers, in the order the design lists them (13-2). */
export const OFFER_REPORT_REASONS: readonly { value: OfferReportReason; label: string }[] = [
  { value: 'offensive', label: 'Offensive' },
  { value: 'misleading', label: 'Misleading' },
  { value: 'spam', label: 'Spam' },
  { value: 'unsafe', label: 'Feels unsafe' },
  { value: 'other', label: 'Something else' },
]

/** How full the disc is while the pass is live (Flow 13 pass.js: 0.62); a spent one is full, an ended one empty. */
export const LIVE_LEVEL = 0.62

export const LIVE_FOOT = 'Show this at the door. Staff type the code and tap Redeemed.'
export const OFFLINE_FOOT = 'This pass needs a connection to show its code.'
export const FRESH_CODE_FOOT = 'Getting a fresh code…'

/** Which face the door code wears: `offline` is "no fresh code to show", whatever the reason. */
export type DoorState = 'live' | 'offline' | 'redeemed' | 'used' | 'ended'

export type PassView = {
  door: DoorState
  /** How full the disc is, 0–1. */
  level: number
  /** A spent pass is still: no wave, no bubbles, dimmed. */
  spent: boolean
  /** "Redeemed 9:43 PM" over the disc, once there is something to stamp. */
  stamp: string | null
  /** When staff redeemed it, "9:43 PM" (the one clock), if the server said. */
  redeemedClock: string | undefined
  /** The sentence under the ticket. */
  foot: string
}


/**
 * What the pass shows, from what the server last said and the clock now. A
 * live pass whose code has gone stale (past its turn, no fresh one came) shows
 * no code, never the old one (L2): `offline` if the last ask failed, else a
 * fresh code is on its way.
 */
export function passView(
  offer: Pick<OpenedOffer, 'state' | 'pass' | 'venue' | 'redeemedAt'>,
  now: number,
  lastReadFailed: boolean
): PassView {
  switch (offer.state) {
    case 'live': {
      const fresh = !!offer.pass && codeIsFresh(offer.pass.rotatesAt, now)
      return {
        door: fresh ? 'live' : 'offline',
        level: LIVE_LEVEL,
        spent: false,
        stamp: null,
        redeemedClock: undefined,
        foot: fresh ? LIVE_FOOT : lastReadFailed ? OFFLINE_FOOT : FRESH_CODE_FOOT,
      }
    }
    case 'redeemed': {
      const clock = offer.redeemedAt ? clockTime(offer.redeemedAt) : undefined
      return {
        door: 'redeemed',
        level: 1,
        spent: false,
        stamp: clock ? `Redeemed ${clock}` : 'Redeemed',
        redeemedClock: clock,
        foot: offerStateLine('redeemed', offer.venue.name) ?? '',
      }
    }
    case 'used_tonight':
      return {
        door: 'used',
        level: 1,
        spent: true,
        stamp: 'Used tonight',
        redeemedClock: undefined,
        foot: offerStateLine('used_tonight', offer.venue.name) ?? '',
      }
    case 'ended':
      return { door: 'ended', level: 0, spent: true, stamp: null, redeemedClock: undefined, foot: offerStateLine('ended', offer.venue.name) ?? '' }
  }
}

/** "ENDED SUNDAY": the day the offer ran out, for an ended pass. */
export const endedLabel = (endsAt: string) => `ENDED ${WEEKDAYS_LONG[weekdayIn(new Date(endsAt))]?.toUpperCase() ?? ''}`.trim()

/** "until Wed 15 Oct": how long the offer runs (the pass itself is for today). */
export const validUntil = (endsAt: string) => `until ${calendarDate(endsAt, { weekday: true })}`
