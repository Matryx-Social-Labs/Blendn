/**
 * "Add friend" in a match's options (SCRUM-750), rendered: the owner's rule is "if users have matched and they have
 * revealed themselves we can then give an option to add as friend". The server decides (`friend: { state, canAdd }`);
 * the thread draws each state, asks with their real id and never a handle, and says what went wrong in the app's words.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'

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
    sendFriendRequest: jest.fn(),
  },
}))
const mockConversationHandlers: { onRevealed?: (d: { conversationId: string }) => void }[] = []
jest.mock('../lib/socketClient', () => {
  const noop = () => () => {}
  return {
    subscribeToConversation: (_id: string, h: (typeof mockConversationHandlers)[number]) => {
      mockConversationHandlers.push(h)
      return () => mockConversationHandlers.splice(mockConversationHandlers.indexOf(h), 1)
    },
    subscribeToDelivered: noop,
    startPrivateTyping: jest.fn(),
    stopPrivateTyping: jest.fn(),
    markPrivateMessagesRead: jest.fn(),
  }
})
const mockAuth = { user: { id: 'u-a' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
const mockSync: { current?: () => void | Promise<void> } = {}
jest.mock('../lib/useLiveSync', () => ({
  useLiveSync: (o: { onSync: () => void | Promise<void> }) => {
    mockSync.current = o.onSync
    return 'connected'
  },
}))
const mockPush: ((n: { request: { content: { data: Record<string, unknown> } } }) => void)[] = []
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: (fn: (typeof mockPush)[number]) => {
    mockPush.push(fn)
    return { remove: () => mockPush.splice(mockPush.indexOf(fn), 1) }
  },
}))
const mockH: Record<string, jest.Mock> = {}
jest.mock('../lib/haptics', () => ({ H: new Proxy({}, { get: (_t, k: string) => (mockH[k] ??= jest.fn()) }) }))
jest.mock('../lib/notifications', () => ({ useActiveThread: () => {} }))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/RealtimeStatusBanner', () => () => null)
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))

/* eslint-disable import/first */
import { StyleSheet } from 'react-native'
import PrivateChat from '../app/private-chat/[conversationId]'
import { SheetHost } from '../components/SheetHost'
import { apiClient } from '../lib/apiClient'
import { clearOutbox, dmThread, setDraft } from '../lib/chatOutbox'
import { COLOR } from '../lib/design/tokens'
import { closeSheet } from '../lib/sheet'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const revealed = {
  id: 'c1',
  otherUser: { id: 'u-c', name: 'Mika', image: 'https://cdn.blendn.app/u/mika.jpg' },
  fromMatch: true,
  pseudonymous: true,
  youRevealed: true,
  theyRevealed: true,
  revealRequested: false,
}
const withFriend = (friend: unknown, over: Record<string, unknown> = {}) => ({ success: true, data: { ...revealed, friend, ...over } }) as never
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}
const openOptions = async (data: unknown) => {
  api.getConversation.mockResolvedValue(data as never)
  await render(
    <>
      <PrivateChat />
      <SheetHost />
    </>
  )
  await flush()
  await act(async () => fireEvent.press(screen.getByLabelText('Conversation options')))
  await flush()
}
/** The options sheet's own rows: the card in the thread carries the same words. */
const sheet = () => within(screen.getByTestId('sheet-host'))
const colourOf = (text: string) => StyleSheet.flatten(sheet().getByText(text).props.style).color
const card = () => screen.queryByTestId('dm-reveal-friend')

beforeEach(() => {
  jest.clearAllMocks()
  clearOutbox()
  mockParams = { conversationId: 'c1' }
  mockPush.length = 0
  for (const k of Object.keys(mockH)) mockH[k].mockClear()
  api.getConversationMessages.mockResolvedValue({ success: true, data: { messages: [], hasMore: false, nextCursor: null } } as never)
})
afterEach(() => act(() => closeSheet()))

