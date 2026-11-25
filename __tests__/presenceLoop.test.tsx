import React from 'react'
import { AppState } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

/**
 * One presence loop, at the root, driven by the active check-in (SCRUM-1327, launch client/07a).
 *
 * The server's ping used to run only from the Pulse, and only for an event in its loaded feed; a second loop here took
 * its own fix every two minutes and judged it on the device against the pin, accuracy unread, and could check somebody
 * out on its own. Now this is the only loop: it pings whatever event `/checkins/active` names, the server judges, and the
 * app asks "Still at the event?" only when the server has seen two good outside readings a grace period apart.
 */
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getActiveCheckins: jest.fn(), getEvent: jest.fn(), sendPresencePing: jest.fn() },
}))
let mockOnCheckInChanged: (() => void) | null = null
jest.mock('../lib/checkIn', () => ({
  checkOutOf: jest.fn(),
  checkInChanged: jest.fn(),
  subscribeCheckInChanged: jest.fn((fn: () => void) => {
    mockOnCheckInChanged = fn
    return () => {
      mockOnCheckInChanged = null
    }
  }),
}))
jest.mock('../lib/toast', () => ({ toast: jest.fn() }))
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}))
// The sheets have their own test (presenceSheets); here only what the monitor asks them to show.
jest.mock('../components/PresenceSheets', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native')
  return { PresenceSheets: (p: { asking: boolean; onStay: () => void; onLeave: () => void; notice: boolean }) => (
    <View>
      {p.asking ? (
        <View testID="ask">
          <Pressable testID="stay" onPress={p.onStay} />
          <Pressable testID="leave" onPress={p.onLeave} />
        </View>
      ) : null}
      {p.notice ? <Text testID="notice">checked out</Text> : null}
    </View>
  ) }
})

/* eslint-disable import/first */
import * as Location from 'expo-location'
import { PresenceMonitor } from '../components/PresenceMonitor'
import { apiClient } from '../lib/apiClient'
import { checkInChanged, checkOutOf } from '../lib/checkIn'
import { toast } from '../lib/toast'
/* eslint-enable import/first */

const api = apiClient as unknown as Record<'getActiveCheckins' | 'getEvent' | 'sendPresencePing', jest.Mock>
const loc = Location as unknown as Record<'getForegroundPermissionsAsync' | 'getLastKnownPositionAsync' | 'getCurrentPositionAsync', jest.Mock>

// The pilot's farmhouse: a pin, and a phone 2 km away whose fix is a 2 km blur (precise location off).
const PIN = { latitude: 13.0086503, longitude: 77.3112094 }
const fixAt = (coords: { latitude: number; longitude: number }, accuracy: number, ageMs = 0) => ({
  coords: { ...coords, accuracy },
  timestamp: Date.now() - ageMs,
})
const FAR = { latitude: 13.0266, longitude: 77.3112 }

const MIN = 60_000
const ping = (status: string, extra: object = {}) => ({ success: true, data: { status, nextPingInSeconds: 300, ...extra } })
const checkIns = (...list: Array<{ eventId: string; kind?: string }>) => ({
  success: true,
  data: { checkIns: list.map((c) => ({ id: `c-${c.eventId}`, kind: 'event', event: { id: c.eventId }, ...c })) },
})

