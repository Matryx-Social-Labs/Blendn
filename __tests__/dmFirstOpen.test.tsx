/**
 * SCRUM-1321: a long DM opened for the first time after a sign-in (nothing cached) flickered and would not scroll; the second
 * open was fine. The list's top asks for older pages (`onStartReached`), and the first page paints at offset 0, the top.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { FlatList } from 'react-native'

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
    cancelReveal: jest.fn(),
    revealInConversation: jest.fn(),
  },
}))
const mockLive: { onMessage?: (data: unknown) => void; onRevealed?: () => void }[] = []
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
let mockToastInset = 0
jest.mock('../components/toastDock', () => ({ ...jest.requireActual('../components/toastDock'), useToastInset: () => mockToastInset }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))

/* eslint-disable import/first */
import PrivateChat from '../app/private-chat/[conversationId]'
import { apiClient } from '../lib/apiClient'
import { clearOutbox } from '../lib/chatOutbox'
import { queryCache } from '../lib/queryCache'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const friend = { id: 'c1', otherUser: { id: 'u-c', name: 'Mika', image: null }, fromMatch: false, pseudonymous: false, youRevealed: true, theyRevealed: true, revealRequested: false }
const at = (n: number) => new Date(Date.UTC(2026, 10, 20, 9) + n * 60_000).toISOString()
const message = (n: number) => ({ id: `m${n}`, conversationId: 'c1', senderId: n % 2 ? 'u-c' : 'u-a', sender: { id: 'u-c', name: null, image: null }, text: `line ${n}`, isRead: true, createdAt: at(n) })
/** A thread of `total` messages served newest first, a page at a time; the cursor is the oldest served. */
const serve = (total: number) =>
  api.getConversationMessages.mockImplementation((async (_c: string, q: { limit?: number; before?: string }) => {
    const top = q.before ? Number(q.before) - 1 : total
    const ids = Array.from({ length: Math.min(q.limit ?? 50, top) }, (_, i) => top - i)
    const oldest = ids[ids.length - 1]
    return { success: true, data: { messages: ids.map(message), hasMore: oldest > 1, nextCursor: oldest > 1 ? String(oldest) : null } }
  }) as never)
const reads = () => api.getConversationMessages.mock.calls.map(([, q]) => (q as { before?: string })?.before ?? 'newest')
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve()
  })
}
const VIEW = 700
const CONTENT = 3200
const feed = () => screen.getByTestId('dm-feed')
const scrolled = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 393, height: CONTENT }, layoutMeasurement: { width: 393, height: VIEW }, zoomScale: 1 } })
/** The native list's first frame: laid out and measured at offset 0, the top — before the jump to the newest has landed. */
const firstFrame = async () => {
  await act(async () => fireEvent(feed(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: VIEW } } }))
  await act(async () => fireEvent(feed(), 'contentSizeChange', 393, CONTENT))
  await flush()
}

beforeEach(() => {
  jest.clearAllMocks()
  clearOutbox()
  queryCache.invalidate('private_messages_')
  mockParams = { conversationId: 'c1' }
  mockAuth.user = { id: 'u-a' }
  api.getConversation.mockResolvedValue({ success: true, data: friend } as never)
  serve(600)
})

