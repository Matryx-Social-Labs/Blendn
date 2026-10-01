import { readFileSync } from 'fs'
import { join } from 'path'

// `lib/notifications` reaches apiClient and AsyncStorage; only its pure router is under test.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import {
  acceptConflictLine,
  askConflictLine,
  BOARD_CLOSED_SENTENCE,
  BOARD_ENABLED,
  BOARD_MAX_POST_LENGTH,
  boardClosed,
  boardMarkSeed,
  boardMessage,
  inboxRequests,
  isSettled,
  outgoingLine,
  scrubBoardUrl,
  sortBoardPosts,
  spacesLabel,
  WAITING_LINE,
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
   * Copied verbatim from blendn-admin at origin/dev 02730b4 — the client cannot
   * import the server — with where each one is written, so a change there has
   * an address here:
   *
   *   lib/board.ts `boardDenialMessage` — the four write gates
   *   app/api/mobile/events/[eventId]/board/route.ts — the doors (403)
   *   app/api/mobile/events/[eventId]/board/[postId]/requests/route.ts — a
   *     post gone or blocked (404)
   *   lib/age.ts `FINISH_ONBOARDING`, `minAgeRefusal` — the access gate (403)
   *   lib/rate-limit.ts — "Too many requests" (429)
   *
   * Each gate has a different fix, so each must reach the screen as itself —
   * one generic "Couldn't post" names none of them.
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
    ['FORBIDDEN', "Finish setting up your profile first. Blend'n is for people 18 and over."],
    ['AGE_RESTRICTED', 'This event is 21+. Add your age to your profile to check in.'],
    ['NOT_FOUND', 'That post is no longer on the board'],
    ['RATE_LIMITED', 'Too many requests'],
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

describe('an ask you sent reads what the server sends, and never a no', () => {
  /*
   * The server keeps a decline from the asker (step 6b): their declined ask
   * arrives `pending` and `live` until the night lapses, and an ask to somebody
   * blocked either way arrives as an ask on a withdrawn post. So the line
   * follows `live`, and needs no rule of its own for a decline.
   */
  it('reads waiting while live — which is all a declined ask ever looks like to its asker', () => {
    expect(outgoingLine(request({ status: 'pending', live: true, decidedAt: null }))).toBe(WAITING_LINE)
  })

  it('says yes once accepted, closed once nothing can come of it, and owns a withdrawal', () => {
    expect(outgoingLine(request({ live: false, status: 'accepted' }))).toMatch(/said yes/)
    expect(outgoingLine(request({ live: false }))).toBe('Closed')
    // A block reads as a withdrawn post: pending, not live, no words.
    expect(outgoingLine(request({ live: false, post: { id: 'p1', kind: 'offer', body: null } }))).toBe('Closed')
    expect(outgoingLine(request({ live: false, status: 'withdrawn' }))).toBe('You withdrew this')
  })

  it('has no word for no, in any state', () => {
    for (const status of ['pending', 'accepted', 'declined', 'withdrawn'] as const) {
      for (const live of [true, false]) {
        expect(outgoingLine(request({ status, live })).toLowerCase()).not.toMatch(/declin|refus|reject|\bno\b/)
      }
    }
  })
})

