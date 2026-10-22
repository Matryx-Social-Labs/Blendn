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
}

/** What `PollBubble` takes. `votes`: a number; `null` withheld under five; absent while the organiser hides them. */
export type PollView = { options: PollOption[]; picked?: number; closed: boolean }

export function pollView(results: PollResults): PollView {
  // Nothing at all while it is open unless it opted in: the server sends nulls either way, so the poll's own flags say which.
  const hidden = !results.closed && !results.resultsVisible
  const options = [...results.options]
    .sort((a, b) => a.position - b.position)
    .map((o): PollOption => (hidden ? { label: o.label } : { label: o.label, votes: o.votes }))
  const picked = options.length ? [...results.options].sort((a, b) => a.position - b.position).findIndex((o) => o.id === results.myVote) : -1
  return { options, picked: picked >= 0 ? picked : undefined, closed: results.closed }
}

/** The id of the option at `index`, in the order the bubble draws them. */
export const optionIdAt = (results: PollResults, index: number): string | undefined =>
  [...results.options].sort((a, b) => a.position - b.position)[index]?.id

const path = (eventId: string, pollId: string) => `/api/mobile/events/${encodeURIComponent(eventId)}/polls/${encodeURIComponent(pollId)}`

export const getPoll = (eventId: string, pollId: string): Promise<ApiResponse<PollResults>> => apiClient.queuedRequest<PollResults>(path(eventId, pollId))

export const votePoll = (eventId: string, pollId: string, optionId: string): Promise<ApiResponse<PollResults>> =>
  apiClient.queuedRequest<PollResults>(`${path(eventId, pollId)}/vote`, { method: 'POST', body: JSON.stringify({ optionId }) }, true, 2)

/** The server's one 409 the room keeps (R4.1 Polls · C8): a vote on a poll that has closed. */
export const POLL_CLOSED_SENTENCE = 'This poll has closed'
export const pollClosed = (error: string | undefined | null) => (error ?? '').trim().replace(/\.$/, '') === POLL_CLOSED_SENTENCE
