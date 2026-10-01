/**
 * The Board screen against a mocked API (client plan Part 3b, test plan BD-*).
 *
 * The two empty states, the two card shapes in their order, each gate's reason
 * on the screen in the server's words, a 409 drawn as a state that never tells
 * a decline, and the guards that keep one tap one request.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'

const mockParams: Record<string, string> = {}
const mockRedirect = jest.fn()
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
  Redirect: (p: { href: string }) => {
    mockRedirect(p.href)
    return null
  },
}))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: (p: object) => React.createElement(View, p),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getBoard: jest.fn(),
    getBoardRequests: jest.fn(),
    getEvent: jest.fn(),
    postToBoard: jest.fn(),
    askOnBoard: jest.fn(),
    withdrawBoardPost: jest.fn(),
    reportBoardPost: jest.fn(),
    blockBoardPost: jest.fn(),
  },
}))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn() }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import { router } from 'expo-router'
import BoardRoute, { BoardScreen } from '../app/board/[eventId]'
import { apiClient } from '../lib/apiClient'
import { openBlendn } from '../lib/blendnOverlay'
import type { BoardPost, BoardRequest } from '../lib/board'
import { showSheet, type ActionSheet } from '../lib/sheet'

const api = apiClient as jest.Mocked<typeof apiClient>
const FUTURE = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString()

const OFFER: BoardPost = {
  id: 'p-offer',
  kind: 'offer',
  body: 'Driving from Indiranagar at 8',
  spacesLeft: 2,
  createdAt: '2026-10-01T09:00:00Z',
  author: 'Velvet Heron',
  mine: false,
  requestCount: 1,
}
const SEEKING: BoardPost = {
  id: 'p-seek',
  kind: 'seeking',
  body: 'Going alone, anyone from Koramangala?',
  spacesLeft: null,
  createdAt: '2026-10-01T10:00:00Z',
  author: 'Quiet Otter',
  mine: false,
  requestCount: 0,
}
const ask = (over: Partial<BoardRequest>): BoardRequest => ({
  id: 'r1',
  status: 'pending',
  message: null,
  createdAt: '2026-10-01T10:00:00Z',
  decidedAt: null,
  live: true,
  counterpart: 'Velvet Heron',
  event: { id: 'e1', title: 'Warehouse Night', startTime: FUTURE },
  post: { id: 'p-offer', kind: 'offer', body: OFFER.body },
  ...over,
})

const board = (posts: BoardPost[]) => ({ success: true, data: { posts } })
const asks = (outgoing: BoardRequest[]) => ({ success: true, data: { incoming: [], outgoing } })
const event = (startTime: string) =>
  ({ success: true, data: { id: 'e1', title: 'Warehouse Night', startTime } }) as never

/** What the RefreshControl calls when the list is pulled. */
const pullToRefresh = () =>
  act(async () => {
    await screen.getByTestId('board-list').props.refreshControl.props.onRefresh()
  })

beforeEach(() => {
  jest.clearAllMocks()
  // Reset, not clear: a test that fails early must not leave queued answers for the next.
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset())
  Object.keys(mockParams).forEach((k) => delete mockParams[k])
  mockParams.eventId = 'e1'
  api.getBoardRequests.mockResolvedValue(asks([]) as never)
  api.getEvent.mockResolvedValue(event(FUTURE))
})

describe('the route', () => {
  it('goes home while the board is switched off', async () => {
    await render(<BoardRoute />)
    expect(mockRedirect).toHaveBeenCalledWith('/(tabs)/events')
    expect(api.getBoard).not.toHaveBeenCalled()
  })
})

