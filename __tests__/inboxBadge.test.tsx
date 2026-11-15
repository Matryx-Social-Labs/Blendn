/*
 * The Banter tab's dot and the Pulse bell read one feed (BAR-02), split by where an ask leads (requests placement A, board 03):
 * the bell is the unseen rows that are not talk-asks; the Banter dot is the conversations, `badgeCount - unreadCount`, plus the
 * message requests and Lobby asks waiting. The fixture is the feed's counts as blendn-admin builds them.
 */
import { act, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getNotifications: jest.fn(),
    getMessageRequests: jest.fn(async () => ({ success: true, data: { requests: [], totalCount: 0 } })),
    getBoardRequests: jest.fn(async () => ({ success: true, data: { incoming: [], outgoing: [] } })),
  },
}))
jest.mock('../lib/socketClient', () => ({ subscribeToBell: jest.fn(() => () => {}), subscribeToUserNotifications: jest.fn(() => () => {}) }))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(async () => ({ status: 'denied' })), setBadgeCountAsync: jest.fn() }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { queryCache } from '../lib/queryCache'
import { banterUnread, BELL_PAGE, markBellRead, publishTalkAsks, refreshInboxBadge, refreshTalkAsks, resetInboxBadge, useInboxBadge, useInboxBadgeSync } from '../lib/inboxBadge'
import { clearDirtyDomains, isDomainDirty } from '../lib/liveSyncState'
import { subscribeToBell, subscribeToUserNotifications } from '../lib/socketClient'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const feed = (extra: Record<string, unknown>) => ({ success: true, data: { notifications: [], pagination: { limit: 1, hasMore: false }, ...extra } }) as never

function Probe() {
  useInboxBadgeSync('u1')
  const b = useInboxBadge()
  return <Text testID="n">{`${b.bell}/${banterUnread(b)}`}</Text>
}

beforeEach(() => {
  jest.clearAllMocks()
  resetInboxBadge()
})

it('two unseen rows and one conversation: the bell 2, the Banter dot 1', async () => {
  api.getNotifications.mockResolvedValue(feed({ unreadCount: 2, badgeCount: 3 }))
  const view = await render(<Probe />)
  await waitFor(() => expect(view.getByTestId('n').props.children).toBe('2/1'))
})

it('opening the bell clears the rows and leaves the conversation', async () => {
  api.getNotifications.mockResolvedValue(feed({ unreadCount: 2, badgeCount: 3 }))
  const view = await render(<Probe />)
  await waitFor(() => expect(view.getByTestId('n').props.children).toBe('2/1'))
  await act(async () => markBellRead())
  expect(view.getByTestId('n').props.children).toBe('0/1')
})

it('an older server sends no badgeCount: no dot', async () => {
  api.getNotifications.mockResolvedValue(feed({ unreadCount: 2 }))
  const view = await render(<Probe />)
  await waitFor(() => expect(view.getByTestId('n').props.children).toBe('2/0'))
})

it('a row landing re-reads the server; a trigger during that read earns one follow-up', async () => {
  api.getNotifications.mockResolvedValue(feed({ unreadCount: 1, badgeCount: 1 }))
  const view = await render(<Probe />)
  await waitFor(() => expect(view.getByTestId('n').props.children).toBe('1/0'))
  api.getNotifications.mockClear()
  api.getNotifications.mockResolvedValue(feed({ unreadCount: 1, badgeCount: 4 }))
  const onRow = (subscribeToBell as jest.Mock).mock.calls[0][0]
  await act(async () => {
    onRow()
    void refreshInboxBadge()
  })
  expect(api.getNotifications).toHaveBeenCalledTimes(2)
  expect(view.getByTestId('n').props.children).toBe('1/3')
})

describe('a live DM moves the Banter dot (H2)', () => {
  // The server never sends notification:new for a DM (private_message is not in the bell); it sends private:message to user:<id>.
  const onPrivateMessage = () => (subscribeToUserNotifications as jest.Mock).mock.calls.at(-1)[1]

  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('subscribes on the user’s own room and re-reads once for a burst, ~2 s later', async () => {
    api.getNotifications.mockResolvedValue(feed({ unreadCount: 0, badgeCount: 0 }))
    const view = await render(<Probe />)
    await act(async () => {})
    expect(subscribeToUserNotifications).toHaveBeenCalledWith('u1', expect.any(Function))
    api.getNotifications.mockClear()
    api.getNotifications.mockResolvedValue(feed({ unreadCount: 0, badgeCount: 3 }))
    await act(async () => {
      onPrivateMessage()({})
      onPrivateMessage()({})
      onPrivateMessage()({})
    })
    expect(api.getNotifications).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(2100)
    })
    expect(api.getNotifications).toHaveBeenCalledTimes(1)
    expect(view.getByTestId('n').props.children).toBe('0/3')
  })
})

