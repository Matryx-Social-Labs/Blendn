import type { PollOption } from '../components/ds/PollBubble'
import { apiClient, type ApiResponse } from './apiClient'

/**
 * An organiser's poll in a room (Flow 5 · poll bubbles, Flow 15 #17). The bubble is `PollBubble`; this is what the
 * server says to draw in it. The routes exist (`GET` and `POST …/events/:eventId/polls/:pollId[/vote]`, blendn-admin
 * lib/polls.ts) and answer the poll as this reader may see it. What the room's message does not carry yet is the
 * poll's id (SV8): `poll_id` on a `poll` message, read here from `pollId`, `poll_id` or `metadata.pollId`. Until it
 * does, the room says a poll as a notice, as it always has.
 */

/** One poll as the server discloses it to this reader (lib/polls.ts `PollResults`). */
export type PollResults = {
  id: string
  question: string
  closed: boolean
  /** The organiser let counts show while it is open. */
  resultsVisible: boolean
  options: { id: string; label: string; position: number; votes: number | null }[]
  /** The option you chose, by id. */
  myVote: string | null
  /** What to say in place of numbers the server withheld: this, never a count the client invents. Null when nothing is. */
  suppressedLabel?: string | null
  /** Why: `hidden_until_close` (the organiser has not published them) or `few_votes` (under the floor). Absent from an older server. */
  suppressedReason?: 'hidden_until_close' | 'few_votes' | null
}

/** What `PollBubble` takes. `votes`: a number; `null` withheld under five; absent while the organiser hides them. */
export type PollView = { options: PollOption[]; picked?: number; closed: boolean; withheldLine?: string }

export function pollView(results: PollResults): PollView {
  // Hidden until it closes, or counts withheld: the server says which (`suppressedReason`). An older server says nothing, and
  // then the poll's own flags decide (open and not published is hidden).
  const hidden = results.suppressedReason ? results.suppressedReason === 'hidden_until_close' : !results.closed && !results.resultsVisible
  const fewVotes = results.suppressedReason === 'few_votes'
  const options = [...results.options]
    .sort((a, b) => a.position - b.position)
    .map((o): PollOption => (hidden ? { label: o.label } : { label: o.label, votes: o.votes }))
  const picked = options.length ? [...results.options].sort((a, b) => a.position - b.position).findIndex((o) => o.id === results.myVote) : -1
  // Under the floor, in the server's words ("Results appear once more people vote"), not a number of ours.
  const withheldLine = fewVotes && results.suppressedLabel ? results.suppressedLabel : undefined
  return { options, picked: picked >= 0 ? picked : undefined, closed: results.closed, ...(withheldLine ? { withheldLine } : {}) }
}

/** The id of the option at `index`, in the order the bubble draws them. */
export const optionIdAt = (results: PollResults, index: number): string | undefined =>
  [...results.options].sort((a, b) => a.position - b.position)[index]?.id

const path = (eventId: string, pollId: string) => `/api/mobile/events/${encodeURIComponent(eventId)}/polls/${encodeURIComponent(pollId)}`

export const getPoll = (eventId: string, pollId: string): Promise<ApiResponse<PollResults>> => apiClient.queuedRequest<PollResults>(path(eventId, pollId))

export const votePoll = (eventId: string, pollId: string, optionId: string): Promise<ApiResponse<PollResults>> =>
  apiClient.queuedRequest<PollResults>(`${path(eventId, pollId)}/vote`, { method: 'POST', body: JSON.stringify({ optionId }) }, true, 2)

/**
 * A vote the server refused with a 409 and a `reasonCode` (blendn-admin lib/polls.ts `POLL_VOTE_REFUSALS`): the poll closed
 * (the one the room keeps, R4.1 Polls · C8), or the room itself says no: closed, you are not in it, you are not live in it.
 * The room's own refusals drive the room's lock, not a toast. An older server sends only the sentence.
 */
export type PollRefusal = 'POLL_CLOSED' | 'ROOM_CLOSED' | 'NOT_IN_ROOM' | 'NOT_LIVE' | 'NOT_AN_OPTION'

const SENTENCES: Record<string, PollRefusal> = {
  'This poll has closed': 'POLL_CLOSED',
  'The chatroom is not open': 'ROOM_CLOSED',
  'You are not in this chatroom': 'NOT_IN_ROOM',
}

export function pollRefusal(result: { reasonCode?: string; error?: string | null }): PollRefusal | null {
  const code = result.reasonCode
  if (code === 'POLL_CLOSED' || code === 'ROOM_CLOSED' || code === 'NOT_IN_ROOM' || code === 'NOT_LIVE' || code === 'NOT_AN_OPTION') return code
  return SENTENCES[(result.error ?? '').trim().replace(/\.$/, '')] ?? null
}

/** The first read of a poll waits a random beat so a room of thousands opening together does not ask at once. */
export const POLL_JITTER_MS = 2000
export const pollReadDelay = () => Math.floor(Math.random() * POLL_JITTER_MS)

/** A poll read lately is not read again by the next row, remount or reader on this phone. */
const POLL_TTL_MS = 20_000
const cache = new Map<string, { at: number; results: PollResults }>()
export const cachedPoll = (pollId: string, now: number = Date.now()): PollResults | null => {
  const hit = cache.get(pollId)
  return hit && now - hit.at < POLL_TTL_MS ? hit.results : null
}
export const rememberPoll = (pollId: string, results: PollResults, now: number = Date.now()): void => {
  cache.set(pollId, { at: now, results })
}
export const forgetPolls = (): void => cache.clear()
