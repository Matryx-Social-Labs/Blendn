/**
 * A direct message (Flow 5 DM frames, R3-0, R3-D5), rendered: the header's
 * face only ever from the server's answer, an account's unsent message never
 * the next one's, the reveal bar's states, the photo gate, and the thread's
 * empty, failed and ended states.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import { chatHeaderBottom } from '../components/chat/ChatHeader'
import { FlatList, StyleSheet } from 'react-native'

let mockParams: Record<string, string> = { conversationId: 'c1' }
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
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
const mockLive: { onMessage?: (data: unknown) => void }[] = []
const mockToast = jest.fn()
jest.mock('../lib/socketClient', () => {
  const noop = () => () => {}
  return {
    subscribeToConversation: (_c: string, handlers: { onMessage?: (data: unknown) => void }) => {
      mockLive.push(handlers)
      return () => {}
    },
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
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
jest.mock('../components/RealtimeStatusBanner', () => () => null)
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))

/* eslint-disable import/first */
import PrivateChat from '../app/private-chat/[conversationId]'
import { apiClient } from '../lib/apiClient'
import { clearOutbox, dmThread, keepFailed } from '../lib/chatOutbox'
import { RECEIPT_POLL_MS } from '../lib/receipts'
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
  mockLive.length = 0
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

describe('a warning before contact details in a DM (5.10)', () => {
  it('says it will send — a DM is flagged, never removed — and keeps Send enabled', async () => {
    await open()
    await act(async () => fireEvent.changeText(screen.getByLabelText('Message'), 'call me on 9876543210'))
    expect(screen.getByText(/This looks like a phone number\. It will send\./)).toBeTruthy()
    expect(screen.queryByText(/removed/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState).toMatchObject({ disabled: false })
    await act(async () => fireEvent.changeText(screen.getByLabelText('Message'), 'see you there'))
    expect(screen.queryByText(/This looks like/)).toBeNull()
  })
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
    expect(screen.getByText('They see you · you don’t see them')).toBeTruthy()
    expect(screen.queryByLabelText('Show them who you are')).toBeNull()
  })

  it('both revealed: no bar, and the line says so', async () => {
    api.getConversation.mockResolvedValue({ success: true, data: named } as never)
    await open()
    expect(screen.getByText('You see each other')).toBeTruthy()
    expect(screen.queryByLabelText('Show them who you are')).toBeNull()
  })
})

// C30 (DS-17's caller half): "Message Mika Sengupta-Rao" wrapped the placeholder to two lines. A real name is its
// first name; a pseudonym is whole, never "Message Arctic". Negative control: the full name fails the first case.
describe('the composer’s placeholder', () => {
  it('a real name: the first name only', async () => {
    api.getConversation.mockResolvedValue({ success: true, data: { ...named, otherUser: { ...named.otherUser, name: 'Mika Sengupta-Rao' } } } as never)
    await open()
    expect(screen.getByPlaceholderText('Message Mika')).toBeTruthy()
  })

  it('a pseudonym: whole', async () => {
    await open()
    expect(screen.getByPlaceholderText('Message Arctic Falcon')).toBeTruthy()
  })
})

describe('the reveal strip is not over the thread (TG-04, RC audit C6)', () => {
  it('the feed’s window starts under the strip’s measured height, so the match card is never behind it', async () => {
    await open()
    const H = 260
    await act(async () => fireEvent(screen.getByTestId('dm-reveal-strip'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: H } } }))
    const window = StyleSheet.flatten(screen.getByTestId('dm-feed').props.style)
    expect(window.marginTop).toBeGreaterThanOrEqual(chatHeaderBottom(0) + H)
  })
})