describe('a 409 has fixed words, never the server’s', () => {
  it('reads a re-ask as waiting — one ask per post, ever — and a full offer as full', () => {
    const conflict = (error: string) => ({ errorCode: 'CONFLICT', error })
    expect(askConflictLine(conflict('You have already asked — give them a moment'))).toBe(WAITING_LINE)
    // The sentence the server used to send after a decline; the decline it delivered must stay unsaid.
    expect(askConflictLine(conflict('They have already answered this one'))).toBe(WAITING_LINE)
    expect(askConflictLine(conflict('That offer is full'))).toBe('Full')
  })

  it.each([
    ['That offer is full', 'Your offer is full'],
    ['That request has already been answered', 'Already answered'],
    ['That post was taken down', 'Closed'],
    ['That event has ended', 'Closed'],
    // A block or a closed pair: one sentence on the server, one line here.
    ['This request can no longer be accepted', 'Closed'],
  ])('an accept refused with "%s" reads "%s"', (error, line) => {
    expect(acceptConflictLine({ errorCode: 'CONFLICT', error })).toBe(line)
  })

  it('knows the doors by the server’s sentence', () => {
    expect(BOARD_CLOSED_SENTENCE).toBe('The board closes when the doors open — the room is open instead')
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

describe('the board is off until its safety half ships', () => {
  it('is off unless a build asks for it', () => {
    // Step 6b (block/report by post, blocked authors filtered, no decline told,
    // spaces that go down) turns it on. Nothing here sets the variable.
    expect(process.env.EXPO_PUBLIC_BOARD_ENABLED).toBeUndefined()
    expect(BOARD_ENABLED).toBe(false)
  })

  it('reads one constant at every way in', () => {
    const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
    expect(src('components/screens/EventDetailScreen.tsx')).toContain(
      'event && BOARD_ENABLED && !boardClosed(event.start_time) ?'
    )
    expect(src('app/(tabs)/chat.tsx')).toMatch(/\{BOARD_ENABLED \? \(\s*<BoardRequestsSection/)
    expect(src('app/board/[eventId].tsx')).toContain('if (!BOARD_ENABLED) return <Redirect href="/(tabs)/events" />')
  })
})

describe('the event screen offers the board by the run’s doors, not the day’s', () => {
  /*
   * A three-day festival that opened yesterday: today's session starts
   * tonight, so the day's window says "not started" — but the server closed
   * the board at the first doors. Keyed on the day, the row opened onto
   * "The board's closed".
   */
  it('is closed on day two of a multi-day event whose day has not started', () => {
    const now = Date.parse('2026-10-02T12:00:00Z')
    const run = { start_time: '2026-10-01T18:00:00Z', session: { startTime: '2026-10-02T18:00:00Z' } }
    expect(boardClosed(run.session.startTime, now)).toBe(false)
    expect(boardClosed(run.start_time, now)).toBe(true)
  })
})

describe('a post’s length', () => {
  it('is the server’s, named once', () => {
    expect(BOARD_MAX_POST_LENGTH).toBe(500)
    const composer = readFileSync(join(__dirname, '..', 'components/board/BoardSections.tsx'), 'utf8')
    expect(composer).toContain('maxLength={BOARD_MAX_POST_LENGTH}')
    expect(composer).not.toMatch(/maxLength=\{\d/)
  })
})

describe('crash reports never pair a person with a board', () => {
  it('takes the ids out of board URLs and leaves others alone', () => {
    const e = '3f1c2a9e-1b2c-4d5e-8f90-123456789abc'
    const p = 'aa1c2a9e-1b2c-4d5e-8f90-123456789abc'
    expect(scrubBoardUrl(`https://staging-api.blendn.app/api/mobile/events/${e}/board`)).toBe(
      'https://staging-api.blendn.app/api/mobile/events/:id/board'
    )
    expect(scrubBoardUrl(`GET https://x/api/mobile/events/${e}/board/${p}/requests`)).toBe(
      'GET https://x/api/mobile/events/:id/board/:id/requests'
    )
    expect(scrubBoardUrl(`https://x/api/mobile/board/requests/${p}`)).toBe('https://x/api/mobile/board/requests/:id')
    expect(scrubBoardUrl(`https://x/api/mobile/events/${e}`)).toBe(`https://x/api/mobile/events/${e}`)
    expect(scrubBoardUrl(`https://x/dashboard/events/${e}`)).toBe(`https://x/dashboard/events/${e}`)
  })

  it('is wired into every place Sentry sends a URL', () => {
    const sentry = readFileSync(join(__dirname, '..', 'lib/sentry.ts'), 'utf8')
    for (const hook of ['beforeBreadcrumb', 'beforeSend', 'beforeSendTransaction']) expect(sentry).toContain(hook)
    expect(sentry.match(/scrubBoardUrl\(/g)?.length).toBeGreaterThanOrEqual(4)
  })
})

describe('the Banter counts board requests as something to show', () => {
  const chat = () => readFileSync(join(__dirname, '..', 'app/(tabs)/chat.tsx'), 'utf8')

  it('does not claim an empty inbox under them', () => {
    expect(chat()).toContain(
      'const hasHeaderContent = liveRooms.length > 0 || incomingRequests.length > 0 || boardRequestCount > 0'
    )
    expect(chat()).toContain('onCount={setBoardRequestCount}')
  })

  it('reads them again on pull-to-refresh and on live sync', () => {
    const src = chat()
    const refresh = src.slice(src.indexOf('const onRefresh = useCallback'), src.indexOf('// Real-time private message updates'))
    expect(refresh).toContain('setBoardRefreshKey((k) => k + 1)')
    const sync = src.slice(src.indexOf('const socketStatus = useLiveSync({'), src.indexOf('const respondToRequest'))
    expect(sync).toContain('setBoardRefreshKey((k) => k + 1)')
    expect(sync).toContain('return loadChats(false, true)')
  })
})
