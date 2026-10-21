import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'

/**
 * The room (Flow 5 room frames, R2-D2, R3-D5), rendered: what it reads, what
 * it refuses to load, and every state it can be in — empty, failed, gone,
 * removed, a send refused for its links, the composer's locks in the server's
 * words, and a mute that lands while you are here.
 */
let mockParams: Record<string, string> = { id: 'g1' }
const mockMessage: Array<(d: { message: Record<string, unknown> }) => void> = []
const mockMuted: Array<(d: { userId: string; muted: boolean; reason?: string }) => void> = []

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  // The room reads a Blend's chrome on focus; a room that is not a Blend's reads nothing.
  useIsFocused: () => true,
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ addListener: () => ({ remove: () => {} }), play: () => {} }), VideoView: () => null }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), journey: jest.fn() } }))
// One object per account: the room adopts the user when its identity changes.
const mockAuth: { user: { id: string; name: string }; loading: boolean } = { user: { id: 'u-a', name: 'Asha' }, loading: false }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getChatMessages: jest.fn(),
    getChatGroups: jest.fn(),
    sendChatMessage: jest.fn(),
    reactToChatMessage: jest.fn(),
    rejoinChatGroup: jest.fn(),
  },
}))
jest.mock('../lib/socketClient', () => {
  const noop = () => () => {}
  return {
    subscribeToLiveEnded: noop,
    subscribeToChatMessage: (_room: string, cb: never) => {
      mockMessage.push(cb)
      return () => {}
    },
    subscribeToChatTyping: noop,
    subscribeToChatReaction: noop,
    subscribeToChatMessageDeleted: noop,
    subscribeToChatMemberBanned: noop,
    subscribeToChatMemberLeft: noop,
    subscribeToChatMemberMuted: (_room: string, cb: never) => {
      mockMuted.push(cb)
      return () => {}
    },
    rejoinChatSocket: jest.fn(),
    startTyping: jest.fn(),
    stopTyping: jest.fn(),
  }
})
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: () => () => {} }))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: () => ({ state: 'connected', connected: true }) }))
jest.mock('../components/RealtimeStatusBanner', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/chat/RoomGuidelinesBanner', () => ({ RoomGuidelinesBanner: () => null }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/notifications', () => ({ useActiveThread: jest.fn() }))

/* eslint-disable import/first */
import GroupChat from '../app/chat/[id]'
import { apiClient } from '../lib/apiClient'
import { clearOutbox, keepFailed, roomThread } from '../lib/chatOutbox'
import { resetRoomMembership } from '../lib/roomMembership'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const COVER = 'https://cdn.blendn.app/covers/vinyl.jpg'
const ATTACKER = 'https://attacker.example/p.png'
const eventRow = { id: 'g1', name: 'Vinyl Night', memberCount: 12, event: { id: 'e1', title: 'Vinyl Night', coverImageUrl: COVER } }
const page = (messages: unknown[]) => ({ success: true, data: { messages, pagination: { hasMore: false, nextCursor: null } } })
const theirs = { id: 'm1', user: { id: 'u-c', name: 'Cosmic Panda' }, content: 'Anyone near the stage?', type: 'text', created_at: '2026-10-15T19:00:00.000Z' }

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve()
  })
}
const open = async () => {
  await render(<GroupChat />)
  await flush()
}
const send = async (text: string) => {
  await act(async () => fireEvent.changeText(screen.getByLabelText('Message'), text))
  await act(async () => fireEvent.press(screen.getByLabelText('Send')))
  await flush()
}
type HostNode = { props?: Record<string, unknown>; children?: (HostNode | string)[] | null }
/** Every image URI any host view on screen was handed. */
const imageUris = (): string[] => {
  const walk = (n: HostNode | string | null): string[] => {
    if (!n || typeof n === 'string') return []
    const sources = [n.props?.source, n.props?.src].flat() as ({ uri?: string } | string | undefined)[]
    const own = sources.map((x) => (typeof x === 'string' ? x : x?.uri)).filter((x): x is string => typeof x === 'string')
    return [...own, ...(n.children ?? []).flatMap(walk)]
  }
  const root = screen.toJSON() as HostNode | HostNode[] | null
  return (Array.isArray(root) ? root : [root]).flatMap(walk)
}

beforeEach(() => {
  jest.clearAllMocks()
  clearOutbox()
  resetRoomMembership()
  mockMuted.length = 0
  mockMessage.length = 0
  mockParams = { id: 'g1' }
  mockAuth.user = { id: 'u-a', name: 'Asha' }
  api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [eventRow] } } as never)
  api.getChatMessages.mockResolvedValue(page([theirs]) as never)
})