describe('the two empty states', () => {
  it('invites the first post when nobody has posted', async () => {
    api.getBoard.mockResolvedValue(board([]))
    await render(<BoardScreen />)

    expect(await screen.findByText("Nobody's posted yet")).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Write a post'))
    expect(screen.getByLabelText('Your post')).toBeTruthy()
    expect(screen.getByText('0/500')).toBeTruthy()
  })

  it('is closed once the server says the doors have opened, and offers the room', async () => {
    api.getEvent.mockResolvedValue(event(PAST))
    api.getBoard.mockResolvedValue(board([OFFER]))
    await render(<BoardScreen />)

    expect(await screen.findByText("The board's closed")).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Open the room'))
    expect(openBlendn).toHaveBeenCalled()
    expect(screen.queryByText(OFFER.body)).toBeNull()
  })

  it('takes the title from the server, not the link', async () => {
    mockParams.title = 'Spoofed title'
    api.getBoard.mockResolvedValue(board([]))
    await render(<BoardScreen />)
    expect(await screen.findByText('Warehouse Night')).toBeTruthy()
    expect(screen.queryByText('Spoofed title')).toBeNull()
  })
})

describe('two shapes, one order', () => {
  it('puts an offer, with its spaces, above a newer seeking', async () => {
    // The server sends newest first: the seeking arrives first.
    api.getBoard.mockResolvedValue(board([SEEKING, OFFER]))
    await render(<BoardScreen />)

    expect(await screen.findByText('2 spaces left')).toBeTruthy()
    const bodies = screen.getAllByText(/Driving from Indiranagar|Going alone/).map((n) => n.props.children)
    expect(bodies).toEqual([OFFER.body, SEEKING.body])
    // The kind in words too, so the counter is never the only difference.
    expect(screen.getByText('Offering')).toBeTruthy()
    expect(screen.getByText('Looking')).toBeTruthy()
  })

  it('offers nothing to ask on a chat post', async () => {
    api.getBoard.mockResolvedValue(board([{ ...SEEKING, id: 'p-chat', kind: 'chat', author: 'Lunar Fox' }]))
    await render(<BoardScreen />)
    expect(await screen.findByText('Saying')).toBeTruthy()
    expect(screen.queryByLabelText('Ask to join, Lunar Fox')).toBeNull()
  })

  it('says a full offer is full and offers no ask', async () => {
    api.getBoard.mockResolvedValue(board([{ ...OFFER, spacesLeft: 0 }]))
    await render(<BoardScreen />)
    expect(await screen.findByText('Full')).toBeTruthy()
    expect(screen.getByText('No spaces left')).toBeTruthy()
    expect(screen.queryByLabelText('Ask to join, Velvet Heron')).toBeNull()
  })
})

describe('BD-CU01 on screen: a refused post names its gate', () => {
  /* The server's sentences — see board.test.ts for where each comes from. */
  it.each([
    'Mark yourself as going to post here',
    'Add your name, age, two interests and why you go out — people are deciding whether to travel with you',
    'You have 5 asks waiting for an answer. Give them a moment.',
    'You have sent a lot of requests this week. Try again in a few days.',
    'The board closes when the doors open — the room is open instead',
    "This looks like a phone number. The board is anonymous, so contact details can't go on it.",
  ])('%s', async (reason) => {
    api.getBoard.mockResolvedValue(board([]))
    api.postToBoard.mockResolvedValue({ success: false, errorCode: reason.includes('phone') ? undefined : 'FORBIDDEN', error: reason })
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Write a post'))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'Two seats from Indiranagar')
    await fireEvent.press(screen.getByLabelText('Post to the board'))

    expect(await screen.findByText(reason)).toBeTruthy()
    expect(api.postToBoard).toHaveBeenCalledWith('e1', { kind: 'offer', body: 'Two seats from Indiranagar', spacesLeft: 1 })
    // Still composing, with the words kept, so the fix can be followed and retried.
    expect(screen.getByLabelText('Your post').props.value).toBe('Two seats from Indiranagar')
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(reason)
  })

  it('shows the doors refusal even when the event could not be read', async () => {
    api.getEvent.mockResolvedValue({ success: false, error: 'No internet connection.' } as never)
    api.getBoard.mockResolvedValue(board([]))
    const doors = 'The board closes when the doors open — the room is open instead'
    api.postToBoard.mockResolvedValue({ success: false, errorCode: 'FORBIDDEN', error: doors })
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Write a post'))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'Anyone?')
    await fireEvent.press(screen.getByLabelText('Post to the board'))
    expect(await screen.findByText(doors)).toBeTruthy()
  })
})