describe('what the options draw for each state', () => {
  it('none + canAdd: Add friend, lit in the thread’s rose', async () => {
    await openOptions(withFriend({ state: 'none', canAdd: true }))
    expect(sheet().getByLabelText('Add friend')).toBeTruthy()
    expect(colourOf('Add friend')).toBe(COLOR.selectionRoseGlyph)
    // Beside View profile and Unmatch, which keep their place.
    expect(screen.getByLabelText('View profile')).toBeTruthy()
    expect(screen.getByLabelText('Unmatch…')).toBeTruthy()
  })

  it('incoming: Accept, lit', async () => {
    await openOptions(withFriend({ state: 'incoming', canAdd: true }))
    expect(sheet().getByLabelText('Accept friend request')).toBeTruthy()
    expect(colourOf('Accept friend request')).toBe(COLOR.selectionRoseGlyph)
  })

  it('requested: a quiet Requested that does nothing', async () => {
    await openOptions(withFriend({ state: 'requested', canAdd: false }))
    const row = sheet().getByLabelText('Friend request sent')
    expect(row.props.accessibilityState).toMatchObject({ disabled: true })
    expect(colourOf('Requested')).toBe(COLOR.textPrimary)
    await act(async () => fireEvent.press(row))
    expect(api.sendFriendRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['friends already', { state: 'friends', canAdd: false }],
    ['a person the server does not offer', { state: 'none', canAdd: false }],
    ['an older server with no friend field', undefined],
    ['a friend field that is not one', { state: 'maybe' }],
  ])('%s: no friend row at all', async (_name, friend) => {
    await openOptions(withFriend(friend))
    for (const label of ['Add friend', 'Accept friend request', 'Friend request sent', 'Friends']) expect(sheet().queryByLabelText(label)).toBeNull()
    expect(card()).toBeNull()
    expect(screen.getByLabelText('Unmatch…')).toBeTruthy()
  })

  it('an unrevealed match, whose id is a handle: nothing to add', async () => {
    await openOptions(withFriend({ state: 'none', canAdd: false }, { otherUser: { id: 'rh_abc', name: 'Arctic Falcon', image: null }, theyRevealed: false }))
    expect(sheet().queryByLabelText('Add friend')).toBeNull()
  })
})

describe('asking', () => {
  it('sends their real id, tells you, and the row becomes Requested', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'requested' } } as never)
    await openOptions(withFriend({ state: 'none', canAdd: true }))
    await act(async () => fireEvent.press(sheet().getByLabelText('Add friend')))
    await flush()

    expect(api.sendFriendRequest).toHaveBeenCalledTimes(1)
    expect(api.sendFriendRequest).toHaveBeenCalledWith({ userId: 'u-c' })
    expect(mockShowToast).toHaveBeenCalledWith('Friend request sent to Mika', 'success', { haptic: 'success' })

    await act(async () => fireEvent.press(screen.getByLabelText('Conversation options')))
    await flush()
    expect(sheet().queryByLabelText('Add friend')).toBeNull()
    expect(sheet().getByLabelText('Friend request sent').props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('accepting a request they made lands as friends, and the row is gone', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } } as never)
    await openOptions(withFriend({ state: 'incoming', canAdd: true }))
    await act(async () => fireEvent.press(sheet().getByLabelText('Accept friend request')))
    await flush()

    expect(api.sendFriendRequest).toHaveBeenCalledWith({ userId: 'u-c' })
    expect(mockShowToast).toHaveBeenCalledWith('You and Mika are friends', 'success', { haptic: 'success' })
    await act(async () => fireEvent.press(screen.getByLabelText('Conversation options')))
    await flush()
    // Friends: nothing left to do, so the menu draws nothing (the profile says "Friends").
    expect(sheet().queryByLabelText('Accept friend request')).toBeNull()
    expect(sheet().queryByLabelText('Friends')).toBeNull()
  })

  it('the row spins while the request is out, and a second press sends nothing more', async () => {
    let finish: (v: unknown) => void = () => {}
    api.sendFriendRequest.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await openOptions(withFriend({ state: 'none', canAdd: true }))
    await act(async () => fireEvent.press(sheet().getByLabelText('Add friend')))
    expect(sheet().getByLabelText('Add friend').props.accessibilityState).toMatchObject({ busy: true })
    await act(async () => fireEvent.press(sheet().getByLabelText('Add friend')))
    expect(api.sendFriendRequest).toHaveBeenCalledTimes(1)
    await act(async () => finish({ success: true, data: { state: 'requested' } }))
    await flush()
  })
})

