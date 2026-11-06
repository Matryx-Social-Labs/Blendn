/**
 * The Board screen against a mocked API (client plan Part 3b, test plan BD-*).
 *
 * The two empty states, the two card shapes in their order, each gate's reason
 * on the screen in the server's words, a 409 drawn as a state that never tells
 * a decline, and the guards that keep one tap one request.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { AccessibilityInfo, StyleSheet } from 'react-native'

const mockParams: Record<string, string> = {}
const mockRedirect = jest.fn()
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), canDismiss: jest.fn(() => true), dismissAll: jest.fn() },
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
    getBoardPost: jest.fn(),
    getBoardRequests: jest.fn(),
    getEvent: jest.fn(),
    postToBoard: jest.fn(),
    askOnBoard: jest.fn(),
    withdrawBoardPost: jest.fn(),
    rsvpToEvent: jest.fn(),
    reportBoardPost: jest.fn(),
    blockBoardPost: jest.fn(),
    getBoardAlerts: jest.fn(),
    setBoardAlerts: jest.fn(),
    // The next page of the board (lib/chatPaging) reads through the queue.
    queuedRequest: jest.fn(),
  },
}))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn() }))
jest.mock('../lib/lobbySeen', () => ({ lobbySeenAt: jest.fn(), rememberLobbySeen: jest.fn() }))
const mockPushListeners: ((n: { request: { content: { data: Record<string, unknown> } } }) => void)[] = []
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: (fn: (typeof mockPushListeners)[number]) => {
    mockPushListeners.push(fn)
    return { remove: () => mockPushListeners.splice(mockPushListeners.indexOf(fn), 1) }
  },
}))
const mockRemoved: Array<(d: { eventId: string; postId: string }) => void> = []
jest.mock('../lib/socketClient', () => ({
  ...jest.requireActual('../lib/socketClient'),
  subscribeToBoardPostRemoved: (cb: never) => {
    mockRemoved.push(cb)
    return () => {}
  },
}))
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
import { H } from '../lib/haptics'
import { noteBlocked } from '../lib/blockEpoch'

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
  it('opens the Lobby now that it is on', async () => {
    api.getBoard.mockResolvedValue(board([]))
    await render(<BoardRoute />)
    expect(await screen.findByText(/Nobody’s posted yet/)).toBeTruthy()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('goes home when a build switches it off', async () => {
    // Its own module registry, so only this render sees the board off.
    let Off: typeof BoardRoute = BoardRoute
    jest.isolateModules(() => {
      jest.doMock('../lib/board', () => ({ ...jest.requireActual('../lib/board'), BOARD_ENABLED: false }))
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Off = (require('../app/board/[eventId]') as typeof import('../app/board/[eventId]')).default
    })
    await render(<Off />)
    expect(mockRedirect).toHaveBeenCalledWith('/(tabs)/events')
    expect(api.getBoard).not.toHaveBeenCalled()
  })
})

describe('the two empty states', () => {
  it('invites the first post when nobody has posted', async () => {
    api.getBoard.mockResolvedValue(board([]))
    await render(<BoardScreen />)

    expect(await screen.findByText(/Nobody’s posted yet/)).toBeTruthy()
    await fireEvent.press(screen.getByTestId('lobby-start-seeking'))
    expect(screen.getByLabelText('Your post')).toBeTruthy()
    expect(screen.getByText('0 / 280', { includeHiddenElements: true })).toBeTruthy()
  })

  it('never closes on the phone’s clock: past the start, the Lobby is what the server says (read-only from doors)', async () => {
    api.getEvent.mockResolvedValue(event(PAST))
    api.getBoard.mockResolvedValue(board([OFFER]))
    await render(<BoardScreen />)
    expect(await screen.findByText(OFFER.body)).toBeTruthy()
    expect(screen.queryByText('The Lobby has closed')).toBeNull()
  })

  it('Open the room goes to the tabs first, then the room (Flow 4 Board #14)', async () => {
    api.getBoard.mockResolvedValue(lobby([OFFER], { state: 'read_only', phase: 'live' }) as never)
    await render(<BoardScreen />)
    await fireEvent.press(await screen.findByLabelText('Open the room'))
    // The overlay is under the root stack, so opened from here it was under the board.
    const { router } = jest.requireMock('expo-router') as { router: { dismissAll: jest.Mock } }
    expect(router.dismissAll).toHaveBeenCalled()
    expect(openBlendn).toHaveBeenCalledWith()
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

    expect(await screen.findByText('2 spots left')).toBeTruthy()
    const bodies = screen.getAllByText(/Driving from Indiranagar|Going alone/).map((n) => n.props.children)
    expect(bodies).toEqual([OFFER.body, SEEKING.body])
    // The kind in words too, so the counter is never the only difference.
    expect(screen.getByText('Offering spots')).toBeTruthy()
    expect(screen.getByText('Looking for someone to go with')).toBeTruthy()
  })

  it('offers nothing to ask on a chat post', async () => {
    api.getBoard.mockResolvedValue(board([{ ...SEEKING, id: 'p-chat', kind: 'chat', author: 'Lunar Fox' }]))
    await render(<BoardScreen />)
    expect(await screen.findByText('Just saying')).toBeTruthy()
    expect(screen.queryByLabelText('Ask to join, Lunar Fox')).toBeNull()
  })

  it('says a full offer is full and offers no ask', async () => {
    api.getBoard.mockResolvedValue(board([{ ...OFFER, spacesLeft: 0 }]))
    await render(<BoardScreen />)
    expect(await screen.findByText('Full')).toBeTruthy()
    expect(screen.getByText('No spots left')).toBeTruthy()
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
    'The Lobby closes when the doors open — the room is open instead',
    "This looks like a phone number. The Lobby is anonymous, so contact details can’t go on it.",
  ])('%s', async (reason) => {
    api.getBoard.mockResolvedValue(board([]))
    api.postToBoard.mockResolvedValue({ success: false, errorCode: reason.includes('phone') ? undefined : 'FORBIDDEN', error: reason })
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Post something'))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'Two seats from Indiranagar')
    await fireEvent.press(screen.getByLabelText('Post'))

    expect(await screen.findByText(reason)).toBeTruthy()
    expect(api.postToBoard).toHaveBeenCalledWith('e1', { kind: 'offer', subKind: 'ride', body: 'Two seats from Indiranagar', spacesLeft: 1 })
    // Still composing, with the words kept, so the fix can be followed and retried.
    expect(screen.getByLabelText('Your post').props.value).toBe('Two seats from Indiranagar')
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(reason)
  })

  it('shows the doors refusal even when the event could not be read', async () => {
    api.getEvent.mockResolvedValue({ success: false, error: 'No internet connection.' } as never)
    api.getBoard.mockResolvedValue(board([]))
    const doors = 'The Lobby closes when the doors open — the room is open instead'
    api.postToBoard.mockResolvedValue({ success: false, errorCode: 'FORBIDDEN', error: doors })
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Post something'))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'Anyone?')
    await fireEvent.press(screen.getByLabelText('Post'))
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

    await fireEvent.press(await screen.findByLabelText('Post something'))
    await fireEvent.press(within(screen.getByTestId('board-composer')).getByRole('radio', { name: 'Looking for' }))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'Me too, from HSR')
    await fireEvent.press(screen.getByLabelText('Post'))

    await waitFor(() => expect(screen.getAllByText(/Me too, from HSR|Driving from/)[0].props.children).toBe('Me too, from HSR'))
    expect(api.postToBoard).toHaveBeenCalledWith('e1', { kind: 'seeking', subKind: 'ride', body: 'Me too, from HSR' })

    // The next read lists it under the handle the server gave you.
    await pullToRefresh()
    expect(await screen.findByText('Lunar Fox')).toBeTruthy()
    expect(screen.getByText('You')).toBeTruthy()
  })

  it('opens the next post on an empty draft: text, kind and spaces all reset (PR #401 review)', async () => {
    api.getBoard.mockResolvedValue(board([]))
    api.postToBoard.mockResolvedValue({
      success: true,
      data: { id: 'p-new', kind: 'seeking', body: 'Me too, from HSR', spacesLeft: null, createdAt: '2026-10-01T11:00:00Z' },
    })
    api.withdrawBoardPost.mockResolvedValue({ success: true, data: { id: 'p-new', withdrawn: true } } as never)
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Post something'))
    await fireEvent.press(within(screen.getByTestId('board-composer')).getByRole('radio', { name: 'Looking for' }))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'Me too, from HSR')
    await fireEvent.press(screen.getByLabelText('Post'))
    await screen.findAllByText('You')

    // Take it down, so the board offers Write a post again.
    await fireEvent.press(screen.getByLabelText('Take down your post'))
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
    const run = (sheet.actions.find((a) => a.label === 'Take down') as { run: () => Promise<unknown> }).run
    await act(async () => {
      await run()
    })

    await fireEvent.press(await screen.findByLabelText('Post something'))
    expect(screen.getByLabelText('Your post').props.value).toBe('')
    expect(within(screen.getByTestId('board-composer')).getByRole('radio', { name: 'Offering' }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }))
    expect(screen.getByLabelText('How many can join you').props.accessibilityValue).toEqual(expect.objectContaining({ now: 1 }))
  })

  it('sends one post for two taps', async () => {
    api.getBoard.mockResolvedValue(board([]))
    let settle: (v: unknown) => void = () => {}
    api.postToBoard.mockReturnValue(new Promise((r) => (settle = r)) as never)
    await render(<BoardScreen />)

    await fireEvent.press(await screen.findByLabelText('Post something'))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'Anyone?')
    const post = screen.getByLabelText('Post')
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
    api.askOnBoard.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'That post is no longer in the Lobby' })
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
    expect(await screen.findByText("Couldn’t send that. Try again.")).toBeTruthy()
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

describe('a Lobby you may not read says why', () => {
  it.each([
    ['FORBIDDEN', 'Mark yourself as going to post here', 'Not in this Lobby yet'],
    ['AGE_RESTRICTED', 'This event is 21+.', 'This Lobby has an age limit'],
    ['NOT_FOUND', 'Event not found', "This Lobby isn’t here"],
  ])('%s', async (errorCode, error, title) => {
    api.getBoard.mockResolvedValue({ success: false, errorCode, error })
    await render(<BoardScreen />)

    expect(await screen.findByText(title)).toBeTruthy()
    expect(screen.getByText(error)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Back to the event'))
    expect(router.back).toHaveBeenCalled()
  })

  it('an older server that still closes at doors: the doors banner and the room', async () => {
    api.getEvent.mockResolvedValue({ success: false, error: 'No internet connection.' } as never)
    api.getBoard.mockResolvedValue({
      success: false,
      errorCode: 'FORBIDDEN',
      error: 'The Lobby closes when the doors open — the room is open instead',
    })
    await render(<BoardScreen />)
    expect(await screen.findByText('The doors are open')).toBeTruthy()
    expect(screen.getByLabelText('Open the room')).toBeTruthy()
  })

  it('says the Lobby did not load, rather than that it is empty', async () => {
    api.getBoard.mockResolvedValue({ success: false, errorCode: 'SERVER_ERROR', error: 'Failed to load the Lobby' })
    await render(<BoardScreen />)
    expect(await screen.findByText("The Lobby didn’t load")).toBeTruthy()
    expect(screen.queryByText("Nobody’s posted yet")).toBeNull()
  })

  it('and when the request itself never came back', async () => {
    api.getBoard.mockResolvedValue({ success: false, error: 'No internet connection. Check your network and try again.' })
    await render(<BoardScreen />)
    expect(await screen.findByText("The Lobby didn’t load")).toBeTruthy()
  })
})

describe('a refresh', () => {
  it('that fails keeps the Lobby and says so; the next that works clears it', async () => {
    api.getBoard
      .mockResolvedValueOnce(board([OFFER]))
      .mockResolvedValueOnce({ success: false, errorCode: 'SERVER_ERROR', error: 'x' })
      .mockResolvedValue(board([OFFER]))
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)

    await pullToRefresh()
    expect(await screen.findByText("The Lobby didn’t refresh. Pull down to try again.")).toBeTruthy()
    expect(screen.getByText(OFFER.body)).toBeTruthy()

    await pullToRefresh()
    await waitFor(() => expect(screen.queryByText("The Lobby didn’t refresh. Pull down to try again.")).toBeNull())
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
    expect(await screen.findByText('2 asks')).toBeTruthy()
    expect(screen.queryByLabelText('Ask to join, Lunar Fox')).toBeNull()
  })

  it.each([
    ['taken down', { success: true, data: { id: 'p-mine', withdrawn: true } }],
    ['already gone', { success: false, errorCode: 'NOT_FOUND', error: 'Post not found' }],
  ])('leaves the Lobby when %s', async (_, answer) => {
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
    expect(await run()).toEqual({ ok: false, error: "Couldn’t take it down. Try again." })
    expect(screen.getByText(MINE.body)).toBeTruthy()
  })
})

describe('report and block, by the post', () => {
  type Steps = { label: string; next?: () => unknown; run?: (...a: string[]) => Promise<unknown> }[]
  const menu = async () => {
    await fireEvent.press(await screen.findByLabelText("More options for Velvet Heron’s post"))
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as { title: string; actions: Steps }
    const step = (label: string) => sheet.actions.find((a) => a.label === label)!
    return { sheet, step }
  }

  it('is on anybody’s post but yours', async () => {
    api.getBoard.mockResolvedValue(board([OFFER, { ...SEEKING, id: 'p-mine', author: 'Lunar Fox', mine: true }]))
    await render(<BoardScreen />)
    expect(await screen.findByLabelText("More options for Velvet Heron’s post")).toBeTruthy()
    expect(screen.queryByLabelText("More options for Lunar Fox’s post")).toBeNull()
  })

  it('blocks by the post, after asking, and takes it off the Lobby — even past a stale read', async () => {
    // A read already in flight still lists the post; it must not bring it back.
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.blockBoardPost.mockImplementation(async () => {
      // The real client moves the epoch on a yes (lib/apiClient noteBlockedOn).
      noteBlocked()
      return { success: true, data: { blocked: true } }
    })
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
    expect(await reasons.run('harassment')).toEqual({ ok: false, error: "You’ve sent a lot of reports. Try again later." })
    expect(api.reportBoardPost).toHaveBeenCalledWith('e1', 'p-offer', { reason: 'harassment' })
  })
})

it('is C-A now: no placeholder banner, the type is a segment of three, and you post as your room name (SCRUM-1026)', async () => {
  api.getBoard.mockResolvedValue(lobby([OFFER], { you: { pseudonym: 'Quiet Lynx' } }) as never)
  await render(<BoardScreen />)
  await screen.findByText(OFFER.body)
  expect(screen.queryByText(/PLACEHOLDER DESIGN/)).toBeNull()
  await fireEvent.press(screen.getByLabelText('Post something'))
  const sheet = within(screen.getByTestId('board-composer'))
  expect(sheet.getAllByRole('radio').slice(0, 3).map((r) => r.props.accessibilityLabel)).toEqual(['Offering', 'Looking for', 'Just saying'])
  expect(sheet.getByText('Quiet Lynx')).toBeTruthy()
})

it('hides a ticket in the sheet where the Lobby says tickets are hidden', async () => {
  api.getBoard.mockResolvedValue(lobby([OFFER], { ticketsHidden: true }) as never)
  await render(<BoardScreen />)
  await fireEvent.press(await screen.findByLabelText('Post something'))
  expect(within(screen.getByTestId('board-composer')).queryByText('Spare ticket')).toBeNull()
})

describe('your post, live (PR #401 drive: "1 asked" only after reopening the Lobby)', () => {
  const MINE: BoardPost = { ...OFFER, id: 'p-mine', author: 'Lunar Fox', mine: true, requestCount: 0 }

  it('re-reads the Lobby the moment a board_request push lands, and says the new count', async () => {
    api.getBoard.mockResolvedValueOnce(board([MINE])).mockResolvedValue(board([{ ...MINE, requestCount: 1 }]))
    await render(<BoardScreen />)
    expect(await screen.findByText('No asks yet')).toBeTruthy()
    await act(async () => mockPushListeners.forEach((fn) => fn({ request: { content: { data: { type: 'board_request' } } } })))
    expect(await screen.findByText('1 ask')).toBeTruthy()
  })

  it('ignores any other push', async () => {
    api.getBoard.mockResolvedValue(board([MINE]))
    await render(<BoardScreen />)
    await screen.findByText('No asks yet')
    const reads = api.getBoard.mock.calls.length
    await act(async () => mockPushListeners.forEach((fn) => fn({ request: { content: { data: { type: 'private_message' } } } })))
    expect(api.getBoard.mock.calls.length).toBe(reads)
  })
})

describe('H.success on the server’s yes (H1)', () => {
  it('plays once as a post is recorded, and not when it is refused', async () => {
    const success = jest.spyOn(H, 'success').mockImplementation(() => {})
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.postToBoard.mockResolvedValueOnce({ success: false, errorCode: 'FORBIDDEN', error: 'Complete your profile first' } as never)
    await render(<BoardScreen />)
    await fireEvent.press(await screen.findByLabelText('Post something'))
    await fireEvent.press(within(screen.getByTestId('board-composer')).getByRole('radio', { name: 'Looking for' }))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'Anyone from HSR?')
    await fireEvent.press(screen.getByLabelText('Post'))
    await screen.findByText('Complete your profile first')
    expect(success).not.toHaveBeenCalled()

    api.postToBoard.mockResolvedValueOnce({ success: true, data: { id: 'p-new', kind: 'seeking', body: 'Anyone from HSR?', spacesLeft: null, createdAt: '2026-10-01T11:00:00Z' } } as never)
    await fireEvent.press(screen.getByLabelText('Post'))
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1))
  })

  it('plays once as an ask is recorded; a 409 that reads as waiting is not a new yes', async () => {
    const success = jest.spyOn(H, 'success').mockImplementation(() => {})
    api.getBoard.mockResolvedValue(board([OFFER, { ...SEEKING, id: 'p-two', author: 'Lunar Fox' }]))
    api.askOnBoard.mockResolvedValueOnce({ success: true, data: { id: 'r1', status: 'pending' } } as never)
    api.askOnBoard.mockResolvedValueOnce({ success: false, errorCode: 'CONFLICT', error: 'You have already asked — give them a moment' } as never)
    await render(<BoardScreen />)
    await fireEvent.press(await screen.findByLabelText('Ask to join, Velvet Heron'))
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1))
    await fireEvent.press(await screen.findByLabelText('Say hi, Lunar Fox'))
    await screen.findAllByText('Waiting on them')
    expect(success).toHaveBeenCalledTimes(1)
  })
})

describe('a post taken down (C8, SV9: the server’s top-level takenDown on the first page)', () => {
  const taken = { id: 'p-mine', kind: 'seeking', body: 'Selling a ticket, dm me', createdAt: '2026-10-01T09:00:00Z', takenDownAt: '2026-10-01T09:30:00Z' }
  const withTaken = (posts: BoardPost[], takenDown: object[]) => ({ success: true, data: { posts, takenDown } })

  beforeEach(() => {
    mockRemoved.length = 0
  })

  it('says so to its author, and why, in place of the post, with a way to write another', async () => {
    api.getBoard.mockResolvedValue(withTaken([OFFER], [taken]) as never)
    await render(<BoardScreen />)
    expect(await screen.findByText('Your post was taken down.')).toBeTruthy()
    expect(screen.getByText('It didn’t meet the community guidelines.')).toBeTruthy()
    // The card, never the words that were taken down; yours first.
    expect(screen.queryByText(taken.body)).toBeNull()
    expect(screen.getByText(OFFER.body)).toBeTruthy()
    expect(screen.queryByLabelText('Take down your post')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Write a new post'))
    expect(screen.getByLabelText('Your post')).toBeTruthy()
  })

  it('every one in the list gets its card', async () => {
    api.getBoard.mockResolvedValue(withTaken([], [taken, { ...taken, id: 'p-mine-2', takenDownAt: '2026-10-01T09:40:00Z' }]) as never)
    await render(<BoardScreen />)
    await screen.findAllByText('Your post was taken down.')
    expect(screen.getAllByTestId('board-taken-down')).toHaveLength(2)
  })

  it('a server that sends no list draws no card: your own live post is just your post', async () => {
    api.getBoard.mockResolvedValue(board([{ ...SEEKING, id: 'p-x', mine: true } as BoardPost]))
    await render(<BoardScreen />)
    expect(await screen.findByText(SEEKING.body)).toBeTruthy()
    expect(screen.queryByTestId('board-taken-down')).toBeNull()
  })

  it('a post you just wrote that was then taken down is the card, not a post that is still yours', async () => {
    const mine = { ...SEEKING, id: 'p-mine', body: taken.body, author: 'Lunar Fox', mine: true }
    api.getBoard.mockResolvedValueOnce(board([OFFER]))
    api.postToBoard.mockResolvedValue({ success: true, data: { id: 'p-mine', kind: 'seeking', body: taken.body, spacesLeft: null, createdAt: taken.createdAt } } as never)
    await render(<BoardScreen />)
    await fireEvent.press(await screen.findByLabelText('Post something'))
    await fireEvent.press(within(screen.getByTestId('board-composer')).getByRole('radio', { name: 'Looking for' }))
    await fireEvent.changeText(screen.getByLabelText('Your post'), taken.body)
    api.getBoard.mockResolvedValue(withTaken([OFFER], [taken]) as never)
    await fireEvent.press(screen.getByLabelText('Post'))
    expect(await screen.findByText('Your post was taken down.')).toBeTruthy()
    expect(screen.queryByText(mine.body)).toBeNull()
  })

  it('board:postRemoved for this event drops the post at once and re-reads, which brings the card; another event’s is ignored', async () => {
    const mine = { ...SEEKING, id: 'p-mine', body: taken.body, author: 'Lunar Fox', mine: true }
    api.getBoard.mockResolvedValue(board([mine, OFFER]))
    await render(<BoardScreen />)
    expect(await screen.findByText(taken.body)).toBeTruthy()
    const reads = api.getBoard.mock.calls.length

    await act(async () => mockRemoved.forEach((f) => f({ eventId: 'other', postId: 'p-mine' })))
    expect(api.getBoard.mock.calls.length).toBe(reads)

    api.getBoard.mockResolvedValue(withTaken([OFFER], [taken]) as never)
    await act(async () => mockRemoved.forEach((f) => f({ eventId: 'e1', postId: 'p-mine' })))
    expect(await screen.findByText('Your post was taken down.')).toBeTruthy()
    expect(api.getBoard.mock.calls.length).toBe(reads + 1)
    expect(screen.queryByText(taken.body)).toBeNull()
  })
})

describe('a Lobby of thousands: more posts as the end nears (SCRUM-760 c)', () => {
  const many = (from: number, n: number): BoardPost[] =>
    Array.from({ length: n }, (_, i) => ({ ...SEEKING, id: `p-${from + i}`, body: `Post number ${from + i}`, author: `Fox ${from + i}`, createdAt: `2026-10-01T${String(10 - (i % 9)).padStart(2, '0')}:00:00Z` }))
  const page = (posts: BoardPost[], nextCursor: string | null) => ({ success: true, data: { posts, pagination: { hasMore: !!nextCursor, nextCursor } } })
  const reachEnd = () => act(async () => fireEvent(screen.getByTestId('board-list'), 'endReached'))

  it('asks for the next page by the server’s cursor, appends it once, and stops when it says there is no more', async () => {
    api.getBoard.mockResolvedValue(page(many(0, 3), 'c1') as never)
    ;(apiClient.queuedRequest as jest.Mock).mockResolvedValueOnce(page(many(3, 3), null))
    await render(<BoardScreen />)
    await screen.findByText('Post number 0')
    await reachEnd()
    expect(apiClient.queuedRequest).toHaveBeenCalledWith('/api/mobile/events/e1/board?cursor=c1')
    expect(await screen.findByText('Post number 5')).toBeTruthy()
    await reachEnd()
    expect(apiClient.queuedRequest).toHaveBeenCalledTimes(1)
  })

  it('an older server with no cursor is one page, and nothing more is asked', async () => {
    api.getBoard.mockResolvedValue(board(many(0, 3)))
    await render(<BoardScreen />)
    await screen.findByText('Post number 0')
    await reachEnd()
    expect(apiClient.queuedRequest).not.toHaveBeenCalled()
  })

  it('a page that fails keeps the Lobby, does not loop, and retries on its own button', async () => {
    api.getBoard.mockResolvedValue(page(many(0, 3), 'c1') as never)
    ;(apiClient.queuedRequest as jest.Mock).mockResolvedValueOnce({ success: false, error: 'offline' })
    await render(<BoardScreen />)
    await screen.findByText('Post number 0')
    await reachEnd()
    expect(await screen.findByTestId('board-more-failed')).toBeTruthy()
    expect(screen.getByText('Post number 0')).toBeTruthy()
    await reachEnd()
    expect(apiClient.queuedRequest).toHaveBeenCalledTimes(1)
    ;(apiClient.queuedRequest as jest.Mock).mockResolvedValueOnce(page(many(3, 2), null))
    await fireEvent.press(screen.getByTestId('board-more-failed'))
    expect(await screen.findByText('Post number 4')).toBeTruthy()
  })

  it('a refresh re-reads the newest page and keeps the older pages already loaded, under their own cursor', async () => {
    api.getBoard.mockResolvedValue(page(many(0, 3), 'c1') as never)
    ;(apiClient.queuedRequest as jest.Mock).mockResolvedValueOnce(page(many(3, 3), 'c2'))
    await render(<BoardScreen />)
    await screen.findByText('Post number 0')
    await reachEnd()
    await screen.findByText('Post number 5')
    await pullToRefresh()
    expect(screen.getByText('Post number 5')).toBeTruthy()
    ;(apiClient.queuedRequest as jest.Mock).mockResolvedValueOnce(page(many(6, 1), null))
    await reachEnd()
    // The cursor is where the older pages left off, not the newest page's.
    expect(apiClient.queuedRequest).toHaveBeenLastCalledWith('/api/mobile/events/e1/board?cursor=c2')
  })
})

describe('a block removes a person from every page already loaded (safety)', () => {
  type Steps = { label: string; next?: () => unknown; run?: () => Promise<unknown> }[]
  const page = (posts: BoardPost[], nextCursor: string | null) => ({ success: true, data: { posts, pagination: { hasMore: !!nextCursor, nextCursor } } })
  const otter = { ...SEEKING, id: 'p-old-otter' }
  const olderHeron = { ...OFFER, id: 'p-old-heron', body: 'Another ride from Velvet Heron' }

  it('drops their posts from the older pages too, forgets those pages, and starts again from the fresh first page’s cursor', async () => {
    api.getBoard.mockResolvedValueOnce(page([OFFER], 'c1') as never)
    ;(apiClient.queuedRequest as jest.Mock).mockResolvedValueOnce(page([olderHeron, otter], 'c2'))
    api.blockBoardPost.mockImplementation(async () => {
      // The real client moves the epoch on a yes (lib/apiClient noteBlockedOn).
      noteBlocked()
      return { success: true, data: { blocked: true } }
    })
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    await act(async () => fireEvent(screen.getByTestId('board-list'), 'endReached'))
    await screen.findByText(olderHeron.body)

    // The server now filters them: the fresh first page has somebody else and a new cursor.
    api.getBoard.mockResolvedValue(page([{ ...SEEKING, id: 'p-new-otter', body: 'Fresh from Quiet Otter' }], 'c9') as never)
    await fireEvent.press(screen.getAllByLabelText("More options for Velvet Heron’s post")[0])
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as { actions: Steps }
    const confirm = sheet.actions.find((a) => a.label === 'Block')!.next!() as { actions: Steps }
    await act(async () => void (await confirm.actions.find((a) => a.label === 'Block')!.run!()))

    await waitFor(() => expect(screen.queryByText(OFFER.body)).toBeNull())
    expect(screen.queryByText(olderHeron.body)).toBeNull()
    expect(await screen.findByText('Fresh from Quiet Otter')).toBeTruthy()
    // The old pages are forgotten: the next page is the fresh first page's, not the one the old pages left off at.
    ;(apiClient.queuedRequest as jest.Mock).mockResolvedValueOnce(page([], null))
    await act(async () => fireEvent(screen.getByTestId('board-list'), 'endReached'))
    expect(apiClient.queuedRequest).toHaveBeenLastCalledWith('/api/mobile/events/e1/board?cursor=c9')
  })

  it('a page that was on its way when they were blocked is not drawn', async () => {
    let finish: (v: unknown) => void = () => {}
    api.getBoard.mockResolvedValueOnce(page([OFFER], 'c1') as never)
    ;(apiClient.queuedRequest as jest.Mock).mockReturnValueOnce(new Promise((r) => (finish = r)))
    api.blockBoardPost.mockImplementation(async () => {
      // The real client moves the epoch on a yes (lib/apiClient noteBlockedOn).
      noteBlocked()
      return { success: true, data: { blocked: true } }
    })
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    await act(async () => fireEvent(screen.getByTestId('board-list'), 'endReached'))

    api.getBoard.mockResolvedValue(page([otter], null) as never)
    await fireEvent.press(screen.getByLabelText("More options for Velvet Heron’s post"))
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as { actions: Steps }
    const confirm = sheet.actions.find((a) => a.label === 'Block')!.next!() as { actions: Steps }
    await act(async () => void (await confirm.actions.find((a) => a.label === 'Block')!.run!()))
    await act(async () => finish(page([olderHeron], null)))
    expect(screen.queryByText(olderHeron.body)).toBeNull()
  })
})

describe('a jump from one board to another (RC drive 2 D-E)', () => {
  it('opens the next board on an empty composer: a draft never posts to another event', async () => {
    api.getBoard.mockResolvedValue(board([]))
    const view = await render(<BoardRoute />)
    await fireEvent.press(await screen.findByLabelText('Post something'))
    await fireEvent.changeText(screen.getByLabelText('Your post'), 'For e1 only')
    // A link to another event's board, on the same screen instance.
    mockParams.eventId = 'e2'
    await view.rerender(<BoardRoute />)
    await screen.findByText(/Nobody’s posted yet/)
    expect(screen.queryByDisplayValue('For e1 only')).toBeNull()
  })
})

describe('a busy board (TG-15, 120 posts)', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => (i % 3 === 0 ? { ...OFFER, id: `o${i}`, author: `Offer ${i}` } : { ...SEEKING, id: `s${i}`, author: `Seek ${i}` }))
  const page = (posts: BoardPost[], totalCount: number) => ({ success: true, data: { posts, pagination: { hasMore: true, nextCursor: 'c1', totalCount } } })

  it('counts on the chips are the server’s, compact, and whole to a screen reader; a chip’s next page keeps its filter', async () => {
    const counts = { all: 12_480, offer: 4_160, seeking: 8_000, chat: 320, offerRides: 900, mine: 1, replies: 0 }
    api.getBoard.mockResolvedValue({ ...page(many(30), 12_480), data: { ...page(many(30), 12_480).data, counts } } as never)
    await render(<BoardScreen />)
    expect(await screen.findByLabelText('All, 12480 posts')).toBeTruthy()
    expect(within(screen.getByTestId('lobby-chip-all')).getByText('12k')).toBeTruthy()

    api.getBoard.mockResolvedValue({ success: true, data: { posts: many(30).filter((p) => p.kind === 'offer'), counts, pagination: { hasMore: true, nextCursor: 'c9' } } } as never)
    await fireEvent.press(screen.getByTestId('lobby-chip-offer'))
    await waitFor(() => expect(api.getBoard).toHaveBeenLastCalledWith('e1', { kind: 'offer' }))
    api.queuedRequest.mockResolvedValue({ success: true, data: { posts: [], pagination: { hasMore: false } } } as never)
    await act(async () => screen.getByTestId('board-list').props.onEndReached())
    expect(api.queuedRequest).toHaveBeenCalledWith('/api/mobile/events/e1/board?cursor=c9&kind=offer')
  })

  it('an older server that sends no counts: no chips to learn', async () => {
    api.getBoard.mockResolvedValue(page([OFFER, SEEKING], 2) as never)
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    expect(screen.queryByTestId('lobby-chips')).toBeNull()
  })
})

/* ---------- L-A (SCRUM-1026): the Lobby to the board, mockups/redesign-2026-11/lobby/ ---------- */

