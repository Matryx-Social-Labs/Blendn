/*
 * How a push is shown on this phone.
 *
 * Three things were wrong, and each made the app louder than it meant to be:
 *
 *   channels   the app created only `default` (at the highest importance), and
 *              the server sent DMs and friend requests on `messages` — so
 *              Android filed them under "Miscellaneous" while room chatter
 *              arrived as a heads-up
 *   on screen  a DM you were reading still dropped a banner over itself for
 *              every message
 *   reminders  "starts in an hour" came twice: once scheduled here, once
 *              pushed by the server's reminder sweeper
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const mockChannel = jest.fn((..._a: unknown[]) => Promise.resolve(null))
const mockScheduled = jest.fn(() => Promise.resolve([] as { identifier: string }[]))
const mockCancel = jest.fn((..._a: unknown[]) => Promise.resolve())

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: (...a: unknown[]) => mockChannel(...a),
  getAllScheduledNotificationsAsync: () => mockScheduled(),
  cancelScheduledNotificationAsync: (...a: unknown[]) => mockCancel(...a),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2 },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

// eslint-disable-next-line import/first
import * as Notifications from 'expo-notifications'
// eslint-disable-next-line import/first
import {
  cancelLegacyEventReminders,
  claimThread,
  DEFAULT_CHANNEL_NAME,
  ensureNotificationChannels,
  setActiveThread,
} from '../lib/notifications'

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

const pushFor = (data: Record<string, string>) => ({ request: { content: { data } } })

/**
 * What the app registered at import, called the way expo-notifications calls
 * it. Read once here: `clearMocks` empties the call record before every test.
 */
const registered = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0][0]
const present = (data: Record<string, string>): Promise<Record<string, boolean>> =>
  registered.handleNotification(pushFor(data))

beforeEach(() => {
  mockChannel.mockClear()
  mockCancel.mockClear()
  setActiveThread(null)
})

