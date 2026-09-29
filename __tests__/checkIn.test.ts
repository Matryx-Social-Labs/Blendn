/*
 * One check-in, one check-out (lib/checkIn.ts).
 *
 * The Pulse and the event screen each had their own check-in, and five places
 * checked out without telling the tab bar. These pin what the shared module
 * decides, so both doors — and the Blend'n button — agree.
 */
jest.mock('../lib/apiClient', () => ({
  apiClient: { checkIn: jest.fn(), checkOut: jest.fn(), forgetActiveCheckins: jest.fn(), forgetEvent: jest.fn() },
}))
jest.mock('../lib/rosterMemory', () => ({ forgetRoster: jest.fn() }))
jest.mock('../lib/roomVisibilityStorage', () => ({
  hasSeenPublicCheckInWarning: jest.fn(() => Promise.resolve(true)),
  markPublicCheckInWarningSeen: jest.fn(() => Promise.resolve()),
}))

/* eslint-disable import/first */
import { readFileSync } from 'fs'
import { join } from 'path'
import { askIntentRoute, checkOutOf, CHECK_IN_TIMEOUT_MS, submitCheckIn, subscribeCheckInChanged } from '../lib/checkIn'
/* eslint-enable import/first */

const mockApi = jest.requireMock('../lib/apiClient').apiClient as Record<
  'checkIn' | 'checkOut' | 'forgetActiveCheckins' | 'forgetEvent',
  jest.Mock
>
const mockForgetRoster = jest.requireMock('../lib/rosterMemory').forgetRoster as jest.Mock

const at = { latitude: 12.97, longitude: 77.59, accuracy: 18 }

beforeEach(() => {
  jest.useRealTimers()
  Object.values(mockApi).forEach((fn) => fn.mockReset())
  mockForgetRoster.mockReset()
})

describe('submitCheckIn', () => {
  it('sends the measured accuracy inside deviceInfo', async () => {
    mockApi.checkIn.mockResolvedValue({ success: true, data: {} })
    await submitCheckIn('e1', at)
    expect(mockApi.checkIn).toHaveBeenCalledWith('e1', {
      latitude: at.latitude,
      longitude: at.longitude,
      deviceInfo: expect.objectContaining({ gpsAccuracy: 18 }),
    })
  })

  it('sends no accuracy rather than a made-up one when it is unknown', async () => {
    // The Pulse used to send a hard-coded 50.
    mockApi.checkIn.mockResolvedValue({ success: true, data: {} })
    await submitCheckIn('e1', { latitude: 1, longitude: 2 })
    expect(mockApi.checkIn.mock.calls[0][1].deviceInfo.gpsAccuracy).toBeUndefined()
  })

  it('reads intentNeeded and revealSuggestion off a success', async () => {
    mockApi.checkIn.mockResolvedValue({
      success: true,
      data: { checkInId: 'c1', intentNeeded: true, revealSuggestion: true },
    })
    expect(await submitCheckIn('e1', at)).toEqual({
      kind: 'checkedIn',
      checkInId: 'c1',
      askIntent: true,
      revealSuggestion: true,
    })
  })

  it('routes an askIntent to the preferences screen with the intent leading', () => {
    // `askIntent: '1'` is what makes that screen open on "Why do you go out?";
    // both doors push this route when the server says the intent is needed.
    expect(askIntentRoute('e1')).toEqual({
      pathname: '/event-preferences/[eventId]',
      params: { eventId: 'e1', revealed: '0', askIntent: '1' },
    })
  })

  it('names a refusal by its code and offers a map only when out of range', async () => {
    mockApi.checkIn.mockResolvedValue({ success: false, errorCode: 'OUT_OF_RANGE', error: '120 m outside' })
    const out = await submitCheckIn('e1', at)
    expect(out).toMatchObject({ kind: 'refused', alreadyCheckedIn: false })
    if (out.kind !== 'refused') throw new Error('expected refused')
    expect(out.refusal.offerDirections).toBe(true)
    expect(out.refusal.message).toBe('120 m outside')
  })

  it('treats ALREADY_CHECKED_IN as in, and says so', async () => {
    mockApi.checkIn.mockResolvedValue({ success: false, errorCode: 'ALREADY_CHECKED_IN', error: 'x' })
    const heard = jest.fn()
    const off = subscribeCheckInChanged(heard)
    expect(await submitCheckIn('e1', at)).toMatchObject({ kind: 'refused', alreadyCheckedIn: true })
    expect(heard).toHaveBeenCalledTimes(1)
    off()
  })

  it('gives up waiting after the timeout', async () => {
    jest.useFakeTimers()
    mockApi.checkIn.mockReturnValue(new Promise(() => {}))
    const pending = submitCheckIn('e1', at)
    jest.advanceTimersByTime(CHECK_IN_TIMEOUT_MS)
    expect(await pending).toEqual({ kind: 'timeout' })
  })
})