const COUNTS = { all: 18, offer: 5, seeking: 9, chat: 4, offerRides: 3, mine: 1, replies: 2 }
const PINNED = { id: 'h1', body: 'Music starts at 6. Entry is from the side lane.', host: 'Nightshift Collective', createdAt: '2026-10-01T06:00:00Z', updatedAt: '2026-10-01T06:00:00Z' }
const CLOSES = '2026-11-09T18:30:00Z'
const lobby = (posts: BoardPost[], meta: Record<string, unknown> = {}) => ({
  success: true,
  data: { state: 'open', phase: 'before', doorsAt: FUTURE, closesAt: CLOSES, ticketsHidden: false, counts: COUNTS, compose: { allowed: true, message: null, reasonCode: null }, posts, ...meta },
})

describe('L-A: the pinned host post', () => {
  it('leads All with the host’s words, labelled Host and never a person; a filter leaves it out', async () => {
    api.getBoard.mockResolvedValue(lobby([OFFER], { pinned: PINNED }) as never)
    await render(<BoardScreen />)
    expect(await screen.findByText(PINNED.body)).toBeTruthy()
    expect(screen.getByText('Nightshift Collective')).toBeTruthy()
    expect(screen.getByText('Host')).toBeTruthy()
    expect(screen.getByLabelText('Pinned')).toBeTruthy()

    api.getBoard.mockResolvedValue(lobby([OFFER], { pinned: PINNED }) as never)
    await fireEvent.press(screen.getByTestId('lobby-chip-offer'))
    await waitFor(() => expect(screen.queryByText(PINNED.body)).toBeNull())
  })
})

