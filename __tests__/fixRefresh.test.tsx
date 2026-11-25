/*
 * SCRUM-1324: "after a while it shows 'last seen 10 min ago', and this keeps increasing, and does not update when the app
 * comes back". The Pulse's own fix was read once at mount; a return to the app read the last-known position and, when it
 * was within ~1 km, kept the OLD object, so its time never moved and the map's "Last seen here N min ago · updating"
 * (`youMark`, ten minutes) counted up for ever. `useFixRefresh` asks at mount, on every return, and every
 * `FIX_REFRESH_MS` while the Pulse is on screen with sharing on, inside the foreground budget, one guarded ask at a time.
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
jest.mock('../lib/logger', () => ({ Logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), journey: jest.fn() } }))

/* eslint-disable import/first */
import * as Location from 'expo-location'
import { youMark } from '../lib/mapPresence'
import type { PreciseFix } from '../lib/roomButton'
import { FIX_REFRESH_MS, FIX_REUSE, keepPlace, useFixRefresh } from '../lib/useFixRefresh'
/* eslint-enable import/first */

const permission = Location.getForegroundPermissionsAsync as jest.Mock
const current = Location.getCurrentPositionAsync as jest.Mock
const lastKnown = Location.getLastKnownPositionAsync as jest.Mock
const T0 = Date.UTC(2026, 10, 28, 12, 0, 0)
const MIN = 60_000
const position = (at: number, latitude = 12.9784) => ({ coords: { latitude, longitude: 77.6408, accuracy: 20 }, timestamp: at })
const notStale = (fix: PreciseFix | undefined) => !!fix && youMark({ sharing: true, permission: 'granted', fix, now: Date.now() }).kind !== 'stale'
const flush = () => act(async () => {})
const later = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms)
  })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