describe('posting', () => {
  it('puts a new post at the top, and keeps it through a read that does not list it yet', async () => {
    const mine = { ...SEEKING, id: 'p-new', body: 'Me too, from HSR', author: 'Lunar Fox', mine: true }
    api.getBoard
      .mockResolvedValueOnce(board([OFFER]))
      // A read shared with one in flight before the post: no new post in it.
      .mockResolvedValueOnce(board([OFFER]))
      .mockResolvedValue(board([mine, OFFER]))
    api.postToBoard.mockResolvedValue({
      success: true,
      data: { id: 'p-new', kind: 'seeking', body: 'Me too, from HSR', spacesLeft: null, createdAt: '2026-10-01T11:00:00Z' },
    })
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Write a post'))
    await fireEvent.press(screen.getByLabelText("I'm looking"))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'Me too, from HSR')
    await fireEvent.press(screen.getByLabelText('Post to the board'))

    await waitFor(() => expect(screen.getAllByText(/Me too, from HSR|Driving from/)[0].props.children).toBe('Me too, from HSR'))
    expect(api.postToBoard).toHaveBeenCalledWith('e1', { kind: 'seeking', body: 'Me too, from HSR' })

    // The next read lists it under the handle the server gave you.
    await pullToRefresh()
    expect(await screen.findByText('Lunar Fox')).toBeTruthy()
    expect(screen.getByText('Looking · yours')).toBeTruthy()
  })

  it('sends one post for two taps', async () => {
    api.getBoard.mockResolvedValue(board([]))
    let settle: (v: unknown) => void = () => {}
    api.postToBoard.mockReturnValue(new Promise((r) => (settle = r)) as never)
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Write a post'))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'Anyone?')
    const post = screen.getByLabelText('Post to the board')
    await fireEvent.press(post)
    await fireEvent.press(post)
    settle({ success: false, errorCode: 'FORBIDDEN', error: 'Mark yourself as going to post here' })

    await screen.findByText('Mark yourself as going to post here')
    expect(api.postToBoard).toHaveBeenCalledTimes(1)
  })
})