describe('L-A: filters run on the server, with their counts', () => {
  it('asks the server for a kind, for Mine and for Replies to me, and back to everything on All', async () => {
    api.getBoard.mockResolvedValue(lobby([OFFER, SEEKING]) as never)
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    expect(screen.getByLabelText('Looking for, 9 posts')).toBeTruthy()

    await fireEvent.press(screen.getByTestId('lobby-chip-seeking'))
    await waitFor(() => expect(api.getBoard).toHaveBeenLastCalledWith('e1', { kind: 'seeking' }))
    await fireEvent.press(screen.getByTestId('lobby-chip-mine'))
    await waitFor(() => expect(api.getBoard).toHaveBeenLastCalledWith('e1', { filter: 'mine' }))
    await fireEvent.press(screen.getByTestId('lobby-chip-replies'))
    await waitFor(() => expect(api.getBoard).toHaveBeenLastCalledWith('e1', { filter: 'replies' }))
    await fireEvent.press(screen.getByTestId('lobby-chip-all'))
    await waitFor(() => expect(api.getBoard).toHaveBeenLastCalledWith('e1', {}))
  })

  it('a filter that found nothing says so and offers every post (control: All with posts never says it)', async () => {
    api.getBoard.mockResolvedValue(lobby([OFFER]) as never)
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    expect(screen.queryByTestId('board-filter-empty')).toBeNull()
    api.getBoard.mockResolvedValue(lobby([]) as never)
    await fireEvent.press(screen.getByTestId('lobby-chip-mine'))
    expect(await screen.findByTestId('board-filter-empty')).toBeTruthy()
  })
})

