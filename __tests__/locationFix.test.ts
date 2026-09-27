/**
 * The check-in's position, run rather than grepped.
 *
 * `getCurrentLocation` left `EventDetailScreen` for `lib/locationFix.ts` so the
 * Blend'n room's hold-to-check-in could share it. Out of the screen it can be
 * driven: these pin the three answers that matter at a venue door — a weak
 * fix is refused, a good one carries its accuracy, and a phone with no fix
 * stops at the deadline instead of spinning.
 */
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  hasServicesEnabledAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}))
jest.mock('../lib/logger', () => ({
  Logger: { warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))

import * as Location from 'expo-location'
import { getCurrentLocation, LOCATION_FIX_TIMEOUT_MS } from '../lib/locationFix'

const loc = Location as jest.Mocked<typeof Location>

function trays() {
  return { showTray: jest.fn(), closeTray: jest.fn() }
}

function fixWith(accuracy: number | null) {
  return { coords: { latitude: 12.97, longitude: 77.59, accuracy }, timestamp: 0 } as any
}

beforeEach(() => {
  jest.useRealTimers()
  jest.clearAllMocks()
  loc.hasServicesEnabledAsync.mockResolvedValue(true)
  loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any)
})

describe('getCurrentLocation', () => {
  it('returns a good fix with its accuracy, which the server reads', async () => {
    loc.getCurrentPositionAsync.mockResolvedValue(fixWith(12))
    const t = trays()
    expect(await getCurrentLocation(t)).toEqual({ latitude: 12.97, longitude: 77.59, accuracy: 12 })
    expect(t.showTray).not.toHaveBeenCalled()
  })

  it('refuses a fix worse than 50m, and says so', async () => {
    loc.getCurrentPositionAsync.mockResolvedValue(fixWith(80))
    const t = trays()
    expect(await getCurrentLocation(t)).toBeNull()
    expect(t.showTray).toHaveBeenCalledWith('GPS signal weak', expect.stringContaining('80m'), expect.any(Array))
  })

  it('stops at the deadline when no fix ever arrives', async () => {
    jest.useFakeTimers()
    loc.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}))
    const t = trays()
    const pending = getCurrentLocation(t)
    // Let the service and permission checks settle before the clock moves.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    jest.advanceTimersByTime(LOCATION_FIX_TIMEOUT_MS)
    expect(await pending).toBeNull()
    expect(t.showTray).toHaveBeenCalledWith('Location timeout', expect.any(String))
  })

  it('asks for permission rather than reading a position without it', async () => {
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as any)
    const t = trays()
    expect(await getCurrentLocation(t)).toBeNull()
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled()
    expect(t.showTray).toHaveBeenCalledWith('Location permission required', expect.any(String), expect.any(Array))
  })
})
