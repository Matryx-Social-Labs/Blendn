/**
 * SCRUM-903 / 906 family: an await on Expo's single native queue with no deadline. When the queue is blocked (a
 * notification-permission read wedged on an iOS 27 sim) the reads never answer, and whatever waits on them spins for
 * ever. Fake native modules that never resolve; each wait must end.
 */
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4 },
  hasServicesEnabledAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}))
jest.mock('../lib/logger', () => ({ Logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(), journey: jest.fn() } }))
jest.mock('../lib/api', () => ({ getEvents: jest.fn() }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: jest.fn() }))
jest.mock('../lib/cityStorage', () => ({ readStoredCity: jest.fn() }))
jest.mock('../lib/roomSignal', () => ({ getRoomSignal: jest.fn(), subscribeRoomSignal: jest.fn() }))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: jest.fn() }))

import { readFileSync } from 'fs'
import { join } from 'path'
import * as Location from 'expo-location'
import { LOCATION_FIX_TIMEOUT_MS, roughFix } from '../lib/locationFix'
import { QUIET_LOCATION_MS, quietLocation } from '../lib/useTonight'

const loc = Location as jest.Mocked<typeof Location>
const never = () => new Promise<never>(() => {})

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
})
afterEach(() => jest.useRealTimers())

describe('quietLocation gates the Pulse’s first load', () => {
  it('a blocked permission read lets the Pulse load without a fix, at QUIET_LOCATION_MS', async () => {
    loc.getForegroundPermissionsAsync.mockReturnValue(never())
    let result: unknown
    void quietLocation().then((r) => (result = r))
    await jest.advanceTimersByTimeAsync(QUIET_LOCATION_MS - 1)
    expect(result).toBeUndefined()
    await jest.advanceTimersByTimeAsync(1)
    expect(result).toEqual({ coords: null, location: 'on' })
  })

  it('a blocked last-known read after a granted permission does the same', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', ios: { accuracy: 'reduced' } } as never)
    loc.getLastKnownPositionAsync.mockReturnValue(never())
    const pending = quietLocation()
    await jest.advanceTimersByTimeAsync(QUIET_LOCATION_MS)
    await expect(pending).resolves.toEqual({ coords: null, location: 'on' })
  })

  it('answers at once when the reads do', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never)
    await expect(quietLocation()).resolves.toEqual({ coords: null, location: 'off' })
  })
})

describe('roughFix (Nearby) is bounded from its first read', () => {
  it('a Location Services read that never answers ends at the deadline, not after it', async () => {
    loc.getLastKnownPositionAsync.mockResolvedValue(null)
    loc.hasServicesEnabledAsync.mockReturnValue(never())
    const pending = roughFix()
    const settled = jest.fn()
    pending.catch(settled)
    await jest.advanceTimersByTimeAsync(LOCATION_FIX_TIMEOUT_MS - 1)
    expect(settled).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_LOCATION_TIMEOUT' }))
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled()
  })

  it('a last-known read that never answers ends at the deadline too', async () => {
    loc.getLastKnownPositionAsync.mockReturnValue(never())
    const pending = roughFix()
    const settled = jest.fn()
    pending.catch(settled)
    await jest.advanceTimersByTimeAsync(LOCATION_FIX_TIMEOUT_MS)
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_LOCATION_TIMEOUT' }))
  })
})

describe('the Events tab’s quiet fix', () => {
  it('bounds getCurrentPositionAsync: "my location" answers its wait (source pin)', () => {
    const source = readFileSync(join(__dirname, '../app/(tabs)/events.tsx'), 'utf8')
    const quiet = source.slice(source.indexOf('const getCurrentLocationQuietly'), source.indexOf('const requestLocationIfNeeded'))
    expect(quiet).toMatch(/withDeadline\(\s*Location\.getCurrentPositionAsync/)
  })
})