let appHandlers: Array<(s: string) => void> = []
const setApp = async (state: string) => {
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true, writable: true })
  await act(async () => {
    for (const h of [...appHandlers]) h(state)
  })
  await settle()
}
async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => {})
}
const advance = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
  await settle()
}
const pingedIds = () => api.sendPresencePing.mock.calls.map((c) => c[0])

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ now: new Date('2026-11-28T10:00:00Z') })
  appHandlers = []
  mockOnCheckInChanged = null
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true })
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
    appHandlers.push(fn)
    return { remove: () => (appHandlers = appHandlers.filter((h) => h !== fn)) }
  }) as never)
  loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true })
  loc.getLastKnownPositionAsync.mockResolvedValue(null)
  loc.getCurrentPositionAsync.mockImplementation(async () => fixAt(PIN, 20))
  // An event with a pin, for the loop this replaces (it read the fence from the event).
  api.getEvent.mockResolvedValue({ success: true, data: { ...PIN, checkInRadius: 85 } })
  api.getActiveCheckins.mockResolvedValue(checkIns({ eventId: 'e-unlisted' }))
  api.sendPresencePing.mockResolvedValue(ping('inside'))
  ;(checkOutOf as jest.Mock).mockResolvedValue({ success: true })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('the loop follows the active check-in, whatever event it is', () => {
  it('an event no Pulse list carries (unlisted, another city): pinged at once, then every interval', async () => {
    await render(<PresenceMonitor />)
    await settle()
    expect(pingedIds()).toEqual(['e-unlisted'])
    await advance(5 * MIN)
    expect(pingedIds()).toEqual(['e-unlisted', 'e-unlisted'])
  })

  it('a fresh ping on every return to the app, none while away', async () => {
    await render(<PresenceMonitor />)
    await settle()
    await setApp('background')
    await advance(6 * MIN)
    expect(api.sendPresencePing).toHaveBeenCalledTimes(1)
    await setApp('active')
    expect(api.sendPresencePing).toHaveBeenCalledTimes(2)
  })

  it('a return while a ping is still waiting for its fix sends one ping, not two', async () => {
    let release: (v: unknown) => void = () => {}
    loc.getCurrentPositionAsync.mockImplementationOnce(() => new Promise((r) => (release = r)))
    await render(<PresenceMonitor />)
    await settle()
    await setApp('background')
    await setApp('active')
    await act(async () => release(fixAt(PIN, 20)))
    await settle()
    expect(api.sendPresencePing).toHaveBeenCalledTimes(1)
  })

  it('a Go Live venue day is LiveAtVenue’s: only the event is pinged', async () => {
    api.getActiveCheckins.mockResolvedValue(checkIns({ eventId: 'day-1', kind: 'venue_day' }, { eventId: 'e1' }))
    await render(<PresenceMonitor />)
    await settle()
    expect(pingedIds()).toEqual(['e1'])
  })

  it('with only a Go Live, pings nothing', async () => {
    api.getActiveCheckins.mockResolvedValue(checkIns({ eventId: 'day-1', kind: 'venue_day' }))
    await render(<PresenceMonitor />)
    await settle()
    await advance(10 * MIN)
    expect(api.sendPresencePing).not.toHaveBeenCalled()
  })

  it('a check-in made elsewhere starts the loop without waiting for a trip to the background', async () => {
    api.getActiveCheckins.mockResolvedValue(checkIns())
    await render(<PresenceMonitor />)
    await settle()
    expect(api.sendPresencePing).not.toHaveBeenCalled()
    api.getActiveCheckins.mockResolvedValue(checkIns({ eventId: 'e2' }))
    await act(async () => mockOnCheckInChanged?.())
    await settle()
    expect(pingedIds()).toEqual(['e2'])
  })

  it('the check-in that answers last wins: a slow first read does not bring back the room just left', async () => {
    let slow: (v: unknown) => void = () => {}
    api.getActiveCheckins.mockImplementationOnce(() => new Promise((r) => (slow = r)))
    await render(<PresenceMonitor />)
    api.getActiveCheckins.mockResolvedValue(checkIns())
    await act(async () => mockOnCheckInChanged?.())
    await settle()
    await act(async () => slow(checkIns({ eventId: 'e-old' })))
    await settle()
    await advance(10 * MIN)
    expect(api.sendPresencePing).not.toHaveBeenCalled()
  })
})

describe('the fix', () => {
  it('a last-known fix a minute old at 30 m is reused: no fresh GPS ask', async () => {
    loc.getLastKnownPositionAsync.mockResolvedValue(fixAt(PIN, 30, MIN))
    await render(<PresenceMonitor />)
    await settle()
    expect(loc.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 120_000, requiredAccuracy: 150 })
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled()
    expect(api.sendPresencePing).toHaveBeenCalledWith('e-unlisted', { ...PIN, accuracy: 30 })
  })

  it('no recent last-known fix (the control): one Balanced ask', async () => {
    await render(<PresenceMonitor />)
    await settle()
    expect(loc.getCurrentPositionAsync).toHaveBeenCalledTimes(1)
    expect(loc.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 3 })
  })

  it('the server’s interval is floored at a minute: a bad nextPingInSeconds cannot spin the GPS', async () => {
    api.sendPresencePing.mockResolvedValue(ping('inside', { nextPingInSeconds: 1 }))
    await render(<PresenceMonitor />)
    await settle()
    await advance(30_000)
    expect(api.sendPresencePing).toHaveBeenCalledTimes(1)
    await advance(30_000)
    expect(api.sendPresencePing).toHaveBeenCalledTimes(2)
  })
})

