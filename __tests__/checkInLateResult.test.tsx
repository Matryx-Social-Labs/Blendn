/**
 * The check-in that answers after the app stopped waiting (SCRUM-1189; launch audit client-feedback Verification 3).
 *
 * `submitCheckIn` gives up at 12 s and shows "Still checking you in"; the request goes on (a queued one is even sent
 * after the tray is up) until apiClient's own 15 s deadline. When the server then says yes, both doors must come to "in"
 * (`checkInChanged`), even if the person pressed Cancel first: a re-read on Cancel happens before the late answer lands,
 * so it is the late answer itself that has to say so. When it ends with no server answer at all, the server may still
 * have said yes, so the doors re-read it (SCRUM-1480).
 */
import { act, render } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'

import { CHECK_IN_TIMEOUT_MS, submitCheckIn, subscribeCheckInChanged } from '../lib/checkIn'
import { TIMEOUT_MESSAGE } from '../lib/fetchTimeout'
import { H } from '../lib/haptics'
import { useCheckInFlow, type UseCheckInFlowOptions } from '../lib/useCheckInFlow'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Sam Rao', image: null } }) }))
let mockSession = 1
jest.mock('../lib/apiClient', () => ({
  apiClient: { checkIn: jest.fn(), forgetActiveCheckins: jest.fn(), forgetVenues: jest.fn(), forgetEvent: jest.fn(), setMatchPreferences: jest.fn(async () => ({ success: true })) },
  currentSession: () => mockSession,
}))
jest.mock('../lib/locationFix', () => ({ warmLocationFix: jest.fn(async () => {}), getCurrentLocation: jest.fn(async () => ({ latitude: 12.97, longitude: 77.59, accuracy: 8 })) }))
jest.mock('../lib/roomVisibilityStorage', () => ({}))

const { apiClient: api } = jest.requireMock('../lib/apiClient') as { apiClient: Record<'checkIn' | 'forgetActiveCheckins' | 'forgetEvent', jest.Mock> }
const { Logger } = jest.requireMock('../lib/logger') as { Logger: Record<'warn' | 'error', jest.Mock> }
const lateLines = () => Logger.warn.mock.calls.filter((c) => c[1] === 'checkin:late').map((c) => c[2])

const at = { latitude: 12.97, longitude: 77.59, accuracy: 18 }
const yes = { success: true, data: { checkIn: { id: 'c1' }, left: [{ eventId: 'e0', kind: 'event', name: 'Vinyl Night' }] } }

/** A request the test answers when it chooses. */
function later<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
/** A real turn of the event loop, so a promise nobody handled would be reported by now. */
const settle = () => act(async () => new Promise<void>((done) => setImmediate(done)))

let heard: jest.Mock
let off: () => void
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
  jest.clearAllMocks()
  // clearMocks keeps a once-value a test left unconsumed: none may leak into the next.
  api.checkIn.mockReset()
  mockSession = 1
  heard = jest.fn()
  // The other door and the tab bar: anything listening for "check-in state changed".
  off = subscribeCheckInChanged(heard)
})
afterEach(() => {
  off()
  jest.useRealTimers()
})

describe('submitCheckIn, after it stopped waiting', () => {
  async function timedOut() {
    const request = later<unknown>()
    api.checkIn.mockReturnValue(request.promise)
    const pending = submitCheckIn('e1', at)
    jest.advanceTimersByTime(CHECK_IN_TIMEOUT_MS)
    expect(await pending).toEqual({ kind: 'timeout' })
    return request
  }

  it('a success that lands late tells both doors, and the rooms it took you out of', async () => {
    const request = await timedOut()
    expect(heard).not.toHaveBeenCalled()
    request.resolve(yes)
    await settle()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(api.forgetActiveCheckins).toHaveBeenCalled()
    expect(api.forgetEvent.mock.calls.map((c) => c[0])).toEqual(['e1', 'e0'])
    // One line per late answer, kept in production (warn), so a drive can see how a timed-out check-in ended.
    expect(lateLines()).toEqual([{ eventId: 'e1', isIn: true, code: undefined, sameSession: true }])
  })

  it('"already checked in" landing late is a yes too, as it is on time', async () => {
    const request = await timedOut()
    request.resolve({ success: false, errorCode: 'ALREADY_CHECKED_IN', error: 'x' })
    await settle()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(api.forgetEvent).toHaveBeenCalledWith('e1')
  })

  // SCRUM-1480: apiClient aborts every request at 15 s and answers `{ success: false, error }` with no code, so a yes slower
  // than that never lands. The server may have committed it: with no server answer, every door re-reads the server.
  it.each([
    ['aborted at 15 s', TIMEOUT_MESSAGE],
    ['the network dropped it', 'No internet connection. Check your network and try again.'],
  ])('a late request that ends with no server answer (%s) makes every door re-read', async (_, error) => {
    const request = await timedOut()
    request.resolve({ success: false, error })
    await settle()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(api.forgetActiveCheckins).toHaveBeenCalled()
    expect(api.forgetEvent.mock.calls.map((c) => c[0])).toEqual(['e1'])
  })

  // Control for the rule above: a no-answer end after a sign-out (or another sign-in) re-reads nothing of the next session.
  it('a late request with no server answer after a sign-out touches nothing of the next session', async () => {
    const request = await timedOut()
    mockSession = 2
    request.resolve({ success: false, error: TIMEOUT_MESSAGE })
    await settle()
    expect(heard).not.toHaveBeenCalled()
    expect(api.forgetActiveCheckins).not.toHaveBeenCalled()
    expect(lateLines()).toEqual([{ eventId: 'e1', isIn: false, code: undefined, error: TIMEOUT_MESSAGE, sameSession: false }])
  })

  it('a refusal that lands late changes nothing (control)', async () => {
    const request = await timedOut()
    request.resolve({ success: false, errorCode: 'OUT_OF_RANGE', error: '120 m outside' })
    await settle()
    expect(lateLines()).toEqual([{ eventId: 'e1', isIn: false, code: 'OUT_OF_RANGE', sameSession: true }])
    expect(heard).not.toHaveBeenCalled()
    expect(api.forgetActiveCheckins).not.toHaveBeenCalled()
  })

  // An unhandled rejection fails the test by itself (jest-circus): without the catch this one does.
  it('a request that throws late is logged, changes nothing, and leaves no unhandled rejection', async () => {
    const request = await timedOut()
    request.reject(new Error('queue gone'))
    await settle()
    expect(heard).not.toHaveBeenCalled()
    expect(Logger.error).toHaveBeenCalledWith('events', 'checkin:late:failed', expect.objectContaining({ eventId: 'e1' }))
  })

  it('a sign-out clearing the queue under it is expected: a warning, not an error report', async () => {
    const request = await timedOut()
    mockSession = 2
    request.reject(new Error('Request queue cleared'))
    await settle()
    expect(Logger.error).not.toHaveBeenCalled()
    expect(Logger.warn).toHaveBeenCalledWith('events', 'checkin:late:failed', expect.objectContaining({ eventId: 'e1' }))
  })

  // A control on dev (nothing reconciled then); it bites once the session check is taken out.
  it('a success that lands after a sign-out (or another sign-in) touches nothing of the next session', async () => {
    const request = await timedOut()
    mockSession = 2
    request.resolve(yes)
    await settle()
    expect(heard).not.toHaveBeenCalled()
    expect(api.forgetActiveCheckins).not.toHaveBeenCalled()
    expect(api.forgetEvent).not.toHaveBeenCalled()
  })
})

