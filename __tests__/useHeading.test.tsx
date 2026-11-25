/*
 * The compass behind the heading beam (pulse-map 14 A, SCRUM-1089): watched only while the map is on screen and the
 * app is in front, drawn only for a real turn, its width held two seconds before it changes, nothing when it cannot tell.
 */
import { act, renderHook } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'

type Reading = { trueHeading: number; magHeading: number; accuracy: number }
const mockRemove = jest.fn()
let mockEmit: ((h: Reading) => void) | null = null
const mockWatch = jest.fn()
jest.mock('expo-location', () => ({ watchHeadingAsync: (...a: unknown[]) => mockWatch(...a) }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

/* eslint-disable import/first */
import { useHeading } from '../lib/useHeading'
/* eslint-enable import/first */

let appListener: ((s: AppStateStatus) => void) | null = null
const reading = (over: Partial<Reading> = {}): Reading => ({ trueHeading: 30, magHeading: 31, accuracy: 3, ...over })
// A reading, drawn (its render and effects run), then time passing.
const emit = async (h: Reading, after = 200) => {
  await act(async () => mockEmit?.(h))
  await act(async () => jest.advanceTimersByTime(after))
}
const flush = () => act(async () => {})

beforeEach(() => {
  jest.useFakeTimers()
  mockRemove.mockClear()
  mockWatch.mockReset().mockImplementation(async (cb: (h: Reading) => void) => {
    mockEmit = cb
    return { remove: mockRemove }
  })
  mockEmit = null
  appListener = null
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, l) => {
    appListener = l as (s: AppStateStatus) => void
    return { remove: jest.fn() } as never
  })
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true })
})
afterEach(() => jest.useRealTimers())

const mount = async (props: { on: boolean; fix?: { speed?: number | null; course?: number | null; timestamp?: number | null } | null; reduceMotion?: boolean }) => {
  const hook = await renderHook((p: typeof props) => useHeading({ fix: null, reduceMotion: false, ...p }), { initialProps: props })
  await flush()
  return hook
}

it('nothing until the compass says something (the iOS simulator has none)', async () => {
  const hook = await mount({ on: true })
  expect(mockWatch).toHaveBeenCalledTimes(1)
  expect(hook.result.current).toBeNull()
  await emit(reading())
  expect(hook.result.current).toEqual({ deg: 30, width: 40 })
})

it('never watches while the map is not on screen (control: on → watched)', async () => {
  await mount({ on: false })
  expect(mockWatch).not.toHaveBeenCalled()
})

it('stops when the map leaves the screen, and again when the app goes to the background; starts again on return', async () => {
  const hook = await mount({ on: true })
  await act(async () => hook.rerender({ on: false }))
  expect(mockRemove).toHaveBeenCalledTimes(1)

  await act(async () => hook.rerender({ on: true }))
  await flush()
  expect(mockWatch).toHaveBeenCalledTimes(2)
  await act(async () => appListener?.('background'))
  expect(mockRemove).toHaveBeenCalledTimes(2)
  expect(hook.result.current).toBeNull()

  await act(async () => appListener?.('active'))
  await flush()
  expect(mockWatch).toHaveBeenCalledTimes(3)
})

it('a watch that resolves after the map has gone is removed at once, not left running', async () => {
  let resolve: (s: { remove: () => void }) => void = () => {}
  mockWatch.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
  const hook = await mount({ on: true })
  await act(async () => hook.rerender({ on: false }))
  await act(async () => resolve({ remove: mockRemove }))
  expect(mockRemove).toHaveBeenCalledTimes(1)
})

it('a turn under 3° is not drawn; 3° is', async () => {
  const hook = await mount({ on: true })
  await emit(reading({ trueHeading: 30 }))
  await emit(reading({ trueHeading: 32 }))
  expect(hook.result.current?.deg).toBe(30)
  await emit(reading({ trueHeading: 33 }))
  expect(hook.result.current?.deg).toBe(33)
})

it('Reduce Motion: 15° steps', async () => {
  const hook = await mount({ on: true, reduceMotion: true })
  await emit(reading({ trueHeading: 30 }))
  await emit(reading({ trueHeading: 44 }))
  expect(hook.result.current?.deg).toBe(30)
  await emit(reading({ trueHeading: 45 }))
  expect(hook.result.current?.deg).toBe(45)
})

it('at most one draw per 125 ms, and the last reading of a burst is never lost', async () => {
  const hook = await mount({ on: true })
  await emit(reading({ trueHeading: 30 }), 0)
  await act(async () => {
    mockEmit?.(reading({ trueHeading: 60 }))
    mockEmit?.(reading({ trueHeading: 90 }))
  })
  expect(hook.result.current?.deg).toBe(30)
  await act(async () => jest.advanceTimersByTime(125))
  expect(hook.result.current?.deg).toBe(90)
})

it('a new width waits about 2 s before it shows, so an unsure moment does not flicker', async () => {
  const hook = await mount({ on: true })
  await emit(reading({ accuracy: 3 }))
  await emit(reading({ accuracy: 2 }), 1500)
  expect(hook.result.current?.width).toBe(40)
  await act(async () => jest.advanceTimersByTime(600))
  expect(hook.result.current?.width).toBe(70)
})

it('a width that comes back within the hold never switches (control: it held, it did not switch twice)', async () => {
  const hook = await mount({ on: true })
  await emit(reading({ accuracy: 3 }))
  await emit(reading({ accuracy: 1 }), 500)
  await emit(reading({ accuracy: 3 }), 500)
  await act(async () => jest.advanceTimersByTime(3000))
  expect(hook.result.current?.width).toBe(40)
})

it('the compass going unsure past 50° (level 0) takes the beam away', async () => {
  const hook = await mount({ on: true })
  await emit(reading())
  await emit(reading({ accuracy: 0 }))
  expect(hook.result.current).toBeNull()
})

it('no compass at all (the watch fails) is quietly nothing, never an error on screen', async () => {
  mockWatch.mockImplementationOnce(async () => {
    throw new Error('Heading updates not available')
  })
  const hook = await mount({ on: true })
  expect(hook.result.current).toBeNull()
})

it('moving past 2 m/s: the course over ground, even with the compass saying otherwise', async () => {
  const hook = await mount({ on: true })
  await emit(reading({ trueHeading: 30 }))
  await act(async () => hook.rerender({ on: true, fix: { speed: 3, course: 200, timestamp: Date.now() } }))
  await emit(reading({ trueHeading: 30 }))
  expect(hook.result.current?.deg).toBe(200)
})