describe('when it does not go through, the row stays and the sheet says why (no toast on top of it)', () => {
  const press = async (response: unknown, offer = { state: 'none', canAdd: true }) => {
    if (response instanceof Error) api.sendFriendRequest.mockRejectedValue(response)
    else api.sendFriendRequest.mockResolvedValue(response as never)
    await openOptions(withFriend(offer))
    await act(async () => fireEvent.press(sheet().getByLabelText(offer.state === 'incoming' ? 'Accept friend request' : 'Add friend')))
    await flush()
  }

  it('NOT_A_REVEALED_MATCH says to reveal first', async () => {
    await press({ success: false, errorCode: 'NOT_FOUND', reasonCode: 'NOT_A_REVEALED_MATCH', error: 'Not found' })
    expect(sheet().getByText('Reveal yourself first')).toBeTruthy()
    expect(sheet().getByLabelText('Add friend')).toBeTruthy()
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it.each([
    ['any other 404', { success: false, errorCode: 'NOT_FOUND', error: 'Not found' }],
    ['a thrown request', new Error('network')],
  ])('%s is the standard error', async (_name, response) => {
    await press(response)
    expect(sheet().getByText("That didn’t go through. Try again.")).toBeTruthy()
    expect(sheet().queryByText('Reveal yourself first')).toBeNull()
    expect(sheet().getByLabelText('Add friend')).toBeTruthy()
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('an unfinished profile says so, in the reason’s own words (Flow 15 15.19), and the row stays', async () => {
    await press({ success: false, errorCode: 'FORBIDDEN', reasonCode: 'PROFILE_INCOMPLETE', error: 'Finish your profile' })
    expect(sheet().getByText('Finish your profile to add friends')).toBeTruthy()
    expect(sheet().queryByText('That didn’t go through. Try again.')).toBeNull()
    expect(sheet().getByLabelText('Add friend')).toBeTruthy()
  })

  it('asking too fast says to slow down, not that it failed', async () => {
    await press({ success: false, errorCode: 'RATE_LIMITED', reasonCode: 'RATE_LIMITED', retryAfter: 40, error: 'Slow down' })
    expect(sheet().getByText('Slow down — try again soon')).toBeTruthy()
    expect(sheet().getByLabelText('Add friend')).toBeTruthy()
  })

  it('never calls with a handle, even if the server offered one', async () => {
    api.getConversation.mockResolvedValue(withFriend({ state: 'none', canAdd: true }, { otherUser: { id: 'rh_dm_handle', name: 'Mika', image: null } }))
    await openOptions(withFriend({ state: 'none', canAdd: true }, { otherUser: { id: 'rh_dm_handle', name: 'Mika', image: null } }))
    await act(async () => fireEvent.press(sheet().getByLabelText('Add friend')))
    await flush()
    expect(api.sendFriendRequest).not.toHaveBeenCalled()
    expect(sheet().getByText("That didn’t go through. Try again.")).toBeTruthy()
  })
})

describe('Accept is felt on press-in, and success still plays once', () => {
  it('the options row plays H.primary at the start of an accept, and Add friend does not', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } } as never)
    await openOptions(withFriend({ state: 'incoming', canAdd: true }))
    await act(async () => fireEvent.press(sheet().getByLabelText('Accept friend request')))
    await flush()
    expect(mockH.primary).toHaveBeenCalledTimes(1)
    // The success haptic is the toast's, once.
    expect(mockShowToast).toHaveBeenCalledWith('You and Mika are friends', 'success', { haptic: 'success' })
    expect(mockShowToast).toHaveBeenCalledTimes(1)
  })

  it('adding does not play it', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'requested' } } as never)
    await openOptions(withFriend({ state: 'none', canAdd: true }))
    await act(async () => fireEvent.press(sheet().getByLabelText('Add friend')))
    await flush()
    expect(mockH.primary).not.toHaveBeenCalled()
  })
})

