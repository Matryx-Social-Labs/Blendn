import { apiClient, type ApiResponse } from './apiClient'
import type {
  Blend,
  BlendRef,
  CreateCrewBody,
  Crew,
  CrewInvite,
  CrewReportReason,
  CrewsAtEvent,
} from './crews'

/*
 * The crew and Blend routes (`docs/api/API.md` → Crews, Blends — mirrored from blendn-admin).
 *
 * Uncached, like the friends lists and the board: a crew list is read to act
 * on, and a stale one offers an invite that has lapsed or a Blend that has
 * closed. Mutations go at priority 2 and are never retried (`apiClient`).
 * Every refusal is read through `crewMessage` (lib/crews.ts).
 */

const enc = encodeURIComponent
const post = (body?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) })

export const crewsApi = {
  myCrews(): Promise<ApiResponse<{ crews: Crew[]; invites: CrewInvite[] }>> {
    return apiClient.queuedRequest('/api/mobile/crews')
  },

  crew(crewId: string): Promise<ApiResponse<Crew>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}`)
  },

  create(body: CreateCrewBody): Promise<ApiResponse<{ crewId: string; chatGroupId: string; invited: number }>> {
    return apiClient.queuedRequest('/api/mobile/crews', post(body), true, 2)
  },

  /** The owner's settings. Only "Room for one more" has a control so far. */
  update(crewId: string, patch: { openToSolo: boolean }): Promise<ApiResponse<Crew>> {
    return apiClient.queuedRequest(
      `/api/mobile/crews/${enc(crewId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
      true,
      2
    )
  },

  /** `invited` is how many you asked for — never who got one. */
  invite(crewId: string, userIds: string[]): Promise<ApiResponse<{ invited: number }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/invites`, post({ userIds }), true, 2)
  },

  join(crewId: string, consent: { revealConsent: true; keepMeAnonymous: boolean }): Promise<ApiResponse<{ chatGroupId: string }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/join`, post(consent), true, 2)
  },

  /** Told to nobody. */
  decline(crewId: string): Promise<ApiResponse<{ declined: true }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/join`, { method: 'DELETE' }, true, 2)
  },

  /** `myId` is your own id: this is only ever your own setting. */
  setKeepMeAnonymous(crewId: string, myId: string, keepMeAnonymous: boolean): Promise<ApiResponse<{ keepMeAnonymous: boolean }>> {
    return apiClient.queuedRequest(
      `/api/mobile/crews/${enc(crewId)}/members/${enc(myId)}`,
      { method: 'PATCH', body: JSON.stringify({ keepMeAnonymous }) },
      true,
      2
    )
  },

  leave(crewId: string, myId: string): Promise<ApiResponse<{ dissolved: boolean }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/members/${enc(myId)}`, { method: 'DELETE' }, true, 2)
  },

  /** "We're here": checks nobody in. `repeated: true` after the first tap of the night. */
  here(crewId: string, eventId: string): Promise<ApiResponse<{ notified: number; repeated: boolean }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/here`, post({ eventId }), true, 2)
  },

  report(crewId: string, report: { reason: CrewReportReason; description?: string }): Promise<ApiResponse<{ reported: true }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/report`, post(report), true, 2)
  },

  crewsAt(eventId: string, page: { limit: number; offset: number }): Promise<ApiResponse<CrewsAtEvent>> {
    return apiClient.queuedRequest(
      `/api/mobile/events/${enc(eventId)}/crews?limit=${page.limit}&offset=${page.offset}`
    )
  },

  /** As one of your crews here (`asCrewId`), or as yourself. */
  likeCrew(eventId: string, crewId: string, asCrewId?: string): Promise<ApiResponse<{ liked: true; blend: BlendRef | null }>> {
    return apiClient.queuedRequest(
      `/api/mobile/events/${enc(eventId)}/crews/${enc(crewId)}/like`,
      post(asCrewId ? { asCrewId } : {}),
      true,
      2
    )
  },

  /**
   * A person, on your crew's behalf. `handle` is the deck's room handle. The
   * answer is `{ liked: true }` whatever the server found out about them —
   * it tells you nothing about the person, so nothing here may either.
   */
  likePersonAsCrew(eventId: string, handle: string, asCrewId: string): Promise<ApiResponse<{ liked: true; blend: BlendRef | null }>> {
    return apiClient.queuedRequest(
      `/api/mobile/events/${enc(eventId)}/matches/likes`,
      post({ userId: handle, asCrewId }),
      true,
      2
    )
  },

  /**
   * "Open to joining a crew tonight". It lapses at the end of the night by
   * itself, and the server has no GET for it — so `undefined` asks the
   * current value without changing it (an empty PUT answers `openToCrews`).
   */
  openToCrews(eventId: string, value?: boolean): Promise<ApiResponse<{ openToCrews: boolean }>> {
    return apiClient.queuedRequest(
      `/api/mobile/events/${enc(eventId)}/matches/preferences`,
      { method: 'PUT', body: JSON.stringify(value === undefined ? {} : { openToCrews: value }) },
      true,
      3
    )
  },

  blends(): Promise<ApiResponse<{ blends: Blend[] }>> {
    return apiClient.queuedRequest('/api/mobile/blends')
  },

  /** One tap reveals your crew in this Blend only. No count comes back — who kept private is not told to your crew. */
  reveal(blendId: string): Promise<ApiResponse<{ revealed: true }>> {
    return apiClient.queuedRequest(`/api/mobile/blends/${enc(blendId)}/reveal`, post(), true, 2)
  },
}
