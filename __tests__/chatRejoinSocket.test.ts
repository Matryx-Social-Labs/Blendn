/*
 * Rejoining a room puts the socket back in it.
 *
 * While you were out of a room the server refused this socket's `join:chat`,
 * and Rejoin goes over HTTP without reconnecting, so the room stayed silent
 * until the next reconnect. Seen on the simulator against staging, 2026-09-28:
 * leave, Rejoin, messages back, and "SOCKET :: Server error" from the refused
 * join still the last word.
 */
import * as fs from 'fs'
import * as path from 'path'

type Handler = (...args: unknown[]) => void

class MockSocket {
  connected = false
  handlers = new Map<string, Handler[]>()
  emitted: unknown[][] = []
  disconnect = jest.fn()
  io = { on: jest.fn(), removeAllListeners: jest.fn(), engine: { transport: { name: 'websocket' } } }
  on(event: string, fn: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn])
    return this
  }
  removeAllListeners = jest.fn(() => this)
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
import { connect, rejoinChatSocket } from '../lib/socketClient'

it('asks the server for the room again on a live socket', async () => {
  const pending = connect()
  await new Promise((r) => setTimeout(r, 0))
  const s = mockSockets[mockSockets.length - 1]
  s.fire('connect')
  await pending
  s.emitted = []

  rejoinChatSocket('group-1')

  expect(s.emitted).toContainEqual(['join:chat', 'group-1'])
})

it('is what the chat screen does once Rejoin succeeds', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../app/chat/[id].tsx'), 'utf8')
  const rejoin = screen.slice(screen.indexOf('const rejoin = async'))
  expect(rejoin.slice(0, rejoin.indexOf('void loadMessages(true)'))).toContain('rejoinChatSocket(String(chatRoomId))')
})
