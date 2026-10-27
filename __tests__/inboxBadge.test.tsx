/*
 * The Banter tab's dot and the Pulse bell read one feed (BAR-02): the bell is `unreadCount`, the Banter dot is the
 * conversations, `badgeCount - unreadCount`. The fixture is the feed's counts as blendn-admin builds them.
 */
import { act, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getNotifications: jest.fn() } }))
jest.mock('../lib/socketClient', () => ({ subscribeToBell: jest.fn(() => () => {}) }))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(async () => ({ status: 'denied' })), setBadgeCountAsync: jest.fn() }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { banterUnread, markBellRead, refreshInboxBadge, useInboxBadge, useInboxBadgeSync } from '../lib/inboxBadge'
import { subscribeToBell } from '../lib/socketClient'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const feed = (extra: Record<string, unknown>) => ({ success: true, data: { notifications: [], pagination: { limit: 1, hasMore: false }, ...extra } }) as never

function Probe() {
  useInboxBadgeSync()
  const b = useInboxBadge()
  return <Text testID="n">{`${b.unreadCount}/${banterUnread(b)}`}</Text>
}

beforeEach(() => jest.clearAllMocks())

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

it('a row landing re-reads the server, and concurrent triggers share one read', async () => {
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
  expect(api.getNotifications).toHaveBeenCalledTimes(1)
  expect(view.getByTestId('n').props.children).toBe('1/3')
})
