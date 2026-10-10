import React from 'react'
import { act, render, screen, fireEvent } from '@testing-library/react-native'

const NOW = Date.parse('2026-10-09T20:00:00.000Z')
const mockShowToast = jest.fn()
const mockEnded: Array<(d: { eventId: string; reason: string }) => void> = []
const mockChanged = new Set<() => void>()

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getActiveCheckins: jest.fn(), goLive: jest.fn() } }))
jest.mock('../lib/socketClient', () => ({
  subscribeToLiveEnded: (cb: never) => { mockEnded.push(cb); return () => {} },
}))
jest.mock('../lib/checkIn', () => ({
  checkInChanged: jest.fn(() => mockChanged.forEach((f) => f())),
  subscribeCheckInChanged: (f: () => void) => { mockChanged.add(f); return () => mockChanged.delete(f) },
}))
jest.mock('../lib/usePresence', () => ({ usePresence: () => ({ finished: false }) }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('../lib/locationFix', () => ({ getCurrentLocation: jest.fn(async () => ({ latitude: 1, longitude: 2, accuracy: 10 })) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/ActionTray', () => {
  const R = require('react')
  const { Text, Pressable } = require('react-native')
  return {
    __esModule: true,
    default: ({ visible, title, buttons }: any) =>
      visible ? R.createElement(R.Fragment, null, R.createElement(Text, null, title),
        ...buttons.map((b: any) => R.createElement(Pressable, { key: b.label, onPress: b.onPress }, R.createElement(Text, null, b.label)))) : null,
  }
})

/* eslint-disable import/first */
import { LiveAtVenue } from '../components/LiveAtVenue'
import { apiClient } from '../lib/apiClient'
import { checkInChanged } from '../lib/checkIn'
import { readLiveSession, rememberLiveSession } from '../lib/goLive'
/* eslint-enable import/first */

const at = (min: number) => new Date(NOW + min * 60_000).toISOString()
const active = (expiresAt: string, stay = false) =>
  (apiClient.getActiveCheckins as jest.Mock).mockResolvedValue({
    success: true,
    data: { checkIns: [{ id: 'c1', eventId: 'day-1', kind: 'venue_day', expiresAt, stay, event: { venueName: 'The Humming Tree' } }] },
  })

async function mount() {
  await render(<LiveAtVenue />)
  await act(async () => { await Promise.resolve() })
}

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW })
  mockEnded.length = 0
  mockChanged.clear()
  await require('@react-native-async-storage/async-storage').clear()
  await rememberLiveSession({ userId: 'u1', venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree', choice: { minutes: 20 } })
  ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: true, data: { venueDayId: 'day-1', expiresAt: at(65) } })
})
afterEach(() => jest.useRealTimers())