describe('"Still at the event?" only on the server’s word, never a check-out without a tap', () => {
  it('a rough fix 2 km out for 40 minutes, which the server cannot place: no question, no check-out', async () => {
    loc.getCurrentPositionAsync.mockImplementation(async () => fixAt(FAR, 2000))
    api.sendPresencePing.mockResolvedValue(ping('unknown', { reason: 'no_signal' }))
    await render(<PresenceMonitor />)
    await settle()
    for (let t = 0; t < 40; t += 2) await advance(2 * MIN)
    expect(screen.queryByTestId('ask')).toBeNull()
    expect(checkOutOf).not.toHaveBeenCalled()
  })

  it('"I’m still here", then 40 minutes of rough fixes far away: the app never checks anyone out by itself', async () => {
    api.sendPresencePing.mockResolvedValueOnce(ping('outside', { reason: 'grace_expired' })).mockResolvedValue(ping('unknown', { reason: 'no_signal' }))
    loc.getCurrentPositionAsync.mockImplementation(async () => fixAt(FAR, 2000))
    await render(<PresenceMonitor />)
    await settle()
    for (let t = 0; t < 12 && !screen.queryByTestId('ask'); t += 2) await advance(2 * MIN)
    fireEvent.press(screen.getByTestId('stay'))
    await settle()
    for (let t = 0; t < 40; t += 2) await advance(2 * MIN)
    expect(checkOutOf).not.toHaveBeenCalled()
  })

  it('one lone outside reading: no question', async () => {
    api.sendPresencePing.mockResolvedValueOnce(ping('outside', { reason: 'left_area' })).mockResolvedValue(ping('inside', { reason: 'inside' }))
    await render(<PresenceMonitor />)
    await settle()
    await advance(5 * MIN)
    expect(screen.queryByTestId('ask')).toBeNull()
  })

  it('two good outside readings a grace period apart: asked once, and still never checked out by the app', async () => {
    api.sendPresencePing
      .mockResolvedValueOnce(ping('outside', { reason: 'left_area' }))
      .mockResolvedValueOnce(ping('outside', { reason: 'left_area' }))
      .mockResolvedValue(ping('outside', { reason: 'grace_expired' }))
    await render(<PresenceMonitor />)
    await settle()
    await advance(5 * MIN)
    expect(screen.queryByTestId('ask')).toBeNull()
    await advance(5 * MIN)
    expect(screen.getByTestId('ask')).toBeTruthy()
    fireEvent.press(screen.getByTestId('stay'))
    await settle()
    expect(screen.queryByTestId('ask')).toBeNull()
    // Still outside: the same departure is not asked about again, and the app does nothing on its own.
    await advance(5 * MIN)
    expect(screen.queryByTestId('ask')).toBeNull()
    expect(checkOutOf).not.toHaveBeenCalled()
  })

  it('"Check me out" that fails keeps the question open and says so', async () => {
    api.sendPresencePing.mockResolvedValue(ping('outside', { reason: 'grace_expired' }))
    ;(checkOutOf as jest.Mock).mockResolvedValue({ success: false, error: 'Network request failed' })
    await render(<PresenceMonitor />)
    await settle()
    fireEvent.press(screen.getByTestId('leave'))
    await settle()
    expect(checkOutOf).toHaveBeenCalledWith('e-unlisted')
    expect(screen.getByTestId('ask')).toBeTruthy()
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'error')
    expect(screen.queryByTestId('notice')).toBeNull()
  })

  it('"Check me out" that works closes the question, with no notice (they asked for it)', async () => {
    api.sendPresencePing.mockResolvedValue(ping('outside', { reason: 'grace_expired' }))
    await render(<PresenceMonitor />)
    await settle()
    fireEvent.press(screen.getByTestId('leave'))
    await settle()
    expect(screen.queryByTestId('ask')).toBeNull()
    expect(screen.queryByTestId('notice')).toBeNull()
  })
})

describe('the loop ends', () => {
  it('the server checked them out for leaving: the notice, everyone re-reads, and no more pings', async () => {
    api.sendPresencePing.mockResolvedValue(ping('checked_out', { reason: 'left_area' }))
    await render(<PresenceMonitor />)
    await settle()
    expect(screen.getByTestId('notice')).toBeTruthy()
    expect(checkInChanged).toHaveBeenCalledWith('e-unlisted')
    await advance(15 * MIN)
    expect(api.sendPresencePing).toHaveBeenCalledTimes(1)
  })

  it('the event ended: no notice about leaving, no more pings', async () => {
    api.sendPresencePing.mockResolvedValue(ping('checked_out', { reason: 'occurrence_ended' }))
    await render(<PresenceMonitor />)
    await settle()
    expect(screen.queryByTestId('notice')).toBeNull()
    await advance(15 * MIN)
    expect(api.sendPresencePing).toHaveBeenCalledTimes(1)
  })

  it('checked out elsewhere: the next read names no event and the pings stop', async () => {
    await render(<PresenceMonitor />)
    await settle()
    api.getActiveCheckins.mockResolvedValue(checkIns())
    await act(async () => mockOnCheckInChanged?.())
    await settle()
    await advance(15 * MIN)
    expect(api.sendPresencePing).toHaveBeenCalledTimes(1)
  })

  it('signed out (the monitor unmounts): no more pings', async () => {
    const view = await render(<PresenceMonitor />)
    await settle()
    await act(async () => view.unmount())
    await advance(15 * MIN)
    expect(api.sendPresencePing).toHaveBeenCalledTimes(1)
  })
})