describe('L-A: one action per post', () => {
  it('Ask to join on an offer, Say hi on a search, nothing on Just saying', async () => {
    const CHAT: BoardPost = { ...SEEKING, id: 'p-chat', kind: 'chat', body: 'See you all there' }
    api.getBoard.mockResolvedValue(lobby([OFFER, SEEKING, CHAT]) as never)
    await render(<BoardScreen />)
    expect(await screen.findByLabelText('Ask to join, Velvet Heron')).toBeTruthy()
    expect(screen.getByLabelText('Say hi, Quiet Otter')).toBeTruthy()
    expect(screen.getByText('Offering spots')).toBeTruthy()
    expect(screen.getByText('Looking for someone to go with')).toBeTruthy()
    // The chip and the post's pill.
    expect(screen.getAllByText('Just saying')).toHaveLength(2)
    expect(screen.getAllByRole('button').filter((b) => /^(Ask to join|Say hi)/.test(b.props.accessibilityLabel ?? ''))).toHaveLength(2)
  })

  it('your post: its asks counted, and See asks goes where they are answered', async () => {
    const MINE: BoardPost = { ...OFFER, id: 'p-mine', author: 'Quiet Lynx', mine: true, requestCount: 3 }
    api.getBoard.mockResolvedValue(lobby([MINE]) as never)
    await render(<BoardScreen />)
    expect(await screen.findByText('3 asks')).toBeTruthy()
    expect(screen.getByText('You')).toBeTruthy()
    await fireEvent.press(screen.getByText('See asks'))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/chat')
  })
})

