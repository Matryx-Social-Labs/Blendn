import { markSeed } from './pseudonymAvatar'

/**
 * The pre-event board: going alone, and looking for somebody to go with.
 *
 * Pure, so the rules the screens draw can be tested without a render. The
 * server owns every gate (`lib/board.ts` / `lib/board-access.ts` in
 * blendn-admin); this file only decides how its answers look.
 *
 * Design of record: "Part 3b — the board, designed" in the client plan.
 */

/**
 * Whether the board is reachable at all. **Off** until its server half lands
 * (step 6b: block and report by post or request, blocked authors filtered out,
 * a decline never told to the asker, spaces that go down). Every way in reads
 * this one constant — the event screen's row, the Banter's section and the
 * route itself — so turning it on is one line, and a build can try it with
 * `EXPO_PUBLIC_BOARD_ENABLED=true` without a code change.
 */
export const BOARD_ENABLED = process.env.EXPO_PUBLIC_BOARD_ENABLED === 'true'

/** The server's `BOARD.MAX_POST_LENGTH` (blendn-admin lib/constants.ts). */
export const BOARD_MAX_POST_LENGTH = 500

/** What an ask that has not been accepted reads, whatever happened to it. */
export const WAITING_LINE = 'Waiting on them'

/** `offer` has spaces to give, `seeking` wants one, `chat` asks nothing. */
export type BoardPostKind = 'offer' | 'seeking' | 'chat'

/** One post as `GET /events/:eventId/board` sends it. */
export interface BoardPost {
  id: string
  kind: BoardPostKind
  body: string
  /** Only on an offer. Null elsewhere: "never about spaces" is not "full". */
  spacesLeft: number | null
  createdAt: string
  /** The author's handle at this event — a pseudonym, never a name. */
  author: string
  /** Yours: offer to take it down rather than to ask. */
  mine: boolean
  /** How many have asked. A number, never who. */
  requestCount: number
}

export type BoardRequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'

/** One request as `GET /board/requests` sends it, in either direction. */
export interface BoardRequest {
  id: string
  status: BoardRequestStatus
  message: string | null
  createdAt: string
  decidedAt: string | null
  /** Still worth answering: pending, the event not over, the post still up. */
  live: boolean
  /** The other person's handle at that event. Never a name. */
  counterpart: string
  event: { id: string; title: string; startTime: string }
  /** `body` is null once the post was taken down. */
  post: { id: string; kind: BoardPostKind; body: string | null }
}

export interface BoardRequests {
  /** Waiting on you. */
  incoming: BoardRequest[]
  /** Waiting on them. */
  outgoing: BoardRequest[]
}

/**
 * Yours first, then offers, then everything else — each group newest first,
 * as the server sent it.
 *
 * Yours first because a post you just made has to land where you are looking
 * (the success state is "the card appears at the top"). Offers above seekings
 * because an offer's spaces are the board's only real-time signal: a car with
 * one seat left is news, a person looking is not going anywhere. One list, not
 * two sections — three posts in two headed groups reads as a broken screen.
 */
export function sortBoardPosts(posts: readonly BoardPost[]): BoardPost[] {
  const mine = posts.filter((p) => p.mine)
  const others = posts.filter((p) => !p.mine)
  return [
    ...mine,
    ...others.filter((p) => p.kind === 'offer'),
    ...others.filter((p) => p.kind !== 'offer'),
  ]
}

/** "2 spaces left", "1 space left", "Full" — or null on anything not an offer. */
export function spacesLabel(spacesLeft: number | null): string | null {
  if (spacesLeft === null || !Number.isFinite(spacesLeft)) return null
  if (spacesLeft <= 0) return 'Full'
  return spacesLeft === 1 ? '1 space left' : `${spacesLeft} spaces left`
}

/**
 * Whether the doors have opened, so the board has closed.
 *
 * The server closes posting and asking at `start_time` (the run's, not the
 * day's — a multi-day event closes its board at the first doors). An unknown
 * start is not closed: the server will say so if it is.
 */
export function boardClosed(startTime: string | null | undefined, now: number = Date.now()): boolean {
  if (!startTime) return false
  const t = new Date(startTime).getTime()
  return Number.isFinite(t) && t <= now
}

