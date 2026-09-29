/*
 * A conversation subscriber is called only for the events it asked for.
 *
 * `subscribeToConversation` kept one callback set per conversation and fanned
 * every `private:message`, `private:typing` and `private:read` out to all of it.
 * The DM screen registered a handler for each, so `handleRead` ran
 * `data.messageIds.includes` on a message payload and threw, unmounting the
 * screen the moment the other person's first message arrived (simulator,
 * 2026-09-12). Driven here against the real socket client and a mock socket.
 */
type Handler = (...args: unknown[]) => void

class MockSocket {
  connected = false
  handlers = new Map<string, Handler[]>()
  emitted: unknown[][] = []
  io = { on: jest.fn(), removeAllListeners: jest.fn(), engine: { transport: { name: 'websocket' } } }
  disconnect = jest.fn()
  removeAllListeners = jest.fn(() => this)
  on(event: string, fn: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn])
    return this
  }
  emit(...args: unknown[]) {
    this.emitted.push(args)
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
import { connect, subscribeToConversation } from '../lib/socketClient'

async function connected(): Promise<MockSocket> {
  const pending = connect()
  await new Promise((r) => setTimeout(r, 0))
  const s = mockSockets[mockSockets.length - 1]
  s.fire('connect')
  await pending
  return s
}

const message = { conversationId: 'c1', message: { id: 'm1', text: 'hi' } }
const typing = { conversationId: 'c1', userId: 'u2', userName: 'Sam', isTyping: true }
const read = { conversationId: 'c1', messageIds: ['m1'], readBy: 'u2' }

it('gives each handler only its own event, whatever else the conversation receives', async () => {
  const s = await connected()
  const onMessage = jest.fn()
  const onTyping = jest.fn()
  const onRead = jest.fn()
  subscribeToConversation('c1', { onMessage, onTyping, onRead })

  s.fire('private:message', message)
  s.fire('private:typing', typing)
  s.fire('private:read', read)

  expect(onMessage.mock.calls).toEqual([[message]])
  expect(onTyping.mock.calls).toEqual([[typing]])
  expect(onRead.mock.calls).toEqual([[read]])
})

it('lets a subscriber ask for only some events', async () => {
  const s = await connected()
  const onRead = jest.fn()
  subscribeToConversation('c1', { onRead })

  expect(() => {
    s.fire('private:message', message)
    s.fire('private:typing', typing)
  }).not.toThrow()
  s.fire('private:read', read)
  expect(onRead).toHaveBeenCalledTimes(1)
})

it('ignores a conversation nobody subscribed to', async () => {
  const s = await connected()
  const onMessage = jest.fn()
  subscribeToConversation('c1', { onMessage })
  s.fire('private:message', { conversationId: 'other', message: { id: 'm9' } })
  expect(onMessage).not.toHaveBeenCalled()
})

it('joins the conversation once, and leaves only when its last subscriber goes', async () => {
  const s = await connected()
  const first = subscribeToConversation('c2', { onMessage: jest.fn() })
  const second = subscribeToConversation('c2', { onRead: jest.fn() })
  const sent = () => s.emitted.filter(([e, id]) => id === 'c2' && (e === 'join:conversation' || e === 'leave:conversation'))
  expect(sent().map(([e]) => e)).toEqual(['join:conversation', 'join:conversation'])

  first()
  expect(sent().some(([e]) => e === 'leave:conversation')).toBe(false)
  second()
  expect(sent().filter(([e]) => e === 'leave:conversation')).toHaveLength(1)
})

it('stops delivering to a subscriber that unsubscribed', async () => {
  const s = await connected()
  const onMessage = jest.fn()
  const off = subscribeToConversation('c1', { onMessage })
  off()
  s.fire('private:message', message)
  expect(onMessage).not.toHaveBeenCalled()
})