describe('L-A: a photo', () => {
  const url = 'https://fly.storage.tigris.dev/blendn-chat/p.jpg'
  it('your pending photo is yours alone, blurred, and says it is being checked', async () => {
    const MINE = { ...OFFER, id: 'p-mine', mine: true, photo: { status: 'pending', url, alt: null } } as BoardPost
    api.getBoard.mockResolvedValue(lobby([MINE]) as never)
    await render(<BoardScreen />)
    expect(await screen.findByText('Checking your photo')).toBeTruthy()
    expect(screen.getByText('Only you can see the photo until it’s checked.')).toBeTruthy()
  })

  it('an approved one carries its alt text (control: an http URL draws nothing)', async () => {
    const P = { ...OFFER, photo: { status: 'approved', url, alt: 'Our booth by the DJ' } } as BoardPost
    const Q = { ...SEEKING, photo: { status: 'approved', url: 'http://x.example/q.jpg', alt: 'Not ours' } } as BoardPost
    api.getBoard.mockResolvedValue(lobby([P, Q]) as never)
    await render(<BoardScreen />)
    expect(await screen.findByLabelText('Our booth by the DJ')).toBeTruthy()
    expect(screen.queryByLabelText('Not ours')).toBeNull()
  })
})

describe('L-A: the composer’s slot', () => {
  it('Post something opens the sheet', async () => {
    api.getBoard.mockResolvedValue(lobby([OFFER]) as never)
    await render(<BoardScreen />)
    await fireEvent.press(await screen.findByTestId('lobby-composer'))
    expect(screen.getByTestId('board-composer')).toBeTruthy()
  })

  it('not going: the gate, and I’m going says so to the server and re-reads', async () => {
    api.getBoard.mockResolvedValue(lobby([OFFER], { compose: { allowed: false, message: 'Say you’re going first.', reasonCode: 'BOARD_NOT_GOING' } }) as never)
    api.rsvpToEvent.mockResolvedValue({ success: true, data: { rsvpStatus: 'going', rsvpCount: 1 } } as never)
    await render(<BoardScreen />)
    expect(await screen.findByText('Say you’re going to post')).toBeTruthy()
    expect(screen.queryByTestId('lobby-composer')).toBeNull()
    const reads = api.getBoard.mock.calls.length
    await fireEvent.press(screen.getByText('I’m going'))
    expect(api.rsvpToEvent).toHaveBeenCalledWith('e1', 'going')
    await waitFor(() => expect(api.getBoard.mock.calls.length).toBeGreaterThan(reads))
  })

  it('not going, and the server says no: its sentence, and the gate stays', async () => {
    api.getBoard.mockResolvedValue(lobby([OFFER], { compose: { allowed: false, message: 'x', reasonCode: 'BOARD_NOT_GOING' } }) as never)
    api.rsvpToEvent.mockResolvedValue({ success: false, error: 'This event is full' } as never)
    await render(<BoardScreen />)
    await fireEvent.press(await screen.findByText('I’m going'))
    expect(await screen.findByText('This event is full')).toBeTruthy()
  })

  it('profile unfinished: Finish goes to the profile', async () => {
    api.getBoard.mockResolvedValue(lobby([OFFER], { compose: { allowed: false, message: 'x', reasonCode: 'BOARD_PROFILE_INCOMPLETE' } }) as never)
    await render(<BoardScreen />)
    await fireEvent.press(await screen.findByText('Finish'))
    expect(router.push).toHaveBeenCalledWith('/edit-profile')
  })

  it('nobody posted yet: the two starts open the sheet', async () => {
    api.getBoard.mockResolvedValue(lobby([], { counts: { ...COUNTS, all: 0, offer: 0, seeking: 0, chat: 0, mine: 0, replies: 0 } }) as never)
    await render(<BoardScreen />)
    await fireEvent.press(await screen.findByText('I have spots'))
    expect(screen.getByTestId('board-composer')).toBeTruthy()
    expect(screen.getByText(/Nobody’s posted yet/)).toBeTruthy()
  })
})

