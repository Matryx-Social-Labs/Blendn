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
  Accuracy: { High: 4, BestForNavigation: 6 },
  hasServicesEnabledAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}))
jest.mock('../lib/checkInTiming', () => ({ markCheckIn: jest.fn() }))
jest.mock('../lib/logger', () => ({
  Logger: { warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))

import * as Location from 'expo-location'
import { Platform } from 'react-native'
import { markCheckIn } from '../lib/checkInTiming'
import { getCurrentLocation, LOCATION_FIX_TIMEOUT_MS } from '../lib/locationFix'

/** Which native path runs: iOS watches, Android asks once. */
const setOS = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true })

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
  // The flow's tests ask once (Android's path); iOS's watch has its own below.
  setOS('android')
  loc.hasServicesEnabledAsync.mockResolvedValue(true)
  loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any)
  loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any)
  loc.getLastKnownPositionAsync.mockResolvedValue(null)
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
    expect(t.showTray).toHaveBeenCalledWith('GPS signal is weak', 'Accuracy is 80 m. Step away from walls and try again.', expect.any(Array), { icon: 'radar' })
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
    expect(t.showTray).toHaveBeenCalledWith('Location timed out', 'We couldn’t get a fix in 15 seconds.', expect.any(Array), { icon: 'hourglass' })
  })

  // SCRUM-906: the deadline starts before the first native read, so a blocked native queue cannot spin Go Live for ever.
  it.each([
    ['the Location Services read', () => loc.hasServicesEnabledAsync.mockReturnValue(new Promise(() => {}))],
    ['the permission read', () => loc.requestForegroundPermissionsAsync.mockReturnValue(new Promise(() => {}))],
  ])('answers "Couldn’t get your location" within the deadline when %s never answers (SCRUM-906)', async (_name, stall) => {
    jest.useFakeTimers()
    stall()
    const t = trays()
    const pending = getCurrentLocation({ ...t, purpose: 'goLive' })
    await jest.advanceTimersByTimeAsync(LOCATION_FIX_TIMEOUT_MS - 1)
    expect(t.showTray).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(await pending).toBeNull()
    expect(t.showTray).toHaveBeenCalledTimes(1)
    expect(t.showTray).toHaveBeenCalledWith('Couldn’t get your location', expect.any(String), expect.any(Array), { icon: 'map-pin-off' })
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled()
  })

  it('bounds the whole ask, reads and fix together, at one deadline (SCRUM-906)', async () => {
    jest.useFakeTimers()
    loc.requestForegroundPermissionsAsync.mockImplementation(() => new Promise((r) => setTimeout(() => r({ status: 'granted' } as any), 10_000)))
    loc.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}))
    const t = trays()
    const pending = getCurrentLocation(t)
    await jest.advanceTimersByTimeAsync(LOCATION_FIX_TIMEOUT_MS)
    expect(await pending).toBeNull()
    // The reads answered, so it is the fix that ran out of time.
    expect(t.showTray).toHaveBeenCalledWith('Location timed out', expect.any(String), expect.any(Array), { icon: 'hourglass' })
  })

  it('asks for permission rather than reading a position without it', async () => {
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as any)
    const t = trays()
    expect(await getCurrentLocation(t)).toBeNull()
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled()
    expect(t.showTray).toHaveBeenCalledWith('Location permission needed', 'Blend’n needs your location once, to check you in here.', expect.any(Array), { icon: 'map-pin' })
  })

  it('"Try again" on a timed-out fix resumes what wanted it (Flow 4 Tonight #25)', async () => {
    jest.useFakeTimers()
    loc.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}))
    const t = trays()
    const onRetry = jest.fn()
    const pending = getCurrentLocation({ ...t, onRetry })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    jest.advanceTimersByTime(LOCATION_FIX_TIMEOUT_MS)
    await pending
    const buttons = t.showTray.mock.calls[0][2] as { label: string; kind?: string; onPress: () => void }[]
    expect(buttons.map((b) => [b.label, b.kind])).toEqual([
      ['Cancel', 'tertiary'],
      ['Try again', 'primary'],
    ])
    buttons[1].onPress()
    expect(t.closeTray).toHaveBeenCalled()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('says a Go Live’s words, not a check-in’s, for Go Live', async () => {
    loc.hasServicesEnabledAsync.mockResolvedValue(false)
    const t = trays()
    await getCurrentLocation({ ...t, purpose: 'goLive' })
    expect(t.showTray).toHaveBeenCalledWith('Location Services are off', 'Turn on Location Services to go live here.', expect.any(Array), { icon: 'map-pin-off' })
    const buttons = t.showTray.mock.calls[0][2] as { label: string; kind?: string }[]
    expect(buttons.map((b) => [b.label, b.kind])).toEqual([
      ['Not now', 'tertiary'],
      ['Open Settings', 'lit'],
    ])
  })

  it('precise location off: its own tray with the path to the switch (R3-D4 4.7)', async () => {
    setOS('ios') // Precise Location is an iOS switch, and the path named is iOS's
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', ios: { accuracy: 'reduced' } } as any)
    const t = trays()
    expect(await getCurrentLocation(t)).toBeNull()
    expect(t.showTray).toHaveBeenCalledWith(
      'Precise location is off',
      'Check-in needs your exact spot to confirm you’re inside. Turn on Precise Location for Blend’n.',
      expect.any(Array),
      { icon: 'locate-off', detail: 'Settings › Blend’n › Location › Precise Location' }
    )
  })
})