describe('reads that overlap or outlive the account', () => {
  const deferred = () => {
    let resolve!: (v: never) => void
    const promise = new Promise<never>((r) => (resolve = r))
    return { promise, resolve }
  }

  it('a trigger during a read gets one follow-up read, not a dropped one (M6)', async () => {
    const first = deferred()
    api.getNotifications.mockReturnValueOnce(first.promise as never).mockResolvedValue(feed({ unreadCount: 1, badgeCount: 2 }))
    api.getNotifications.mockClear()
    const a = refreshInboxBadge()
    void refreshInboxBadge()
    void refreshInboxBadge()
    first.resolve(feed({ unreadCount: 0, badgeCount: 0 }))
    await a
    await new Promise((r) => setImmediate(r))
    expect(api.getNotifications).toHaveBeenCalledTimes(2)
  })

  it('a read begun before sign-out does not paint the next account (M6)', async () => {
    const view = await render(<Probe />)
    await act(async () => {})
    const slow = deferred()
    api.getNotifications.mockReturnValueOnce(slow.promise as never)
    const read = refreshInboxBadge()
    await act(async () => resetInboxBadge())
    slow.resolve(feed({ unreadCount: 9, badgeCount: 9 }))
    await act(async () => {
      await read
    })
    expect(view.getByTestId('n').props.children).toBe('0/0')
  })
})

describe('a message request makes the Banter read its requests again (SCRUM-907)', () => {
  // A request has no socket event of its own, only the bell's row.
  const KEY = 'message_requests_u1'
  const land = async (kind: string) => {
    api.getNotifications.mockResolvedValue(feed({ unreadCount: 1, badgeCount: 1 }))
    queryCache.set(KEY, { incoming: [], outgoing: [] }, 60_000)
    await render(<Probe />)
    const onRow = (subscribeToBell as jest.Mock).mock.calls.at(-1)[0]
    await act(async () => onRow({ kind }))
  }

  it('a message_request row drops the cached requests', async () => {
    await land('message_request')
    expect(queryCache.get(KEY)).toBeNull()
  })

  it('another kind of row leaves them', async () => {
    await land('event_update')
    expect(queryCache.get(KEY)).not.toBeNull()
  })
})

describe('an accepted message request makes the Banter read its people again (SCRUM-918)', () => {
  // The accepted request creates the conversation on the server; the sender is told by the bell's row only.
  const KEY = 'personal_chats_u1'
  const land = async (kind: string) => {
    api.getNotifications.mockResolvedValue(feed({ unreadCount: 1, badgeCount: 1 }))
    queryCache.set(KEY, [], 60_000)
    await render(<Probe />)
    const onRow = (subscribeToBell as jest.Mock).mock.calls.at(-1)[0]
    await act(async () => onRow({ kind }))
  }

  it('a message_request_response row drops the cached people and marks the chat domain dirty', async () => {
    clearDirtyDomains(['chat'])
    await land('message_request_response')
    expect(queryCache.get(KEY)).toBeNull()
    expect(isDomainDirty('chat')).toBe(true)
  })

  it('another kind of row leaves them', async () => {
    clearDirtyDomains(['chat'])
    await land('event_update')
    expect(queryCache.get(KEY)).not.toBeNull()
    expect(isDomainDirty('chat')).toBe(false)
  })
})

