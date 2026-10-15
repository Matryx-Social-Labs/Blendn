/**
 * A direct message (Flow 5 DM frames, R3-0, R3-D5), rendered: the header's
 * face only ever from the server's answer, an account's unsent message never
 * the next one's, the reveal bar's states, the photo gate, and the thread's
 * empty, failed and ended states.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

let mockParams: Record<string, string> = { conversationId: 'c1' }
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => mockParams,
    Stack: { Screen: () => React.createElement(React.Fragment) },
  }
})
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getConversation: jest.fn(),
    getConversationMessages: jest.fn(),
    sendPrivateMessage: jest.fn(),
    requestReveal: jest.fn(),
    revealInConversation: jest.fn(),
  },
}))
jest.mock('../lib/socketClient', () => {
  const noop = () => () => {}
  return {
    subscribeToConversation: noop,
    subscribeToDelivered: noop,
    startPrivateTyping: jest.fn(),
    stopPrivateTyping: jest.fn(),
    markPrivateMessagesRead: jest.fn(),
  }
})
// One object per account: the screen reloads when `user` changes identity.
const mockAuth: { user: { id: string; image?: string | null } } = { user: { id: 'u-a' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: () => 'connected' }))
jest.mock('../lib/notifications', () => ({ useActiveThread: () => {} }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/RealtimeStatusBanner', () => () => null)
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))

/* eslint-disable import/first */
import PrivateChat from '../app/private-chat/[conversationId]'
import { apiClient } from '../lib/apiClient'
import { clearOutbox, dmThread, keepFailed } from '../lib/chatOutbox'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const ATTACKER = 'https://attacker.example/p.png'
const THEIR_PHOTO = 'https://cdn.blendn.app/u/mika.jpg'
const anonymous = {
  id: 'c1',
  otherUser: { id: 'u-c', name: 'Arctic Falcon', image: null },
  fromMatch: true,
  pseudonymous: true,
  youRevealed: false,
  theyRevealed: false,
  revealRequested: false,
}
const named = { ...anonymous, otherUser: { id: 'u-c', name: 'Mika', image: THEIR_PHOTO }, youRevealed: true, theyRevealed: true }
const theirs = { id: 'm1', conversationId: 'c1', senderId: 'u-c', sender: { id: 'u-c', name: null, image: null }, text: 'See you at the bar?', isRead: true, createdAt: '2026-10-15T19:00:00.000Z' }
const page = (messages: unknown[]) => ({ success: true, data: { messages, hasMore: false, nextCursor: null } })

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
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve()
  })
}
const open = async () => {
  await render(<PrivateChat />)
  await flush()
}

beforeEach(() => {
  jest.clearAllMocks()
  clearOutbox()
  mockParams = { conversationId: 'c1' }
  mockAuth.user = { id: 'u-a' }
  api.getConversation.mockResolvedValue({ success: true, data: anonymous } as never)
  api.getConversationMessages.mockResolvedValue(page([theirs]) as never)
})

describe('the header’s face is only ever the server’s', () => {
  it('draws no route avatar before the server answers', async () => {
    mockParams = { conversationId: 'c1', otherUserName: 'Arctic Falcon', otherUserAvatar: ATTACKER }
    api.getConversation.mockReturnValue(new Promise(() => {}) as never)
    await open()
    expect(imageUris().some((u) => u.includes('attacker.example'))).toBe(false)
  })

  it('draws the server’s photo and name once it answers, never the route’s', async () => {
    mockParams = { conversationId: 'c1', otherUserName: 'Blendn Support', otherUserAvatar: ATTACKER }
    api.getConversation.mockResolvedValue({ success: true, data: named } as never)
    await open()
    expect(imageUris().some((u) => u.includes('attacker.example'))).toBe(false)
    expect(imageUris()).toContain(THEIR_PHOTO)
    expect(screen.queryByText('Blendn Support')).toBeNull()
    expect(screen.getAllByText('Mika').length).toBeGreaterThan(0)
  })
})

it('shows B nothing of A’s unsent DM, and B never sends it', async () => {
  const unsent = { id: 'local-1', conversationId: 'c1', senderId: 'u-a', sender: { id: 'u-a', name: null, image: null }, text: 'A’s unsent DM', isRead: false, createdAt: '2026-10-15T19:01:00.000Z', failed: true }
  keepFailed(dmThread('c1', 'u-a'), [unsent])
  mockAuth.user = { id: 'u-b' }
  await open()
  expect(screen.queryByText('A’s unsent DM')).toBeNull()
  expect(api.sendPrivateMessage).not.toHaveBeenCalled()
})

describe('the reveal bar', () => {
  it('both anonymous: Show them and Ask them; asking turns it to Asked', async () => {
    api.requestReveal.mockResolvedValue({ success: true } as never)
    await open()
    expect(screen.getByText('You’re both anonymous here')).toBeTruthy()
    expect(screen.getByLabelText('Show them who you are')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByLabelText('Ask them')))
    await flush()
    expect(api.requestReveal).toHaveBeenCalledWith('c1')
    expect(screen.getByText('Asked · they’ll decide in their own time')).toBeTruthy()
    expect(screen.queryByLabelText('Ask them')).toBeNull()
  })

  it('you revealed: they can see you, and there is nothing to press', async () => {
    api.getConversation.mockResolvedValue({ success: true, data: { ...anonymous, youRevealed: true } } as never)
    await open()
    expect(screen.getByText('They can see your name. You can’t see theirs yet.')).toBeTruthy()
    expect(screen.queryByLabelText('Show them who you are')).toBeNull()
  })

  it('both revealed: no bar, and the line says so', async () => {
    api.getConversation.mockResolvedValue({ success: true, data: named } as never)
    await open()
    expect(screen.getByText('You can both see each other')).toBeTruthy()
    expect(screen.queryByLabelText('Show them who you are')).toBeNull()
  })
})

describe('photos (R9): only once you can both see each other, or nobody was hidden', () => {
  it.each([
    ['both anonymous', anonymous, false],
    ['only you revealed', { ...anonymous, youRevealed: true }, false],
    ['both revealed', named, true],
    ['never pseudonymous', { ...anonymous, pseudonymous: false }, true],
  ])('%s', async (_name, data, offered) => {
    api.getConversation.mockResolvedValue({ success: true, data } as never)
    await open()
    expect(!!screen.queryByLabelText('Send a photo')).toBe(offered)
  })
})

describe('the thread’s states', () => {
  it('empty: Say hi, which sends at once', async () => {
    api.getConversationMessages.mockResolvedValue(page([]) as never)
    api.sendPrivateMessage.mockResolvedValue({ success: true, data: { ...theirs, id: 'm2', senderId: 'u-a', text: 'Hey 👋' } } as never)
    await open()
    expect(screen.getByText('Say hi to Arctic Falcon.')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByLabelText(/Say hi/)))
    await flush()
    expect(api.sendPrivateMessage).toHaveBeenCalledWith('c1', expect.objectContaining({ text: 'Hey 👋' }))
  })

  it('a read that fails says so and offers to try again', async () => {
    api.getConversationMessages.mockResolvedValue({ success: false, error: 'Network request failed' } as never)
    await open()
    expect(screen.getByText('Couldn’t load this conversation')).toBeTruthy()
    expect(screen.getByLabelText('Try again')).toBeTruthy()
  })

  it('ended: the composer goes, and it never says why', async () => {
    api.getConversationMessages.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'Conversation not found' } as never)
    await open()
    expect(screen.getByText('This conversation has ended')).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()
    expect(screen.queryByText(/block/i)).toBeNull()
  })
})
