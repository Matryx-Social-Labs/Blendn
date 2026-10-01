import { readFileSync } from 'fs'
import { join } from 'path'

// `lib/notifications` reaches apiClient and AsyncStorage; only its pure router is under test.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import {
  boardClosed,
  boardMarkSeed,
  boardMessage,
  inboxRequests,
  isSettled,
  outgoingLine,
  sortBoardPosts,
  spacesLabel,
  type BoardPost,
  type BoardRequest,
} from '../lib/board'
import { notificationTarget } from '../lib/notifications'

/**
 * The board's rules as the app draws them (client plan Part 3b; test plan §6,
 * BD-CU01..CU04). The gates are the server's; these are how its answers look.
 */

const post = (over: Partial<BoardPost>): BoardPost => ({
  id: 'p',
  kind: 'seeking',
  body: 'Anyone heading over from Koramangala?',
  spacesLeft: null,
  createdAt: '2026-10-01T10:00:00Z',
  author: 'Velvet Heron',
  mine: false,
  requestCount: 0,
  ...over,
})

const request = (over: Partial<BoardRequest>): BoardRequest => ({
  id: 'r',
  status: 'pending',
  message: null,
  createdAt: '2026-10-01T10:00:00Z',
  decidedAt: null,
  live: true,
  counterpart: 'Arctic Falcon',
  event: { id: 'e1', title: 'Warehouse Night', startTime: '2026-10-03T20:00:00Z' },
  post: { id: 'p1', kind: 'offer', body: 'Two seats from Indiranagar' },
  ...over,
})

describe('the order a board reads in', () => {
  it('puts yours first, then offers above seekings, newest first within each', () => {
    const posts = [
      post({ id: 's-new', kind: 'seeking' }),
      post({ id: 'o-new', kind: 'offer', spacesLeft: 2 }),
      post({ id: 'mine', kind: 'seeking', mine: true }),
      post({ id: 's-old', kind: 'seeking' }),
      post({ id: 'o-old', kind: 'offer', spacesLeft: 1 }),
      post({ id: 'chat', kind: 'chat' }),
    ]
    expect(sortBoardPosts(posts).map((p) => p.id)).toEqual(['mine', 'o-new', 'o-old', 's-new', 's-old', 'chat'])
  })

  it('does not reorder the list it was given', () => {
    const posts = [post({ id: 'a' }), post({ id: 'b', kind: 'offer' })]
    sortBoardPosts(posts)
    expect(posts.map((p) => p.id)).toEqual(['a', 'b'])
  })
})

describe("an offer's spaces", () => {
  it('counts them, says full at zero, and says nothing for a post that is not an offer', () => {
    expect(spacesLabel(2)).toBe('2 spaces left')
    expect(spacesLabel(1)).toBe('1 space left')
    expect(spacesLabel(0)).toBe('Full')
    expect(spacesLabel(null)).toBeNull()
  })
})

describe('the board closes at doors', () => {
  const now = Date.parse('2026-10-01T20:00:00Z')
  it('is open before the start and closed from it', () => {
    expect(boardClosed('2026-10-01T20:30:00Z', now)).toBe(false)
    expect(boardClosed('2026-10-01T20:00:00Z', now)).toBe(true)
    expect(boardClosed('2026-10-01T19:00:00Z', now)).toBe(true)
  })
  it('leaves an unknown start to the server', () => {
    expect(boardClosed(undefined, now)).toBe(false)
    expect(boardClosed('not a date', now)).toBe(false)
  })
})

describe('BD-CU01: a refusal says which gate, in the server’s words', () => {
  /*
   * The sentences `boardDenialMessage` and the routes send (blendn-admin
   * lib/board.ts, app/api/mobile/…/board). Each has a different fix, so each
   * must reach the screen as itself — one generic "Couldn't post" names none.
   */
  const refusals: Array<[string, string]> = [
    ['FORBIDDEN', 'Mark yourself as going to post here'],
    [
      'FORBIDDEN',
      'Add your name, age, two interests and why you go out — people are deciding whether to travel with you',
    ],
    ['FORBIDDEN', 'You have 5 asks waiting for an answer. Give them a moment.'],
    ['FORBIDDEN', 'You have sent a lot of requests this week. Try again in a few days.'],
    ['FORBIDDEN', 'The board closes when the doors open — the room is open instead'],
    ['AGE_RESTRICTED', "Blend'n is for people 18 and over."],
    ['NOT_FOUND', 'That post is no longer on the board'],
    ['RATE_LIMITED', 'Too many requests. Try again in a minute.'],
  ]

  it.each(refusals)('%s → %s', (errorCode, error) => {
    expect(boardMessage({ errorCode, error }, 'Couldn’t post that. Try again.')).toBe(error)
  })

  it('passes a moderation refusal (422, no code) through too', () => {
    const error = "This looks like a phone number. The board is anonymous, so contact details can't go on it."
    expect(boardMessage({ error }, 'fallback')).toBe(error)
  })

  it('falls back on a server fault or a developer string, never shows one', () => {
    expect(boardMessage({ errorCode: 'SERVER_ERROR', error: 'Failed to post' }, 'fallback')).toBe('fallback')
    expect(boardMessage({ error: 'HTTP 502 Bad Gateway (/api/mobile/…)' }, 'fallback')).toBe('fallback')
    expect(boardMessage({ error: 'Invalid JSON response (500)' }, 'fallback')).toBe('fallback')
    expect(boardMessage({ error: '  ' }, 'fallback')).toBe('fallback')
    expect(boardMessage(undefined, 'fallback')).toBe('fallback')
  })
})

