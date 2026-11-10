/*
 * The room's two tabs never leave or rejoin the room's socket (Flow 5 C1, R-A).
 *
 * The chat moved into the overlay as its Chat tab. A host that mounted the tab
 * it shows and dropped the other would unsubscribe the chat on People
 * (`leave:chat`) and subscribe again on Chat (`join:chat`): every switch a
 * round trip, a gap where messages are missed, and a concert room's server
 * re-adding thousands of sockets. The real socket client counts the emits here.
 */
import React, { useEffect, type ReactNode } from 'react'
import { render } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'

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
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: { getAccessToken: () => Promise.resolve('token') } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/sentry', () => ({ Sentry: { captureMessage: jest.fn() } }))

// eslint-disable-next-line import/first
import { connect, subscribeToChatMessage, subscribeToChatReaction, subscribeToChatTyping } from '../lib/socketClient'
// eslint-disable-next-line import/first
import { RoomTabs } from '../components/blendn/RoomTabs'
// eslint-disable-next-line import/first
import type { RoomTab } from '../lib/roomTab'

/** What the Chat tab's body does with the socket (`RoomChat`): the room's messages, typing and reactions. */
function ChatProbe() {
  useEffect(() => {
    const off = [subscribeToChatMessage('g1', () => {}), subscribeToChatTyping('g1', () => {}), subscribeToChatReaction('g1', () => {})]
    return () => off.forEach((f) => f())
  }, [])
  return <Text>chat</Text>
}

/** The host this replaces in spirit: only the shown tab is mounted. The control: the count below must see its switches. */
function OneTabMounted({ tab, people, chat }: { tab: RoomTab; people: ReactNode; chat: ReactNode }) {
  return <>{tab === 'chat' ? chat : people}</>
}

const roomEmits = (s: MockSocket) => s.emitted.filter(([name]) => name === 'join:chat' || name === 'leave:chat')

async function liveSocket() {
  const pending = connect()
  await new Promise((r) => setTimeout(r, 0))
  const s = mockSockets[mockSockets.length - 1]
  s.fire('connect')
  await pending
  return s
}

async function switches(Host: typeof RoomTabs | typeof OneTabMounted, s: MockSocket) {
  const tree = (tab: RoomTab) => <Host tab={tab} people={<Text>people</Text>} chat={<ChatProbe />} />
  const view = await render(tree('chat'))
  const opened = roomEmits(s).length
  for (const tab of ['people', 'chat', 'people', 'chat'] as const) await view.rerender(tree(tab))
  return { view, opened, switched: roomEmits(s).length - opened }
}

it('joins the room once, as the room opens, and a tab switch emits no leave or join', async () => {
  const s = await liveSocket()
  s.emitted = []
  const { view, opened, switched } = await switches(RoomTabs, s)
  expect(opened).toBeGreaterThan(0)
  expect(switched).toBe(0)
  // Closing the room is what leaves it.
  await view.unmount()
  expect(roomEmits(s).filter(([name]) => name === 'leave:chat')).toEqual([['leave:chat', 'g1']])
})

it('control: a host that mounts only the shown tab leaves and rejoins on every switch, and the count sees it', async () => {
  const s = await liveSocket()
  s.emitted = []
  const { switched } = await switches(OneTabMounted, s)
  expect(switched).toBeGreaterThan(0)
})

it('keeps the hidden tab out of reach: not touchable, not read by a screen reader', async () => {
  const view = await render(<RoomTabs tab="people" people={<Text>people</Text>} chat={<Text>chat</Text>} />)
  const chatPane = view.getByTestId('room-tab-chat', { includeHiddenElements: true })
  expect(chatPane.props.pointerEvents).toBe('none')
  expect(chatPane.props.importantForAccessibility).toBe('no-hide-descendants')
  expect(chatPane.props.accessibilityElementsHidden).toBe(true)
  expect(view.getByTestId('room-tab-people').props.pointerEvents).toBe('auto')
})

// Found on the iOS drive: opened on People, the chat's bubbles never took a long-press. Fabric does not mount a
// `display: none` subtree, so the gesture handlers attached as React drew them found no native view. The hidden pane is
// drawn and see-through instead, so its views exist from the first frame.
it('draws the hidden tab (see-through, under the shown one), never display: none', async () => {
  const view = await render(<RoomTabs tab="people" people={<Text>people</Text>} chat={<Text>chat</Text>} />)
  const style = StyleSheet.flatten(view.getByTestId('room-tab-chat', { includeHiddenElements: true }).props.style)
  expect(style.display).not.toBe('none')
  expect(style).toMatchObject({ opacity: 0, position: 'absolute' })
  expect(StyleSheet.flatten(view.getByTestId('room-tab-people').props.style).opacity ?? 1).toBe(1)
})