describe('L-A: after doors, and after the end', () => {
  it('read-only: until when, the room, the chips, and no action on any post', async () => {
    api.getEvent.mockResolvedValue({ success: true, data: { id: 'e1', title: 'Warehouse Night', startTime: PAST, timezone: 'Asia/Kolkata' } } as never)
    api.getBoard.mockResolvedValue(lobby([OFFER, SEEKING], { state: 'read_only', phase: 'live' }) as never)
    await render(<BoardScreen />)
    expect(await screen.findByText('The doors are open')).toBeTruthy()
    expect(screen.getByText('The Lobby is read-only now. You can read it until Tue 10 Nov, 12 AM.')).toBeTruthy()
    expect(screen.getByText(OFFER.body)).toBeTruthy()
    expect(screen.queryByLabelText('Ask to join, Velvet Heron')).toBeNull()
    expect(screen.queryByLabelText('Say hi, Quiet Otter')).toBeNull()
    expect(screen.queryByTestId('lobby-composer')).toBeNull()
    await fireEvent.press(screen.getByText('Open the room'))
    expect(openBlendn).toHaveBeenCalled()
  })

  it('live and empty (4b): nobody posted, the room is open — under the host’s note when there is one', async () => {
    api.getBoard.mockResolvedValue(lobby([], { state: 'read_only', phase: 'live', pinned: PINNED, counts: { ...COUNTS, all: 0, offer: 0, seeking: 0, chat: 0, mine: 0, replies: 0 } }) as never)
    await render(<BoardScreen />)
    expect(await screen.findByText('Nobody posted in the Lobby.')).toBeTruthy()
    expect(screen.getByText('The room is open.')).toBeTruthy()
    expect(screen.getByText(PINNED.body)).toBeTruthy()
    expect(screen.queryByText('The doors are open')).toBeNull()
  })

  it('closed a day after the end: says so, and offers nothing', async () => {
    api.getBoard.mockResolvedValue({ success: false, errorCode: 'FORBIDDEN', reasonCode: 'LOBBY_CLOSED', error: 'The Lobby has closed. The Lobby and the room close a day after the event ends.' } as never)
    await render(<BoardScreen />)
    expect(await screen.findByText('The Lobby has closed')).toBeTruthy()
    expect(screen.getByText('The Lobby and the room close a day after the event ends. Your friends, chats and crews are where they were.')).toBeTruthy()
    expect(screen.queryByText('Open the room')).toBeNull()
  })
})