describe('nothing is fetched from a host the server did not name', () => {
  it('ignores an image in the route, draws the server’s cover, and puts the server’s title over the route’s', async () => {
    mockParams = { id: 'g1', roomName: 'Blendn Support', eventTitle: 'Blendn Support', eventImage: ATTACKER }
    await open()
    expect(imageUris().some((u) => u.includes('attacker.example'))).toBe(false)
    expect(imageUris()).toContain(COVER)
    expect(screen.queryByText('Blendn Support')).toBeNull()
    expect(screen.getAllByText('Vinyl Night').length).toBeGreaterThan(0)
  })

  it('draws no cover at all while the server has not answered', async () => {
    mockParams = { id: 'g1', eventImage: ATTACKER }
    api.getChatGroups.mockReturnValue(new Promise(() => {}) as never)
    await open()
    expect(imageUris().some((u) => u.includes('attacker.example'))).toBe(false)
  })
})

describe('one account’s unsent message is never the next one’s', () => {
  const unsent = {
    message_id: 'temp-1',
    sender_id: 'u-a',
    sender_name: 'You',
    message_text: 'A’s unsent line',
    message_type: 'text',
    reply_to_message_id: null,
    created_at: '2026-10-15T19:01:00.000Z',
    failed: true,
  }

  it('shows B nothing of A’s in a room they share, and B never sends it', async () => {
    keepFailed(roomThread('g1', 'u-a'), [unsent])
    mockAuth.user = { id: 'u-b', name: 'Bilal' }
    await open()
    expect(screen.queryByText('A’s unsent line')).toBeNull()
    expect(screen.queryByText('Not sent · Tap to retry', { includeHiddenElements: true })).toBeNull()
    expect(api.sendChatMessage).not.toHaveBeenCalled()
  })

  it('gives A their own back, and A’s retry sends it', async () => {
    keepFailed(roomThread('g1', 'u-a'), [unsent])
    api.sendChatMessage.mockResolvedValue({ success: true, data: { id: 'm9' } } as never)
    await open()
    expect(screen.getByText('Not sent · Tap to retry', { includeHiddenElements: true })).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByLabelText(/^Not sent: A’s unsent line/)))
    await flush()
    expect(api.sendChatMessage).toHaveBeenCalledWith('g1', 'A’s unsent line', 'text', undefined, undefined, undefined)
  })
})

describe('the feed’s states', () => {
  it('reads the room: their message, in the room’s voice', async () => {
    await open()
    expect(screen.getByText('Anyone near the stage?')).toBeTruthy()
    expect(screen.getAllByText('Cosmic Panda').length).toBeGreaterThan(0)
  })

  it('an empty room offers a starter', async () => {
    api.getChatMessages.mockResolvedValue(page([]) as never)
    await open()
    expect(screen.getByText('Start the room conversation')).toBeTruthy()
  })

  it('a read that fails says so and offers to try again', async () => {
    api.getChatMessages.mockResolvedValue({ success: false, error: 'Network request failed' } as never)
    await open()
    expect(screen.getByText('Couldn’t load this chat')).toBeTruthy()
  })

  it('a room the server no longer has goes back', async () => {
    api.getChatMessages.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'Chat group not found' } as never)
    await open()
    expect(screen.getByText('This room isn’t here any more')).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()
  })

  it('removed: the server’s sentence, and no composer', async () => {
    api.getChatMessages.mockResolvedValue({ success: false, errorCode: 'USER_BANNED', error: 'The organiser removed you from this chat.' } as never)
    await open()
    expect(screen.getByText('You were removed from this room')).toBeTruthy()
    expect(screen.getByText('The organiser removed you from this chat.')).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()
  })
})