describe('the expiry prompt (PL-M02), as mounted', () => {
  it('shows five minutes before the end, once; "Extend 45 min · free" asks the server for 45 minutes', async () => {
    active(at(20))
    await mount()
    expect(screen.queryByText('Extend 45 min · free')).toBeNull()
    await act(async () => { jest.advanceTimersByTime(14 * 60_000) })
    expect(screen.queryByText('Extend 45 min · free')).toBeNull()
    await act(async () => { jest.advanceTimersByTime(60_000 + 1) })
    expect(screen.getByText('Still at The Humming Tree?')).toBeTruthy()
    expect((await readLiveSession('u1'))?.prompted).toBe(true)

    await act(async () => { fireEvent.press(screen.getByText('Extend 45 min · free')) })
    expect(apiClient.goLive).toHaveBeenCalledWith('v1', expect.objectContaining({ minutes: 45 }))
  })

  it('does not show again once asked tonight, nor for "stay"', async () => {
    await rememberLiveSession({ userId: 'u1', venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree' })
    const { markLivePrompted } = require('../lib/goLive')
    await markLivePrompted('u1', 'day-1')
    active(at(20))
    await mount()
    await act(async () => { jest.advanceTimersByTime(19 * 60_000) })
    expect(screen.queryByText('Extend 45 min · free')).toBeNull()
  })

  it('"stay" never prompts', async () => {
    active(at(20), true)
    await mount()
    await act(async () => { jest.advanceTimersByTime(19 * 60_000) })
    expect(screen.queryByText('Extend 45 min · free')).toBeNull()
  })
})

describe('the prompt goes when what it says stops being true (M6)', () => {
  it('closes on live:ended, and is marked asked only once it was on screen', async () => {
    active(at(20))
    await mount()
    expect((await readLiveSession('u1'))?.prompted).toBe(false)
    await act(async () => { jest.advanceTimersByTime(15 * 60_000 + 1) })
    expect(screen.getByText('Still at The Humming Tree?')).toBeTruthy()
    await act(async () => { mockEnded[0]({ eventId: 'day-1', reason: 'expired' }) })
    expect(screen.queryByText('Still at The Humming Tree?')).toBeNull()
  })

  it('closes when the window moved elsewhere (an extend on the place screen)', async () => {
    active(at(20))
    await mount()
    await act(async () => { jest.advanceTimersByTime(15 * 60_000 + 1) })
    expect(screen.getByText('Still at The Humming Tree?')).toBeTruthy()
    active(at(60))
    await act(async () => { mockChanged.forEach((f) => f()); await Promise.resolve(); await Promise.resolve() })
    expect(screen.queryByText('Still at The Humming Tree?')).toBeNull()
  })

  it('Extend closes the prompt once the server says live', async () => {
    active(at(20))
    await mount()
    await act(async () => { jest.advanceTimersByTime(15 * 60_000 + 1) })
    await act(async () => { fireEvent.press(screen.getByText('Extend 45 min · free')) })
    expect(screen.queryByText('Still at The Humming Tree?')).toBeNull()
  })
})

describe('live:mockEnded, as mounted', () => {
  it('says what happened for an expiry, and tells the tab bar; says nothing for your own stop', async () => {
    active(at(20))
    await mount()
    mockEnded[0]({ eventId: 'day-1', reason: 'manual' })
    expect(mockShowToast).not.toHaveBeenCalled()
    mockEnded[0]({ eventId: 'day-1', reason: 'expired' })
    expect(mockShowToast).toHaveBeenCalledWith("You're no longer live at The Humming Tree.", 'info')
    expect(checkInChanged).toHaveBeenCalledWith('day-1')
  })
})

describe('reads of /checkins/active (cross-ref H1, H2)', () => {
  it('a failed read is not "not live": the prompt still comes for the window you are in (H1)', async () => {
    active(at(20))
    await mount()
    ;(apiClient.getActiveCheckins as jest.Mock).mockResolvedValue({ success: false, error: 'Request timed out' })
    await act(async () => { mockChanged.forEach((f) => f()); await Promise.resolve() })
    await act(async () => { jest.advanceTimersByTime(15 * 60_000 + 1) })
    expect(screen.getByText('Still at The Humming Tree?')).toBeTruthy()
  })

  it('an older read that lands last does not undo a newer one — Extend at expiry (H2)', async () => {
    let releaseOld: (v: unknown) => void = () => {}
    const fresh = { success: true, data: { checkIns: [{ id: 'c1', eventId: 'day-1', kind: 'venue_day', expiresAt: at(65), stay: false, event: { venueName: 'The Humming Tree' } }] } }
    const old = { success: true, data: { checkIns: [{ id: 'c1', eventId: 'day-1', kind: 'venue_day', expiresAt: at(20), stay: false, event: { venueName: 'The Humming Tree' } }] } }
    ;(apiClient.getActiveCheckins as jest.Mock)
      .mockReturnValueOnce(new Promise((r) => { releaseOld = r })) // read 1: started first, answers last
      .mockResolvedValueOnce(fresh)                                  // read 2: started after the extend, answers first
    await render(<LiveAtVenue />)
    await act(async () => { mockChanged.forEach((f) => f()); await Promise.resolve() })
    await act(async () => { releaseOld(old); await Promise.resolve() })
    await act(async () => { jest.advanceTimersByTime(16 * 60_000) })
    expect(screen.queryByText('Still at The Humming Tree?')).toBeNull() // the window now ends at +65, not +20
  })
})
