/*
 * Your invite, shared through the tray (Flow 16 · 16.1, “Your invite” with no inviter on the card): the link is built
 * from the token by the one builder, and the hook says whether it went anywhere (the onboarding step needs that).
 */
const mockOpenShare = jest.fn()
const mockGetInvite = jest.fn()
jest.mock('../lib/shareTray', () => ({ openShare: (t: unknown) => mockOpenShare(t) }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getFriendInvite: () => mockGetInvite(), resetFriendInvite: jest.fn() } }))

import { act, renderHook, waitFor } from '@testing-library/react-native'

import { useFriendInvite } from '../lib/useFriendInvite'

const TOKEN = 'abcdefghijklmnopqrstuv'

beforeEach(() => {
  mockOpenShare.mockReset().mockResolvedValue(true)
  mockGetInvite.mockReset().mockResolvedValue({ success: true, data: { token: TOKEN, url: `https://www.blendn.app/f/${TOKEN}` } })
})

it('opens the tray with the invite link and reports whether it went', async () => {
  const { result } = await renderHook(() => useFriendInvite())
  await waitFor(() => expect(result.current.invite).not.toBeNull())
  let went: boolean | undefined
  await act(async () => {
    went = await result.current.share()
  })
  expect(mockOpenShare).toHaveBeenCalledWith({ kind: 'invite', url: `https://www.blendn.app/f/${TOKEN}` })
  expect(went).toBe(true)
  mockOpenShare.mockResolvedValue(false)
  await act(async () => {
    went = await result.current.share()
  })
  expect(went).toBe(false)
})

it('has nothing to share until the link has loaded', async () => {
  mockGetInvite.mockResolvedValue({ success: false })
  const { result } = await renderHook(() => useFriendInvite())
  await waitFor(() => expect(result.current.failed).toBe(true))
  await act(async () => {
    expect(await result.current.share()).toBe(false)
  })
  expect(mockOpenShare).not.toHaveBeenCalled()
})
