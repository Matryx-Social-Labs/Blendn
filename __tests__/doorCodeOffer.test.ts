/**
 * The door code, guest side (gate 13, SCRUM-1313; design/02a SPEC §4, guest option A): when a check-in is offered the
 * host's door code, and what the request carries. The server shapes are admin dev `8048fe85` (docs/API.md "The door
 * code"): `reasonCode: DOOR_CODE_OFFERED` on a refusal the code can fix, `doorCode` plus `deviceInfo.gpsAccuracy` (and
 * `mocked`) on the request, and `DOOR_CODE_*` answers.
 */
jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3, BestForNavigation: 6 },
  hasServicesEnabledAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}))
jest.mock('../lib/checkInTiming', () => ({ markCheckIn: jest.fn() }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({
  apiClient: { checkIn: jest.fn(), forgetActiveCheckins: jest.fn(), forgetVenues: jest.fn(), forgetEvent: jest.fn() },
  currentSession: () => 1,
}))
jest.mock('../lib/roomVisibilityStorage', () => ({}))

/* eslint-disable import/first */
import * as Location from 'expo-location'
import { Platform } from 'react-native'
import { submitCheckIn } from '../lib/checkIn'
import { CHECK_IN_CODES, checkInRefusal, isDoorCodeRefusal, isExpectedRefusal } from '../lib/checkInRefusal'
import { getCurrentLocation, LOCATION_FIX_TIMEOUT_MS, type TrayButton } from '../lib/locationFix'
/* eslint-enable import/first */

const loc = Location as jest.Mocked<typeof Location>
const api = jest.requireMock('../lib/apiClient').apiClient as { checkIn: jest.Mock }
const fixWith = (accuracy: number, mocked?: boolean) =>
  ({ coords: { latitude: 12.97, longitude: 77.59, accuracy }, timestamp: Date.now(), ...(mocked === undefined ? {} : { mocked }) }) as any

const OFFER_TITLE = 'GPS can’t place you'
const OFFER_BODY = 'Indoors, GPS can be weak. Ask the host for the door code. It’s on their screen at the entrance.'

beforeEach(() => {
  jest.useRealTimers()
  jest.clearAllMocks()
  Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true })
  loc.hasServicesEnabledAsync.mockResolvedValue(true)
  loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any)
  loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any)
  loc.getLastKnownPositionAsync.mockResolvedValue(null)
})

describe('the server’s refusals', () => {
  it('DOOR_CODE_OFFERED is the "GPS can’t place you" tray that offers the code, not "Check-in failed"', () => {
    // `reasonOf` reads `reasonCode ?? errorCode`: an OUT_OF_RANGE (or a vague fix) with the offer arrives as DOOR_CODE_OFFERED.
    const r = checkInRefusal('DOOR_CODE_OFFERED', 'You’re about 45m outside the check-in area')
    expect(r).toMatchObject({ title: OFFER_TITLE, message: OFFER_BODY, offerDoorCode: true, offerDirections: false })
  })

  it('every door-code answer is a refusal by design (no Sentry error), and the code’s own, not a tray', () => {
    for (const code of ['DOOR_CODE_OFFERED', 'DOOR_CODE_PAUSED', 'DOOR_CODE_LOCKED', 'DOOR_CODE_FAR', 'DOOR_CODE_CHANGED', 'DOOR_CODE_WRONG', 'DOOR_CODE_UNAVAILABLE']) {
      expect(isExpectedRefusal(code)).toBe(true)
    }
    expect(['DOOR_CODE_PAUSED', 'DOOR_CODE_LOCKED', 'DOOR_CODE_FAR', 'DOOR_CODE_CHANGED', 'DOOR_CODE_WRONG', 'DOOR_CODE_UNAVAILABLE'].every(isDoorCodeRefusal)).toBe(true)
    // The offer itself is a tray; an ordinary refusal is not the sheet's.
    expect(isDoorCodeRefusal(CHECK_IN_CODES.OUT_OF_RANGE)).toBe(false)
    expect(isDoorCodeRefusal('DOOR_CODE_OFFERED')).toBe(false)
    expect(isDoorCodeRefusal(undefined)).toBe(false)
  })

  it('an OUT_OF_RANGE with no offer is today’s tray, with Open Maps', () => {
    expect(checkInRefusal('OUT_OF_RANGE', 'You’re about 3 km outside the check-in area')).toMatchObject({ title: 'Not quite there yet', offerDirections: true })
    expect(checkInRefusal('OUT_OF_RANGE', 'x').offerDoorCode).toBeFalsy()
  })
})

describe('submitCheckIn with a door code', () => {
  const at = { latitude: 12.97, longitude: 77.59, accuracy: 86, mocked: true }

  it('sends the code, the accuracy the server requires with it, and the OS’s mocked flag', async () => {
    api.checkIn.mockResolvedValue({ success: true, data: { checkIn: { id: 'c1' } } })
    await submitCheckIn('e1', at, undefined, '7kq m4p')
    expect(api.checkIn).toHaveBeenCalledTimes(1)
    const body = api.checkIn.mock.calls[0][1]
    expect(body).toMatchObject({ latitude: 12.97, longitude: 77.59, doorCode: '7kq m4p', deviceInfo: { gpsAccuracy: 86, mocked: true } })
  })

  it('a fix the OS never called mocked goes as false', async () => {
    api.checkIn.mockResolvedValue({ success: true, data: {} })
    await submitCheckIn('e1', { latitude: 1, longitude: 2, accuracy: 20 }, undefined, 'ABCDEF')
    expect(api.checkIn.mock.calls[0][1].deviceInfo.mocked).toBe(false)
  })

  it('a GPS check-in sends no doorCode', async () => {
    api.checkIn.mockResolvedValue({ success: true, data: {} })
    await submitCheckIn('e1', { latitude: 1, longitude: 2, accuracy: 20 })
    expect(api.checkIn.mock.calls[0][1]).not.toHaveProperty('doorCode')
  })

  it('a wrong code comes back as the server’s sentence under its code', async () => {
    const sentence = 'That code didn’t match. Check the host’s screen; it may have just changed.'
    api.checkIn.mockResolvedValue({ success: false, error: sentence, errorCode: 'DOOR_CODE_WRONG' })
    const out = await submitCheckIn('e1', at, undefined, 'ZZZZZZ')
    expect(out).toMatchObject({ kind: 'refused', errorCode: 'DOOR_CODE_WRONG', refusal: { message: sentence } })
  })
})