describe('check-in state changes reach the tab bar', () => {
  it('drops the cached active check-ins and notifies on success', async () => {
    mockApi.checkIn.mockResolvedValue({ success: true, data: {} })
    const heard = jest.fn()
    const off = subscribeCheckInChanged(heard)
    await submitCheckIn('e1', at)
    expect(mockApi.forgetActiveCheckins).toHaveBeenCalled()
    expect(heard).toHaveBeenCalledTimes(1)
    off()
  })

  it('says nothing about a refusal that changed nothing', async () => {
    mockApi.checkIn.mockResolvedValue({ success: false, errorCode: 'EVENT_ENDED', error: 'over' })
    const heard = jest.fn()
    const off = subscribeCheckInChanged(heard)
    await submitCheckIn('e1', at)
    expect(heard).not.toHaveBeenCalled()
    off()
  })
})

/*
 * Simulator QA, 2026-09-28: Blend in → I Agree → "Checked in" → Stay here, and
 * the event screen's CTA went back to "Blend in" while the centre button said
 * "Open the room". Only the active list was dropped; the event detail, SWR-
 * cached with `userStatus.isCheckedIn: false`, answered the screen's re-read
 * (on the socket's check-in, or on focus coming back from "Why do you go out?")
 * and overwrote the optimistic "You're in".
 */
describe('a check-in change drops the cached event detail too', () => {
  const { getEventDetailCache, setEventDetailCache } = jest.requireActual('../lib/eventDetailCache')

  it.each([
    ['a fresh check-in', () => mockApi.checkIn.mockResolvedValue({ success: true, data: {} }), () => submitCheckIn('e1', at)],
    [
      'already checked in',
      () => mockApi.checkIn.mockResolvedValue({ success: false, errorCode: 'ALREADY_CHECKED_IN', error: 'x' }),
      () => submitCheckIn('e1', at),
    ],
    ['a check-out', () => mockApi.checkOut.mockResolvedValue({ success: true, data: {} }), () => checkOutOf('e1')],
  ])('%s', async (_name, arrange, act) => {
    arrange()
    setEventDetailCache('e1', { userStatus: { isCheckedIn: false } })
    setEventDetailCache('e2', { userStatus: { isCheckedIn: false } })
    await act()
    expect(mockApi.forgetEvent).toHaveBeenCalledWith('e1')
    expect(getEventDetailCache('e1')).toBeNull()
    // Only the event that changed.
    expect(getEventDetailCache('e2')).not.toBeNull()
  })

  it('and not on a refusal that changed nothing', async () => {
    mockApi.checkIn.mockResolvedValue({ success: false, errorCode: 'EVENT_ENDED', error: 'over' })
    await submitCheckIn('e1', at)
    expect(mockApi.forgetEvent).not.toHaveBeenCalled()
  })
})

describe('the event screen hears check-in changes', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const screen = strip(readFileSync(join(__dirname, '..', 'components', 'screens', 'EventDetailScreen.tsx'), 'utf8'))

  it('re-reads the detail — the one source of userStatus — whenever check-in state changes', () => {
    expect(screen).toContain("import { subscribeCheckInChanged } from '../../lib/checkIn'")
    expect(screen).toMatch(/subscribeCheckInChanged\(\(\) => void fetchEventDetails\(\)\)/)
  })

  it('still turns the CTA at once from the check-in result', () => {
    expect(screen).toMatch(/onCheckedIn: \(outcome\) =>\s*setCheckInStatus\(/)
  })

  it('apiClient drops only the detail, not the attendee list', () => {
    const src = readFileSync(join(__dirname, '..', 'lib', 'apiClient.ts'), 'utf8')
    const body = src.slice(src.indexOf('forgetEvent(eventId: string): void {'), src.indexOf('private setCache<T>'))
    expect(body).toContain('const detail = `:/api/mobile/events/${eventId}`')
    expect(body).toContain('key.includes(`${detail}:`) || key.includes(`${detail}?`)')
  })
})

describe('checkOutOf', () => {
  it('forgets the roster and notifies, for every caller', async () => {
    mockApi.checkOut.mockResolvedValue({ success: true, data: {} })
    const heard = jest.fn()
    const off = subscribeCheckInChanged(heard)
    await checkOutOf('e1')
    expect(mockForgetRoster).toHaveBeenCalledWith('e1')
    expect(heard).toHaveBeenCalledTimes(1)
    off()
  })

  it('changes nothing when the server refuses', async () => {
    mockApi.checkOut.mockResolvedValue({ success: false, error: 'no' })
    const heard = jest.fn()
    const off = subscribeCheckInChanged(heard)
    const result = await checkOutOf('e1')
    expect(result.success).toBe(false)
    expect(mockForgetRoster).not.toHaveBeenCalled()
    expect(heard).not.toHaveBeenCalled()
    off()
  })
})

describe('every check-out goes through checkOutOf', () => {
  // The room checks out through `useRoomControls` (see the next test).
  it.each(['lib/useRoomControls.ts', 'app/(tabs)/events.tsx', 'components/PresenceMonitor.tsx'])('%s', (file) => {
    const src = readFileSync(join(__dirname, '..', file), 'utf8')
    expect(src).toContain('checkOutOf(')
    expect(src).not.toContain('apiClient.checkOut(')
  })

  it("and the Blend'n room checks out through useRoomControls, not around it", () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'blendn', 'BlendnScreen.tsx'), 'utf8')
    expect(src).toContain('controls.checkOut()')
    expect(src).not.toContain('apiClient.checkOut(')
  })

  it('and the tab bar listens', () => {
    const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', '_layout.tsx'), 'utf8')
    expect(src).toContain('subscribeCheckInChanged(')
  })
})
