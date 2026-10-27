import { act, renderHook } from '@testing-library/react-native'

/**
 * ROOM-04: "Not listed here" must clear after "Turn it on → Settings → on → back". Settings is a screen above the Room,
 * so the Room re-reads show_online on every focus, uncached; a mount-time read left the banner up.
 */
let mockFocus: (() => void | (() => void)) | null = null
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocus = effect
  },
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Sneha', profile: { photos: [] } } }) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/checkIn', () => ({ checkOutOf: jest.fn() }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getProfile: jest.fn() } }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { useRoomControls } from '../lib/useRoomControls'
/* eslint-enable import/first */

const profile = (show_online: boolean) => ({ success: true, data: { profile: { show_online } } })

it('re-reads show_online on focus, without the cache, and follows the new value', async () => {
  const get = apiClient.getProfile as jest.Mock
  get.mockResolvedValueOnce(profile(false))
  const { result } = await renderHook(() => useRoomControls('e1', false))
  await act(async () => void mockFocus?.())
  expect(get).toHaveBeenLastCalledWith('u1', { cache: false })
  expect(result.current.listed).toBe(false)

  get.mockResolvedValueOnce(profile(true))
  await act(async () => void mockFocus?.())
  expect(result.current.listed).toBe(true)
})