describe('the card in the thread, once you can both see each other', () => {
  const open = async (data: unknown) => {
    api.getConversation.mockResolvedValue(data as never)
    await render(
      <>
        <PrivateChat />
        <SheetHost />
      </>
    )
    await flush()
  }
  const touch = () => act(async () => fireEvent(screen.getByTestId('dm-feed'), 'touchEnd'))

  it('says "You can both see each other" with a lit Add friend, only while the server offers it', async () => {
    await open(withFriend({ state: 'none', canAdd: true }))
    expect(screen.getByTestId('dm-reveal')).toBeTruthy()
    expect(within(screen.getByTestId('dm-reveal')).getByText('You can both see each other')).toBeTruthy()
    expect(within(screen.getByTestId('dm-reveal')).getByText('Add friend')).toBeTruthy()
    // Lit in the thread's rose, never the white strong or the gradient.
    expect(StyleSheet.flatten(within(screen.getByTestId('dm-reveal')).getByRole('button', { name: 'Add friend' }).props.style).backgroundColor).toBe(COLOR.selectionRoseFill)
  })

  it('reads both sides as seen', async () => {
    await open(withFriend({ state: 'none', canAdd: true }))
    expect(screen.getByLabelText(/^You, .*, seen\. Mika, seen\.$/)).toBeTruthy()
  })

  it('an incoming request reads "Accept friend request"', async () => {
    await open(withFriend({ state: 'incoming', canAdd: true }))
    expect(within(screen.getByTestId('dm-reveal')).getByText('Accept friend request')).toBeTruthy()
  })

  it.each([
    ['requested', { state: 'requested', canAdd: false }],
    ['friends', { state: 'friends', canAdd: false }],
    ['not offered', { state: 'none', canAdd: false }],
    ['no offer from the server', undefined],
  ])('%s: no card', async (_name, friend) => {
    await open(withFriend(friend))
    expect(screen.queryByTestId('dm-reveal')).toBeNull()
  })

  it('asks with their real id; the card is gone once asked, and the options keep the way back as Requested', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'requested' } } as never)
    await open(withFriend({ state: 'none', canAdd: true }))
    await act(async () => fireEvent.press(screen.getByTestId('dm-reveal-friend')))
    await flush()
    expect(api.sendFriendRequest).toHaveBeenCalledWith({ userId: 'u-c' })
    expect(screen.queryByTestId('dm-reveal')).toBeNull()
    await act(async () => fireEvent.press(screen.getByLabelText('Conversation options')))
    await flush()
    expect(sheet().getByLabelText('Friend request sent')).toBeTruthy()
  })

  it('a refusal from the card is a toast, and the card stays', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'x' } as never)
    await open(withFriend({ state: 'none', canAdd: true }))
    await act(async () => fireEvent.press(screen.getByTestId('dm-reveal-friend')))
    await flush()
    expect(mockShowToast).toHaveBeenCalledWith("That didn’t go through. Try again.", 'error', { haptic: 'error' })
    expect(screen.getByTestId('dm-reveal')).toBeTruthy()
  })

  it('Accept on the card plays H.primary, and Add friend does not', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } } as never)
    await open(withFriend({ state: 'incoming', canAdd: true }))
    await act(async () => fireEvent(screen.getByTestId('dm-reveal-friend'), 'pressIn'))
    expect(mockH.primary).toHaveBeenCalledTimes(1)
  })

  it('folds away with a touch on the thread, and the options still carry Add friend', async () => {
    await open(withFriend({ state: 'none', canAdd: true }))
    await touch()
    await flush()
    expect(screen.queryByTestId('dm-reveal')).toBeNull()
    await act(async () => fireEvent.press(screen.getByLabelText('Conversation options')))
    await flush()
    expect(sheet().getByLabelText('Add friend')).toBeTruthy()
  })
})

describe('the composer across a remount (a text-size change, Opus review M4)', () => {
  afterEach(() => {
    mockParams = { conversationId: 'c1' }
    clearOutbox()
  })

  it('what you typed wins over the suggested opener the route carries', async () => {
    api.getConversation.mockResolvedValue({ success: true, data: revealed } as never)
    mockParams = { conversationId: 'c1', draft: 'Try: what brought you here?' }
    setDraft(dmThread('c1', 'u-a'), 'my own words, half typed')
    await render(<PrivateChat />)
    await flush()
    expect(screen.getByDisplayValue('my own words, half typed')).toBeTruthy()
    expect(screen.queryByDisplayValue('Try: what brought you here?')).toBeNull()
  })

  it('with nothing typed, the opener still fills it', async () => {
    api.getConversation.mockResolvedValue({ success: true, data: revealed } as never)
    mockParams = { conversationId: 'c1', draft: 'Try: what brought you here?' }
    await render(<PrivateChat />)
    await flush()
    expect(screen.getByDisplayValue('Try: what brought you here?')).toBeTruthy()
  })
})