describe('Android channels', () => {
  it('names the `default` channel for a person, never by its bare id (the stray lowercase "default", drive r7)', () => {
    expect(DEFAULT_CHANNEL_NAME).toBe('Other notifications')
    const src = read('lib', 'notifications.ts')
    expect(src).toMatch(/setNotificationChannelAsync\('default', \{\s+name: DEFAULT_CHANNEL_NAME,/)
    expect(src).not.toMatch(/name: 'default'/)
  })

  it('creates the three the server sends on', async () => {
    // blendn-admin `deliveryFor` picks one of these for every kind.
    await ensureNotificationChannels()
    const ids = mockChannel.mock.calls.map((c) => c[0])
    expect(ids).toEqual(expect.arrayContaining(['messages', 'rooms', 'events']))
  })

  it('adds the three Flow 9 channels and the offers one the server already sends on', async () => {
    await ensureNotificationChannels()
    const ids = mockChannel.mock.calls.map((c) => c[0])
    expect(ids).toEqual(expect.arrayContaining(['matches', 'crew', 'after-the-night', 'offers']))
  })

  it('hides people and crew on the lock screen, shows events, and makes After the night quiet', async () => {
    await ensureNotificationChannels()
    const by = Object.fromEntries(mockChannel.mock.calls.map((c) => [c[0], c[1] as { lockscreenVisibility: number; importance: number }]))
    // PRIVATE = 0, PUBLIC = 1 (the mock mirrors the enum).
    for (const id of ['messages', 'matches', 'crew', 'rooms']) expect(by[id].lockscreenVisibility).toBe(0)
    expect(by.events.lockscreenVisibility).toBe(1)
    expect(by['after-the-night'].importance).toBeLessThan(by.rooms.importance)
  })

  it('makes people and events louder than room replies', async () => {
    await ensureNotificationChannels()
    const importance = Object.fromEntries(
      mockChannel.mock.calls.map((c) => [c[0], (c[1] as { importance: number }).importance])
    )
    expect(importance.messages).toBeGreaterThan(importance.rooms)
    expect(importance.events).toBeGreaterThan(importance.rooms)
  })
})

describe('a push with the app open', () => {
  it('leaves the system banner to the in-app capsule only while the tabs have claimed it', async () => {
    const { claimBannerHost } = require('../lib/inAppBanners')
    expect((await present({ type: 'match' })).shouldShowBanner).toBe(true)
    const release = claimBannerHost('tabs')
    expect(await present({ type: 'match' })).toMatchObject({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false })
    // A kind with no capsule still gets the system's.
    expect((await present({ type: 'venue_offer' })).shouldShowBanner).toBe(true)
    release()
  })
})

describe('a push for what is already on screen', () => {
  it('is not shown over the conversation it belongs to', async () => {
    setActiveThread('dm:c1')
    const shown = await present({ type: 'private_message', conversationId: 'c1' })
    expect(shown).toMatchObject({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false })
  })

  it('is not shown over the room it belongs to', async () => {
    setActiveThread('room:g1')
    const shown = await present({ type: 'group_message', chatGroupId: 'g1' })
    expect(shown.shouldShowBanner).toBe(false)
  })

  it('is shown when you are reading somebody else', async () => {
    setActiveThread('dm:c1')
    const shown = await present({ type: 'private_message', conversationId: 'c2' })
    expect(shown).toMatchObject({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true })
  })

  it('is shown for everything else, wherever you are', async () => {
    setActiveThread('dm:c1')
    const shown = await present({ type: 'friend_request', requestId: 'r1' })
    expect(shown.shouldShowBanner).toBe(true)
  })

  it('a chat opened straight from another keeps its claim when the first lets go', async () => {
    const releaseA = claimThread('dm:a')
    const releaseB = claimThread('dm:b')
    releaseA()
    expect((await present({ type: 'private_message', conversationId: 'b' })).shouldShowBanner).toBe(false)
    releaseB()
    expect((await present({ type: 'private_message', conversationId: 'b' })).shouldShowBanner).toBe(true)
  })

  it('both chat screens say which thread they show', () => {
    expect(read('app', 'private-chat', '[conversationId].tsx')).toMatch(/useActiveThread\(`dm:\$\{/)
    expect(read('app', 'chat', '[id].tsx')).toMatch(/useActiveThread\(`room:\$\{/)
  })
})

describe('the one-hour reminder', () => {
  it('is the server’s alone: nothing here schedules one', () => {
    for (const file of [
      ['lib', 'notifications.ts'],
      ['components', 'screens', 'EventDetailScreen.tsx'],
      ['app', '(tabs)', 'events.tsx'],
    ]) {
      expect(read(...file)).not.toMatch(/scheduleNotificationAsync|syncEventReminder|scheduleEventReminder/)
    }
  })

  it('cancels the ones an earlier build scheduled, and nothing else', async () => {
    mockScheduled.mockResolvedValueOnce([{ identifier: 'event-reminder-e1' }, { identifier: 'something-else' }])
    await cancelLegacyEventReminders()
    expect(mockCancel.mock.calls).toEqual([['event-reminder-e1']])
  })
})

describe('the bell, while the app is open', () => {
  /*
   * The badge moved only when the Pulse came into focus, so a friend request
   * that arrived while you were on it waited for you to leave and come back.
   * The server says `notification:new` on your own socket room when a row lands.
   */
  it('listens for a new row and re-reads its count', () => {
    const socket = read('lib', 'socketClient.ts')
    expect(socket).toMatch(/sock\.on\("notification:new"/)
    expect(socket).toMatch(/export function subscribeToBell\(/)
    // The bell and the tab bar share one read (`lib/inboxBadge`), which listens.
    expect(read('app', '(tabs)', '_layout.tsx')).toMatch(/useInboxBadgeSync\(/)
    const shared = read('lib', 'inboxBadge.ts')
    expect(shared).toMatch(/subscribeToBell\(/)
    // The server's count, not a local +1 that duplicates would inflate.
    expect(shared).toMatch(/subscribeToBell\(\(row\) => \{[^}]*\}[^}]*void refreshInboxBadge\(\)/)
  })
})