describe('a long DM, opened with nothing cached (SCRUM-1321)', () => {
  let responder: jest.SpyInstance
  const scrollToEnd = jest.fn()
  beforeEach(() => {
    responder = jest.spyOn(FlatList.prototype, 'getScrollResponder').mockReturnValue({ scrollToEnd } as never)
  })
  afterEach(() => responder.mockRestore())

  it('reads the newest page only: the first frame at the top is not the reader asking for older ones', async () => {
    await render(<PrivateChat />)
    await flush()
    await firstFrame()
    expect(reads()).toEqual(['newest'])
  })

  it('reads the next older page once the reader scrolls up to the top, and only then', async () => {
    await render(<PrivateChat />)
    await flush()
    await firstFrame()
    // Landed at the newest, then the reader's own drag to the top.
    await act(async () => fireEvent.scroll(feed(), scrolled(CONTENT - VIEW)))
    await act(async () => fireEvent(feed(), 'scrollBeginDrag', scrolled(CONTENT - VIEW)))
    await act(async () => fireEvent.scroll(feed(), scrolled(0)))
    await flush()
    expect(reads()).toEqual(['newest', '551'])
  })

  /* Android, driven: a fling's last scroll event came 144 px short of the top; the one at 0 was throttled away. */
  it('reads the next older page from near the top, not only at its very first pixel', async () => {
    await render(<PrivateChat />)
    await flush()
    await firstFrame()
    await act(async () => fireEvent.scroll(feed(), scrolled(CONTENT - VIEW)))
    await act(async () => fireEvent(feed(), 'scrollBeginDrag', scrolled(CONTENT - VIEW)))
    await act(async () => fireEvent.scroll(feed(), scrolled(144)))
    await flush()
    expect(reads()).toEqual(['newest', '551'])
  })

  /*
   * A drag that starts at the newest message reports "at the end" for its first events. Taken as the reader being back at the
   * end, the list followed again mid-drag, and every row laid out under the thumb pulled it back to the newest: it would not
   * scroll (driven on the Android emulator, SCRUM-1321). The room fixed this for itself on 2026-11-10.
   */
  it('a drag from the newest message is the reader’s: rows laid out under it do not pull it back', async () => {
    await render(<PrivateChat />)
    await flush()
    await firstFrame()
    await act(async () => fireEvent.scroll(feed(), scrolled(CONTENT - VIEW)))
    scrollToEnd.mockClear()
    await act(async () => fireEvent(feed(), 'scrollBeginDrag', scrolled(CONTENT - VIEW)))
    await act(async () => fireEvent.scroll(feed(), scrolled(CONTENT - VIEW - 30)))
    await act(async () => fireEvent(feed(), 'contentSizeChange', 393, CONTENT + 400))
    expect(scrollToEnd).not.toHaveBeenCalled()
  })

  it('a drag that comes to rest at the newest message follows it again: the next arrival is kept in view', async () => {
    await render(<PrivateChat />)
    await flush()
    await firstFrame()
    await act(async () => fireEvent(feed(), 'scrollBeginDrag', scrolled(CONTENT - VIEW)))
    await act(async () => fireEvent.scroll(feed(), scrolled(1000)))
    await act(async () => fireEvent(feed(), 'scrollEndDrag', scrolled(CONTENT - VIEW)))
    await act(async () => fireEvent(feed(), 'momentumScrollEnd', scrolled(CONTENT - VIEW)))
    scrollToEnd.mockClear()
    await act(async () => fireEvent(feed(), 'contentSizeChange', 393, CONTENT + 120))
    expect(scrollToEnd).toHaveBeenCalled()
  })

  /* Android, driven: the app's own animated jump reports momentum too, and lands short while the new row lays out. */
  it('the app’s own jump to the newest, landing short, keeps following: the row being laid out is brought into view', async () => {
    await render(<PrivateChat />)
    await flush()
    await firstFrame()
    await act(async () => fireEvent(feed(), 'momentumScrollBegin', scrolled(CONTENT - VIEW - 300)))
    await act(async () => fireEvent(feed(), 'momentumScrollEnd', scrolled(CONTENT - VIEW - 300)))
    scrollToEnd.mockClear()
    await act(async () => fireEvent(feed(), 'contentSizeChange', 393, CONTENT + 120))
    expect(scrollToEnd).toHaveBeenCalled()
  })

  it('a fling up from the newest message stays the reader’s through its momentum, and follows again only if it rests at the end', async () => {
    await render(<PrivateChat />)
    await flush()
    await firstFrame()
    const fling = (y: number) => ({ nativeEvent: { ...scrolled(y).nativeEvent, velocity: { x: 0, y: 2.4 } } })
    await act(async () => fireEvent(feed(), 'scrollBeginDrag', scrolled(CONTENT - VIEW)))
    // The finger lifts while still near the end; momentum carries the list up.
    await act(async () => fireEvent(feed(), 'scrollEndDrag', fling(CONTENT - VIEW - 20)))
    await act(async () => fireEvent(feed(), 'momentumScrollBegin', scrolled(CONTENT - VIEW - 40)))
    scrollToEnd.mockClear()
    await act(async () => fireEvent(feed(), 'contentSizeChange', 393, CONTENT + 120))
    expect(scrollToEnd).not.toHaveBeenCalled()
    await act(async () => fireEvent(feed(), 'momentumScrollEnd', scrolled(900)))
    await act(async () => fireEvent(feed(), 'contentSizeChange', 393, CONTENT + 240))
    expect(scrollToEnd).not.toHaveBeenCalled()
  })

  /* Android, driven: from 150 rows up the jump lands short of rows not yet measured, and nothing carried it the rest of the way. */
  it('the jump to the newest follows the end until it gets there', async () => {
    await render(<PrivateChat />)
    await flush()
    await firstFrame()
    await act(async () => fireEvent(feed(), 'scrollBeginDrag', scrolled(CONTENT - VIEW)))
    await act(async () => fireEvent(feed(), 'scrollEndDrag', scrolled(200)))
    await act(async () => fireEvent.scroll(feed(), scrolled(200)))
    await act(async () => fireEvent.press(screen.getByTestId('chat-newest')))
    scrollToEnd.mockClear()
    await act(async () => fireEvent(feed(), 'contentSizeChange', 393, CONTENT + 900))
    expect(scrollToEnd).toHaveBeenCalled()
  })

  /*
   * An older page keeps the reader on the message they were reading. Anchored on row 0, the day pill — whose key every
   * older page of the same day keeps — the list held the pill in place, so the reader sat at the top of the new page with
   * nothing to scroll up into, and paging stopped (driven, Android).
   */
  it('keeps the reader’s place by the first message, not by the day pill above it', async () => {
    await render(<PrivateChat />)
    await flush()
    const data = feed().props.data as { kind: string }[]
    expect(data[0].kind).toBe('separator')
    expect(data[1].kind).toBe('message')
    // FlatList moves the index past its header: row 1 of the data.
    expect(feed().props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 2 })
  })

  /* Android, driven: the pill tapped while a fling still coasts; the jump's own momentum end landed short and stopped the follow. */
  it('the pill tapped mid-fling still follows the end until it gets there', async () => {
    await render(<PrivateChat />)
    await flush()
    await firstFrame()
    const fling = (y: number) => ({ nativeEvent: { ...scrolled(y).nativeEvent, velocity: { x: 0, y: 2.4 } } })
    await act(async () => fireEvent(feed(), 'scrollBeginDrag', scrolled(CONTENT - VIEW)))
    await act(async () => fireEvent.scroll(feed(), scrolled(600)))
    await act(async () => fireEvent(feed(), 'scrollEndDrag', fling(400)))
    await act(async () => fireEvent.press(screen.getByTestId('chat-newest')))
    await act(async () => fireEvent(feed(), 'momentumScrollEnd', scrolled(CONTENT - VIEW - 900)))
    scrollToEnd.mockClear()
    await act(async () => fireEvent(feed(), 'contentSizeChange', 393, CONTENT + 900))
    expect(scrollToEnd).toHaveBeenCalled()
  })
})
