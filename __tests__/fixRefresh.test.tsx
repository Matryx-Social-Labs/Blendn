/*
 * SCRUM-1324: "after a while it shows 'last seen 10 min ago', and this keeps increasing, and does not update when the app
 * comes back". The Pulse's own fix was read once at mount and never again while open; on a return to the app it read the
 * last-known position and, when that was within ~1 km, kept the OLD object, so its timestamp never moved and the map's
 * "Last seen here N min ago · updating" (`youMark`, ten minutes) counted up for ever. `useFixRefresh` asks for a new fix on
 * every return to the app and every `FIX_REFRESH_MS` while it is in front, and hands it over with its own time.
 */
import { act, renderHook } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import { AppState } from 'react-native'

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}))

/* eslint-disable import/first */
import * as Location from 'expo-location'
import { youMark } from '../lib/mapPresence'
import type { PreciseFix } from '../lib/roomButton'
import { FIX_REFRESH_MS, useFixRefresh } from '../lib/useFixRefresh'
/* eslint-enable import/first */

const permission = Location.getForegroundPermissionsAsync as jest.Mock
const current = Location.getCurrentPositionAsync as jest.Mock
const lastKnown = Location.getLastKnownPositionAsync as jest.Mock
const T0 = Date.UTC(2026, 10, 28, 12, 0, 0)
const position = (at: number, latitude = 12.9784) => ({ coords: { latitude, longitude: 77.6408, accuracy: 20 }, timestamp: at })

let onAppState: ((state: string) => void) | undefined
let appState = 'active'
beforeEach(() => {
  jest.useFakeTimers({ now: T0 })
  permission.mockReset().mockResolvedValue({ status: 'granted' })
  current.mockReset().mockImplementation(async () => position(Date.now()))
  lastKnown.mockReset().mockResolvedValue(position(T0))
  appState = 'active'
  Object.defineProperty(AppState, 'currentState', { get: () => appState, configurable: true })
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    onAppState = handler as (state: string) => void
    return { remove: jest.fn() } as never
  })
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

async function mount() {
  const fixes: PreciseFix[] = []
  const statuses: string[] = []
  await renderHook(() => useFixRefresh({ permission: (s) => statuses.push(s), fix: (f) => fixes.push(f) }))
  return { fixes, statuses }
}

it('back from 12 minutes away, standing in the same spot: a new fix is asked, it carries its own time, and the map is not "Last seen"', async () => {
  const { fixes } = await mount()
  appState = 'background'
  await act(async () => onAppState?.('background'))
  jest.setSystemTime(T0 + 12 * 60_000)
  appState = 'active'
  await act(async () => onAppState?.('active'))

  expect(current).toHaveBeenCalled()
  const fix = fixes.at(-1)!
  expect(fix.timestamp).toBe(T0 + 12 * 60_000)
  expect(youMark({ sharing: true, permission: 'granted', fix, now: Date.now() }).kind).not.toBe('stale')
})

it('fifteen minutes in front of you, moving: a new fix every FIX_REFRESH_MS, so the map never reads ten minutes old', async () => {
  const { fixes } = await mount()
  for (let minute = 1; minute <= 15; minute++) {
    await act(async () => {
      jest.advanceTimersByTime(FIX_REFRESH_MS)
    })
    const fix = fixes.at(-1)!
    expect(Date.now() - (fix.timestamp ?? 0)).toBeLessThanOrEqual(FIX_REFRESH_MS)
    expect(youMark({ sharing: true, permission: 'granted', fix, now: Date.now() }).kind).not.toBe('stale')
  }
})

it('negative control: in the background nothing is asked (no background location), and a refused permission asks no fix', async () => {
  const { fixes, statuses } = await mount()
  appState = 'background'
  await act(async () => {
    jest.advanceTimersByTime(5 * FIX_REFRESH_MS)
  })
  expect(current).not.toHaveBeenCalled()
  expect(fixes).toHaveLength(0)

  permission.mockResolvedValue({ status: 'denied' })
  appState = 'active'
  await act(async () => onAppState?.('active'))
  expect(statuses.at(-1)).toBe('denied')
  expect(current).not.toHaveBeenCalled()
  expect(fixes).toHaveLength(0)
})

it('the Pulse takes its own fix through it, and no longer keeps an old fix for a nearby new one', () => {
  const src = readFileSync(join(__dirname, '../app/(tabs)/events.tsx'), 'utf8')
  expect(src).toMatch(/useFixRefresh\(/)
  expect(src).not.toMatch(/Math\.abs\(current\.latitude - position\.coords\.latitude\) < 0\.01/)
})
