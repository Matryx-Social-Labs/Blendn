/**
 * The screen an invite link opens, against a mocked API.
 *
 * Behavioural, because each branch is a decision a structural pin would pass
 * by name alone: what a dead link says (and does not say), what "Send friend
 * request" actually sends, and that the screen moves on to "Requested" only
 * when the server agreed.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ token: 'abcdefghijklmnopqrstuv' }),
  useIsFocused: () => true,
  // The screen's own focus effect, run by hand: a test says when Edit profile has handed the screen back.
  useFocusEffect: (effect: () => void) => {
    mockFocus = effect
  },
}))
let mockFocus: () => void = () => {}
const mockAsk = jest.fn()
jest.mock('../lib/friendsSeeMeAsk', () => ({ askFriendsSeeMe: (...a: unknown[]) => mockAsk(...a), useStillHere: () => () => true }))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { SafeAreaView: (p: object) => React.createElement(View, p), useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: { openFriendInvite: jest.fn(), sendFriendRequest: jest.fn() },
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))
jest.mock('../components/OptimizedImage', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { OptimizedImage: () => React.createElement(View) }
})

import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import InviteScreen from '../app/f/[token]'

const api = apiClient as jest.Mocked<typeof apiClient>
const ANA = { userId: 'u_ana', name: 'Ana', photo: 'https://cdn/ana.jpg' }

beforeEach(() => jest.clearAllMocks())

it('says a dead link does not work, and nothing about why', async () => {
  api.openFriendInvite.mockResolvedValue({
    success: false,
    error: "This invite link doesn’t work any more",
    errorCode: 'NOT_FOUND',
  })
  await render(<InviteScreen />)
  await screen.findByText('This link doesn’t work')
  expect(screen.getByText('Ask the person who sent it for a new one.')).toBeTruthy()
  // No action to take on a link that does not work.
  expect(screen.queryByText('Send friend request')).toBeNull()
})

it('calls a link that failed to load a failed load, not a dead link, and tries again', async () => {
  api.openFriendInvite.mockResolvedValueOnce({ success: false, error: 'This is taking too long. Check your connection and try again.' })
  await render(<InviteScreen />)
  await screen.findByText('This link didn’t open')
  expect(screen.queryByText('This link doesn’t work')).toBeNull()

  api.openFriendInvite.mockResolvedValueOnce({ success: true, data: { person: ANA, state: 'none' } })
  fireEvent.press(screen.getByText('Try again'))
  await screen.findByText('Ana wants to blend with you')
  expect(screen.getByText('Send friend request')).toBeTruthy()
})

it('shows who sent it and asks with the token, then says Requested', async () => {
  api.openFriendInvite.mockResolvedValue({ success: true, data: { person: ANA, state: 'none' } })
  api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'requested' } })
  await render(<InviteScreen />)

  await screen.findByText('Ana wants to blend with you')
  fireEvent.press(screen.getByText('Send friend request'))

  await waitFor(() => expect(api.sendFriendRequest).toHaveBeenCalledWith({ token: 'abcdefghijklmnopqrstuv' }))
  await screen.findByText('Requested')
  // A request that is only sent is no friendship yet: the one-time ask (Q1) waits for one.
  expect(mockAsk).not.toHaveBeenCalled()
})

it('stays put and says so when the request fails', async () => {
  api.openFriendInvite.mockResolvedValue({ success: true, data: { person: ANA, state: 'none' } })
  api.sendFriendRequest.mockResolvedValue({ success: false, error: 'nope' })
  await render(<InviteScreen />)

  await screen.findByText('Ana wants to blend with you')
  fireEvent.press(screen.getByText('Send friend request'))

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("That didn’t go through. Try again.", 'error', { haptic: 'error' }))
  expect(screen.getByText('Send friend request')).toBeTruthy()
})

it('accepting from the link makes you friends at once', async () => {
  api.openFriendInvite.mockResolvedValue({ success: true, data: { person: ANA, state: 'incoming' } })
  api.sendFriendRequest.mockResolvedValue({ success: true, data: { state: 'friends' } })
  await render(<InviteScreen />)

  fireEvent.press(await screen.findByText('Accept friend request'))
  await screen.findByText('View profile')
  expect(mockShowToast).toHaveBeenCalledWith('You and Ana are friends', 'success', { haptic: 'success' })
  expect(mockAsk).toHaveBeenCalledTimes(1)
  expect(mockAsk).toHaveBeenCalledWith({ stillHere: expect.any(Function) })

  fireEvent.press(screen.getByText('View profile'))
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/friends/[userId]', params: { userId: 'u_ana' } })
})

it('is the page’s own shape while it loads, not a bare spinner', async () => {
  api.openFriendInvite.mockReturnValue(new Promise(() => {}))
  await render(<InviteScreen />)
  expect(screen.getByTestId('invite-loading')).toBeTruthy()
  expect(screen.queryByText('Send friend request')).toBeNull()
})

it('says your own link is yours, with Share your link', async () => {
  api.openFriendInvite.mockResolvedValue({ success: true, data: { person: ANA, state: 'self' } })
  await render(<InviteScreen />)
  await screen.findByText('Your invite link')
  fireEvent.press(screen.getByText('Share your link'))
  expect(router.replace).toHaveBeenCalledWith('/friends/add')
})

it('keeps Requested as a disabled secondary with the waiting line, and Not now closes', async () => {
  api.openFriendInvite.mockResolvedValue({ success: true, data: { person: ANA, state: 'requested' } })
  await render(<InviteScreen />)
  await screen.findByText('Requested')
  expect(screen.getByText('Your request is waiting. You’ll hear when they accept.')).toBeTruthy()
  expect(api.sendFriendRequest).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Not now'))
  expect(router.back).toHaveBeenCalled()
})


describe('a refusal with a fix (Flow 15 15.19): the link is not "didn’t open"', () => {
  const PROFILE = { success: false as const, error: 'Finish your profile', errorCode: 'FORBIDDEN', reasonCode: 'PROFILE_INCOMPLETE' }
  const LIMITED = { success: false as const, error: 'Too many', errorCode: 'RATE_LIMITED', reasonCode: 'RATE_LIMITED', retryAfter: 48 }

  it('an unfinished profile on opening says to finish it, and Finish my profile opens Edit profile', async () => {
    api.openFriendInvite.mockResolvedValue(PROFILE)
    await render(<InviteScreen />)
    await screen.findByText('Finish your profile to add friends')
    expect(screen.getByText('Add a photo and your name first. The link stays open; we’ll bring you back to it.')).toBeTruthy()
    expect(screen.queryByText('This link didn’t open')).toBeNull()
    fireEvent.press(screen.getByText('Finish my profile'))
    expect(router.push).toHaveBeenCalledWith('/edit-profile')
  })

  it('coming back from Edit profile reads the link again and shows who sent it', async () => {
    api.openFriendInvite.mockResolvedValueOnce(PROFILE)
    await render(<InviteScreen />)
    fireEvent.press(await screen.findByText('Finish my profile'))
    api.openFriendInvite.mockResolvedValueOnce({ success: true, data: { person: ANA, state: 'none' } })
    mockFocus()
    await screen.findByText('Ana wants to blend with you')
    expect(screen.getByText('Send friend request')).toBeTruthy()
  })

  it('Not now closes without finishing', async () => {
    api.openFriendInvite.mockResolvedValue(PROFILE)
    await render(<InviteScreen />)
    fireEvent.press(await screen.findByText('Not now'))
    expect(router.back).toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('a send the server refuses for the profile is the same screen, not a toast', async () => {
    api.openFriendInvite.mockResolvedValue({ success: true, data: { person: ANA, state: 'none' } })
    api.sendFriendRequest.mockResolvedValue(PROFILE)
    await render(<InviteScreen />)
    fireEvent.press(await screen.findByText('Send friend request'))
    await screen.findByText('Finish your profile to add friends')
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  describe('a rate limit', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('counts down from the server’s retryAfter, disabled until zero, then Try again reads the link again', async () => {
      api.openFriendInvite.mockResolvedValueOnce(LIMITED)
      await render(<InviteScreen />)
      await act(async () => {})
      expect(screen.getByText('Slow down — try again in a minute')).toBeTruthy()
      expect(screen.getByText('Too many links in a row. This one still works; nothing’s lost.')).toBeTruthy()
      expect(screen.getByText('0:48')).toBeTruthy()
      const wait = screen.getByLabelText('Try again, available when the wait ends')
      expect(wait.props.accessibilityState.disabled).toBe(true)

      await act(async () => jest.advanceTimersByTime(47_000))
      expect(screen.getByText('0:01')).toBeTruthy()
      await act(async () => jest.advanceTimersByTime(1_000))
      expect(screen.queryByText('0:00')).toBeNull()
      api.openFriendInvite.mockResolvedValueOnce({ success: true, data: { person: ANA, state: 'none' } })
      await act(async () => {
        fireEvent.press(screen.getByText('Try again'))
      })
      expect(screen.getByText('Ana wants to blend with you')).toBeTruthy()
    })

    it('a second refusal with the same wait counts again from the top, it does not carry on from zero', async () => {
      const FIVE = { success: false as const, errorCode: 'RATE_LIMITED', reasonCode: 'RATE_LIMITED', retryAfter: 5 }
      api.openFriendInvite.mockResolvedValueOnce(FIVE)
      await render(<InviteScreen />)
      await act(async () => {})
      await act(async () => jest.advanceTimersByTime(5_000))
      api.openFriendInvite.mockResolvedValueOnce(FIVE)
      await act(async () => {
        fireEvent.press(screen.getByText('Try again'))
      })
      expect(screen.getByText('0:05')).toBeTruthy()
      expect(screen.getByLabelText('Try again, available when the wait ends').props.accessibilityState.disabled).toBe(true)
    })

    it('with no retryAfter the wait is the minute the sentence promises', async () => {
      api.openFriendInvite.mockResolvedValueOnce({ success: false, errorCode: 'RATE_LIMITED' })
      await render(<InviteScreen />)
      await act(async () => {})
      expect(screen.getByText('1:00')).toBeTruthy()
    })

    it('Back closes', async () => {
      api.openFriendInvite.mockResolvedValueOnce(LIMITED)
      await render(<InviteScreen />)
      await act(async () => {})
      fireEvent.press(screen.getByText('Back'))
      expect(router.back).toHaveBeenCalled()
    })
  })

  it('a dead link and a failed load are still what they were', async () => {
    api.openFriendInvite.mockResolvedValueOnce({ success: false, errorCode: 'NOT_FOUND', error: 'gone' })
    await render(<InviteScreen />)
    await screen.findByText('This link doesn’t work')
  })
})