describe('the reveal panel folds away (drive: it stayed over the thread on Android)', () => {
  const feed = () => screen.getByTestId('dm-feed')
  const touch = () => act(async () => fireEvent(feed(), 'touchEnd'))
  // Where the first message starts: the window's top (under the strip, TG-04) plus the content's padding.
  const padding = () =>
    (StyleSheet.flatten(feed().props.style).marginTop as number) +
    ((feed().props.contentContainerStyle as { paddingTop?: number }[]).flat().map((x) => x?.paddingTop).find((x) => x !== undefined) ?? 0)

  it('a touch on the thread folds it, and the feed gives its room back', async () => {
    await open()
    expect(screen.getByLabelText('Show them who you are')).toBeTruthy()
    await touch()
    await flush()
    expect(screen.queryByLabelText('Show them who you are')).toBeNull()
    // The header still says where things stand.
    expect(screen.getByText('You’re both anonymous here')).toBeTruthy()
  })

  it('a scroll folds it when the finger lifts', async () => {
    await open()
    await act(async () => fireEvent(feed(), 'scrollEndDrag', { nativeEvent: { contentOffset: { x: 0, y: 0 }, contentSize: { width: 393, height: 2000 }, layoutMeasurement: { width: 393, height: 800 }, velocity: { x: 0, y: 0 } } }))
    await flush()
    expect(screen.queryByLabelText('Show them who you are')).toBeNull()
  })

  it('nothing moves while the finger is down: the first tap on a message is not cancelled by the feed shifting', async () => {
    await open()
    // The panel's height is measured on layout; give it one so the feed has something to give back.
    let panel = screen.getByTestId('dm-reveal').parent
    while (panel && !panel.props.onLayout) panel = panel.parent
    await act(async () => panel!.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 150 } } }))
    const before = padding()
    await act(async () => fireEvent(feed(), 'touchStart'))
    await act(async () => fireEvent(feed(), 'touchMove'))
    await flush()
    expect(screen.getByLabelText('Show them who you are')).toBeTruthy()
    expect(padding()).toBe(before)
    // The press lands on the message first, and only then does the panel fold.
    await act(async () => fireEvent(feed(), 'touchEnd'))
    await flush()
    expect(screen.queryByLabelText('Show them who you are')).toBeNull()
    expect(padding()).toBeLessThan(before as number)
  })

  it('the header’s face and line bring it back: there is still one reveal control', async () => {
    await open()
    await touch()
    await flush()
    await act(async () => fireEvent.press(screen.getByLabelText('Arctic Falcon')))
    await flush()
    expect(screen.getByLabelText('Show them who you are')).toBeTruthy()
  })

  it('a new state brings it back: they asked, or you did', async () => {
    api.requestReveal.mockResolvedValue({ success: true } as never)
    await open()
    await touch()
    await flush()
    await act(async () => fireEvent.press(screen.getByLabelText('Arctic Falcon')))
    await flush()
    await act(async () => fireEvent.press(screen.getByLabelText('Ask them')))
    await flush()
    expect(screen.getByText('Asked · they’ll decide in their own time')).toBeTruthy()
    await touch()
    await flush()
    expect(screen.queryByText('Asked · they’ll decide in their own time')).toBeNull()
  })

  it('once both have revealed there is no panel to fold and the header is their profile', async () => {
    api.getConversation.mockResolvedValue({ success: true, data: named } as never)
    await open()
    await touch()
    await flush()
    expect(screen.queryByLabelText('Show them who you are')).toBeNull()
    expect(screen.getByLabelText('Mika')).toBeTruthy()
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

  // RC drive 3 D-A: at AX XXXL the opener and Say hi outgrow the frame, and following the end hid the opener's top under the
  // reveal bar on open. An empty thread opens at its start; a thread with a message still follows its end.
  it.each([
    ['empty: opens at its start (the opener), not pinned to its end', [], 0],
    ['with a message: follows its end', [theirs], 1],
  ])('%s', async (_name, messages, calls) => {
    const scrollToEnd = jest.fn()
    const responder = jest.spyOn(FlatList.prototype, 'getScrollResponder').mockReturnValue({ scrollToEnd } as never)
    try {
      api.getConversationMessages.mockResolvedValue(page(messages) as never)
      await open()
      scrollToEnd.mockClear()
      await act(async () => fireEvent(screen.getByTestId('dm-feed'), 'contentSizeChange', 393, 1400))
      expect(scrollToEnd).toHaveBeenCalledTimes(calls)
    } finally {
      responder.mockRestore()
    }
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

describe('the composer rides the keyboard', () => {
  /*
   * The floating dock is absolutely positioned. Directly inside the
   * KeyboardAvoidingView it ignored the avoider's padding (an absolute child
   * sits against the padding box) and stayed under the keyboard; it must sit
   * in the View the padding shrinks.
   */
  it('the DM’s composer is inside the frame the keyboard padding shrinks', async () => {
    await open()
    const frame = screen.getByTestId('chat-keyboard-dock-frame')
    // Its parent is the avoider's own View — the one that takes the keyboard's padding.
    const avoider = frame.parent
    // The avoider is the keyboard library's (jest draws it as a plain View): `padding` is its own animated style, in the real one.
    expect(avoider?.props.testID).not.toBe('chat-keyboard-frame')
    expect(avoider?.parent?.props.testID).toBe('chat-keyboard-frame')
    expect(within(frame).getByTestId('dm-composer')).toBeTruthy()
  })
})

describe('the receipt catches up with a read the socket never announced', () => {
  it('re-reads while your last message waits, and turns to Read', async () => {
    // Arrange: your message, not read yet; the server will say it was read. The poll's timer is caught, not waited for.
    const polls: Array<() => void> = []
    const realSetInterval = global.setInterval
    const spy = jest.spyOn(global, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === RECEIPT_POLL_MS) polls.push(fn)
      return realSetInterval(() => {}, 1e9)
    }) as typeof setInterval)
    const mine = { id: 'm9', conversationId: 'c1', senderId: 'u-a', sender: { id: 'u-a', name: null, image: null }, text: 'On my way', isRead: false, createdAt: '2026-10-15T19:05:00.000Z' }
    api.getConversation.mockResolvedValue({ success: true, data: named } as never)
    api.getConversationMessages.mockResolvedValue(page([mine]) as never)
    await open()
    expect(screen.getByText('Sent', { includeHiddenElements: true })).toBeTruthy()
    api.getConversationMessages.mockResolvedValue(page([{ ...mine, isRead: true }]) as never)
    // Act: the poll fires.
    expect(polls.length).toBeGreaterThan(0)
    await act(async () => polls[polls.length - 1]())
    await flush()
    // Assert
    expect(screen.queryByText('Sent', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByText('Read', { includeHiddenElements: true })).toBeTruthy()
    spy.mockRestore()
  })
})

describe('a message that arrives rises (#13), only for a reader at the end', () => {
  const deliver = (id: string) => {
    const message = { id, conversationId: 'c1', senderId: 'u-c', sender: { id: 'u-c', name: null, image: null }, text: `hi ${id}`, isRead: false, createdAt: '2026-10-15T19:05:00.000Z' }
    mockLive.forEach((h) => h.onMessage?.({ message }))
  }
  const scrollTo = (y: number) =>
    act(async () =>
      fireEvent.scroll(screen.getByTestId('dm-feed'), {
        nativeEvent: { contentOffset: { y }, contentSize: { height: 4000, width: 400 }, layoutMeasurement: { height: 800, width: 400 } },
      })
    )
  type Host = { props?: Record<string, unknown>; parent: Host | null }
  const enteringOf = (text: string) => {
    let node = screen.getByText(text) as unknown as Host | null
    while (node && !node.props?.entering) node = node.parent
    return node?.props?.entering
  }

  it('at the end: theirs has an entering animation, the history does not', async () => {
    await open()
    await scrollTo(3200)
    await act(async () => deliver('m2'))
    await flush()
    expect(enteringOf('hi m2')).toBeDefined()
    expect(enteringOf('See you at the bar?')).toBeUndefined()
  })

  it('reading back: it just appears', async () => {
    await open()
    await scrollTo(0)
    await act(async () => deliver('m3'))
    await flush()
    expect(enteringOf('hi m3')).toBeUndefined()
  })
})

describe('a conversation that fails to load (r7 M10)', () => {
  it('is the DS failure state: no "Chat" posing as a person, and no composer under it', async () => {
    api.getConversation.mockResolvedValue({ success: false, error: 'offline' } as never)
    api.getConversationMessages.mockRejectedValue(new Error('offline'))
    await open()
    expect(screen.getByTestId('dm-failed')).toBeTruthy()
    expect(screen.queryByText('Chat')).toBeNull()
    expect(screen.getByText('Conversation')).toBeTruthy()
    expect(screen.queryByTestId('dm-composer')).toBeNull()
  })

  it('Try again brings the composer back once the thread loads', async () => {
    api.getConversation.mockResolvedValue({ success: true, data: anonymous } as never)
    api.getConversationMessages.mockRejectedValueOnce(new Error('offline'))
    await open()
    expect(screen.queryByTestId('dm-composer')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await flush()
    expect(screen.getByTestId('dm-composer')).toBeTruthy()
  })
})

describe('a jump from one open DM to another (RC drive 2 D-E, privacy)', () => {
  it('never saves DM 1’s text as DM 2’s draft, and DM 2 shows its own', async () => {
    const { draftOf, setDraft } = jest.requireActual('../lib/chatOutbox') as typeof import('../lib/chatOutbox')
    setDraft(dmThread('c2', 'u-a'), 'kai’s own')
    const view = await render(<PrivateChat />)
    await flush()
    await act(async () => fireEvent.changeText(screen.getByLabelText('Message'), 'only for zoe'))
    // A push or deep link: the same screen instance, a new conversationId (router.push / replace).
    mockParams = { conversationId: 'c2' }
    await view.rerender(<PrivateChat />)
    await flush()
    expect(screen.getByLabelText('Message').props.value).toBe('kai’s own')
    await view.unmount()
    expect(draftOf(dmThread('c1', 'u-a'))).toBe('only for zoe')
    expect(draftOf(dmThread('c2', 'u-a'))).toBe('kai’s own')
  })
})

/*
 * Audit M4: a DM is never removed after delivery (one that fails moderation is stored hidden and never sent), so the
 * two cases are a send withheld by moderation (the dashed placeholder and the toast) and, in the history, your own
 * photo that was withheld: the sender's view is the 220x160 dashed frame (round 4 #37), never a text-sized pill.
 */
describe('a DM withheld by moderation', () => {
  it('withheld at send: the dashed placeholder, and the toast says so', async () => {
    api.getConversationMessages.mockResolvedValue(page([]) as never)
    api.sendPrivateMessage.mockResolvedValue({ success: true, data: { id: 'm2', moderation_hidden: true } } as never)
    await open()
    await act(async () => fireEvent.press(screen.getByLabelText(/Say hi/)))
    await flush()
    expect(screen.getByTestId('dm-bubble-m2-bubble').props.accessibilityLabel).toMatch(/^You, This message was removed by moderation, /)
    expect(screen.getByTestId('dm-bubble-m2-dashed', { includeHiddenElements: true })).toBeTruthy()
    expect(mockToast).toHaveBeenCalledWith('That message wasn’t delivered.', 'info')
  })

  it('your withheld photo: the photo-sized frame with the shield, read as a removed photo (round 4 #37)', async () => {
    const minePhoto = { ...theirs, id: 'm3', senderId: 'u-a', sender: { id: 'u-a', name: null, image: null }, text: null, mediaUrl: 'https://cdn.blendn.app/dm/p.jpg', mediaType: 'image', moderation_hidden: true }
    api.getConversationMessages.mockResolvedValue(page([theirs, minePhoto]) as never)
    await open()
    const frame = screen.getByTestId('dm-photo-m3-bubble')
    expect(frame.props.accessibilityLabel).toMatch(/^You, Photo removed by moderation, /)
    expect(StyleSheet.flatten(frame.props.style)).toMatchObject({ width: 220, height: 160 })
    expect(screen.getByText('Removed by moderation', { includeHiddenElements: true })).toBeTruthy()
    expect(imageUris()).not.toContain(minePhoto.mediaUrl)
  })
})