describe('a send the server refuses', () => {
  it('too many links: the bubble stays, "Not sent · Two links at most", and the composer stays open', async () => {
    api.sendChatMessage.mockResolvedValue({ success: false, errorCode: 'SPAM_BLOCKED', error: 'Too many links (3)' } as never)
    await open()
    await send('a.io b.io c.io')
    expect(screen.getByLabelText(/^Not sent: a\.io b\.io c\.io/)).toBeTruthy()
    expect(screen.getByText('Not sent · Two links at most', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByLabelText('Message')).toBeTruthy()
  })

  it.each([
    ['USER_MUTED', 'You have been muted in this chat', 'Muted'],
    ['CHAT_LOCKED', 'This chat has been locked by the organiser', 'Read only'],
    ['CHAT_CLOSED', 'This chat opens 24 hours before the event starts.', 'Not open yet'],
    ['CHAT_CLOSED', 'This event is no longer available.', 'This room is hidden'],
    ['NOT_CHECKED_IN', 'RSVP to this event to chat', 'RSVP to this event to join the chat'],
  ])('%s locks the composer in the server’s words', async (errorCode, error, title) => {
    api.sendChatMessage.mockResolvedValue({ success: false, errorCode, error } as never)
    await open()
    await send('hello')
    expect(screen.getByLabelText(`${title}. ${error}`)).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()
  })
})

it('a mute that lands while you are here flips the composer, and says it just happened', async () => {
  await open()
  expect(screen.getByLabelText('Message')).toBeTruthy()
  // Somebody else's mute is not yours.
  await act(async () => mockMuted.forEach((f) => f({ userId: 'u-c', muted: true })))
  expect(screen.getByLabelText('Message')).toBeTruthy()
  await act(async () => mockMuted.forEach((f) => f({ userId: 'u-a', muted: true })))
  expect(screen.queryByLabelText('Message')).toBeNull()
  expect(screen.getByText('Just now · the organiser muted you')).toBeTruthy()
})

describe('the newest chip counts a message once', () => {
  it('a redelivered message, or one history already brought, is not new', async () => {
    // Arrange: reading back, away from the end.
    await open()
    await act(async () =>
      fireEvent.scroll(screen.getByTestId('room-feed'), {
        nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 4000, width: 400 }, layoutMeasurement: { height: 800, width: 400 } },
      })
    )
    const deliver = (id: string) => {
      const message = { id, userId: 'u-c', userName: 'Cosmic Panda', content: `hi ${id}`, type: 'text', createdAt: '2026-10-15T19:05:00.000Z' }
      mockMessage.forEach((cb) => cb({ message }))
    }
    // Act: one new message delivered twice, and the history's m1 again.
    await act(async () => {
      deliver('m2')
      deliver('m2')
      deliver('m1')
    })
    await flush()
    // Assert
    expect(screen.getByLabelText('1 new, jump to the newest')).toBeTruthy()
  })
})

describe('a message that arrives rises (#13), only for a reader at the end', () => {
  const deliver = (id: string) => {
    const message = { id, userId: 'u-c', userName: 'Cosmic Panda', content: `hi ${id}`, type: 'text', createdAt: '2026-10-15T19:05:00.000Z' }
    mockMessage.forEach((cb) => cb({ message }))
  }
  const scrollTo = (y: number) =>
    act(async () =>
      fireEvent.scroll(screen.getByTestId('room-feed'), {
        nativeEvent: { contentOffset: { y }, contentSize: { height: 4000, width: 400 }, layoutMeasurement: { height: 800, width: 400 } },
      })
    )
  type Host = { props?: Record<string, unknown>; parent: Host | null }
  const enteringOf = (text: string) => {
    const row = screen.getByText(text)
    let node = row as unknown as Host | null
    while (node && !node.props?.entering) node = node.parent
    return node?.props?.entering
  }

  it('at the end: the new message has an entering animation, the history does not', async () => {
    await open()
    await scrollTo(3200)
    await act(async () => deliver('m2'))
    await flush()
    expect(enteringOf('hi m2')).toBeDefined()
    expect(enteringOf('Anyone near the stage?')).toBeUndefined()
  })

  it('reading back: a new message just appears (the list never moves under the reader)', async () => {
    await open()
    await scrollTo(0)
    await act(async () => deliver('m3'))
    await flush()
    expect(enteringOf('hi m3')).toBeUndefined()
  })
})

describe('the composer rides the keyboard', () => {
  /*
   * The floating dock is absolutely positioned. Directly inside the
   * KeyboardAvoidingView it ignored the avoider's padding (an absolute child
   * sits against the padding box) and stayed under the keyboard; it must sit
   * in the View the padding shrinks.
   */
  it('the room’s composer is inside the frame the keyboard padding shrinks', async () => {
    await open()
    const frame = screen.getByTestId('chat-keyboard-dock-frame')
    // Its parent is the avoider's own View — the one that takes the keyboard's padding.
    const avoider = frame.parent
    // The avoider is the keyboard library's (jest draws it as a plain View): `padding` is its own animated style, in the real one.
    expect(avoider?.props.testID).not.toBe('chat-keyboard-frame')
    expect(avoider?.parent?.props.testID).toBe('chat-keyboard-frame')
    expect(within(frame).getByTestId('room-composer')).toBeTruthy()
  })
})