let onAppState: ((state: string) => void) | undefined
let appState = 'active'
const goTo = async (state: string) => {
  appState = state
  await act(async () => onAppState?.(state))
}
beforeEach(() => {
  jest.useFakeTimers({ now: T0 })
  permission.mockReset().mockResolvedValue({ status: 'granted' })
  current.mockReset().mockImplementation(async () => position(Date.now()))
  lastKnown.mockReset().mockResolvedValue(null)
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

async function mount(periodic = true) {
  const fixes: PreciseFix[] = []
  const statuses: string[] = []
  const view = await renderHook(({ on }: { on: boolean }) => useFixRefresh(on, { permission: (s) => statuses.push(s), fix: (f) => fixes.push(f) }), {
    initialProps: { on: periodic },
  })
  await flush()
  return { fixes, statuses, view }
}

it('at open: a fix is asked at once, so "Last seen" never shows on a screen just opened', async () => {
  const { fixes } = await mount()
  expect(current).toHaveBeenCalledTimes(1)
  expect(notStale(fixes.at(-1))).toBe(true)
})

it('back from 12 minutes away, standing in the same spot: a new fix with its own time, and the map is not "Last seen"', async () => {
  const { fixes } = await mount(false)
  await goTo('background')
  jest.setSystemTime(T0 + 12 * MIN)
  await goTo('active')
  expect(fixes.at(-1)?.timestamp).toBe(T0 + 12 * MIN)
  expect(notStale(fixes.at(-1))).toBe(true)
})

it('fifteen minutes on the Pulse while moving: one ask every five minutes, so the map never reads ten minutes old', async () => {
  const { fixes } = await mount()
  for (let minute = 1; minute <= 15; minute++) {
    await later(MIN)
    expect(notStale(fixes.at(-1))).toBe(true)
  }
  expect(current).toHaveBeenCalledTimes(1 + 15 / (FIX_REFRESH_MS / MIN))
})

it('negative control: off screen or sharing off, no periodic ask at all; in the background, nothing', async () => {
  await mount(false)
  await later(30 * MIN)
  expect(current).toHaveBeenCalledTimes(1) // the open's own ask only

  current.mockClear()
  await mount(true)
  current.mockClear()
  await goTo('background')
  await later(30 * MIN)
  expect(current).not.toHaveBeenCalled()
})

it('a recent last-known fix is reused (budget: ≤ 2 min, ≤ 150 m): no GPS wake-up', async () => {
  lastKnown.mockResolvedValue(position(T0 - 30_000))
  const { fixes } = await mount()
  expect(lastKnown).toHaveBeenCalledWith(FIX_REUSE)
  expect(current).not.toHaveBeenCalled()
  expect(fixes.at(-1)?.timestamp).toBe(T0 - 30_000)
})

it('a return within 10 s of a fix asks no new fix (a shade pulled down and back), but still reads the permission', async () => {
  const { statuses } = await mount(false)
  await goTo('background')
  await later(5_000)
  permission.mockResolvedValue({ status: 'denied' })
  await goTo('active')
  expect(current).toHaveBeenCalledTimes(1)
  expect(statuses).toEqual(['granted', 'denied'])
})

it('one ask at a time: a return while an ask is pending asks nothing more, and a refusal read applies no fix', async () => {
  const hung = deferred<ReturnType<typeof position>>()
  current.mockReturnValueOnce(hung.promise)
  const { fixes, statuses } = await mount(false)
  jest.setSystemTime(T0 + MIN)
  await goTo('active')
  expect(permission).toHaveBeenCalledTimes(1)
  expect(current).toHaveBeenCalledTimes(1)
  await act(async () => hung.resolve(position(T0)))
  expect(fixes).toHaveLength(1)

  permission.mockResolvedValue({ status: 'denied' })
  jest.setSystemTime(T0 + 2 * MIN)
  await goTo('active')
  expect(statuses.at(-1)).toBe('denied')
  expect(current).toHaveBeenCalledTimes(1)
  expect(fixes).toHaveLength(1)
})

it('a position older than the one applied is dropped', async () => {
  const { fixes } = await mount(false)
  current.mockResolvedValueOnce(position(T0 - MIN, 13.1))
  jest.setSystemTime(T0 + MIN)
  await goTo('active')
  expect(fixes).toHaveLength(1)
  expect(fixes[0].latitude).toBe(12.9784)
})

it('a hung or refused ask keeps the fix before, and the next ask recovers', async () => {
  current.mockReturnValueOnce(new Promise(() => {}))
  const { fixes } = await mount()
  await later(20_000) // the 15 s cap ends it
  expect(fixes).toHaveLength(0)
  current.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { code: 'E_LOCATION_UNAVAILABLE' }))
  await later(FIX_REFRESH_MS)
  expect(fixes).toHaveLength(0)
  await later(FIX_REFRESH_MS)
  expect(fixes).toHaveLength(1)
})

it('unmounted: a late fix applies nothing, and no ask is made after', async () => {
  const hung = deferred<ReturnType<typeof position>>()
  current.mockReturnValueOnce(hung.promise)
  const { fixes, view } = await mount()
  await view.unmount()
  await act(async () => hung.resolve(position(T0)))
  await later(3 * FIX_REFRESH_MS)
  expect(fixes).toHaveLength(0)
  expect(current).toHaveBeenCalledTimes(1)
})

it('keepPlace: a phone standing still keeps the same object (the feed never refetches); a real move is a new one', () => {
  const here: PreciseFix = { latitude: 12.9784, longitude: 77.6408, timestamp: T0 }
  expect(keepPlace(here, { latitude: 12.9790, longitude: 77.6408, timestamp: T0 + MIN })).toBe(here) // ~67 m
  const moved = { latitude: 12.9800, longitude: 77.6408, timestamp: T0 + MIN } // ~178 m
  expect(keepPlace(here, moved)).toBe(moved)
  expect(keepPlace(null, moved)).toBe(moved)
})

it('the Pulse wires it: periodic only on screen with sharing on, the map draws the newest fix, the feed keys on the place', () => {
  const src = readFileSync(join(__dirname, '../app/(tabs)/events.tsx'), 'utf8')
  expect(src).toMatch(/useFixRefresh\(visible && sharing,/)
  expect(src).toMatch(/location: youFix,/)
  expect(src).toMatch(/setUserLocation\(\(current\) => keepPlace\(current, fix\)\)/)
  expect(src).not.toMatch(/Math\.abs\(current\.latitude - position\.coords\.latitude\) < 0\.01/)
})