describe('their reveal, live', () => {
  const push = (data: Record<string, unknown>) => act(async () => mockPush.forEach((fn) => fn({ request: { content: { data } } })))
  const theyOnly = { ...revealed, youRevealed: true, theyRevealed: false, friend: { state: 'none', canAdd: false } }

  it('a reveal push for this conversation re-reads it, and the card appears', async () => {
    api.getConversation.mockResolvedValueOnce({ success: true, data: theyOnly } as never)
    api.getConversation.mockResolvedValue(withFriend({ state: 'none', canAdd: true }))
    await render(<PrivateChat />)
    await flush()
    expect(screen.queryByTestId('dm-reveal-friend')).toBeNull()
    await push({ type: 'reveal', conversationId: 'c1' })
    await flush()
    expect(api.getConversation).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('dm-reveal-friend')).toBeTruthy()
  })

  it.each([
    ['another conversation', { type: 'reveal', conversationId: 'c2' }],
    ['another kind of push', { type: 'private_message', conversationId: 'c1' }],
    ['a push with no payload', {}],
  ])('%s does not', async (_name, data) => {
    api.getConversation.mockResolvedValue({ success: true, data: theyOnly } as never)
    await render(<PrivateChat />)
    await flush()
    await push(data)
    await flush()
    expect(api.getConversation).toHaveBeenCalledTimes(1)
  })

  it('their reveal over the socket (`private:revealed`, RC drive D3) re-reads it, and the card appears in place', async () => {
    api.getConversation.mockResolvedValueOnce({ success: true, data: theyOnly } as never)
    api.getConversation.mockResolvedValue(withFriend({ state: 'none', canAdd: true }))
    await render(<PrivateChat />)
    await flush()
    expect(screen.queryByTestId('dm-reveal-friend')).toBeNull()
    await act(async () => mockConversationHandlers.forEach((h) => h.onRevealed?.({ conversationId: 'c1' })))
    await flush()
    expect(api.getConversation).toHaveBeenCalledTimes(2)
    expect(within(screen.getByTestId('dm-reveal')).getByText('You can both see each other')).toBeTruthy()
    expect(screen.getByTestId('dm-reveal-friend')).toBeTruthy()
  })

  it('a sync (pushes off) re-reads it too', async () => {
    api.getConversation.mockResolvedValueOnce({ success: true, data: theyOnly } as never)
    api.getConversation.mockResolvedValue(withFriend({ state: 'none', canAdd: true }))
    await render(<PrivateChat />)
    await flush()
    await act(async () => {
      await mockSync.current?.()
    })
    await flush()
    expect(api.getConversation).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('dm-reveal-friend')).toBeTruthy()
  })

  it('stops listening when the thread closes', async () => {
    api.getConversation.mockResolvedValue({ success: true, data: theyOnly } as never)
    await render(<PrivateChat />)
    await flush()
    expect(mockPush).toHaveLength(1)
    await screen.unmount()
    expect(mockPush).toHaveLength(0)
  })
})

it('revealing yourself re-reads the conversation, so Add friend appears once they had revealed', async () => {
  const theyOnly = { ...revealed, youRevealed: false, friend: { state: 'none', canAdd: false } }
  api.getConversation.mockResolvedValueOnce({ success: true, data: theyOnly } as never)
  api.getConversation.mockResolvedValue(withFriend({ state: 'none', canAdd: true }))
  api.revealInConversation.mockResolvedValue({ success: true } as never)
  await render(
    <>
      <PrivateChat />
      <SheetHost />
    </>
  )
  await flush()
  await act(async () => fireEvent.press(screen.getByLabelText('Show them who you are')))
  await act(async () => fireEvent.press(screen.getByText('Show them')))
  await flush()
  expect(api.getConversation).toHaveBeenCalledTimes(2)

  await act(async () => fireEvent.press(screen.getByLabelText('Conversation options')))
  // One sheet on screen at a time (lib/modalTurn): the options rise once the reveal sheet has gone (the fallback here).
  for (let i = 0; i < 2; i++) await act(async () => new Promise((r) => setTimeout(r, 700)))
  await flush()
  expect(sheet().getByLabelText('Add friend')).toBeTruthy()
})