describe('the door, around a late answer', () => {
  let flow: ReturnType<typeof useCheckInFlow>
  function Door(props: UseCheckInFlowOptions) {
    flow = useCheckInFlow(props)
    return null
  }
  let props: jest.Mocked<Required<Pick<UseCheckInFlowOptions, 'showTray' | 'closeTray' | 'onCheckedIn' | 'onEnterRoom'>>>
  type TrayButton = { label: string; onPress: () => void }
  const trayButton = (label: string) => (props.showTray.mock.calls.at(-1)![2] as TrayButton[]).find((b) => b.label === label)!

  beforeEach(() => {
    props = { showTray: jest.fn(), closeTray: jest.fn(), onCheckedIn: jest.fn(), onEnterRoom: jest.fn(async () => {}) }
    jest.spyOn(H, 'success').mockImplementation(() => {})
    jest.spyOn(H, 'error').mockImplementation(() => {})
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
    jest.spyOn(AccessibilityInfo, 'isBoldTextEnabled').mockResolvedValue(false)
  })

  /** Hold, and let the 12 s pass: the "Still checking you in" tray is up and the first request is still out. */
  async function holdUntilTimeout() {
    const first = later<unknown>()
    api.checkIn.mockReturnValueOnce(first.promise)
    const screen = await render(<Door eventId="e1" {...props} />)
    await act(async () => {
      void flow.start()
    })
    await act(async () => jest.advanceTimersByTime(CHECK_IN_TIMEOUT_MS))
    await settle()
    expect(props.showTray).toHaveBeenLastCalledWith('Still checking you in', expect.any(String), expect.any(Array), { icon: 'hourglass' })
    return { first, screen }
  }

  it('Cancel, then the server says yes: both doors still come to "in"', async () => {
    const { first } = await holdUntilTimeout()
    await act(async () => trayButton('Cancel').onPress())
    expect(flow.checkingIn).toBe(false)
    // Cancel itself re-reads nothing: the answer is not in yet.
    expect(heard).not.toHaveBeenCalled()
    first.resolve(yes)
    await settle()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(api.forgetEvent).toHaveBeenCalledWith('e1')
  })

  it('the person left the screen before the yes: nothing throws, and whoever is still listening hears it', async () => {
    const { first, screen } = await holdUntilTimeout()
    // The door goes; the app (and its listeners) stays.
    await screen.rerender(<></>)
    first.resolve(yes)
    await settle()
    expect(heard).toHaveBeenCalledTimes(1)
    // The door that left plays nothing.
    expect(props.onCheckedIn).not.toHaveBeenCalled()
  })

  it('Retry got in first, then the first request lands too: one pour, one check-in, still in', async () => {
    const { first } = await holdUntilTimeout()
    api.checkIn.mockResolvedValueOnce(yes)
    await act(async () => trayButton('Retry').onPress())
    expect(props.onCheckedIn).toHaveBeenCalledTimes(1)
    expect(flow.pours).toBe(1)
    expect(heard).toHaveBeenCalledTimes(1)
    first.resolve(yes)
    await settle()
    // The late one only says "re-read": the server's answer is still "in", and nothing on the door runs twice.
    expect(heard).toHaveBeenCalledTimes(2)
    expect(props.onCheckedIn).toHaveBeenCalledTimes(1)
    expect(flow.pours).toBe(1)
    // No tray comes back over the pour (only the timeout's was ever shown), and the hold stays full under "You're in".
    expect(props.showTray).toHaveBeenCalledTimes(1)
    expect(flow.checkingIn).toBe(true)
  })
})
