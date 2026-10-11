import { apiClient, type ApiResponse } from './apiClient'

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
}

export type RegularPrefs = {
  /** "Let this place know I'm a regular": an explicit yes, off until given. */
  known: boolean
  offersMuted: boolean
}

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
  setPrefs(venueId: string, change: Partial<RegularPrefs>): Promise<ApiResponse<RegularPrefs>> {
    return apiClient.queuedRequest(`/api/mobile/venues/${enc(venueId)}/regular`, { method: 'PUT', body: JSON.stringify(change) }, true, 2)
  },
}

/** What the screen says under the offer, by state. Null while the pass can be shown. */
export function offerStateLine(state: OfferState, venueName: string): string | null {
  switch (state) {
    case 'live':
      return null
    case 'redeemed':
      return 'Redeemed. Enjoy it.'
    case 'used_tonight':
      return `You've used a pass at ${venueName} tonight — one a night. This one works another night.`
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