describe('asking', () => {
  it('flips the card to "Waiting on them" when the ask goes, and says so', async () => {
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.askOnBoard.mockResolvedValue({ success: true, data: { id: 'r1', status: 'pending' } })
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Ask to join, Velvet Heron'))
    expect(await screen.findByText('Waiting on them')).toBeTruthy()
    expect(screen.queryByLabelText('Ask to join, Velvet Heron')).toBeNull()
    expect(api.askOnBoard).toHaveBeenCalledWith('e1', 'p-offer')
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Waiting on them')
  })

  it.each(['You have already asked — give them a moment', 'They have already answered this one'])(
    'draws a 409 as waiting, whatever it says — "%s"',
    async (sentence) => {
      api.getBoard.mockResolvedValue(board([OFFER]))
      api.askOnBoard.mockResolvedValue({ success: false, errorCode: 'CONFLICT', error: sentence })
      await render(<BoardScreen />)

      await fireEvent.press(await screen.findByLabelText('Ask to join, Velvet Heron'))
      expect(await screen.findByText('Waiting on them')).toBeTruthy()
      // "They have already answered" is a decline told to the asker. Never shown.
      expect(screen.queryByText(sentence)).toBeNull()
      expect(screen.queryByLabelText('Ask to join, Velvet Heron')).toBeNull()
    }
  )

  it('says an offer that filled is full', async () => {
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.askOnBoard.mockResolvedValue({ success: false, errorCode: 'CONFLICT', error: 'That offer is full' })
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Ask to join, Velvet Heron'))
    expect(await screen.findByText('Full')).toBeTruthy()
    expect(screen.queryByText('That offer is full')).toBeNull()
  })

  it('says a post that went — taken down, or a block either way — is closed', async () => {
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.askOnBoard.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'That post is no longer on the board' })
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Ask to join, Velvet Heron'))
    expect(await screen.findByText('Closed')).toBeTruthy()
    expect(screen.queryByLabelText('Ask to join, Velvet Heron')).toBeNull()
  })

  it('names the gate on an ask, and leaves the button for after the fix', async () => {
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.askOnBoard.mockResolvedValue({
      success: false,
      errorCode: 'FORBIDDEN',
      error: 'You have 5 asks waiting for an answer. Give them a moment.',
    })
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Ask to join, Velvet Heron'))
    expect(await screen.findByText('You have 5 asks waiting for an answer. Give them a moment.')).toBeTruthy()
    expect(screen.getByLabelText('Ask to join, Velvet Heron')).toBeTruthy()
  })

  it('sends one ask for two taps', async () => {
    api.getBoard.mockResolvedValue(board([OFFER]))
    let settle: (v: unknown) => void = () => {}
    api.askOnBoard.mockReturnValue(new Promise((r) => (settle = r)) as never)
    await render(<BoardScreen />)

    const button = await screen.findByLabelText('Ask to join, Velvet Heron')
    await fireEvent.press(button)
    await fireEvent.press(button)
    settle({ success: true, data: { id: 'r1', status: 'pending' } })

    await screen.findByText('Waiting on them')
    expect(api.askOnBoard).toHaveBeenCalledTimes(1)
  })

  it('a request that throws leaves a retry, not a spinner', async () => {
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.askOnBoard.mockRejectedValue(new Error('queue cleared'))
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Ask to join, Velvet Heron'))
    expect(await screen.findByText("Couldn't send that. Try again.")).toBeTruthy()
    expect(screen.getByLabelText('Ask to join, Velvet Heron')).toBeTruthy()
  })
})

describe('a card remembers your ask, and never says how it was answered', () => {
  const at = async (outgoing: BoardRequest[]) => {
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.getBoardRequests.mockResolvedValue(asks(outgoing) as never)
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
  }

  it('pending: waiting', async () => {
    await at([ask({})])
    expect(screen.getByText('Waiting on them')).toBeTruthy()
    expect(screen.queryByLabelText('Ask to join, Velvet Heron')).toBeNull()
  })

  it('declined, as its asker is sent it (pending, live): waiting', async () => {
    await at([ask({ status: 'pending', live: true, decidedAt: null })])
    expect(screen.getByText('Waiting on them')).toBeTruthy()
    expect(screen.queryByText(/declin/i)).toBeNull()
    expect(screen.queryByLabelText(/declin/i)).toBeNull()
  })

  it('blocked either way, as its asker is sent it (a withdrawn post): closed', async () => {
    await at([ask({ live: false, post: { id: 'p-offer', kind: 'offer', body: null } })])
    expect(screen.getByText('Closed')).toBeTruthy()
  })

  it('accepted: they said yes', async () => {
    await at([ask({ status: 'accepted', live: false })])
    expect(screen.getByText(/They said yes/)).toBeTruthy()
  })

  it('lapsed: closed', async () => {
    await at([ask({ live: false })])
    expect(screen.getByText('Closed')).toBeTruthy()
  })

  it('withdrawn: yours, and not to be made again — one ask per post, ever', async () => {
    await at([ask({ status: 'withdrawn', live: false })])
    expect(screen.getByText('You withdrew this')).toBeTruthy()
    expect(screen.queryByLabelText('Ask to join, Velvet Heron')).toBeNull()
  })

  it('a live ask, listed first, beats an older withdrawn one on the same post', async () => {
    await at([ask({ id: 'r2' }), ask({ id: 'r1', status: 'withdrawn', live: false })])
    expect(screen.getByText('Waiting on them')).toBeTruthy()
  })

  it('an ask at another event is not this card’s', async () => {
    await at([ask({ event: { id: 'e2', title: 'Elsewhere', startTime: FUTURE } })])
    expect(screen.getByLabelText('Ask to join, Velvet Heron')).toBeTruthy()
  })
})