describe('L-A: new posts wait behind the pill (the list never jumps)', () => {
  it('at the top of the list nothing can jump, so a background read shows what is new at once, with no pill', async () => {
    const NEW: BoardPost = { ...SEEKING, id: 'p-new', body: 'Just landed, anyone near MG Road?', author: 'Night Owl' }
    api.getBoard.mockResolvedValue(lobby([OFFER]) as never)
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    api.getBoard.mockResolvedValue(lobby([NEW, OFFER]) as never)
    await act(async () => mockPushListeners.forEach((fn) => fn({ request: { content: { data: { type: 'board_request' } } } })))
    expect(await screen.findByText(NEW.body)).toBeTruthy()
    expect(screen.queryByText('1 new post')).toBeNull()
  })

  it('a background read holds what is new; the pill brings it in (control: a refresh shows it at once)', async () => {
    const NEW: BoardPost = { ...SEEKING, id: 'p-new', body: 'Just landed, anyone near MG Road?', author: 'Night Owl', createdAt: '2026-10-02T10:00:00Z' }
    api.getBoard.mockResolvedValue(lobby([OFFER]) as never)
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)

    // Scrolled into the list: what arrives above it waits behind the pill.
    await fireEvent.scroll(screen.getByTestId('board-list'), { nativeEvent: { contentOffset: { x: 0, y: 400 }, contentSize: { width: 402, height: 2000 }, layoutMeasurement: { width: 402, height: 874 } } })
    api.getBoard.mockResolvedValue(lobby([NEW, OFFER]) as never)
    await act(async () => mockPushListeners.forEach((fn) => fn({ request: { content: { data: { type: 'board_request' } } } })))
    expect(await screen.findByText('1 new post')).toBeTruthy()
    expect(screen.queryByText(NEW.body)).toBeNull()
    await fireEvent.press(screen.getByText('1 new post'))
    expect(await screen.findByText(NEW.body)).toBeTruthy()
    expect(screen.queryByText('1 new post')).toBeNull()

    const NEWER: BoardPost = { ...NEW, id: 'p-newer', body: 'Two seats from Whitefield' }
    api.getBoard.mockResolvedValue(lobby([NEWER, NEW, OFFER]) as never)
    await pullToRefresh()
    expect(await screen.findByText(NEWER.body)).toBeTruthy()
  })
})

describe('L-A: the starts never offer a ticket the event hides', () => {
  const none = { ...COUNTS, all: 0, offer: 0, seeking: 0, chat: 0, mine: 0, replies: 0 }
  it.each([
    [true, 'I have spots. A ride or a table.'],
    [false, 'I have spots. A ride, a table or a spare ticket.'],
  ])('ticketsHidden %s', async (ticketsHidden, label) => {
    api.getBoard.mockResolvedValue(lobby([], { counts: none, ticketsHidden }) as never)
    await render(<BoardScreen />)
    expect(await screen.findByLabelText(label)).toBeTruthy()
  })
})

describe('L-A: the list starts under the bar as tall as it draws (AX XXXL: the bar grows past its fixed height)', () => {
  it('a bar measured taller than the fixed top pushes the list down; a short one changes nothing (control)', async () => {
    api.getBoard.mockResolvedValue(lobby([OFFER]) as never)
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    const top = () => StyleSheet.flatten(screen.getByTestId('board-list').props.contentContainerStyle).paddingTop as number
    const fixed = top()
    await fireEvent(screen.getByTestId('lobby-bar'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 20 } } })
    expect(top()).toBe(fixed)
    await fireEvent(screen.getByTestId('lobby-bar'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 400 } } })
    expect(top()).toBe(400 + 8)
  })
})