describe('the client’s own weak-fix tray (accuracy over 50 m)', () => {
  const trays = () => ({ showTray: jest.fn(), closeTray: jest.fn(), onRetry: jest.fn() })
  const buttons = (t: ReturnType<typeof trays>): TrayButton[] => t.showTray.mock.calls[0][2]

  it('offers "Enter door code" (lit) and "Try GPS again" when the event says the code is available', async () => {
    loc.getCurrentPositionAsync.mockResolvedValue(fixWith(86, true))
    const t = trays()
    const enter = jest.fn()
    const available = jest.fn(async () => true)
    expect(await getCurrentLocation({ ...t, doorCode: { available, enter } })).toBeNull()
    expect(t.showTray).toHaveBeenCalledWith(OFFER_TITLE, OFFER_BODY, expect.any(Array), { icon: 'radar' })
    const b = buttons(t)
    expect(b.map((x) => [x.label, x.kind])).toEqual([
      ['Try GPS again', 'tertiary'],
      ['Enter door code', 'lit'],
    ])
    // The sheet gets the weak fix: the server judges it (≤ 1000 m, within 1 km), so the request needs it.
    b[1].onPress()
    expect(t.closeTray).toHaveBeenCalled()
    expect(enter).toHaveBeenCalledWith({ latitude: 12.97, longitude: 77.59, accuracy: 86, mocked: true })
    // "Try GPS again" resumes the check-in, as today's "Try again" does.
    b[0].onPress()
    expect(t.onRetry).toHaveBeenCalledTimes(1)
  })

  it('is today’s "GPS signal is weak" tray when the code is not available', async () => {
    loc.getCurrentPositionAsync.mockResolvedValue(fixWith(86))
    const t = trays()
    await getCurrentLocation({ ...t, doorCode: { available: async () => false, enter: jest.fn() } })
    expect(t.showTray).toHaveBeenCalledWith('GPS signal is weak', 'Accuracy is 86 m. Step away from walls and try again.', expect.any(Array), { icon: 'radar' })
  })

  it('is today’s tray when the availability read fails', async () => {
    loc.getCurrentPositionAsync.mockResolvedValue(fixWith(86))
    const t = trays()
    await getCurrentLocation({ ...t, doorCode: { available: async () => Promise.reject(new Error('offline')), enter: jest.fn() } })
    expect(t.showTray.mock.calls[0][0]).toBe('GPS signal is weak')
  })

  it('never asks about the code for a good fix', async () => {
    loc.getCurrentPositionAsync.mockResolvedValue(fixWith(12))
    const available = jest.fn(async () => true)
    const t = trays()
    expect(await getCurrentLocation({ ...t, doorCode: { available, enter: jest.fn() } })).toMatchObject({ accuracy: 12 })
    expect(available).not.toHaveBeenCalled()
  })

  it('never offers the code for a refusal Settings fixes (permission denied)', async () => {
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as any)
    const available = jest.fn(async () => true)
    const t = trays()
    await getCurrentLocation({ ...t, doorCode: { available, enter: jest.fn() } })
    expect(t.showTray.mock.calls[0][0]).toBe('Location permission needed')
    expect(available).not.toHaveBeenCalled()
  })
})

describe('"Location timed out" (SPEC §4: when a Balanced fallback fix exists)', () => {
  const trays = () => ({ showTray: jest.fn(), closeTray: jest.fn(), onRetry: jest.fn() })

  it('offers the code with the phone’s fallback fix when the code is available', async () => {
    jest.useFakeTimers()
    loc.getCurrentPositionAsync.mockImplementationOnce(() => new Promise(() => {}))
    // The fallback: the phone's last fix (roughFix), here 300 m wide.
    loc.getLastKnownPositionAsync.mockResolvedValueOnce(null).mockResolvedValueOnce(fixWith(300))
    const t = trays()
    const enter = jest.fn()
    const done = getCurrentLocation({ ...t, doorCode: { available: async () => true, enter } })
    await jest.advanceTimersByTimeAsync(LOCATION_FIX_TIMEOUT_MS)
    expect(await done).toBeNull()
    expect(t.showTray.mock.calls[0][0]).toBe(OFFER_TITLE)
    ;(t.showTray.mock.calls[0][2] as TrayButton[]).find((b) => b.label === 'Enter door code')!.onPress()
    expect(enter).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 300 }))
  })

  it('is today’s timeout tray when no fallback fix comes', async () => {
    jest.useFakeTimers()
    loc.getCurrentPositionAsync.mockImplementation(() => new Promise(() => {}))
    const t = trays()
    const done = getCurrentLocation({ ...t, doorCode: { available: async () => true, enter: jest.fn() } })
    await jest.advanceTimersByTimeAsync(LOCATION_FIX_TIMEOUT_MS + 5_000)
    expect(await done).toBeNull()
    expect(t.showTray.mock.calls[0][0]).toBe('Location timed out')
  })
})