describe('a board you may not read says why', () => {
  it.each([
    ['FORBIDDEN', 'Mark yourself as going to post here', 'Not on this board yet'],
    ['AGE_RESTRICTED', 'This event is 21+.', 'This board has an age limit'],
    ['NOT_FOUND', 'Event not found', "This board isn't here"],
  ])('%s', async (errorCode, error, title) => {
    api.getBoard.mockResolvedValue({ success: false, errorCode, error })
    await render(<BoardScreen />)

    expect(await screen.findByText(title)).toBeTruthy()
    expect(screen.getByText(error)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Back to the event'))
    expect(router.back).toHaveBeenCalled()
  })

  it('is the closed board when the server says the doors have opened', async () => {
    api.getEvent.mockResolvedValue({ success: false, error: 'No internet connection.' } as never)
    api.getBoard.mockResolvedValue({
      success: false,
      errorCode: 'FORBIDDEN',
      error: 'The board closes when the doors open — the room is open instead',
    })
    await render(<BoardScreen />)
    expect(await screen.findByText("The board's closed")).toBeTruthy()
    expect(screen.getByLabelText('Open the room')).toBeTruthy()
  })

  it('says the board did not load, rather than that it is empty', async () => {
    api.getBoard.mockResolvedValue({ success: false, errorCode: 'SERVER_ERROR', error: 'Failed to load the board' })
    await render(<BoardScreen />)
    expect(await screen.findByText("The board didn't load")).toBeTruthy()
    expect(screen.queryByText("Nobody's posted yet")).toBeNull()
  })

  it('and when the request itself never came back', async () => {
    api.getBoard.mockResolvedValue({ success: false, error: 'No internet connection. Check your network and try again.' })
    await render(<BoardScreen />)
    expect(await screen.findByText("The board didn't load")).toBeTruthy()
  })
})

describe('a refresh', () => {
  it('that fails keeps the board and says so; the next that works clears it', async () => {
    api.getBoard
      .mockResolvedValueOnce(board([OFFER]))
      .mockResolvedValueOnce({ success: false, errorCode: 'SERVER_ERROR', error: 'x' })
      .mockResolvedValue(board([OFFER]))
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)

    await pullToRefresh()
    expect(await screen.findByText("The board didn't refresh. Pull down to try again.")).toBeTruthy()
    expect(screen.getByText(OFFER.body)).toBeTruthy()

    await pullToRefresh()
    await waitFor(() => expect(screen.queryByText("The board didn't refresh. Pull down to try again.")).toBeNull())
  })
})

describe('your own post', () => {
  const MINE: BoardPost = { ...OFFER, id: 'p-mine', author: 'Lunar Fox', mine: true, requestCount: 2 }
  const takeDownSheet = async () => {
    await fireEvent.press(await screen.findByLabelText('Take down your post'))
    const sheet = (showSheet as jest.Mock).mock.calls[0][0] as ActionSheet
    const action = sheet.actions.find((a) => a.label === 'Take down') as { run: () => Promise<{ ok: boolean }> }
    return action.run
  }

  it('counts the asks and points to where they are answered', async () => {
    api.getBoard.mockResolvedValue(board([MINE]))
    await render(<BoardScreen />)
    expect(await screen.findByText('2 asked — answer in the Banter')).toBeTruthy()
    expect(screen.queryByLabelText('Ask to join, Lunar Fox')).toBeNull()
  })

  it.each([
    ['taken down', { success: true, data: { id: 'p-mine', withdrawn: true } }],
    ['already gone', { success: false, errorCode: 'NOT_FOUND', error: 'Post not found' }],
  ])('leaves the board when %s', async (_, answer) => {
    api.getBoard.mockResolvedValue(board([MINE]))
    api.withdrawBoardPost.mockResolvedValue(answer as never)
    await render(<BoardScreen />)

    const run = await takeDownSheet()
    expect(await run()).toEqual({ ok: true, toast: 'Taken down' })
    expect(api.withdrawBoardPost).toHaveBeenCalledWith('e1', 'p-mine')
    await waitFor(() => expect(screen.queryByText(MINE.body)).toBeNull())
  })

  it('stays, and the sheet says why, when taking it down fails', async () => {
    api.getBoard.mockResolvedValue(board([MINE]))
    api.withdrawBoardPost.mockResolvedValue({ success: false, errorCode: 'SERVER_ERROR', error: 'Failed to withdraw' })
    await render(<BoardScreen />)

    const run = await takeDownSheet()
    expect(await run()).toEqual({ ok: false, error: "Couldn't take it down. Try again." })
    expect(screen.getByText(MINE.body)).toBeTruthy()
  })
})