describe('BD-CU02: a 409 is a state, not an error', () => {
  it('is settled on CONFLICT and nothing else', () => {
    expect(isSettled({ errorCode: 'CONFLICT', error: 'You have already asked — give them a moment' })).toBe(true)
    expect(isSettled({ errorCode: 'FORBIDDEN', error: 'Mark yourself as going to post here' })).toBe(false)
    expect(isSettled({ error: 'No internet connection.' })).toBe(false)
  })
})

describe('an ask you sent never says it was declined', () => {
  it('reads waiting while live, yes once accepted, and closed otherwise', () => {
    expect(outgoingLine(request({}))).toBe('Waiting on them')
    expect(outgoingLine(request({ live: false, status: 'accepted' }))).toMatch(/said yes/)
    for (const status of ['declined', 'withdrawn', 'pending'] as const) {
      const line = outgoingLine(request({ live: false, status }))
      expect(line).toBe('Closed')
      expect(line.toLowerCase()).not.toMatch(/declin|refus|reject|no\b/)
    }
  })
})

describe('what the Banter shows', () => {
  const now = Date.parse('2026-10-03T12:00:00Z')

  it('shows only incoming asks that can still be answered', () => {
    const shown = inboxRequests(
      { incoming: [request({ id: 'live' }), request({ id: 'lapsed', live: false })], outgoing: [] },
      now
    )
    expect(shown.incoming.map((r) => r.id)).toEqual(['live'])
  })

  it('keeps a closed ask until a day after its doors, and hides your own withdrawals', () => {
    const soon = { id: 'e1', title: 'Soon', startTime: '2026-10-03T20:00:00Z' }
    const lastWeek = { id: 'e2', title: 'Last week', startTime: '2026-09-26T20:00:00Z' }
    const shown = inboxRequests(
      {
        incoming: [],
        outgoing: [
          request({ id: 'waiting', event: lastWeek }),
          request({ id: 'declined-soon', live: false, status: 'declined', event: soon }),
          request({ id: 'declined-old', live: false, status: 'declined', event: lastWeek }),
          request({ id: 'withdrawn', live: false, status: 'withdrawn', event: soon }),
        ],
      },
      now
    )
    expect(shown.outgoing.map((r) => r.id)).toEqual(['waiting', 'declined-soon'])
  })
})

describe('BD-CU03: a mark is seeded on the handle, never on a person', () => {
  it('uses the handle, and a per-event, per-post fallback for a placeholder', () => {
    expect(boardMarkSeed('Velvet Heron', 'e1', 'p1')).toBe('Velvet Heron')
    expect(boardMarkSeed('Attendee', 'e1', 'p1')).toBe('e1:p1')
    expect(boardMarkSeed('', 'e1', 'p1')).toBe('e1:p1')
  })

  it('draws no photo and reads no user id on any board surface', () => {
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    let marks = 0
    for (const file of [
      'components/board/BoardSections.tsx',
      'components/board/BoardRequestsSection.tsx',
      'app/board/[eventId].tsx',
    ]) {
      const src = strip(readFileSync(join(__dirname, '..', file), 'utf8'))
      expect(src).not.toMatch(/OptimizedImage|expo-image|avatarUrl|photo|userId|user_id|authorId|author_id/)
      // Every mark goes through the one seed rule.
      for (const m of src.matchAll(/(?:<BoardMark seed|markSeed)=\{([^}]*)\}/g)) {
        expect(m[1]).toMatch(/^boardMarkSeed\(/)
        marks += 1
      }
    }
    // The card, the outgoing row and the incoming request: not a vacuous pass.
    expect(marks).toBeGreaterThanOrEqual(3)
  })
})

describe('board pushes carry no text, and open where the thing lives', () => {
  it('sends a request to the Banter and an acceptance to its conversation', () => {
    expect(notificationTarget({ type: 'board_request', eventId: 'e1', requestId: 'r1' })).toBe('/(tabs)/chat')
    expect(notificationTarget({ type: 'board_request_accepted', conversationId: 'c1' })).toEqual({
      pathname: '/private-chat/[conversationId]',
      params: { conversationId: 'c1' },
    })
    expect(notificationTarget({ type: 'board_request_accepted' })).toBe('/(tabs)/chat')
  })
})