/*
 * The wait between "Checking you in…" and "You're in" was a cold
 * BestForNavigation fix started only once the hold ended: seconds, up to the
 * 15 s deadline. A fix is now started when the pass shows, and a recent one
 * good enough for the door is used instead of asking again.
 */
describe('a fix that is already there', () => {
  const recentFix = (accuracy: number, ageMs = 0) =>
    ({ coords: { latitude: 12.97, longitude: 77.59, accuracy }, timestamp: Date.now() - ageMs }) as any

  /** A fresh copy of the module: the warmed fix is module state. */
  function fresh() {
    let mod!: typeof import('../lib/locationFix')
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('../lib/locationFix')
    })
    return mod
  }

  it('the hold uses the fix warmed when the pass showed, and asks for no other', async () => {
    const { warmLocationFix, getCurrentLocation: locate } = fresh()
    loc.getCurrentPositionAsync.mockResolvedValue(recentFix(9))
    await warmLocationFix()
    expect(loc.getCurrentPositionAsync).toHaveBeenCalledTimes(1)

    expect(await locate(trays())).toEqual({ latitude: 12.97, longitude: 77.59, accuracy: 9 })
    expect(loc.getCurrentPositionAsync).toHaveBeenCalledTimes(1)
  })

  it('warming never asks for permission: without it, nothing starts', async () => {
    const { warmLocationFix } = fresh()
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' } as any)
    await warmLocationFix()
    expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled()
  })

  it('takes the phone’s last fix when it is recent and inside 50 m', async () => {
    const { getCurrentLocation: locate, FRESH_FIX_MAX_AGE_MS } = fresh()
    loc.getLastKnownPositionAsync.mockResolvedValue(recentFix(20, 5_000))
    expect(await locate(trays())).toEqual({ latitude: 12.97, longitude: 77.59, accuracy: 20 })
    expect(loc.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: FRESH_FIX_MAX_AGE_MS, requiredAccuracy: 50 })
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled()
  })

  it('a stale or weak last fix is not used: a new one is asked for', async () => {
    const { getCurrentLocation: locate, FRESH_FIX_MAX_AGE_MS } = fresh()
    loc.getLastKnownPositionAsync.mockResolvedValue(recentFix(20, FRESH_FIX_MAX_AGE_MS + 1))
    loc.getCurrentPositionAsync.mockResolvedValue(recentFix(11))
    expect(await locate(trays())).toEqual({ latitude: 12.97, longitude: 77.59, accuracy: 11 })
    expect(loc.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: true })
  })
})

/*
 * iOS: `getCurrentPositionAsync` is CoreLocation's `requestLocation()`, which
 * answers only after ~10 s of trying for its best accuracy. Every iOS drive
 * waited that long between the hold and the request; Android never did.
 */
describe('iOS: the first good fix from a watch, not requestLocation', () => {
  const recentFix = (accuracy: number) =>
    ({ coords: { latitude: 12.97, longitude: 77.59, accuracy }, timestamp: Date.now() }) as any
  const remove = jest.fn()
  let deliver: (fix: unknown) => void

  function fresh() {
    let mod!: typeof import('../lib/locationFix')
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('../lib/locationFix')
    })
    return mod
  }

  beforeEach(() => {
    setOS('ios')
    remove.mockClear()
    loc.watchPositionAsync.mockImplementation(async (_opts, cb) => {
      deliver = cb as (fix: unknown) => void
      return { remove } as any
    })
  })

  it('takes the first fix inside 50 m and stops watching — never requestLocation', async () => {
    const pending = fresh().getCurrentLocation(trays())
    await new Promise((r) => setImmediate(r))
    deliver(recentFix(900)) // the coarse first fix: kept, not taken
    deliver(recentFix(8))
    expect(await pending).toEqual({ latitude: 12.97, longitude: 77.59, accuracy: 8 })
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(markCheckIn).toHaveBeenCalledWith('location', expect.objectContaining({ source: 'fresh', accuracyM: 8 }))
  })

  it('the hold reuses a warm-up still under way, rather than starting a second watch', async () => {
    const { warmLocationFix, getCurrentLocation: locate } = fresh()
    await warmLocationFix()
    const pending = locate(trays())
    await new Promise((r) => setImmediate(r))
    deliver(recentFix(6))
    expect(await pending).toEqual({ latitude: 12.97, longitude: 77.59, accuracy: 6 })
    expect(loc.watchPositionAsync).toHaveBeenCalledTimes(1)
    expect(markCheckIn).toHaveBeenCalledWith('location', expect.objectContaining({ source: 'warm' }))
  })

  it('is bounded: at the deadline it answers with the best it had, and stops watching', async () => {
    jest.useFakeTimers()
    const { firstGoodFix } = fresh()
    const pending = firstGoodFix(50, 1_000)
    await Promise.resolve()
    await Promise.resolve()
    deliver(recentFix(120))
    jest.advanceTimersByTime(1_000)
    expect((await pending).coords.accuracy).toBe(120)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('with no fix at all by the deadline, times out rather than spinning', async () => {
    jest.useFakeTimers()
    const { firstGoodFix } = fresh()
    const pending = firstGoodFix(50, 1_000)
    await Promise.resolve()
    jest.advanceTimersByTime(1_000)
    await expect(pending).rejects.toMatchObject({ code: 'E_LOCATION_TIMEOUT' })
  })
})