describe('Lobby PR 5: the bell, what you have seen, and Post something from the event page', () => {
  const { rememberLobbySeen } = jest.requireMock('../lib/lobbySeen') as { rememberLobbySeen: jest.Mock }
  const newer = { ...SEEKING, id: 'p-new', createdAt: '2026-11-08T10:00:00Z' }
  const older = { ...OFFER, createdAt: '2026-11-08T09:00:00Z' }

  it('remembers the newest post it showed on All, for Going’s badge (control: a filter remembers nothing)', async () => {
    api.getBoard.mockResolvedValue(board([newer, older]))
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    expect(rememberLobbySeen).toHaveBeenCalledWith('e1', '2026-11-08T10:00:00Z')
    rememberLobbySeen.mockClear()
    api.getBoard.mockResolvedValue({ success: true, data: { posts: [older], counts: { all: 2, offer: 1, seeking: 1, chat: 0, offerRides: 1, mine: 0, replies: 0 } } } as never)
    await pullToRefresh()
    rememberLobbySeen.mockClear()
    await act(async () => fireEvent.press(screen.getByTestId('lobby-chip-offer')))
    expect(rememberLobbySeen).not.toHaveBeenCalled()
  })

  it('does not mark as seen what a background read holds behind the pill (control: the shown read did)', async () => {
    api.getBoard.mockResolvedValue(board([older]))
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    expect(rememberLobbySeen).toHaveBeenCalledWith('e1', '2026-11-08T09:00:00Z')
    rememberLobbySeen.mockClear()
    api.getBoard.mockResolvedValue(board([newer, older]))
    await act(async () => mockPushListeners.forEach((fn) => fn({ request: { content: { data: { type: 'board_request' } } } })))
    expect(api.getBoard).toHaveBeenCalledTimes(2)
    expect(rememberLobbySeen).not.toHaveBeenCalled()
  })

  it('rings the bell into the two alert switches', async () => {
    api.getBoard.mockResolvedValue(board([older]))
    api.getBoardAlerts.mockResolvedValue({ success: true, data: { offersMatch: false, hostPosts: true } } as never)
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Lobby alerts' })))
    expect(api.getBoardAlerts).toHaveBeenCalledWith('e1')
    expect(await screen.findByRole('switch', { name: /^The host posts/ })).toBeTruthy()
  })

  it('opens the composer when the event page asked for it and posting is open (control: not without the ask)', async () => {
    mockParams.compose = '1'
    api.getBoard.mockResolvedValue(board([older]))
    await render(<BoardScreen />)
    expect(await screen.findByLabelText('Your post')).toBeTruthy()
  })

  it('keeps the gate, not the composer, when the event page asked but you cannot post yet', async () => {
    mockParams.compose = '1'
    api.getBoard.mockResolvedValue({ success: true, data: { posts: [older], compose: { allowed: false, message: 'Mark yourself as going', reasonCode: 'BOARD_NOT_GOING' } } } as never)
    await render(<BoardScreen />)
    expect(await screen.findByTestId('lobby-gate-going')).toBeTruthy()
    expect(screen.queryByLabelText('Your post')).toBeNull()
  })

  it('does not open the composer by itself (control)', async () => {
    api.getBoard.mockResolvedValue(board([older]))
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    expect(screen.queryByLabelText('Your post')).toBeNull()
  })
})

describe('a link to a post (SCRUM-1026, 6/6)', () => {
  const { FlatList } = require('react-native')
  const OLD: BoardPost = { ...SEEKING, id: 'p-old', body: 'An older post, past the first page' }
  const one = (post: BoardPost) => ({ success: true, data: { state: 'open', phase: 'before', closesAt: FUTURE, post } }) as never
  let scrolled: jest.SpyInstance
  beforeEach(() => {
    scrolled = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
  })
  afterEach(() => scrolled.mockRestore())
  /** The post the list was asked to scroll to. */
  const scrolledTo = () => screen.getByTestId('board-list').props.data[scrolled.mock.calls[0][0].index]?.id

  it('scrolls to the post when it is on the page', async () => {
    mockParams.post = 'p-seek'
    api.getBoard.mockResolvedValue(board([OFFER, SEEKING]))
    api.getBoardPost.mockResolvedValue(one(SEEKING))
    await render(<BoardScreen />)
    await waitFor(() => expect(scrolled).toHaveBeenCalled())
    expect(scrolledTo()).toBe('p-seek')
    expect(api.getBoardPost).toHaveBeenCalledWith('e1', 'p-seek')
  })

  it('lays a post older than the page on top, and scrolls to it', async () => {
    mockParams.post = 'p-old'
    api.getBoard.mockResolvedValue(board([OFFER, SEEKING]))
    api.getBoardPost.mockResolvedValue(one(OLD))
    await render(<BoardScreen />)
    expect(await screen.findByText(OLD.body)).toBeTruthy()
    await waitFor(() => expect(scrolled).toHaveBeenCalled())
    expect(scrolledTo()).toBe('p-old')
    // A refresh keeps it until the server lists it.
    await pullToRefresh()
    expect(screen.getByText(OLD.body)).toBeTruthy()
  })

  it('says the post is gone, and leaves the Lobby open', async () => {
    mockParams.post = 'p-gone'
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.getBoardPost.mockResolvedValue({ success: false, error: 'That post is no longer in the Lobby', errorCode: 'NOT_FOUND' } as never)
    await render(<BoardScreen />)
    expect(await screen.findByText('That post is no longer in the Lobby')).toBeTruthy()
    expect(screen.getByText(OFFER.body)).toBeTruthy()
    expect(scrolled).not.toHaveBeenCalled()
  })

  it('shows the closed Lobby when the post’s Lobby has closed', async () => {
    mockParams.post = 'p-seek'
    api.getBoard.mockResolvedValue(board([SEEKING]))
    api.getBoardPost.mockResolvedValue({ success: false, error: 'closed', reasonCode: 'LOBBY_CLOSED' } as never)
    await render(<BoardScreen />)
    expect(await screen.findByTestId('lobby-closed')).toBeTruthy()
  })

  it('drops the linked post when you block somebody, as the pages do', async () => {
    mockParams.post = 'p-old'
    api.getBoard.mockResolvedValue(board([OFFER, SEEKING]))
    api.getBoardPost.mockResolvedValue(one(OLD))
    await render(<BoardScreen />)
    expect(await screen.findByText(OLD.body)).toBeTruthy()
    await act(async () => noteBlocked())
    await waitFor(() => expect(screen.queryByText(OLD.body)).toBeNull())
    expect(screen.getByText(OFFER.body)).toBeTruthy()
  })

  it('never lays a post on top that a block overtook while it was being read', async () => {
    mockParams.post = 'p-old'
    api.getBoard.mockResolvedValue(board([OFFER]))
    let answer: (v: unknown) => void = () => {}
    api.getBoardPost.mockReturnValue(new Promise((r) => (answer = r)) as never)
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    await act(async () => noteBlocked())
    await act(async () => answer(one(OLD)))
    expect(screen.queryByText(OLD.body)).toBeNull()
  })

  it('asks again on a refresh, and drops the post once the Lobby says it is gone', async () => {
    mockParams.post = 'p-old'
    api.getBoard.mockResolvedValue(board([OFFER]))
    api.getBoardPost.mockResolvedValue(one(OLD))
    await render(<BoardScreen />)
    expect(await screen.findByText(OLD.body)).toBeTruthy()
    api.getBoardPost.mockResolvedValue({ success: false, error: 'That post is no longer in the Lobby', errorCode: 'NOT_FOUND' } as never)
    await pullToRefresh()
    await waitFor(() => expect(screen.queryByText(OLD.body)).toBeNull())
    // Control: still there while the Lobby still has it.
    expect(api.getBoardPost).toHaveBeenLastCalledWith('e1', 'p-old')
  })

  it('asks for no post without a link, nor for one that is not an id', async () => {
    api.getBoard.mockResolvedValue(board([OFFER]))
    await render(<BoardScreen />)
    await screen.findByText(OFFER.body)
    mockParams.post = '../settings'
    await render(<BoardScreen />)
    await screen.findAllByText(OFFER.body)
    expect(api.getBoardPost).not.toHaveBeenCalled()
  })
})