describe('report and block, by the post', () => {
  type Steps = { label: string; next?: () => unknown; run?: (...a: string[]) => Promise<unknown> }[]
  const menu = async () => {
    await fireEvent.press(await screen.findByLabelText("More options for Velvet Heron's post"))
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as { title: string; actions: Steps }
    const step = (label: string) => sheet.actions.find((a) => a.label === label)!
    return { sheet, step }
  }

  it('is on anybody’s post but yours', async () => {
    api.getBoard.mockResolvedValue(board([OFFER, { ...SEEKING, id: 'p-mine', author: 'Lunar Fox', mine: true }]))
    await render(<BoardScreen />)
    expect(await screen.findByLabelText("More options for Velvet Heron's post")).toBeTruthy()
    expect(screen.queryByLabelText("More options for Lunar Fox's post")).toBeNull()
  })

  it('blocks by the post, after asking, and takes it off the board — even past a stale read', async () => {
    // A read already in flight still lists the post; it must not bring it back.
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.blockBoardPost.mockResolvedValue({ success: true, data: { blocked: true } })
    await render(<BoardScreen />)

    const { sheet, step } = await menu()
    expect(sheet.title).toBe('Velvet Heron')
    const confirm = step('Block').next!() as { title: string; actions: Steps }
    expect(confirm.title).toBe('Block Velvet Heron?')
    const run = confirm.actions.find((a) => a.label === 'Block')!.run!
    expect(await run()).toEqual({ ok: true, toast: 'Velvet Heron is blocked' })
    expect(api.blockBoardPost).toHaveBeenCalledWith('e1', 'p-offer')
    await waitFor(() => expect(screen.queryByText(OFFER.body)).toBeNull())
  })

  it('reports by the post, with a reason and a note', async () => {
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.reportBoardPost.mockResolvedValue({ success: true, data: { reported: true } })
    await render(<BoardScreen />)

    const { step } = await menu()
    const reasons = step('Report').next!() as { kind: string; reasons: { value: string }[]; run: (r: string, d?: string) => Promise<unknown> }
    expect(reasons.kind).toBe('reasons')
    expect(reasons.reasons.map((r) => r.value)).toEqual(['harassment', 'hate_speech', 'inappropriate_content', 'spam', 'other'])
    expect(await reasons.run('spam', 'selling tickets')).toEqual({ ok: true, toast: 'Report sent. Our team will review it.' })
    expect(api.reportBoardPost).toHaveBeenCalledWith('e1', 'p-offer', { reason: 'spam', description: 'selling tickets' })
  })

  it('says so when reports are rate-limited, rather than "try again" into the same wall', async () => {
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.reportBoardPost.mockResolvedValue({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many requests' })
    await render(<BoardScreen />)

    const { step } = await menu()
    const reasons = step('Report').next!() as { run: (r: string) => Promise<unknown> }
    expect(await reasons.run('harassment')).toEqual({ ok: false, error: "You've sent a lot of reports. Try again later." })
    expect(api.reportBoardPost).toHaveBeenCalledWith('e1', 'p-offer', { reason: 'harassment' })
  })
})

it('carries the placeholder banner in every state', async () => {
  api.getBoard.mockResolvedValue(board([OFFER]))
  await render(<BoardScreen />)
  expect(await screen.findByText(/PLACEHOLDER DESIGN/)).toBeTruthy()
})