describe('requests placement A: a talk-ask lights the Banter dot, never the bell (board 03)', () => {
  const row = (kind: string, i: number) => ({ id: `${kind}-${i}`, kind, title: 'T', body: 'B', data: null, readAt: null, createdAt: '2026-11-15T10:00:00Z' })
  const lobbyAsk = (id: string, live: boolean) => ({ id, live, status: 'pending', message: null, createdAt: '', decidedAt: null, counterpart: 'Otter', event: { id: 'e', title: 'E', startTime: '' }, post: { id: 'p', kind: 'ride', body: null } })
  beforeEach(() => {
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 0 } } as never)
    api.getBoardRequests.mockResolvedValue({ success: true, data: { incoming: [], outgoing: [] } } as never)
  })

  it('a message request, a Lobby ask and a reveal ask leave the bell; the dot has the conversations and what waits to talk', async () => {
    // Three unseen rows (one friend request, two talk-asks) and one conversation; 5 message requests and 1 live Lobby ask waiting.
    const rows = [row('friend_request', 1), row('message_request', 1), row('board_request', 1), row('reveal_request', 1)]
    api.getNotifications.mockResolvedValue(feed({ unreadCount: 4, badgeCount: 5, notifications: rows }))
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 5 } } as never)
    api.getBoardRequests.mockResolvedValue({ success: true, data: { incoming: [lobbyAsk('a', true), lobbyAsk('b', false)], outgoing: [] } } as never)
    const view = await render(<Probe />)
    // Control for the split: the server's own `unreadCount` (4) would light the bell for every talk-ask too.
    await waitFor(() => expect(view.getByTestId('n').props.children).toBe('1/7'))
    expect(api.getNotifications).toHaveBeenCalledWith({ unreadOnly: true, limit: BELL_PAGE })
  })

  it('past a page of unseen rows the bell is a floor: never a talk-ask counted', async () => {
    const page = [...Array.from({ length: 25 }, (_, i) => row('message_request', i)), ...Array.from({ length: 5 }, (_, i) => row('match', i))]
    api.getNotifications.mockResolvedValue({ success: true, data: { notifications: page, pagination: { limit: 30, hasMore: true }, unreadCount: 200, badgeCount: 200 } } as never)
    const view = await render(<Probe />)
    await waitFor(() => expect(view.getByTestId('n').props.children).toBe('5/0'))
  })

  it('opening the bell leaves the talk-asks on the dot', async () => {
    api.getNotifications.mockResolvedValue(feed({ unreadCount: 2, badgeCount: 2, notifications: [row('match', 1), row('message_request', 1)] }))
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 3 } } as never)
    const view = await render(<Probe />)
    await waitFor(() => expect(view.getByTestId('n').props.children).toBe('1/3'))
    await act(async () => markBellRead())
    expect(view.getByTestId('n').props.children).toBe('0/3')
  })

  it('what the Banter knows moves the dot at once: an answered request takes it down', async () => {
    api.getNotifications.mockResolvedValue(feed({ unreadCount: 0, badgeCount: 0 }))
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 2 } } as never)
    const view = await render(<Probe />)
    await waitFor(() => expect(view.getByTestId('n').props.children).toBe('0/2'))
    await act(async () => publishTalkAsks({ messageRequests: 1 }))
    expect(view.getByTestId('n').props.children).toBe('0/1')
  })

  it('a talk-ask row re-reads the talk-asks; a friend request row does not', async () => {
    api.getNotifications.mockResolvedValue(feed({ unreadCount: 0, badgeCount: 0 }))
    await render(<Probe />)
    await act(async () => {})
    const onRow = (subscribeToBell as jest.Mock).mock.calls.at(-1)[0]
    api.getMessageRequests.mockClear()
    await act(async () => onRow({ kind: 'friend_request' }))
    expect(api.getMessageRequests).not.toHaveBeenCalled()
    await act(async () => onRow({ kind: 'message_request' }))
    expect(api.getMessageRequests).toHaveBeenCalledTimes(1)
  })

  it('a failed talk-ask read keeps the last answer; sign-out clears it', async () => {
    api.getNotifications.mockResolvedValue(feed({ unreadCount: 0, badgeCount: 0 }))
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: [], totalCount: 4 } } as never)
    const view = await render(<Probe />)
    await waitFor(() => expect(view.getByTestId('n').props.children).toBe('0/4'))
    api.getMessageRequests.mockResolvedValue({ success: false, error: 'down' } as never)
    await act(async () => refreshTalkAsks())
    expect(view.getByTestId('n').props.children).toBe('0/4')
    await act(async () => resetInboxBadge())
    expect(view.getByTestId('n').props.children).toBe('0/0')
  })
})
