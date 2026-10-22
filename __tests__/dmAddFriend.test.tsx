/**
 * "Add friend" in a match's options (SCRUM-750), rendered: the owner's rule is "if users have matched and they have
 * revealed themselves we can then give an option to add as friend". The server decides (`friend: { state, canAdd }`);
 * the thread draws each state, asks with their real id and never a handle, and says what went wrong in the app's words.
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
const mockAuth = { user: { id: 'u-a' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: () => 'connected' }))
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
import { clearOutbox } from '../lib/chatOutbox'
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
const colourOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style).color

beforeEach(() => {
  jest.clearAllMocks()
  clearOutbox()
  mockParams = { conversationId: 'c1' }
  api.getConversationMessages.mockResolvedValue({ success: true, data: { messages: [], hasMore: false, nextCursor: null } } as never)
})
afterEach(() => act(() => closeSheet()))

describe('what the options draw for each state', () => {
  it('none + canAdd: Add friend, lit in the thread’s rose', async () => {
    await openOptions(withFriend({ state: 'none', canAdd: true }))
    expect(screen.getByLabelText('Add friend')).toBeTruthy()
    expect(colourOf('Add friend')).toBe(COLOR.selectionRoseGlyph)
    // Beside View profile and Unmatch, which keep their place.
    expect(screen.getByLabelText('View profile')).toBeTruthy()
    expect(screen.getByLabelText('Unmatch…')).toBeTruthy()
  })

  it('incoming: Accept, lit', async () => {
    await openOptions(withFriend({ state: 'incoming', canAdd: true }))
    expect(screen.getByLabelText('Accept')).toBeTruthy()
    expect(colourOf('Accept')).toBe(COLOR.selectionRoseGlyph)
  })

  it('requested: a quiet Requested that does nothing', async () => {
    await openOptions(withFriend({ state: 'requested', canAdd: false }))
    const row = screen.getByLabelText('Requested')
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
    for (const label of ['Add friend', 'Accept', 'Requested', 'Friends']) expect(screen.queryByLabelText(label)).toBeNull()
    expect(screen.getByLabelText('Unmatch…')).toBeTruthy()
  })

  it('an unrevealed match, whose id is a handle: nothing to add', async () => {
    await openOptions(withFriend({ state: 'none', canAdd: false }, { otherUser: { id: 'rh_abc', name: 'Arctic Falcon', image: null }, theyRevealed: false }))
    expect(screen.queryByLabelText('Add friend')).toBeNull()
  })
})

describe('asking', () => {
  it('sends their real id, tells you, and the row becomes Requested', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'requested' } } as never)
    await openOptions(withFriend({ state: 'none', canAdd: true }))
    await act(async () => fireEvent.press(screen.getByLabelText('Add friend')))
    await flush()

    expect(api.sendFriendRequest).toHaveBeenCalledTimes(1)
    expect(api.sendFriendRequest).toHaveBeenCalledWith({ userId: 'u-c' })
    expect(mockShowToast).toHaveBeenCalledWith('Friend request sent to Mika', 'success', { haptic: 'success' })

    await act(async () => fireEvent.press(screen.getByLabelText('Conversation options')))
    await flush()
    expect(screen.queryByLabelText('Add friend')).toBeNull()
    expect(screen.getByLabelText('Requested').props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('accepting a request they made lands as friends, and the row is gone', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } } as never)
    await openOptions(withFriend({ state: 'incoming', canAdd: true }))
    await act(async () => fireEvent.press(screen.getByLabelText('Accept')))
    await flush()

    expect(api.sendFriendRequest).toHaveBeenCalledWith({ userId: 'u-c' })
    expect(mockShowToast).toHaveBeenCalledWith('You and Mika are friends', 'success', { haptic: 'success' })
    await act(async () => fireEvent.press(screen.getByLabelText('Conversation options')))
    await flush()
    // Friends: nothing left to do, so the menu draws nothing (the profile says "Friends").
    expect(screen.queryByLabelText('Accept')).toBeNull()
    expect(screen.queryByLabelText('Friends')).toBeNull()
  })

  it('the row spins while the request is out, and a second press sends nothing more', async () => {
    let finish: (v: unknown) => void = () => {}
    api.sendFriendRequest.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await openOptions(withFriend({ state: 'none', canAdd: true }))
    await act(async () => fireEvent.press(screen.getByLabelText('Add friend')))
    expect(screen.getByLabelText('Add friend').props.accessibilityState).toMatchObject({ busy: true })
    await act(async () => fireEvent.press(screen.getByLabelText('Add friend')))
    expect(api.sendFriendRequest).toHaveBeenCalledTimes(1)
    await act(async () => finish({ success: true, data: { state: 'requested' } }))
    await flush()
  })
})

describe('when it does not go through', () => {
  it('NOT_A_REVEALED_MATCH says to reveal first, and the row stays', async () => {
    api.sendFriendRequest.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', reasonCode: 'NOT_A_REVEALED_MATCH', error: 'Not found' } as never)
    await openOptions(withFriend({ state: 'none', canAdd: true }))
    await act(async () => fireEvent.press(screen.getByLabelText('Add friend')))
    await flush()
    expect(mockShowToast).toHaveBeenCalledWith('Reveal yourself first', 'info')
    await act(async () => fireEvent.press(screen.getByLabelText('Conversation options')))
    await flush()
    expect(screen.getByLabelText('Add friend')).toBeTruthy()
  })

  it.each([
    ['any other 404', { success: false, errorCode: 'NOT_FOUND', error: 'Not found' }],
    ['a rate limit', { success: false, errorCode: 'RATE_LIMITED', error: 'Slow down' }],
  ])('%s is the standard error toast', async (_name, response) => {
    api.sendFriendRequest.mockResolvedValue(response as never)
    await openOptions(withFriend({ state: 'none', canAdd: true }))
    await act(async () => fireEvent.press(screen.getByLabelText('Add friend')))
    await flush()
    expect(mockShowToast).toHaveBeenCalledWith("That didn't go through. Try again.", 'error', { haptic: 'error' })
    expect(mockShowToast).not.toHaveBeenCalledWith('Reveal yourself first', expect.anything())
  })

  it('a thrown request is the standard error toast too', async () => {
    api.sendFriendRequest.mockRejectedValue(new Error('network'))
    await openOptions(withFriend({ state: 'none', canAdd: true }))
    await act(async () => fireEvent.press(screen.getByLabelText('Add friend')))
    await flush()
    expect(mockShowToast).toHaveBeenCalledWith("That didn't go through. Try again.", 'error', { haptic: 'error' })
  })

  it('never calls with a handle, even if the server offered one', async () => {
    await openOptions(withFriend({ state: 'none', canAdd: true }, { otherUser: { id: 'rh_dm_handle', name: 'Mika', image: null } }))
    await act(async () => fireEvent.press(screen.getByLabelText('Add friend')))
    await flush()
    expect(api.sendFriendRequest).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith("That didn't go through. Try again.", 'error', { haptic: 'error' })
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
  await flush()
  expect(screen.getByLabelText('Add friend')).toBeTruthy()
})
