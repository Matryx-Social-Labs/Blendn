/**
 * Places live on the app (plan v2 step 5): the wiring around Go Live.
 *
 * - `live:ended` drops what still says you are in, so the Banter's next read
 *   loses the place's room (the server leaves it out of `/chat/groups` once
 *   your window is over) and every subscriber hears it.
 * - `EVENT_LIVE_HERE` is a hand-off to the event's check-in, never an error
 *   toast (PL-CU01).
 * - The room, the countdown and the claim link read the server, never a guess.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

type Handler = (...args: unknown[]) => void

class MockSocket {
  connected = false
  handlers = new Map<string, Handler[]>()
  io = { on: jest.fn(), removeAllListeners: jest.fn(), engine: { transport: { name: 'websocket' } } }
  disconnect = jest.fn()
  removeAllListeners = jest.fn(() => this)
  on(event: string, fn: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn])
    return this
  }
  emit() {
    return this
  }
  fire(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true
    for (const fn of this.handlers.get(event) ?? []) fn(...args)
  }
}

const mockSockets: MockSocket[] = []
jest.mock('socket.io-client', () => ({
  io: () => {
    const s = new MockSocket()
    mockSockets.push(s)
    return s
  },
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    forgetChatGroups: jest.fn(),
    forgetActiveCheckins: jest.fn(),
    forgetEventMatches: jest.fn(),
    goLive: jest.fn(),
  },
  TokenStorage: { getAccessToken: () => Promise.resolve('token') },
}))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}))
jest.mock('../lib/sentry', () => ({ Sentry: { captureMessage: jest.fn() } }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/checkIn', () => ({ checkInChanged: jest.fn() }))
jest.mock('../lib/locationFix', () => ({ getCurrentLocation: jest.fn() }))
jest.mock('../lib/openInMaps', () => ({ openInMaps: jest.fn(() => Promise.resolve()) }))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

/* eslint-disable import/first */
import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import { goLiveRefusal } from '../lib/goLive'
import { clearDirtyDomains, isDomainDirty } from '../lib/liveSyncState'
import { connect, subscribeToLiveEnded } from '../lib/socketClient'
import { showGoLiveRefusal } from '../lib/useGoLive'
/* eslint-enable import/first */

async function connected(): Promise<MockSocket> {
  const pending = connect()
  await new Promise((r) => setTimeout(r, 0))
  const s = mockSockets[mockSockets.length - 1]
  s.fire('connect')
  await pending
  return s
}

describe('live:ended', () => {
  it('drops the cached room list, active check-ins and the roster, and marks the Banter dirty', async () => {
    const s = await connected()
    clearDirtyDomains(['chat', 'events', 'match'])
    const heard = jest.fn()
    const off = subscribeToLiveEnded(heard)

    s.fire('live:ended', { eventId: 'day-1', reason: 'expired' })

    expect(apiClient.forgetChatGroups).toHaveBeenCalled()
    expect(apiClient.forgetActiveCheckins).toHaveBeenCalled()
    expect(apiClient.forgetEventMatches).toHaveBeenCalledWith('day-1')
    expect(isDomainDirty('chat')).toBe(true)
    expect(heard).toHaveBeenCalledWith({ eventId: 'day-1', reason: 'expired' })

    off()
    s.fire('live:ended', { eventId: 'day-1', reason: 'manual' })
    expect(heard).toHaveBeenCalledTimes(1)
  })
})

describe('a refused Go Live on screen (PL-CU01)', () => {
  const place = { id: 'v1', name: 'The Humming Tree', latitude: 12.97, longitude: 77.59 }

  it('EVENT_LIVE_HERE opens a hand-off sheet whose action is the event', () => {
    const showTray = jest.fn()
    const closeTray = jest.fn()
    showGoLiveRefusal(goLiveRefusal('EVENT_LIVE_HERE', 'Friday session is on here. Check in to it instead.', 'e1'), place, { showTray, closeTray })

    expect(showTray).toHaveBeenCalledTimes(1)
    const [title, message, buttons] = showTray.mock.calls[0]
    expect(title).toBe('Check in to the event instead')
    expect(message).toBe('Friday session is on here. Check in to it instead.')
    const go = (buttons as { label: string; onPress: () => void }[]).find((b) => b.label === 'Go to the event')
    go?.onPress()
    expect(router.push).toHaveBeenCalledWith('/event/e1')
  })

  it('PLUS_REQUIRED is the Plus placeholder, not a failure', () => {
    const showTray = jest.fn()
    showGoLiveRefusal(goLiveRefusal('PLUS_REQUIRED', 'Staying live is part of Blendn+.'), place, { showTray, closeTray: jest.fn() })
    expect(showTray.mock.calls[0][0]).toBe('Blendn+ is coming')
  })
})

const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8')

describe('the screens read the server', () => {
  const VENUE = read('app/venue/[id].tsx')
  const CHAT = read('app/chat/[id].tsx')
  const LIVE = read('components/LiveAtVenue.tsx')

  it("counts down from the server's expiresAt, and re-reads when the app comes back (PL-CU02)", () => {
    expect(VENUE).toContain('remainingMs(live.expiresAt, now)')
    expect(VENUE).toMatch(/AppState\.addEventListener\('change'/)
  })

  it('offers the claim link only through claimUrlFrom, and only for an unclaimed place', () => {
    expect(VENUE).toContain('!detail.venue.claimed ? claimUrlFrom(detail.claim)')
  })

  it('draws no check-in boundary (plan v2 §4)', () => {
    expect(VENUE).not.toMatch(/Polygon|Circle|geofence/)
  })

  it("a place's room answers NOT_LIVE with the not-live state, on load and on send", () => {
    expect(CHAT.match(/errorCode === 'NOT_LIVE'\) \{? ?setNotLive\(true\)/g)?.length).toBe(2)
    expect(CHAT).toContain('<RoomLeftState kind="not_live"')
    expect(CHAT).toContain('subscribeToLiveEnded(')
  })

  it('the expiry prompt offers the free extension and keeps "stay with Plus" locked', () => {
    expect(LIVE).toContain("label: 'Extend 45 min · free'")
    expect(LIVE).toContain('showPlusPlaceholder(showTray, closeTray)')
  })
})
