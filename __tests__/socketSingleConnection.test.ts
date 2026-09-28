/*
 * One app, one socket.
 *
 * `connect()` built a new socket whenever the current one was not connected —
 * which is every return from the background, before the old one has finished
 * reconnecting — and never retired the old one. socket.io opens a second
 * connection for a namespace that is already open, and the old socket, with
 * unlimited reconnection attempts, came back beside it. Each server event then
 * arrived once per socket.
 *
 * Driven on the owner's iPhone, 2026-09-28: one friend request, one bell row on
 * the server, and the bell read 3.
 */
type Handler = (...args: unknown[]) => void

class MockSocket {
  connected = false
  handlers = new Map<string, Handler[]>()
  managerHandlers = new Map<string, Handler[]>()
  disconnect = jest.fn(() => {
    this.connected = false
  })
  io = {
    on: (event: string, fn: Handler) => {
      this.managerHandlers.set(event, [...(this.managerHandlers.get(event) ?? []), fn])
    },
    removeAllListeners: jest.fn(() => this.managerHandlers.clear()),
    engine: { transport: { name: 'websocket' } },
  }
  on(event: string, fn: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn])
    return this
  }
  removeAllListeners = jest.fn(() => {
    this.handlers.clear()
    return this
  })
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
  apiClient: {},
  TokenStorage: { getAccessToken: () => Promise.resolve('token') },
}))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}))
jest.mock('../lib/sentry', () => ({ Sentry: { captureMessage: jest.fn() } }))

// eslint-disable-next-line import/first
import { connect, handleAppStateChange, subscribeToBell } from '../lib/socketClient'

/** Starts a connection and lets the newest socket complete it. */
async function connected(): Promise<MockSocket> {
  const pending = connect()
  await new Promise((r) => setTimeout(r, 0))
  const s = mockSockets[mockSockets.length - 1]
  s.fire('connect')
  await pending
  return s
}

it('retires the old socket when it builds a new one', async () => {
  const first = await connected()
  first.connected = false // backgrounded; still trying to come back on its own

  const second = await connected()

  expect(second).not.toBe(first)
  expect(first.disconnect).toHaveBeenCalled()
  expect(first.removeAllListeners).toHaveBeenCalled()
  expect(first.io.removeAllListeners).toHaveBeenCalled()
})

it('delivers one server event once, however many times the app came back', async () => {
  const heard = jest.fn()
  const stop = subscribeToBell(heard)
  const sockets = [await connected()]
  for (let i = 0; i < 2; i++) {
    sockets[sockets.length - 1].connected = false
    sockets.push(await connected())
  }

  // The server emits to the user's room, which every live socket is in.
  for (const s of sockets) s.fire('notification:new', { kind: 'friend_request' })

  expect(heard).toHaveBeenCalledTimes(1)
  stop()
})

describe('coming back from the background', () => {
  /*
   * iOS suspends a backgrounded app; its socket still says "connected" when
   * the app returns, on a connection that is dead until the ping times out
   * (about 85 s). No messages arrive in that window and no banner says why
   * (SCRUM-407).
   */
  it('builds a fresh socket after a long background, even though the old one says connected', async () => {
    const first = await connected()
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
    await handleAppStateChange('background')
    now.mockReturnValue(1_000_000 + 20_000)
    const pending = handleAppStateChange('active')
    await new Promise((r) => setTimeout(r, 0))
    const second = mockSockets[mockSockets.length - 1]
    expect(second).not.toBe(first)
    second.fire('connect')
    await pending
    expect(first.disconnect).toHaveBeenCalled()
    now.mockRestore()
  })

  it('keeps the socket for a glance away', async () => {
    const first = await connected()
    const now = jest.spyOn(Date, 'now').mockReturnValue(2_000_000)
    await handleAppStateChange('background')
    now.mockReturnValue(2_000_000 + 5_000)
    await handleAppStateChange('active')
    expect(mockSockets[mockSockets.length - 1]).toBe(first)
    now.mockRestore()
  })
})

describe('delivery acks (SCRUM-408)', () => {
  it("acks a DM from somebody else the moment it arrives, and never your own", async () => {
    const s = await connected()
    const emitted: unknown[][] = []
    s.emit = ((...args: unknown[]) => {
      emitted.push(args)
      return s
    }) as never
    s.fire('connected', { userId: 'me' })
    s.fire('private:message', { conversationId: 'c1', message: { id: 'm1', senderId: 'them' } })
    s.fire('private:message', { conversationId: 'c1', message: { id: 'm2', senderId: 'me' } })
    expect(emitted).toEqual([['private:delivered', 'c1', ['m1']]])
  })
})
