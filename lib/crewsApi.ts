import { apiClient, type ApiResponse } from './apiClient'
import type {
  Blend,
  BlendRef,
  CreateCrewBody,
  Crew,
  CrewIntent,
  CrewInvite,
  CrewLink,
  CrewLinkPreview,
  CrewReportReason,
  CrewsAtEvent,
  HiddenCrew,
} from './crews'

/*
 * The crew and Blend routes (`docs/api/API.md` → Crews, Blends — mirrored from blendn-admin).
 *
 * Uncached, like the friends lists and the board: a crew list is read to act
 * on, and a stale one offers an invite that has lapsed or a Blend that has
 * closed. Mutations go at priority 2 and are never retried (`apiClient`).
 * Every refusal is read through `crewMessage` (lib/crews.ts).
 */

/** `PATCH /crews/:crewId`: anything the owner can change, and at least one of them. */
export type CrewPatch = Partial<{ name: string; bio: string | null; intent: CrewIntent[]; tags: string[]; openToSolo: boolean }>

const enc = encodeURIComponent
const post = (body?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) })

export const INVITES_PAGE = 50
export type InvitesPagination = { limit: number; hasMore: boolean; nextCursor: string | null; totalCount: number }

export const crewsApi = {
  /**
   * My crews, and a page of the invites waiting (`invitesPagination`: `{ limit, hasMore, nextCursor, totalCount }`, newest 200 at
   * most). With no `cursor` the first page of 50; `crews` is not paged. A server before the paging sends none: all the invites, no more.
   */
  myCrews(cursor?: string | null): Promise<ApiResponse<{ crews: Crew[]; invites: CrewInvite[]; invitesPagination?: InvitesPagination; tagIdeas?: string[] }>> {
    return apiClient.queuedRequest(`/api/mobile/crews?limit=${INVITES_PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
  },

  crew(crewId: string): Promise<ApiResponse<Crew>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}`)
  },

  create(body: CreateCrewBody): Promise<ApiResponse<{ crewId: string; chatGroupId: string; invited: number }>> {
    return apiClient.queuedRequest('/api/mobile/crews', post(body), true, 2)
  },

  /** The owner's changes: name, bio, "Here for", tags and "Room for one more". */
  update(crewId: string, patch: CrewPatch): Promise<ApiResponse<Crew>> {
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

  /** Crews 5A, the owner only: members, invites, the chat (closed for good) and open Mixes end. Nobody is pushed; anyone else gets 404. */
  end(crewId: string): Promise<ApiResponse<{ ended: true }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}`, { method: 'DELETE' }, true, 2)
  },

  leave(crewId: string, myId: string): Promise<ApiResponse<{ dissolved: boolean }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/members/${enc(myId)}`, { method: 'DELETE' }, true, 2)
  },

  /**
   * "Going together" (crews 4-A1): marks the event's next night for the crew — a line in the crew chat and one push per crew
   * per night, by the server. 404 not a member / an event you can't take part in, 403 crews off, 400 no night left, 429 three
   * nights told today. `repeated`: it was already planned (no second line or push).
   */
  plan(crewId: string, eventId: string): Promise<ApiResponse<{ planned: boolean; repeated: boolean; occurrenceId: string }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/plans`, post({ eventId }), true, 2)
  },

  /** Takes the plan back (its planner or the owner). Refunds nothing against the day's three. */
  unplan(crewId: string, eventId: string): Promise<ApiResponse<{ planned: false }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/plans`, { method: 'DELETE', body: JSON.stringify({ eventId }) }, true, 2)
  },

  report(crewId: string, report: { reason: CrewReportReason; description?: string }): Promise<ApiResponse<{ reported: true }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/report`, post(report), true, 2)
  },

  crewsAt(eventId: string, page: { limit: number; offset: number }): Promise<ApiResponse<CrewsAtEvent>> {
    return apiClient.queuedRequest(
      `/api/mobile/events/${enc(eventId)}/crews?limit=${page.limit}&offset=${page.offset}`
    )
  },

  /**
   * Wave for your crew (board crews/05-room A; admin #1003): as one of your crews here (`asCrewId`), or as yourself. Shares
   * the like's refusals and its 30 a day; waving twice is waving once; a crew you blocked is 404. `blend` when it was mutual.
   */
  waveCrew(eventId: string, crewId: string, asCrewId?: string): Promise<ApiResponse<{ liked: true; waved: true; blend: BlendRef | null }>> {
    return apiClient.queuedRequest(
      `/api/mobile/events/${enc(eventId)}/crews/${enc(crewId)}/wave`,
      post(asCrewId ? { asCrewId } : {}),
      true,
      2
    )
  },

  /** Block a crew for good (its card is gone from your rooms; its members aren't told). 404 your own, ended or not there. */
  hideCrew(crewId: string): Promise<ApiResponse<{ hidden: true }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/hide`, post(), true, 2)
  },

  unhideCrew(crewId: string): Promise<ApiResponse<{ hidden: false }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/hide`, { method: 'DELETE' }, true, 2)
  },

  /** Settings → Blocked, the crews: newest first. */
  hiddenCrews(page: number, limit: number): Promise<ApiResponse<{ crews: HiddenCrew[]; pagination: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean } }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/hidden?page=${page}&limit=${limit}`)
  },

  /**
   * Wave at a person for your crew (admin #1007): `handle` is their room handle. A refusal about THEM is
   * `{ sent: true, mutual: false }`, the same as a wave that stood: it tells you nothing about the person, so nothing here may.
   */
  wavePersonAsCrew(eventId: string, handle: string, asCrewId: string): Promise<ApiResponse<{ sent: true; mutual: boolean; blend?: BlendRef }>> {
    return apiClient.queuedRequest(
      `/api/mobile/events/${enc(eventId)}/waves`,
      post({ toUserId: handle, asCrewId }),
      true,
      2
    )
  },

  /** S7: a link into your crew, once, for 7 days (10 a day: 429). Share `url`. */
  makeLink(crewId: string): Promise<ApiResponse<{ token: string; url: string; expiresAt: string }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/${enc(crewId)}/links`, post(), true, 2)
  },

  /** The invite card behind a link. Every dead link is one 404 (`INVITE_UNAVAILABLE`). `member`: you are in it already. */
  link(token: string): Promise<ApiResponse<CrewLink>> {
    return apiClient.queuedRequest(`/api/mobile/crews/links/${enc(token)}`)
  },

  /** Signed out: whose link and which crew, nothing more. */
  linkPreview(token: string): Promise<ApiResponse<CrewLinkPreview>> {
    return apiClient.queuedRequest(`/api/mobile/crews/links/${enc(token)}/preview`, {}, false)
  },

  /** Joins, and makes you and whoever shared it friends. Nothing is sent before the consent (`revealConsent`). */
  joinByLink(token: string, consent: { revealConsent: true; keepMeAnonymous: boolean }): Promise<ApiResponse<{ crewId: string; chatGroupId: string }>> {
    return apiClient.queuedRequest(`/api/mobile/crews/links/${enc(token)}`, post(consent), true, 2)
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