type Refusal = { error?: string | null; errorCode?: string | null } | null | undefined

/**
 * What to tell somebody the board refused.
 *
 * Every refusal on the board's routes is a sentence written for the person —
 * "Mark yourself as going to post here", "Add your name, age, two interests
 * and why you go out…", "You have 5 asks waiting for an answer." Each gate has
 * a different fix, so a shared "Couldn't post" names none of them; the server's
 * words go through. Only a server fault or a transport-level string the
 * client invented for a developer falls back to the screen's own sentence.
 */
export function boardMessage(result: Refusal, fallback: string): string {
  const said = result?.error?.trim()
  if (!said) return fallback
  if (result?.errorCode === 'SERVER_ERROR') return fallback
  if (/^(HTTP \d|Invalid JSON)/.test(said)) return fallback
  return said
}

/**
 * A 409 is a state, not an error.
 *
 * "You have already asked", "That request has already been answered" — a
 * double tap on a slow connection, or somebody else getting there first.
 * Drawn red, it teaches people they did something wrong.
 */
export function isSettled(result: Refusal): boolean {
  return result?.errorCode === 'CONFLICT'
}

/**
 * Whether an ask you sent still reads as waiting — and so keeps Withdraw.
 *
 * **A decline reads exactly as waiting.** The server delivers no decline (no
 * push, by design), and the client must not let one be inferred: a row that
 * flipped from "Waiting" to anything else while the post is still up could
 * only mean no. So `declined` is drawn as pending for as long as the row is
 * shown. The server will stop sending `declined` to the asker at all
 * (step 6b); this keeps the rule if it ever does.
 *
 * ponytail: the payload carries no `end_time`, so a declined row reads waiting
 * until the Banter drops it (a day after doors), where a lapsed pending one
 * reads closed from the end of the event. After the night, that gap tells
 * nobody anything worth knowing; send `endTime` if it ever matters.
 */
export function askStillOpen(request: Pick<BoardRequest, 'live' | 'status'>): boolean {
  return request.live || request.status === 'declined'
}

/**
 * The one line an ask you sent carries, on the board card and in the Banter.
 * There is no "declined" — see `askStillOpen`.
 */
export function outgoingLine(request: Pick<BoardRequest, 'live' | 'status'>): string {
  if (request.status === 'accepted') return "They said yes — you're in each other's chats"
  return askStillOpen(request) ? WAITING_LINE : 'Closed'
}

/** How long a closed ask stays in the Banter after its event's doors. */
const OUTGOING_KEEP_MS = 24 * 60 * 60 * 1000

/**
 * The asks worth showing in the Banter.
 *
 * Incoming: only what can still be answered. Outgoing: anything still live,
 * plus closed ones until a day after their doors — long enough to see it
 * resolved, short enough that the Banter does not become an archive. Your own
 * withdrawals are not shown: you know.
 */
export function inboxRequests(requests: BoardRequests, now: number = Date.now()): BoardRequests {
  return {
    incoming: requests.incoming.filter((r) => r.live),
    outgoing: requests.outgoing.filter((r) => {
      if (r.status === 'withdrawn') return false
      if (r.live) return true
      const start = new Date(r.event.startTime).getTime()
      return Number.isFinite(start) && start > now - OUTGOING_KEEP_MS
    }),
  }
}

/**
 * The seed for a person's mark on the board: their handle, per the house rule
 * (`markSeed`). The fallback is per event and per post — never a user id, which
 * the board does not even send.
 */
export function boardMarkSeed(author: string, eventId: string, postId: string): string {
  return markSeed(author, `${eventId}:${postId}`)
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * A board URL with its ids taken out, for crash reports.
 *
 * Sentry records every fetch as a breadcrumb and tags the report with the
 * user's id. A board URL carries the event, the post and the request, so a
 * report would tie one person to who they asked and whose post — exactly the
 * pairing the board keeps pseudonymous. Other URLs pass through unchanged.
 */
export function scrubBoardUrl(url: string): string {
  return /\/board(\/|$|\?)/.test(url) ? url.replace(UUID, ':id') : url
}
