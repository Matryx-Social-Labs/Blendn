import { renderHook, waitFor } from '@testing-library/react-native'

import { usePassReach } from '../lib/usePassReach'
import type { TonightEvent } from '../lib/useTonight'

const mockQuiet = jest.fn()
jest.mock('../lib/useTonight', () => ({ quietLocation: () => mockQuiet() }))

// Toit, Indiranagar; the phone ~2.4 km south of it, and at its door.
const door = { id: 'e', title: 'Toit', latitude: 12.9791, longitude: 77.6408, distanceKm: null } as unknown as TonightEvent
const fix = (latitude: number, longitude: number) => ({ coords: { latitude, longitude, accuracy: 10, timestamp: Date.now(), approximate: false }, location: 'on' })

beforeEach(() => mockQuiet.mockReset())

it('a fresh fix 2.4 km away disables the hold (far)', async () => {
  mockQuiet.mockResolvedValue(fix(12.9575, 77.6408))
  const { result } = await renderHook(() => usePassReach(door, null, 'on'))
  await waitFor(() => expect(result.current).toBe('far'))
})

it('at the door, or with no fix, the hold stays open (the server judges)', async () => {
  mockQuiet.mockResolvedValue(fix(12.9792, 77.6408))
  const near = await renderHook(() => usePassReach(door, null, 'on'))
  await waitFor(() => expect(mockQuiet).toHaveBeenCalled())
  expect(near.result.current).toBe('open')
  mockQuiet.mockResolvedValue({ coords: null, location: 'on' })
  const none = await renderHook(() => usePassReach({ ...door, id: 'f' }, null, 'on'))
  await waitFor(() => expect(mockQuiet).toHaveBeenCalledTimes(2))
  expect(none.result.current).toBe('open')
})

it('inside the fence by the signal: open, without asking for a fix', async () => {
  const { result } = await renderHook(() => usePassReach(door, 'e', 'on'))
  expect(result.current).toBe('open')
  expect(mockQuiet).not.toHaveBeenCalled()
})

it('location off: locationOff', async () => {
  mockQuiet.mockResolvedValue({ coords: null, location: 'off' })
  const { result } = await renderHook(() => usePassReach(door, null, 'off'))
  expect(result.current).toBe('locationOff')
})
