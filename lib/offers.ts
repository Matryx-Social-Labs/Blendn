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
  /** "Let this place know I'm a regular": an explicit yes to whoever runs it now, off until given. */
  known: boolean
  offersMuted: boolean
  /** Who would see it: the organisation that runs the place on Blendn now; null while nobody does. */
  ownerName: string | null
  /**
   * Owner ruling: regulars are deferred. Every regulars surface on the place
   * page is drawn only when the server says the venue has turned them on from
   * the dashboard (`regulars.active === true`). Not sent yet: absent is off.
   */
  regulars?: { active?: boolean }
}

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
  report(offerId: string, reason: OfferReportReason): Promise<ApiResponse<{ reported: true }>> {
    return apiClient.queuedRequest(`/api/mobile/offers/${enc(offerId)}/report`, { method: 'POST', body: JSON.stringify({ reason }) }, true, 2)
  },

  /** "Offers from places": one switch for every place. */
  offersFromPlaces(): Promise<ApiResponse<{ enabled: boolean }>> {
    return apiClient.queuedRequest('/api/mobile/me/offers')
  },

  setOffersFromPlaces(enabled: boolean): Promise<ApiResponse<{ enabled: boolean }>> {
    return apiClient.queuedRequest('/api/mobile/me/offers', { method: 'PUT', body: JSON.stringify({ enabled }) }, true, 2)
  },
}

/** Who sees a yes, in the app's words: the organisation, and the place it runs. */
export function knownLine(prefs: Pick<RegularPrefs, 'ownerName'>, venueName: string): string {
  const who = prefs.ownerName ? `${prefs.ownerName}, who runs ${venueName} on Blendn,` : venueName
  return `${who} will see your first name and how many nights you've come in the last 30 — nothing else.`
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
